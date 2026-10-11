// Il router: unisce reti diverse. Riceve un pacchetto IP da un'interfaccia
// e lo fa uscire da un'altra, verso la sua destinazione.
//
// A ogni passaggio il pacchetto IP resta lo stesso (stessi indirizzi IP),
// tranne il TTL, che scende di uno. Cambia invece la busta: il frame che
// riparte ha come sorgente il MAC dell'interfaccia di uscita e come
// destinazione il MAC del prossimo salto.
//
// Come gli host, il router non spedisce nulla e non misura il tempo: dice
// al simulatore che cosa fare.

import { BROADCAST_MAC, type Ipv4Address } from "../model/addresses";
import type { ArpPacket, EthernetFrame, Ipv4Packet } from "../model/frames";
import type { Router, RouterInterface } from "../model/network";
import { ARP_TIMEOUT_TICKS, makeArpReply, makeArpRequest } from "../protocols/arp";
import { makeEchoReply } from "../protocols/icmp";
import { makeIpv4Packet } from "../protocols/ipv4";
import { lookupRoute, type Route } from "../protocols/routing";
import type { HostTimer, TimerRequest } from "./host";

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

const NOTHING: RouterOutput = { send: [], startTimers: [], cancelTimers: [] };

/**
 * Il router riceve un frame su una sua interfaccia e decide che cosa fare.
 * Modifica lo stato del router: tabella ARP e pacchetti in attesa.
 *
 * @param router - il router
 * @param portName - l'interfaccia su cui il frame è arrivato
 * @param frame - il frame ricevuto
 * @param table - la tabella di routing del router in questo momento
 * @returns i frame da spedire, ciascuno con la sua interfaccia di uscita;
 *   le attese da avviare o annullare; il motivo dello scarto, se il frame
 *   è stato scartato; se la tabella ARP è cambiata
 */
export function receiveFrameOnRouter(
  router: Router,
  portName: string,
  frame: EthernetFrame,
  table: Route[],
): RouterReaction {
  const port = router.ports.find((p) => p.name === portName);
  if (port === undefined) return { ...NOTHING, dropped: "not-my-mac", tableChanged: false };

  // Un'interfaccia accetta ciò che è indirizzato a lei, e i broadcast.
  if (frame.dstMac !== port.mac && frame.dstMac !== BROADCAST_MAC) {
    return { ...NOTHING, dropped: "not-my-mac", tableChanged: false };
  }

  if (frame.etherType === "ARP") {
    return receiveArp(router, port, frame.payload);
  }
  // Un pacchetto IP spedito in broadcast non attraversa un router.
  if (frame.dstMac === BROADCAST_MAC) {
    return { ...NOTHING, dropped: "not-my-mac", tableChanged: false };
  }
  return receivePacket(router, frame.payload, table);
}

/**
 * È scaduta un'attesa del router: la risposta ARP per un prossimo salto
 * non è arrivata. Il router rinuncia ai pacchetti che la aspettavano.
 *
 * @param router - il router
 * @param timer - l'attesa scaduta
 * @returns i pacchetti scartati
 */
export function routerTimerExpired(router: Router, timer: HostTimer): RouterTimerReaction {
  if (timer.kind !== "arp-timeout") return { ...NOTHING, droppedPackets: [] };

  const waiting = router.pendingPackets.filter((pending) => pending.nextHop === timer.ip);
  router.pendingPackets = router.pendingPackets.filter((pending) => pending.nextHop !== timer.ip);
  return { ...NOTHING, droppedPackets: waiting.map((pending) => pending.packet) };
}

