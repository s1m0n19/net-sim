import type { Ipv4Address, MacAddress } from "./addresses";

// L'incapsulamento è rappresentato alla lettera: il frame Ethernet
// contiene nel campo `payload` l'unità del livello superiore.
export interface EthernetFrame {
  dstMac: MacAddress;
  srcMac: MacAddress;
  etherType: "ARP";
  payload: ArpPacket;
}

export interface ArpPacket {
  operation: "request" | "reply";
  senderMac: MacAddress;
  senderIp: Ipv4Address;
  // Nella richiesta è null: è proprio l'informazione che si sta chiedendo.
  targetMac: MacAddress | null;
  targetIp: Ipv4Address;
}
