// Ping e traceroute lanciati da un router, dalla sua CLI.
//
// La logica è quella dell'host (host-ping.ts): una serie di echo request
// mandati uno alla volta, e per traceroute sonde con il TTL crescente.
// Cambiano due cose. Il router non ha un solo indirizzo: come sorgente usa
// quello dell'interfaccia da cui il pacchetto esce. E non ha un gateway:
// la strada la sceglie la sua tabella di routing.

import { ipToNumber, isLoopbackAddress, type Ipv4Address } from "../model/addresses";
import type { EchoMessage, IcmpError, Ipv4Packet } from "../model/frames";
import type { AwaitedEcho, Router } from "../model/network";
import { ECHO_TIMEOUT_TICKS, makeEchoRequest } from "../protocols/icmp";
import { makeIpv4Packet } from "../protocols/ipv4";
import { lookupRoute, type Route } from "../protocols/routing";
import { conclude, outcomeOfError, stopAwaiting, type EchoToSend } from "./echo-series";
import type { PingResult } from "./host-output";
import { merge, NOTHING, routePacket, type RouterOutput } from "./router-sending";

// Identificativo degli echo request del router.
const PING_IDENTIFIER = 1;

// Il TTL con cui partono i pacchetti di un router: IOS usa il massimo.
export const ROUTER_TTL = 255;

/**
 * Avvia un ping dal router: una serie di echo request verso un indirizzo,
 * mandati uno alla volta. Modifica lo stato del router: numero di
 * sequenza, echo request in sospeso e pacchetti in attesa del MAC.
 *
 * @param router - il router che fa il ping
 * @param targetIp - l'indirizzo da raggiungere
 * @param count - quanti echo request mandare in tutto
 * @param table - la tabella di routing del router in questo momento
 * @returns che cosa fare per il primo echo request. Se la destinazione è
 *   un indirizzo del router stesso, o se nessuna rotta ci arriva, non
 *   parte nulla e il risultato contiene già tutti gli esiti
 * @throws Error se `targetIp` non è un indirizzo IPv4 valido, o se `count`
 *   non è un numero intero maggiore di zero
 */
