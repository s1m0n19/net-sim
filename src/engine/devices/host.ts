// Comportamento di un host (PC o server): che cosa fa quando deve
// spedire qualcosa, quando riceve un frame e quando scade un'attesa.
//
// Queste funzioni non spediscono nulla e non misurano il tempo: dicono al
// simulatore che cosa l'host vuole inviare e quali attese vuole avviare,
// e il simulatore lo fa.
//
// Il file è diviso per argomento: qui c'è ciò che l'host fa con un frame
// che arriva e con un'attesa che scade; ping e tracert stanno in
// host-ping.ts, la spedizione di un pacchetto IP in host-sending.ts, e
// ciò che un host chiede al simulatore in host-output.ts.

import { BROADCAST_MAC, type Ipv4Address } from "../model/addresses";
import type { ArpPacket, EthernetFrame, Ipv4Packet } from "../model/frames";
import type { Host } from "../model/network";
import { makeArpReply, makeArpRequest } from "../protocols/arp";
import { isEcho, makeEchoReply } from "../protocols/icmp";
import { makeIpv4Packet } from "../protocols/ipv4";
import { merge, NOTHING, type HostReaction, type HostTimer, type TimerReaction } from "./host-output";
import { echoNeverLeft, echoTimedOut, receiveEchoReply, receiveIcmpError } from "./host-ping";
import { learn, releasePendingPackets, sendIpv4Packet } from "./host-sending";

// Chi usa un host trova qui anche ciò che sta negli altri suoi file.
export * from "./host-output";
export { startPing, startTracert } from "./host-ping";

/**
 * Prepara la richiesta ARP con cui un host cerca il MAC di un indirizzo IP.
 * Non la spedisce: è il simulatore a metterla sul cavo.
 *
 * @param host - l'host che vuole risolvere l'indirizzo
 * @param targetIp - l'indirizzo IP di cui si cerca il MAC
 * @returns il frame da inviare, oppure null se l'host non ha un indirizzo IP
 *   e quindi non può chiedere nulla
 */
export function startArpResolution(host: Host, targetIp: Ipv4Address): EthernetFrame | null {
  if (host.ip === null) return null;
  return makeArpRequest(host.ports[0].mac, host.ip, targetIp);
}

/**
 * Decide che cosa fa un host quando gli arriva un frame.
 * Può aggiornare la tabella ARP dell'host e i suoi pacchetti in attesa.
 *
 * @param host - l'host che riceve; tabella ARP e pacchetti in attesa
 *   possono essere modificati
 * @param frame - il frame arrivato alla sua porta
 * @returns la reazione: frame da inviare, attese da avviare o annullare,
 *   motivo dell'eventuale scarto, e se la tabella ARP è cambiata
 */
export function receiveFrame(host: Host, frame: EthernetFrame): HostReaction {
  const myMac = host.ports[0].mac;

  // Un host accetta solo i frame diretti a lui o a tutti.
  if (frame.dstMac !== myMac && frame.dstMac !== BROADCAST_MAC) {
    return { ...NOTHING, dropped: "not-my-mac", tableChanged: false };
  }

  // Il frame è per me: lo apro e passo il contenuto al protocollo giusto.
  if (frame.etherType === "ARP") {
    return receiveArp(host, frame.payload);
  }
  return receiveIpv4(host, frame.payload);
}

/**
 * Decide che cosa fa un host quando scade una sua attesa.
 * Può togliere pacchetti dall'attesa e chiudere echo request in sospeso.
 *
 * @param host - l'host a cui appartiene l'attesa
 * @param timer - l'attesa scaduta
 * @returns la reazione: i pacchetti a cui l'host rinuncia, gli esiti dei
 *   ping che si concludono, e le attese da annullare
 */
export function timerExpired(host: Host, timer: HostTimer): TimerReaction {
  if (timer.kind === "arp-timeout") {
    return arpTimedOut(host, timer.ip);
  }
  return echoTimedOut(host, timer.sequence);
}

// La risposta ARP non è arrivata in tempo: chi aspettava quel MAC non può partire.
function arpTimedOut(host: Host, ip: Ipv4Address): TimerReaction {
  const waiting = host.pendingPackets.filter((pending) => pending.nextHop === ip);
  host.pendingPackets = host.pendingPackets.filter((pending) => pending.nextHop !== ip);

  // Se tra i pacchetti scartati ci sono echo request dell'host, quelli
  // finiscono qui: non sono mai partiti.
  let output = NOTHING;
  for (const { packet } of waiting) {
    output = merge(output, echoNeverLeft(host, packet));
  }
  return { ...output, droppedPackets: waiting.map((pending) => pending.packet) };
}

function receiveArp(host: Host, arp: ArpPacket): HostReaction {
  if (arp.operation === "request") {
    // La richiesta arriva a tutti, ma risponde solo chi ha l'indirizzo cercato.
    if (arp.targetIp !== host.ip) {
      return { ...NOTHING, dropped: "arp-not-for-me", tableChanged: false };
    }
    // Chi ha chiesto vorrà parlarmi: tanto vale ricordare subito il suo MAC.
    const tableChanged = learn(host, arp.senderIp, arp.senderMac);
    const released = releasePendingPackets(host, arp.senderIp);
    return {
      ...released,
      send: [makeArpReply(arp, host.ports[0].mac), ...released.send],
      dropped: null,
      tableChanged,
    };
  }

  // È una risposta: contiene il MAC che stavo cercando.
  // I pacchetti che lo aspettavano ora possono partire.
  const tableChanged = learn(host, arp.senderIp, arp.senderMac);
  return { ...releasePendingPackets(host, arp.senderIp), dropped: null, tableChanged };
}

function receiveIpv4(host: Host, packet: Ipv4Packet): HostReaction {
  // Il frame era per il mio MAC, ma il pacchetto è per il mio IP?
  // Un host non è un router: ciò che non è per lui lo scarta.
  if (host.ip === null || packet.dstIp !== host.ip) {
    return { ...NOTHING, dropped: "ip-not-for-me", tableChanged: false };
  }

  const icmp = packet.payload;
  if (isEcho(icmp) && icmp.type === "echo-request") {
    // Rispondo a chi ha chiesto: sorgente e destinazione si scambiano.
    const reply = makeIpv4Packet(host.ip, packet.srcIp, makeEchoReply(icmp));
    return { ...sendIpv4Packet(host, reply), dropped: null, tableChanged: false };
  }

  if (!isEcho(icmp)) {
    return { ...receiveIcmpError(host, packet.srcIp, icmp), dropped: null, tableChanged: false };
  }

  // È un echo reply: lo guarda chi ha fatto il ping.
  return { ...receiveEchoReply(host, packet, icmp), dropped: null, tableChanged: false };
}
