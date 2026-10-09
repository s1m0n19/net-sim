// Comportamento di un host (PC o server): che cosa fa quando deve
// spedire qualcosa, quando riceve un frame e quando scade un'attesa.
//
// Queste funzioni non spediscono nulla e non misurano il tempo: dicono al
// simulatore che cosa l'host vuole inviare e quali attese vuole avviare,
// e il simulatore lo fa.

import { BROADCAST_MAC, type Ipv4Address, type MacAddress } from "../model/addresses";
import type { ArpPacket, EthernetFrame, Ipv4Packet } from "../model/frames";
import type { Host } from "../model/network";
import { ARP_TIMEOUT_TICKS, makeArpReply, makeArpRequest } from "../protocols/arp";
import { makeEchoReply, makeEchoRequest } from "../protocols/icmp";
import { makeIpv4Packet, nextHopFor } from "../protocols/ipv4";

// Perché un frame è stato scartato. Serve ai test: l'interfaccia mostra
// che il frame è stato scartato, ma non ne spiega la causa.
export type DropReason = "not-my-mac" | "arp-not-for-me" | "ip-not-for-me";

// Un'attesa dell'host: se scade, l'host deve fare qualcosa.
// Per ora ne esiste una sola: l'attesa della risposta ARP per un indirizzo.
export type HostTimer = { kind: "arp-timeout"; ip: Ipv4Address };

// Richiesta di avviare un'attesa che scadrà dopo `delay` tick.
export interface TimerRequest {
  delay: number;
  timer: HostTimer;
}

// Che cosa l'host chiede al simulatore di fare.
export interface HostOutput {
  send: EthernetFrame[];
  startTimers: TimerRequest[];
  cancelTimers: HostTimer[];
}

// Che cosa ha fatto l'host dopo aver ricevuto un frame.
export interface HostReaction extends HostOutput {
  dropped: DropReason | null;
  tableChanged: boolean;
}

// Che cosa ha fatto l'host allo scadere di un'attesa.
export interface TimerReaction extends HostOutput {
  // Pacchetti a cui l'host ha rinunciato.
  droppedPackets: Ipv4Packet[];
}

// Identificativo degli echo request. Windows usa sempre lo stesso valore
// e distingue i ping con il numero di sequenza.
const PING_IDENTIFIER = 1;

const NOTHING: HostOutput = { send: [], startTimers: [], cancelTimers: [] };

/**
 * Prepara un ping: un echo request verso un indirizzo IP.
 * Non lo spedisce: è il simulatore a metterlo sul cavo.
 * Fa avanzare il numero di sequenza dell'host e, se il MAC del prossimo
 * salto non è noto, mette il pacchetto in attesa.
 *
 * @param host - l'host che fa il ping
 * @param targetIp - l'indirizzo IP da raggiungere
 * @returns che cosa fare: inviare l'echo request se il MAC del prossimo
 *   salto è noto, altrimenti inviare la richiesta ARP e avviare l'attesa
 *   della risposta; nulla se l'host non ha un indirizzo IP, o se la
 *   destinazione è in un'altra rete e manca il gateway
 * @throws Error se `targetIp` non è un indirizzo IPv4 valido
 */
export function startPing(host: Host, targetIp: Ipv4Address): HostOutput {
  if (host.ip === null) return NOTHING;

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
 * Può togliere pacchetti dall'attesa.
 *
 * @param host - l'host a cui appartiene l'attesa
 * @param timer - l'attesa scaduta
 * @returns la reazione: i pacchetti a cui l'host rinuncia, più eventuali
 *   frame da inviare e attese da avviare o annullare
 */
export function timerExpired(host: Host, timer: HostTimer): TimerReaction {
  // La risposta ARP non è arrivata in tempo: chi aspettava quel MAC
  // non può partire.
  const waiting = host.pendingPackets.filter((pending) => pending.nextHop === timer.ip);
  host.pendingPackets = host.pendingPackets.filter((pending) => pending.nextHop !== timer.ip);
  return { ...NOTHING, droppedPackets: waiting.map((pending) => pending.packet) };
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
  if (icmp.type === "echo-request") {
    // Rispondo a chi ha chiesto: sorgente e destinazione si scambiano.
    const reply = makeIpv4Packet(host.ip, packet.srcIp, makeEchoReply(icmp));
    return { ...sendIpv4Packet(host, reply), dropped: null, tableChanged: false };
  }

  // È un echo reply: il ping è andato a buon fine.
  return { ...NOTHING, dropped: null, tableChanged: false };
}

// Spedisce un pacchetto IP: lo incapsula in un frame Ethernet diretto al
// prossimo salto. Se il MAC del prossimo salto non è noto, il pacchetto aspetta.
function sendIpv4Packet(host: Host, packet: Ipv4Packet): HostOutput {
  // A chi lo consegno, sulla mia LAN? Alla destinazione o al gateway.
  const nextHop = nextHopFor(host, packet.dstIp);
  if (nextHop === null || host.ip === null) return NOTHING;

  // Il frame ha bisogno del MAC del prossimo salto.
  const nextHopMac = host.arpTable.get(nextHop);
  if (nextHopMac !== undefined) {
    return { ...NOTHING, send: [encapsulate(host, nextHopMac, packet)] };
  }

  // Non lo conosco: il pacchetto aspetta.
  const alreadyAsking = host.pendingPackets.some((pending) => pending.nextHop === nextHop);
  host.pendingPackets.push({ nextHop, packet });
  if (alreadyAsking) {
    // C'è già una richiesta ARP in corso per questo indirizzo: basta quella.
    return NOTHING;
  }
  // Parte la richiesta ARP, e con lei l'attesa della risposta.
  return {
    ...NOTHING,
    send: [makeArpRequest(host.ports[0].mac, host.ip, nextHop)],
    startTimers: [{ delay: ARP_TIMEOUT_TICKS, timer: { kind: "arp-timeout", ip: nextHop } }],
  };
}

// Fa partire i pacchetti che aspettavano il MAC di `ip`, ora in tabella,
// e annulla l'attesa della risposta ARP, che non serve più.
function releasePendingPackets(host: Host, ip: Ipv4Address): HostOutput {
  const mac = host.arpTable.get(ip);
  const ready = host.pendingPackets.filter((pending) => pending.nextHop === ip);
  if (mac === undefined || ready.length === 0) return NOTHING;

  host.pendingPackets = host.pendingPackets.filter((pending) => pending.nextHop !== ip);
  return {
    ...NOTHING,
    send: ready.map((pending) => encapsulate(host, mac, pending.packet)),
    cancelTimers: [{ kind: "arp-timeout", ip }],
  };
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
