// Come un router spedisce un pacchetto IP: sceglie la rotta, cerca il MAC
// del prossimo salto e scrive la busta nuova.
//
// Vale per i pacchetti che il router inoltra, per gli avvisi ICMP che
// manda e per quelli che nascono su di lui (le risposte ai ping, e i ping
// lanciati dalla sua CLI). Qui stanno anche i tipi di ciò che un router
// chiede al simulatore.

import type { Ipv4Address } from "../model/addresses";
import type { EthernetFrame, Ipv4Packet } from "../model/frames";
import type { Router, RouterInterface } from "../model/network";
import { ARP_TIMEOUT_TICKS, makeArpRequest } from "../protocols/arp";
import { isEcho, makeIcmpError, type DeliveryFailure } from "../protocols/icmp";
import { makeIpv4Packet } from "../protocols/ipv4";
import { lookupRoute, type Route } from "../protocols/routing";
import type { HostTimer, PingResult, TimerRequest, TraceHop } from "./host-output";

// Perché il router ha scartato un frame. Serve ai test: l'interfaccia
// mostra che è stato scartato, ma non ne spiega la causa.
export type RouterDropReason =
  // Il frame non era per questa interfaccia.
  | "not-my-mac"
  // Una richiesta ARP per un indirizzo che questa interfaccia non ha.
  | "arp-not-for-me"
  // Il TTL è arrivato a zero: il pacchetto ha fatto troppa strada.
  | "ttl-expired"
  // Nessuna rotta porta alla destinazione.
  | "no-route";

// Un frame da spedire, con l'interfaccia da cui farlo uscire.
export interface PortFrame {
  portName: string;
  frame: EthernetFrame;
}

// Che cosa il router chiede al simulatore di fare.
export interface RouterOutput {
  send: PortFrame[];
  startTimers: TimerRequest[];
  cancelTimers: HostTimer[];
  // Echo request del router arrivati a una conclusione, e sonde di
  // traceroute: come per un host (vedi host-output.ts).
  pingResults: PingResult[];
  traceHops: TraceHop[];
}

// Che cosa ha fatto il router dopo aver ricevuto un frame.
export interface RouterReaction extends RouterOutput {
  dropped: RouterDropReason | null;
  tableChanged: boolean;
}

// Che cosa ha fatto il router allo scadere di un'attesa.
export interface RouterTimerReaction extends RouterOutput {
  // Pacchetti a cui il router ha rinunciato.
  droppedPackets: Ipv4Packet[];
}

// L'elenco vuoto: nulla da inviare, nulla da aspettare, nulla di concluso.
export const NOTHING: RouterOutput = { send: [], startTimers: [], cancelTimers: [], pingResults: [], traceHops: [] };

/**
 * Fa uscire un pacchetto dall'interfaccia giusta, verso il prossimo salto.
 * Se il MAC del prossimo salto non è noto, il pacchetto resta in attesa e
 * parte una richiesta ARP. Modifica i pacchetti in attesa del router.
 *
 * @param router - il router
 * @param packet - il pacchetto da far uscire, con il TTL già sistemato
 * @param arrivedOn - l'interfaccia da cui era arrivato; null se è nato qui
 * @param table - la tabella di routing del router in questo momento
 * @returns i frame da spedire e le attese da avviare; se nessuna rotta
 *   porta alla destinazione, lo scarto e l'avviso per il mittente
 */
export function routePacket(
  router: Router,
  packet: Ipv4Packet,
  arrivedOn: RouterInterface | null,
  table: Route[],
): RouterReaction {
  const chosen = lookupRoute(table, packet.dstIp);
  if (chosen === null || chosen.portName === null) {
    // Nessuna rotta: il pacchetto viene scartato, e il mittente avvisato.
    const warning = report(router, arrivedOn, "net-unreachable", packet, table);
    return { ...warning, dropped: "no-route", tableChanged: false };
  }
  const port = router.ports.find((p) => p.name === chosen.portName)!;
  // Su una rete collegata si consegna direttamente al destinatario;
  // altrimenti al vicino indicato dalla rotta.
  const nextHop = chosen.nextHop ?? packet.dstIp;

  const mac = router.arpTable.get(nextHop);
  if (mac !== undefined) {
    return { ...NOTHING, send: [frameFor(port, mac, packet)], dropped: null, tableChanged: false };
  }

  // Il MAC del prossimo salto non è noto: il pacchetto aspetta, e parte
  // una richiesta ARP dall'interfaccia di uscita. Se per quell'indirizzo
  // una richiesta è già in corso, basta mettersi in coda.
  const alreadyAsking = router.pendingPackets.some((pending) => pending.nextHop === nextHop);
  router.pendingPackets.push({ nextHop, packet, portName: port.name, arrivedOn: arrivedOn?.name ?? null });
  if (alreadyAsking) {
    return { ...NOTHING, dropped: null, tableChanged: false };
  }
  return {
    ...NOTHING,
    send: [{ portName: port.name, frame: makeArpRequest(port.mac, port.ip!, nextHop) }],
    startTimers: [{ delay: ARP_TIMEOUT_TICKS, timer: { kind: "arp-timeout", ip: nextHop } }],
    dropped: null,
    tableChanged: false,
  };
}

