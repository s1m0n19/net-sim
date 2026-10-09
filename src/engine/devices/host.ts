// Comportamento di un host (PC o server): che cosa fa quando deve
// spedire qualcosa, quando riceve un frame e quando scade un'attesa.
//
// Queste funzioni non spediscono nulla e non misurano il tempo: dicono al
// simulatore che cosa l'host vuole inviare e quali attese vuole avviare,
// e il simulatore lo fa.

import {
  BROADCAST_MAC,
  ipToNumber,
  type Ipv4Address,
  type MacAddress,
} from "../model/addresses";
import type { ArpPacket, EthernetFrame, Ipv4Packet } from "../model/frames";
import type { Host } from "../model/network";
import { ARP_TIMEOUT_TICKS, makeArpReply, makeArpRequest } from "../protocols/arp";
import { ECHO_TIMEOUT_TICKS, makeEchoReply, makeEchoRequest } from "../protocols/icmp";
import { makeIpv4Packet, nextHopFor } from "../protocols/ipv4";

// Perché un frame è stato scartato. Serve ai test: l'interfaccia mostra
// che il frame è stato scartato, ma non ne spiega la causa.
export type DropReason = "not-my-mac" | "arp-not-for-me" | "ip-not-for-me";

// Un'attesa dell'host: se scade, l'host deve fare qualcosa.
export type HostTimer =
  // Attesa della risposta ARP per un indirizzo.
  | { kind: "arp-timeout"; ip: Ipv4Address }
  // Attesa dell'echo reply con un certo numero di sequenza.
  | { kind: "echo-timeout"; sequence: number };

/**
 * Dice se due attese sono la stessa attesa.
 *
 * @param a - la prima attesa
 * @param b - la seconda attesa
 * @returns true se hanno lo stesso tipo e riguardano lo stesso indirizzo
 *   o lo stesso numero di sequenza
 */
export function sameTimer(a: HostTimer, b: HostTimer): boolean {
  if (a.kind === "arp-timeout" && b.kind === "arp-timeout") return a.ip === b.ip;
  if (a.kind === "echo-timeout" && b.kind === "echo-timeout") return a.sequence === b.sequence;
  return false;
}

// Com'è finito un echo request, dal punto di vista di chi ha fatto il ping.
// Sono gli esiti che il comando ping di Windows stampa: distinguerli è il
// primo passo per capire dove sta il problema.
export interface PingResult {
  targetIp: Ipv4Address;
  sequence: number;
  outcome:
    // È arrivato l'echo reply.
    | "reply"
    // L'echo request è partito, ma la risposta non è arrivata in tempo.
    | "timeout"
    // L'host sapeva a chi consegnarlo sulla propria LAN, ma quel
    // dispositivo non ha risposto all'ARP.
    | "unreachable"
    // L'host non sapeva nemmeno a chi consegnarlo: non ha un indirizzo,
    // oppure la destinazione è in un'altra rete e non c'è una strada.
    | "transmit-failed";
}

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
  // Echo request arrivati a una conclusione.
  pingResults: PingResult[];
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

const NOTHING: HostOutput = { send: [], startTimers: [], cancelTimers: [], pingResults: [] };

/**
 * Prepara un ping: un echo request verso un indirizzo IP.
 * Non lo spedisce: è il simulatore a metterlo sul cavo.
 * Fa avanzare il numero di sequenza dell'host, ricorda che aspetta una
 * risposta e, se il MAC del prossimo salto non è noto, mette il pacchetto
 * in attesa.
 *
 * @param host - l'host che fa il ping
 * @param targetIp - l'indirizzo IP da raggiungere
 * @returns che cosa fare: inviare l'echo request se il MAC del prossimo
 *   salto è noto, altrimenti inviare la richiesta ARP; in entrambi i casi
 *   avviare l'attesa dell'echo reply. Se l'host non ha un indirizzo IP, o
 *   se la destinazione è in un'altra rete e manca il gateway, l'unico
 *   contenuto è l'esito "transmit-failed"
 * @throws Error se `targetIp` non è un indirizzo IPv4 valido
 */
export function startPing(host: Host, targetIp: Ipv4Address): HostOutput {
  ipToNumber(targetIp); // rifiuta subito ciò che non è un indirizzo

  const sequence = host.nextEchoSequence;
  host.nextEchoSequence += 1;

  // Senza un indirizzo, o senza una strada verso la destinazione,
  // l'echo request non può nemmeno partire.
  if (host.ip === null || nextHopFor(host, targetIp) === null) {
    return { ...NOTHING, pingResults: [{ targetIp, sequence, outcome: "transmit-failed" }] };
  }

  host.awaitedEchoes.push({ targetIp, sequence });
  const request = makeIpv4Packet(host.ip, targetIp, makeEchoRequest(PING_IDENTIFIER, sequence));
  const sent = sendIpv4Packet(host, request);
  return {
    ...sent,
    startTimers: [
      ...sent.startTimers,
      { delay: ECHO_TIMEOUT_TICKS, timer: { kind: "echo-timeout", sequence } },
    ],
  };
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

  // Se tra i pacchetti scartati ci sono miei echo request, quei ping
  // finiscono qui: non sono mai partiti.
  const pingResults: PingResult[] = [];
  const cancelTimers: HostTimer[] = [];
  for (const { packet } of waiting) {
    if (packet.payload.type !== "echo-request") continue;
    const awaited = stopAwaiting(host, packet.dstIp, packet.payload.sequence);
    if (awaited === null) continue;
    pingResults.push({ ...awaited, outcome: "unreachable" });
    cancelTimers.push({ kind: "echo-timeout", sequence: awaited.sequence });
  }

  return {
    ...NOTHING,
    cancelTimers,
    pingResults,
    droppedPackets: waiting.map((pending) => pending.packet),
  };
}

// L'echo reply non è arrivato in tempo: la richiesta è scaduta.
function echoTimedOut(host: Host, sequence: number): TimerReaction {
  const index = host.awaitedEchoes.findIndex((awaited) => awaited.sequence === sequence);
  if (index === -1) return { ...NOTHING, droppedPackets: [] };

  const [awaited] = host.awaitedEchoes.splice(index, 1);
  return { ...NOTHING, pingResults: [{ ...awaited, outcome: "timeout" }], droppedPackets: [] };
}

// Smette di aspettare un echo reply. Restituisce ciò che si stava
// aspettando, oppure null se non si stava aspettando nulla del genere.
function stopAwaiting(host: Host, targetIp: Ipv4Address, sequence: number) {
  const index = host.awaitedEchoes.findIndex(
    (awaited) => awaited.targetIp === targetIp && awaited.sequence === sequence,
  );
  if (index === -1) return null;
  return host.awaitedEchoes.splice(index, 1)[0];
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

  // È un echo reply. Se lo stavo aspettando, il ping è andato a buon fine
  // e l'attesa non serve più. Una risposta arrivata dopo la scadenza, o
  // mai richiesta, viene ricevuta e ignorata.
  const awaited = stopAwaiting(host, packet.srcIp, icmp.sequence);
  if (awaited === null) {
    return { ...NOTHING, dropped: null, tableChanged: false };
  }
  return {
    ...NOTHING,
    cancelTimers: [{ kind: "echo-timeout", sequence: awaited.sequence }],
    pingResults: [{ ...awaited, outcome: "reply" }],
    dropped: null,
    tableChanged: false,
  };
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
