// Ping e tracert, dal punto di vista di chi li lancia.
//
// Un ping è una serie di echo request mandati uno alla volta: il
// successivo parte quando il precedente si è concluso, con una risposta,
// con un avviso di un router, o senza nulla. Un tracert è la stessa cosa
// con il TTL troppo basso apposta: ogni sonda si fa fermare da un router
// più lontano della precedente, e così ne scopre l'indirizzo.

import { ipToNumber, isLoopbackAddress, type Ipv4Address } from "../model/addresses";
import type { EchoMessage, IcmpError, Ipv4Packet } from "../model/frames";
import type { AwaitedEcho, Host } from "../model/network";
import { ECHO_TIMEOUT_TICKS, makeEchoRequest } from "../protocols/icmp";
import { DEFAULT_TTL, makeIpv4Packet, nextHopFor } from "../protocols/ipv4";
import { conclude, outcomeOfError, stopAwaiting, type EchoToSend } from "./echo-series";
import { merge, NOTHING, type HostOutput, type PingResult, type TimerReaction } from "./host-output";
import { sendIpv4Packet } from "./host-sending";

// Identificativo degli echo request. Windows usa sempre lo stesso valore
// e distingue i ping con il numero di sequenza.
const PING_IDENTIFIER = 1;

/**
 * Avvia un ping: una serie di echo request verso un indirizzo IP, mandati
 * uno alla volta. Il successivo parte quando il precedente si è concluso,
 * con una risposta o senza.
 * Non spedisce nulla: è il simulatore a mettere i frame sul cavo.
 * Modifica lo stato dell'host: numero di sequenza, echo request in sospeso
 * e, se il MAC del prossimo salto non è noto, pacchetti in attesa.
 *
 * @param host - l'host che fa il ping
 * @param targetIp - l'indirizzo IP da raggiungere
 * @param count - quanti echo request mandare in tutto
 * @param ttl - il TTL con cui farli partire; se manca, quello solito (128).
 *   Un TTL piccolo fa fermare il pacchetto dopo pochi router: è l'opzione
 *   `-i` di ping
 * @returns che cosa fare per il primo echo request: inviarlo se il MAC del
 *   prossimo salto è noto, altrimenti inviare la richiesta ARP; in entrambi
 *   i casi avviare l'attesa dell'echo reply. Se la destinazione è l'host
 *   stesso (il suo indirizzo, o un 127.x.x.x) non parte nulla e il
 *   risultato contiene solo gli esiti "reply", uno per ciascun echo
 *   request. Se l'host non sente il segnale sul cavo, non ha un indirizzo
 *   IP, o se la destinazione è in un'altra rete e manca il gateway, nessun
 *   echo request può partire: il risultato contiene solo gli esiti
 *   "transmit-failed"
 * @throws Error se `targetIp` non è un indirizzo IPv4 valido, se `count`
 *   non è un numero intero maggiore di zero, o se `ttl` non sta tra 1 e 255
 */