/**
 * Avvisa il mittente di un pacchetto che non è stato possibile consegnarlo.
 * L'avviso parte dall'indirizzo dell'interfaccia su cui il pacchetto era
 * arrivato, e viene instradato come qualsiasi altro pacchetto.
 *
 * @param router - il router che rinuncia al pacchetto
 * @param arrivedOn - l'interfaccia da cui il pacchetto era arrivato
 * @param failure - perché non è stato consegnato
 * @param packet - il pacchetto scartato
 * @param table - la tabella di routing del router in questo momento
 * @returns l'avviso da spedire; nulla se il pacchetto era nato sul router,
 *   se quell'interfaccia non ha un indirizzo, o se il pacchetto scartato
 *   era a sua volta un avviso
 */
export function report(
  router: Router,
  arrivedOn: RouterInterface | null,
  failure: DeliveryFailure,
  packet: Ipv4Packet,
  table: Route[],
): RouterOutput {
  if (arrivedOn === null || arrivedOn.ip === null || !isEcho(packet.payload)) return NOTHING;
  const error = makeIcmpError(failure, packet);
  if (error === null) return NOTHING;

  // Se nemmeno l'avviso trova una strada, viene scartato in silenzio: per
  // questo qui non c'è un'interfaccia di arrivo.
  const warning = makeIpv4Packet(arrivedOn.ip, packet.srcIp, error);
  const { send, startTimers, cancelTimers } = routePacket(router, warning, null, table);
  return { ...NOTHING, send, startTimers, cancelTimers };
}

/**
 * Unisce due elenchi di cose da fare in uno solo.
 *
 * @param a - il primo elenco
 * @param b - il secondo; le sue voci vengono dopo quelle del primo
 */
export function merge(a: RouterOutput, b: RouterOutput): RouterOutput {
  return {
    send: [...a.send, ...b.send],
    startTimers: [...a.startTimers, ...b.startTimers],
    cancelTimers: [...a.cancelTimers, ...b.cancelTimers],
    pingResults: [...a.pingResults, ...b.pingResults],
    traceHops: [...a.traceHops, ...b.traceHops],
  };
}

/**
 * Registra un MAC nella tabella ARP del router.
 *
 * @returns true se la tabella è cambiata
 */
export function learn(router: Router, ip: Ipv4Address, mac: string): boolean {
  if (router.arpTable.get(ip) === mac) return false;
  router.arpTable.set(ip, mac);
  return true;
}

/**
 * Fa partire i pacchetti che aspettavano il MAC di un indirizzo, ora in
 * tabella, e annulla l'attesa della risposta ARP, che non serve più.
 *
 * @param router - il router; i pacchetti che partono escono dall'attesa
 * @param ip - l'indirizzo di cui ora si conosce il MAC
 */
export function releasePendingPackets(router: Router, ip: Ipv4Address): RouterOutput {
  const mac = router.arpTable.get(ip);
  const waiting = router.pendingPackets.filter((pending) => pending.nextHop === ip);
  if (mac === undefined || waiting.length === 0) return NOTHING;

  router.pendingPackets = router.pendingPackets.filter((pending) => pending.nextHop !== ip);
  const send = waiting.map((pending) => {
    const port = router.ports.find((p) => p.name === pending.portName)!;
    return frameFor(port, mac, pending.packet);
  });
  return { ...NOTHING, send, cancelTimers: [{ kind: "arp-timeout", ip }] };
}

// La busta nuova: dal MAC dell'interfaccia di uscita al MAC del prossimo salto.
function frameFor(port: RouterInterface, dstMac: string, packet: Ipv4Packet): PortFrame {
  return { portName: port.name, frame: { dstMac, srcMac: port.mac, etherType: "IPv4", payload: packet } };
}
