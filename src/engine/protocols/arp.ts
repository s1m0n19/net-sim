// ARP (Address Resolution Protocol): dato un indirizzo IP della propria LAN,
// trova l'indirizzo MAC corrispondente.
//
// Chi cerca manda una richiesta a tutti ("chi ha questo IP?"); solo il
// proprietario dell'indirizzo risponde, direttamente a chi ha chiesto.

import { BROADCAST_MAC, type Ipv4Address, type MacAddress } from "../model/addresses";
import type { ArpPacket, EthernetFrame } from "../model/frames";

// La richiesta viaggia in broadcast, perché non si sa ancora a chi mandarla.
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

// La risposta viaggia in unicast: il MAC di chi ha chiesto è scritto nella richiesta.
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