export function startPing(host: Host, targetIp: Ipv4Address, count: number, ttl?: number): HostOutput {
  ipToNumber(targetIp); // rifiuta subito ciò che non è un indirizzo
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Numero di richieste non valido: ${count}`);
  }
  if (ttl !== undefined) requireTtl(ttl);
  return sendEchoRequest(host, { targetIp, remaining: count - 1, ...(ttl === undefined ? {} : { sendTtl: ttl }) });
}

/**
 * Avvia un tracert: scopre i router sulla strada verso un indirizzo.
 *
 * Il trucco è mandare echo request con il TTL troppo basso per arrivare.
 * La prima sonda parte con TTL 1: il primo router la ferma e avvisa, e
 * così dice chi è. La seconda parte con TTL 2 e arriva un router più in
 * là. Si prosegue finché risponde la destinazione.
 *
 * Modifica lo stato dell'host come `startPing`.
 *
 * @param host - l'host che traccia la strada
 * @param targetIp - l'indirizzo da raggiungere
 * @param maxHops - a quale salto fermarsi comunque
 * @returns che cosa fare per la prima sonda. Se non può partire, o se la
 *   destinazione è l'host stesso, il risultato contiene già la conclusione
 * @throws Error se `targetIp` non è un indirizzo IPv4 valido, o se
 *   `maxHops` non sta tra 1 e 255
 */
export function startTracert(host: Host, targetIp: Ipv4Address, maxHops: number): HostOutput {
  ipToNumber(targetIp);
  requireTtl(maxHops);
  return sendEchoRequest(host, { targetIp, remaining: 0, sendTtl: 1, probe: { hop: 1, maxHops } });
}

/**
 * È arrivato un echo reply. Se l'host lo stava aspettando, quell'echo
 * request si conclude con una risposta e la sua attesa non serve più. Una
 * risposta arrivata dopo la scadenza, o mai richiesta, viene ignorata.
 *
 * @param host - l'host che ha ricevuto la risposta
 * @param packet - il pacchetto IP che la porta: dice chi risponde e con quale TTL
 * @param reply - l'echo reply
 */
export function receiveEchoReply(host: Host, packet: Ipv4Packet, reply: EchoMessage): HostOutput {
  const awaited = stopAwaiting(host, packet.srcIp, reply.sequence);
  if (awaited === null) return NOTHING;
  const answer = { from: packet.srcIp, ttl: packet.ttl };
  return merge(cancelEchoTimeout(awaited), concludeEcho(host, awaited, "reply", answer));
}

/**
 * Un router avvisa che un pacchetto dell'host non è arrivato. Se riguarda
 * un echo request che l'host sta ancora aspettando, quello finisce qui,
 * con l'esito che l'avviso riporta: non serve aspettare la scadenza.
 *
 * @param host - l'host che ha ricevuto l'avviso
 * @param reporter - l'indirizzo del router che lo ha mandato
 * @param error - il messaggio ICMP di errore
 */
export function receiveIcmpError(host: Host, reporter: Ipv4Address, error: IcmpError): HostOutput {
  const { original } = error;
  // L'avviso riguarda un mio echo request? Un errore su altro (una mia
  // risposta, o un pacchetto non mio) viene ricevuto e ignorato.
  if (original.type !== "echo-request" || original.srcIp !== host.ip) return NOTHING;
  const awaited = stopAwaiting(host, original.dstIp, original.sequence);
  if (awaited === null) return NOTHING;

  const outcome = outcomeOfError(error);
  return merge(cancelEchoTimeout(awaited), concludeEcho(host, awaited, outcome, { from: reporter, ttl: null }));
}

/**
 * L'echo reply non è arrivato in tempo: la richiesta è scaduta.
 *
 * @param host - l'host che aspettava
 * @param sequence - il numero di sequenza dell'echo request scaduto
 */
export function echoTimedOut(host: Host, sequence: number): TimerReaction {
  const index = host.awaitedEchoes.findIndex((awaited) => awaited.sequence === sequence);
  if (index === -1) return { ...NOTHING, droppedPackets: [] };

  const [awaited] = host.awaitedEchoes.splice(index, 1);
  return { ...concludeEcho(host, awaited, "timeout"), droppedPackets: [] };
}

/**
 * Un echo request dell'host non è mai partito: aspettava il MAC del
 * prossimo salto, e la risposta ARP non è arrivata. Si conclude come
 * "host non raggiungibile", e il ping prosegue con il successivo.
 *
 * @param host - l'host che lo aveva preparato
 * @param packet - il pacchetto a cui l'host ha rinunciato
 * @returns nulla, se il pacchetto non era un echo request che l'host
 *   stava aspettando
 */
export function echoNeverLeft(host: Host, packet: Ipv4Packet): HostOutput {
  if (packet.payload.type !== "echo-request") return NOTHING;
  const awaited = stopAwaiting(host, packet.dstIp, packet.payload.sequence);
  if (awaited === null) return NOTHING;
  return merge(cancelEchoTimeout(awaited), concludeEcho(host, awaited, "unreachable"));
}

// Il TTL sta in un byte, e con zero un pacchetto non parte nemmeno.
function requireTtl(ttl: number): void {
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 255) {
    throw new Error(`TTL non valido: ${ttl}`);
  }
}

// Prepara un echo request: uno dei quattro di un ping, oppure una sonda
// di tracert. `remaining` dice quanti altri ne seguiranno.
function sendEchoRequest(host: Host, what: EchoToSend): HostOutput {
  const echo: AwaitedEcho = { ...what, sequence: host.nextEchoSequence };
  const { targetIp } = echo;
  host.nextEchoSequence += 1;

  // Un ping a se stessi non passa dalla rete: l'host si risponde da solo,
  // subito, e sul cavo non esce nulla.
  if (isOwnAddress(host, targetIp)) {
    return concludeEcho(host, echo, "reply", { from: targetIp, ttl: DEFAULT_TTL });
  }

  // Senza segnale sul cavo, senza un indirizzo, o senza una strada verso
  // la destinazione, l'echo request non può nemmeno partire.
  if (!host.linkUp || host.ip === null || nextHopFor(host, targetIp) === null) {
    return concludeEcho(host, echo, "transmit-failed");
  }

  host.awaitedEchoes.push(echo);
  const request = makeEchoRequest(PING_IDENTIFIER, echo.sequence);
  const packet = makeIpv4Packet(host.ip, targetIp, request);
  const sent = sendIpv4Packet(host, echo.sendTtl === undefined ? packet : { ...packet, ttl: echo.sendTtl });
  return {
    ...sent,
    startTimers: [
      ...sent.startTimers,
      { delay: ECHO_TIMEOUT_TICKS, timer: { kind: "echo-timeout", sequence: echo.sequence } },
    ],
  };
}

// Dice se un indirizzo indica l'host stesso: è un indirizzo di loopback
// (127.x.x.x), che vale anche per un host non configurato, oppure è
// l'indirizzo dell'host.
function isOwnAddress(host: Host, ip: Ipv4Address): boolean {
  if (isLoopbackAddress(ip)) return true;
  return host.ip !== null && ipToNumber(host.ip) === ipToNumber(ip);
}

// Chiude un echo request con il suo esito e, se la serie continua, fa
// partire subito il successivo. Che cosa si conclude e che cosa segue lo
// decide echo-series.ts; qui lo si spedisce.
function concludeEcho(
  host: Host,
  echo: AwaitedEcho,
  outcome: PingResult["outcome"],
  answer?: { from: Ipv4Address | null; ttl: number | null },
): HostOutput {
  const { next, pingResults, traceHops } = conclude(echo, outcome, answer);
  const done: HostOutput = { ...NOTHING, pingResults, traceHops };
  return next === null ? done : merge(done, sendEchoRequest(host, next));
}

// L'attesa della risposta a un echo request, da annullare perché si è concluso.
function cancelEchoTimeout(echo: AwaitedEcho): HostOutput {
  return { ...NOTHING, cancelTimers: [{ kind: "echo-timeout", sequence: echo.sequence }] };
}
