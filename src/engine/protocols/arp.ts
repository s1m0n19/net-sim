// ARP (Address Resolution Protocol): dato un indirizzo IP della propria LAN,
// trova l'indirizzo MAC corrispondente.
//
// Chi cerca manda una richiesta a tutti ("chi ha questo IP?"); solo il
// proprietario dell'indirizzo risponde, direttamente a chi ha chiesto.

import { BROADCAST_MAC, type Ipv4Address, type MacAddress } from "../model/addresses";
import type { ArpPacket, EthernetFrame } from "../model/frames";

// Per quanti tick un host aspetta la risposta ARP prima di rinunciare.
// Bastano per andata e ritorno anche nelle reti più grandi previste.
export const ARP_TIMEOUT_TICKS = 20;

/**
 * Costruisce una richiesta ARP ("chi ha questo indirizzo IP?").
 * La richiesta viaggia in broadcast, perché non si sa ancora a chi mandarla.
 *
 * @param senderMac - MAC di chi fa la richiesta
 * @param senderIp - IP di chi fa la richiesta
 * @param targetIp - IP di cui si cerca il MAC
 * @returns il frame Ethernet che contiene la richiesta
 */
export function makeArpRequest(
  senderMac: MacAddress,
  senderIp: Ipv4Address,
  targetIp: Ipv4Address,
): EthernetFrame {
  return {
    dstMac: BROADCAST_MAC,
    srcMac: senderMac,
    etherType: "ARP",
    payload: {
      operation: "request",
      senderMac,
      senderIp,
      targetMac: null,
      targetIp,
    },
  };
}

/**
 * Costruisce la risposta a una richiesta ARP.
 * La risposta viaggia in unicast: il MAC di chi ha chiesto è scritto nella richiesta.
 *
 * @param request - la richiesta a cui si risponde
 * @param myMac - MAC di chi risponde, cioè l'informazione richiesta
 * @returns il frame Ethernet che contiene la risposta
 */
export function makeArpReply(request: ArpPacket, myMac: MacAddress): EthernetFrame {
  return {
    dstMac: request.senderMac,
    srcMac: myMac,
    etherType: "ARP",
    payload: {
      operation: "reply",
      senderMac: myMac,
      senderIp: request.targetIp,
      targetMac: request.senderMac,
      targetIp: request.senderIp,
    },
  };
}
