// Comportamento di un host (PC o server): che cosa fa quando deve
// spedire qualcosa e quando riceve un frame.
//
// Queste funzioni non spediscono nulla: dicono al simulatore che cosa
// l'host vuole inviare, e il simulatore lo mette sul cavo.

import { BROADCAST_MAC, type Ipv4Address, type MacAddress } from "../model/addresses";
import type { ArpPacket, EthernetFrame, Ipv4Packet } from "../model/frames";
import type { Host } from "../model/network";
import { makeArpReply, makeArpRequest } from "../protocols/arp";
import { makeEchoReply, makeEchoRequest } from "../protocols/icmp";
import { makeIpv4Packet, nextHopFor } from "../protocols/ipv4";

// Perché un frame è stato scartato. Serve ai test: l'interfaccia mostra
// che il frame è stato scartato, ma non ne spiega la causa.
export type DropReason = "not-my-mac" | "arp-not-for-me" | "ip-not-for-me";

// Che cosa ha fatto l'host dopo aver ricevuto un frame.
export interface HostReaction {
  send: EthernetFrame[];
  dropped: DropReason | null;
  tableChanged: boolean;
}

// Identificativo degli echo request. Windows usa sempre lo stesso valore
// e distingue i ping con il numero di sequenza.
const PING_IDENTIFIER = 1;

/**
 * Prepara un ping: un echo request verso un indirizzo IP.
 * Non lo spedisce: è il simulatore a metterlo sul cavo.
 * Fa avanzare il numero di sequenza dell'host e, se il MAC del prossimo
 * salto non è noto, mette il pacchetto in attesa.
 *
 * @param host - l'host che fa il ping
 * @param targetIp - l'indirizzo IP da raggiungere
 * @returns i frame da inviare: l'echo request se il MAC del prossimo salto
 *   è noto, altrimenti la richiesta ARP per scoprirlo; nessuno se l'host
 *   non ha un indirizzo IP, o se la destinazione è in un'altra rete e
 *   manca il gateway
 * @throws Error se `targetIp` non è un indirizzo IPv4 valido
 */
export function startPing(host: Host, targetIp: Ipv4Address): EthernetFrame[] {
  if (host.ip === null) return [];

  const request = makeEchoRequest(PING_IDENTIFIER, host.nextEchoSequence);
  host.nextEchoSequence += 1;
  return sendIpv4Packet(host, makeIpv4Packet(host.ip, targetIp, request));
}

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
 * @returns la reazione: frame da inviare, motivo dell'eventuale scarto,
 *   e se la tabella ARP è cambiata
 */
export function receiveFrame(host: Host, frame: EthernetFrame): HostReaction {
  const myMac = host.ports[0].mac;

  // Un host accetta solo i frame diretti a lui o a tutti.
  if (frame.dstMac !== myMac && frame.dstMac !== BROADCAST_MAC) {
    return { send: [], dropped: "not-my-mac", tableChanged: false };
  }

  // Il frame è per me: lo apro e passo il contenuto al protocollo giusto.
  if (frame.etherType === "ARP") {
    return receiveArp(host, frame.payload);
  }
  return receiveIpv4(host, frame.payload);
}

function receiveArp(host: Host, arp: ArpPacket): HostReaction {
  if (arp.operation === "request") {
    // La richiesta arriva a tutti, ma risponde solo chi ha l'indirizzo cercato.
    if (arp.targetIp !== host.ip) {
      return { send: [], dropped: "arp-not-for-me", tableChanged: false };
    }
    // Chi ha chiesto vorrà parlarmi: tanto vale ricordare subito il suo MAC.
    const tableChanged = learn(host, arp.senderIp, arp.senderMac);
    const reply = makeArpReply(arp, host.ports[0].mac);
    return {
      send: [reply, ...releasePendingPackets(host, arp.senderIp)],
      dropped: null,
      tableChanged,
    };
  }

  // È una risposta: contiene il MAC che stavo cercando.
  // I pacchetti che lo aspettavano ora possono partire.
  const tableChanged = learn(host, arp.senderIp, arp.senderMac);
  return { send: releasePendingPackets(host, arp.senderIp), dropped: null, tableChanged };
}

function receiveIpv4(host: Host, packet: Ipv4Packet): HostReaction {
  // Il frame era per il mio MAC, ma il pacchetto è per il mio IP?
  // Un host non è un router: ciò che non è per lui lo scarta.
  if (host.ip === null || packet.dstIp !== host.ip) {
    return { send: [], dropped: "ip-not-for-me", tableChanged: false };
  }

  const icmp = packet.payload;
  if (icmp.type === "echo-request") {
    // Rispondo a chi ha chiesto: sorgente e destinazione si scambiano.
    const reply = makeIpv4Packet(host.ip, packet.srcIp, makeEchoReply(icmp));
    return { send: sendIpv4Packet(host, reply), dropped: null, tableChanged: false };
  }

  // È un echo reply: il ping è andato a buon fine.
  return { send: [], dropped: null, tableChanged: false };
}

// Spedisce un pacchetto IP: lo incapsula in un frame Ethernet diretto al
// prossimo salto. Restituisce i frame da inviare.
function sendIpv4Packet(host: Host, packet: Ipv4Packet): EthernetFrame[] {
  // A chi lo consegno, sulla mia LAN? Alla destinazione o al gateway.
  const nextHop = nextHopFor(host, packet.dstIp);
  if (nextHop === null || host.ip === null) return [];

  // Il frame ha bisogno del MAC del prossimo salto.
  const nextHopMac = host.arpTable.get(nextHop);
  if (nextHopMac === undefined) {
    // Non lo conosco: il pacchetto aspetta, e intanto parte la richiesta ARP.
    host.pendingPackets.push({ nextHop, packet });
    return [makeArpRequest(host.ports[0].mac, host.ip, nextHop)];
  }

  return [encapsulate(host, nextHopMac, packet)];
}

// Fa partire i pacchetti che aspettavano il MAC di `ip`, ora in tabella.
// Restituisce i frame da inviare e toglie quei pacchetti dall'attesa.
function releasePendingPackets(host: Host, ip: Ipv4Address): EthernetFrame[] {
  const mac = host.arpTable.get(ip);
  if (mac === undefined) return [];

  const ready = host.pendingPackets.filter((pending) => pending.nextHop === ip);
  host.pendingPackets = host.pendingPackets.filter((pending) => pending.nextHop !== ip);
  return ready.map((pending) => encapsulate(host, mac, pending.packet));
}

// Mette un pacchetto IP dentro un frame Ethernet.
function encapsulate(host: Host, dstMac: MacAddress, packet: Ipv4Packet): EthernetFrame {
  return { dstMac, srcMac: host.ports[0].mac, etherType: "IPv4", payload: packet };
}

// Scrive una riga nella tabella ARP. Restituisce true se la tabella è cambiata.
function learn(host: Host, ip: Ipv4Address, mac: MacAddress): boolean {
  if (host.arpTable.get(ip) === mac) return false;
  host.arpTable.set(ip, mac);
  return true;
}
