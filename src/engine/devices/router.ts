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
//
// Il file è diviso per argomento, come quello dell'host: qui c'è ciò che
// il router fa con un frame che arriva e con un'attesa che scade; come
// spedisce un pacchetto sta in router-sending.ts, e i ping lanciati dalla
// sua CLI in router-ping.ts.

import { BROADCAST_MAC } from "../model/addresses";
import type { ArpPacket, EthernetFrame, Ipv4Packet } from "../model/frames";
import type { Router, RouterInterface } from "../model/network";
import { makeArpReply } from "../protocols/arp";
import { isEcho, makeEchoReply } from "../protocols/icmp";
import { makeIpv4Packet } from "../protocols/ipv4";
import type { Route } from "../protocols/routing";
import type { HostTimer } from "./host-output";
import { echoNeverLeft, echoTimedOut, receiveEchoReply, receiveIcmpError } from "./router-ping";
import {
  learn,
  merge,
  NOTHING,
  releasePendingPackets,
  report,
  routerOnBehalfOf,
  routePacket,
  type RouterOutput,
  type RouterReaction,
  type RouterTimerReaction,
} from "./router-sending";

// Chi usa un router trova qui anche ciò che sta negli altri suoi file.
export * from "./router-sending";
export { startPing as startRouterPing, startTraceroute } from "./router-ping";

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
  return receivePacket(router, port, frame.payload, table);
}

/**
 * È scaduta un'attesa del router. Se era la risposta ARP per un prossimo
 * salto, il router rinuncia ai pacchetti che la aspettavano e avvisa chi
 * li aveva mandati: "destination host unreachable". Se era la risposta a
 * un suo ping, quell'echo request è scaduto.
 *
 * @param router - il router
 * @param timer - l'attesa scaduta
 * @param table - la tabella di routing del router in questo momento
 * @returns i pacchetti scartati, e gli avvisi da spedire ai mittenti
 */
export function routerTimerExpired(router: Router, timer: HostTimer, table: Route[]): RouterTimerReaction {
  if (timer.kind === "echo-timeout") {
    // La risposta a un ping del router non è arrivata in tempo.
    return { ...echoTimedOut(router, timer.sequence, table), droppedPackets: [] };
  }

  const waiting = router.pendingPackets.filter((pending) => pending.nextHop === timer.ip);
  router.pendingPackets = router.pendingPackets.filter((pending) => pending.nextHop !== timer.ip);

  let output: RouterOutput = NOTHING;
  for (const pending of waiting) {
    const arrivedOn = router.ports.find((p) => p.name === pending.arrivedOn) ?? null;
    // L'avviso, o l'esito di un ping del router, è della conversazione del
    // pacchetto, non di chi aveva chiesto l'ARP (D-133).
    let consequences = report(router, arrivedOn, "host-unreachable", pending.packet, table);
    // Se il pacchetto era un echo request del router stesso, finisce qui.
    if (arrivedOn === null) consequences = merge(consequences, echoNeverLeft(router, pending.packet, table));
    output = merge(output, routerOnBehalfOf(pending, consequences));
  }
  return { ...output, droppedPackets: waiting };
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

function receivePacket(router: Router, arrivedOn: RouterInterface, packet: Ipv4Packet, table: Route[]): RouterReaction {
  // Il pacchetto è per uno degli indirizzi del router?
  const mine = router.ports.some((p) => p.ip !== null && p.ip === packet.dstIp);
  if (mine) {
    const icmp = packet.payload;
    if (!isEcho(icmp)) {
      // Un avviso: forse riguarda un ping lanciato dal router.
      return { ...receiveIcmpError(router, packet.srcIp, icmp, table), dropped: null, tableChanged: false };
    }
    if (icmp.type === "echo-reply") {
      // Una risposta: la guarda chi, sul router, ha fatto il ping.
      return { ...receiveEchoReply(router, packet, icmp, table), dropped: null, tableChanged: false };
    }
    // Un echo request: risponde dall'indirizzo a cui è stato fatto il ping.
    const reply = makeIpv4Packet(packet.dstIp, packet.srcIp, makeEchoReply(icmp));
    return routePacket(router, reply, null, table);
  }

  // Non è per il router: va inoltrato. Ogni router toglie 1 al TTL; un
  // pacchetto che arriva a zero ha fatto troppa strada e viene scartato,
  // e il mittente ne viene avvisato. È ciò che ferma un pacchetto finito
  // in un ciclo tra router.
  if (packet.ttl <= 1) {
    const warning = report(router, arrivedOn, "ttl-expired", packet, table);
    return { ...warning, dropped: "ttl-expired", tableChanged: false };
  }
  return routePacket(router, { ...packet, ttl: packet.ttl - 1 }, arrivedOn, table);
}
