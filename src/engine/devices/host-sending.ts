// Come un host spedisce un pacchetto IP: a chi consegnarlo sulla propria
// LAN, come conoscerne il MAC, e che cosa fare mentre lo aspetta.
//
// Un pacchetto IP viaggia dentro un frame Ethernet, e il frame ha bisogno
// del MAC del prossimo salto: la destinazione stessa, se è nella stessa
// rete, altrimenti il gateway. Se l'host non lo conosce lo chiede con ARP,
// e intanto tiene il pacchetto in attesa.

import type { Ipv4Address, MacAddress } from "../model/addresses";
import type { EthernetFrame, Ipv4Packet } from "../model/frames";
import type { Host } from "../model/network";
import { ARP_TIMEOUT_TICKS, makeArpRequest } from "../protocols/arp";
import { nextHopFor } from "../protocols/ipv4";
import { NOTHING, type HostOutput } from "./host-output";

/**
 * Spedisce un pacchetto IP: lo incapsula in un frame Ethernet diretto al
 * prossimo salto. Se il MAC del prossimo salto non è noto, il pacchetto
 * aspetta e parte una richiesta ARP.
 *
 * @param host - l'host che spedisce; i suoi pacchetti in attesa possono cambiare
 * @param packet - il pacchetto da spedire
 * @returns il frame da inviare; oppure la richiesta ARP e l'attesa della
 *   risposta; oppure nulla, se l'host non può spedire o se per
 *   quell'indirizzo una richiesta ARP è già in corso
 */
export function sendIpv4Packet(host: Host, packet: Ipv4Packet): HostOutput {
  // Senza segnale sul cavo non si spedisce nulla.
  if (!host.linkUp) return NOTHING;

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

/**
 * Fa partire i pacchetti che aspettavano il MAC di un indirizzo, ora in
 * tabella, e annulla l'attesa della risposta ARP, che non serve più.
 *
 * @param host - l'host; i suoi pacchetti in attesa vengono tolti
 * @param ip - l'indirizzo di cui ora si conosce il MAC
 */
export function releasePendingPackets(host: Host, ip: Ipv4Address): HostOutput {
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

/**
 * Scrive una riga nella tabella ARP di un host.
 *
 * @param host - l'host
 * @param ip - l'indirizzo
 * @param mac - il MAC che gli corrisponde
 * @returns true se la tabella è cambiata
 */
export function learn(host: Host, ip: Ipv4Address, mac: MacAddress): boolean {
  if (host.arpTable.get(ip) === mac) return false;
  host.arpTable.set(ip, mac);
  return true;
}