export function startPing(router: Router, targetIp: Ipv4Address, count: number, table: Route[]): RouterOutput {
  ipToNumber(targetIp); // rifiuta subito ciò che non è un indirizzo
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Numero di richieste non valido: ${count}`);
  }
  return sendEchoRequest(router, { targetIp, remaining: count - 1 }, table);
}

/**
 * Avvia un traceroute dal router: sonde con il TTL crescente, ciascuna
 * fermata da un router più lontano della precedente (vedi `startTracert`
 * in host-ping.ts).
 *
 * @param router - il router che traccia la strada
 * @param targetIp - l'indirizzo da raggiungere
 * @param maxHops - a quale salto fermarsi comunque
 * @param table - la tabella di routing del router in questo momento
 * @throws Error se `targetIp` non è un indirizzo IPv4 valido, o se
 *   `maxHops` non sta tra 1 e 255
 */
export function startTraceroute(router: Router, targetIp: Ipv4Address, maxHops: number, table: Route[]): RouterOutput {
  ipToNumber(targetIp);
  if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 255) {
    throw new Error(`TTL non valido: ${maxHops}`);
  }
  return sendEchoRequest(router, { targetIp, remaining: 0, sendTtl: 1, probe: { hop: 1, maxHops } }, table);
}

/**
 * È arrivato un echo reply per il router. Se lo stava aspettando,
 * quell'echo request si conclude con una risposta; altrimenti viene ignorato.
 *
 * @param router - il router che ha ricevuto la risposta
 * @param packet - il pacchetto IP che la porta: dice chi risponde e con quale TTL
 * @param reply - l'echo reply
 * @param table - la tabella di routing del router in questo momento
 */
export function receiveEchoReply(router: Router, packet: Ipv4Packet, reply: EchoMessage, table: Route[]): RouterOutput {
  const awaited = stopAwaiting(router, packet.srcIp, reply.sequence);
  if (awaited === null) return NOTHING;
  const answer = { from: packet.srcIp, ttl: packet.ttl };
  return merge(cancelEchoTimeout(awaited), concludeEcho(router, awaited, "reply", table, answer));
}

/**
 * Un altro router avvisa che un pacchetto di questo router non è arrivato.
 * Se riguarda un echo request ancora in sospeso, quello finisce qui.
 *
 * @param router - il router che ha ricevuto l'avviso
 * @param reporter - l'indirizzo di chi lo ha mandato
 * @param error - il messaggio ICMP di errore
 * @param table - la tabella di routing del router in questo momento
 */
export function receiveIcmpError(router: Router, reporter: Ipv4Address, error: IcmpError, table: Route[]): RouterOutput {
  const { original } = error;
  const mine = router.ports.some((port) => port.ip !== null && port.ip === original.srcIp);
  if (original.type !== "echo-request" || !mine) return NOTHING;
  const awaited = stopAwaiting(router, original.dstIp, original.sequence);
  if (awaited === null) return NOTHING;

  const answer = { from: reporter, ttl: null };
  return merge(cancelEchoTimeout(awaited), concludeEcho(router, awaited, outcomeOfError(error), table, answer));
}

/**
 * L'echo reply non è arrivato in tempo: la richiesta è scaduta.
 *
 * @param router - il router che aspettava
 * @param sequence - il numero di sequenza dell'echo request scaduto
 * @param table - la tabella di routing del router in questo momento
 */
export function echoTimedOut(router: Router, sequence: number, table: Route[]): RouterOutput {
  const index = router.awaitedEchoes.findIndex((awaited) => awaited.sequence === sequence);
  if (index === -1) return NOTHING;

  const [awaited] = router.awaitedEchoes.splice(index, 1);
  return concludeEcho(router, awaited, "timeout", table);
}

/**
 * Un echo request del router non è mai partito: aspettava il MAC del
 * prossimo salto, e la risposta ARP non è arrivata.
 *
 * @param router - il router che lo aveva preparato
 * @param packet - il pacchetto a cui il router ha rinunciato
 * @param table - la tabella di routing del router in questo momento
 * @returns nulla, se il pacchetto non era un echo request in sospeso
 */
export function echoNeverLeft(router: Router, packet: Ipv4Packet, table: Route[]): RouterOutput {
  if (packet.payload.type !== "echo-request") return NOTHING;
  const awaited = stopAwaiting(router, packet.dstIp, packet.payload.sequence);
  if (awaited === null) return NOTHING;
  return merge(cancelEchoTimeout(awaited), concludeEcho(router, awaited, "unreachable", table));
}

// Prepara un echo request: uno di quelli di un ping, oppure una sonda di
// traceroute.
function sendEchoRequest(router: Router, what: EchoToSend, table: Route[]): RouterOutput {
  const echo: AwaitedEcho = { ...what, sequence: router.nextEchoSequence };
  const { targetIp } = echo;
  router.nextEchoSequence += 1;

  // Un ping a un proprio indirizzo non passa dalla rete.
  if (isOwnAddress(router, targetIp)) {
    return concludeEcho(router, echo, "reply", table, { from: targetIp, ttl: ROUTER_TTL });
  }

  // Senza una rotta verso la destinazione l'echo request non può partire.
  // La sorgente è l'indirizzo dell'interfaccia da cui uscirà.
  const exit = lookupRoute(table, targetIp);
  const port = exit === null ? undefined : router.ports.find((p) => p.name === exit.portName);
  if (port === undefined || port.ip === null) {
    return concludeEcho(router, echo, "transmit-failed", table);
  }

  router.awaitedEchoes.push(echo);
  const request = makeEchoRequest(PING_IDENTIFIER, echo.sequence);
  const packet = { ...makeIpv4Packet(port.ip, targetIp, request), ttl: echo.sendTtl ?? ROUTER_TTL };
  const { send, startTimers, cancelTimers } = routePacket(router, packet, null, table);
  return {
    ...NOTHING,
    send,
    cancelTimers,
    startTimers: [...startTimers, { delay: ECHO_TIMEOUT_TICKS, timer: { kind: "echo-timeout", sequence: echo.sequence } }],
  };
}

// Un indirizzo di loopback, o quello di una delle interfacce.
function isOwnAddress(router: Router, ip: Ipv4Address): boolean {
  if (isLoopbackAddress(ip)) return true;
  return router.ports.some((port) => port.ip !== null && ipToNumber(port.ip) === ipToNumber(ip));
}

// Chiude un echo request con il suo esito e, se la serie continua, fa
// partire subito il successivo (vedi echo-series.ts).
function concludeEcho(
  router: Router,
  echo: AwaitedEcho,
  outcome: PingResult["outcome"],
  table: Route[],
  answer?: { from: Ipv4Address | null; ttl: number | null },
): RouterOutput {
  const { next, pingResults, traceHops } = conclude(echo, outcome, answer);
  const done: RouterOutput = { ...NOTHING, pingResults, traceHops };
  return next === null ? done : merge(done, sendEchoRequest(router, next, table));
}

// L'attesa della risposta a un echo request, da annullare perché si è concluso.
function cancelEchoTimeout(echo: AwaitedEcho): RouterOutput {
  return { ...NOTHING, cancelTimers: [{ kind: "echo-timeout", sequence: echo.sequence }] };
}
