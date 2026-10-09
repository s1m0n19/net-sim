// Comportamento di un host (PC o server): che cosa fa quando deve
// risolvere un indirizzo e quando riceve un frame.
//
// Queste funzioni non spediscono nulla: dicono al simulatore che cosa
// l'host vuole inviare, e il simulatore lo mette sul cavo.

import { BROADCAST_MAC, type Ipv4Address, type MacAddress } from "../model/addresses";
import type { EthernetFrame } from "../model/frames";
import type { Host } from "../model/network";
import { makeArpReply, makeArpRequest } from "../protocols/arp";

// Perché un frame è stato scartato. Serve ai test: l'interfaccia mostra
// che il frame è stato scartato, ma non ne spiega la causa.
export type DropReason = "not-my-mac" | "arp-not-for-me";

// Che cosa ha fatto l'host dopo aver ricevuto un frame.
export interface HostReaction {
  send: EthernetFrame[];
  dropped: DropReason | null;
  tableChanged: boolean;
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
 * Può aggiornare la tabella ARP dell'host.
 *
 * @param host - l'host che riceve; la sua tabella ARP può essere modificata
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

  const arp = frame.payload;

  if (arp.operation === "request") {
    // La richiesta arriva a tutti, ma risponde solo chi ha l'indirizzo cercato.
    if (arp.targetIp !== host.ip) {
      return { send: [], dropped: "arp-not-for-me", tableChanged: false };
    }
    // Chi ha chiesto vorrà parlarmi: tanto vale ricordare subito il suo MAC.
    const tableChanged = learn(host, arp.senderIp, arp.senderMac);
    return { send: [makeArpReply(arp, myMac)], dropped: null, tableChanged };
  }

  // È una risposta: contiene il MAC che stavo cercando.
  const tableChanged = learn(host, arp.senderIp, arp.senderMac);
  return { send: [], dropped: null, tableChanged };
}

// Scrive una riga nella tabella ARP. Restituisce true se la tabella è cambiata.
function learn(host: Host, ip: Ipv4Address, mac: MacAddress): boolean {
  if (host.arpTable.get(ip) === mac) return false;
  host.arpTable.set(ip, mac);
  return true;
}