function receiveArp(router: Router, port: RouterInterface, arp: ArpPacket): RouterReaction {
  if (arp.operation === "request") {
    // Il router risponde solo per l'indirizzo dell'interfaccia su cui la
    // richiesta è arrivata: non risponde al posto di altri (niente proxy ARP).
    if (port.ip === null || arp.targetIp !== port.ip) {
      return { ...NOTHING, dropped: "arp-not-for-me", tableChanged: false };
    }
    // Chi ha chiesto vorrà parlarmi: tanto vale ricordare subito il suo MAC.
    const tableChanged = learn(router, arp.senderIp, arp.senderMac);
    const released = releasePendingPackets(router, arp.senderIp);
    const reply = { portName: port.name, frame: makeArpReply(arp, port.mac) };
    return { ...released, send: [reply, ...released.send], dropped: null, tableChanged };
  }

  // Una risposta: ora il router conosce il MAC che cercava.
  const tableChanged = learn(router, arp.senderIp, arp.senderMac);
  const released = releasePendingPackets(router, arp.senderIp);
  return { ...released, dropped: null, tableChanged };
}

function receivePacket(router: Router, packet: Ipv4Packet, table: Route[]): RouterReaction {
  // Il pacchetto è per uno degli indirizzi del router?
  const mine = router.ports.some((p) => p.ip !== null && p.ip === packet.dstIp);
  if (mine) {
    if (packet.payload.type !== "echo-request") {
      // Il router non fa ping: una risposta non la aspettava.
      return { ...NOTHING, dropped: null, tableChanged: false };
    }
    // Risponde dall'indirizzo a cui è stato fatto il ping.
    const reply = makeIpv4Packet(packet.dstIp, packet.srcIp, makeEchoReply(packet.payload));
    return route(router, reply, table);
  }

  // Non è per il router: va inoltrato. Ogni router toglie 1 al TTL; un
  // pacchetto che arriva a zero ha fatto troppa strada e viene scartato.
  // È ciò che ferma un pacchetto finito in un ciclo tra router.
  if (packet.ttl <= 1) {
    return { ...NOTHING, dropped: "ttl-expired", tableChanged: false };
  }
  return route(router, { ...packet, ttl: packet.ttl - 1 }, table);
}

// Fa uscire un pacchetto dall'interfaccia giusta, verso il prossimo salto.
function route(router: Router, packet: Ipv4Packet, table: Route[]): RouterReaction {
  const chosen = lookupRoute(table, packet.dstIp);
  if (chosen === null || chosen.portName === null) {
    return { ...NOTHING, dropped: "no-route", tableChanged: false };
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
  router.pendingPackets.push({ nextHop, packet, portName: port.name });
  if (alreadyAsking) {
    return { ...NOTHING, dropped: null, tableChanged: false };
  }
  return {
    send: [{ portName: port.name, frame: makeArpRequest(port.mac, port.ip!, nextHop) }],
    startTimers: [{ delay: ARP_TIMEOUT_TICKS, timer: { kind: "arp-timeout", ip: nextHop } }],
    cancelTimers: [],
    dropped: null,
    tableChanged: false,
  };
}

// Registra un MAC nella tabella ARP. Dice se la tabella è cambiata.
function learn(router: Router, ip: Ipv4Address, mac: string): boolean {
  if (router.arpTable.get(ip) === mac) return false;
  router.arpTable.set(ip, mac);
  return true;
}

// Fa partire i pacchetti che aspettavano il MAC di `ip`, ora in tabella,
// e annulla l'attesa della risposta ARP, che non serve più.
function releasePendingPackets(router: Router, ip: Ipv4Address): RouterOutput {
  const mac = router.arpTable.get(ip);
  const waiting = router.pendingPackets.filter((pending) => pending.nextHop === ip);
  if (mac === undefined || waiting.length === 0) return NOTHING;

  router.pendingPackets = router.pendingPackets.filter((pending) => pending.nextHop !== ip);
  const send = waiting.map((pending) => {
    const port = router.ports.find((p) => p.name === pending.portName)!;
    return frameFor(port, mac, pending.packet);
  });
  return { send, startTimers: [], cancelTimers: [{ kind: "arp-timeout", ip }] };
}

// La busta nuova: dal MAC dell'interfaccia di uscita al MAC del prossimo salto.
function frameFor(port: RouterInterface, dstMac: string, packet: Ipv4Packet): PortFrame {
  return { portName: port.name, frame: { dstMac, srcMac: port.mac, etherType: "IPv4", payload: packet } };
}
