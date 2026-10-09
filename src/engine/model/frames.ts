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

// Il pacchetto IP porta gli indirizzi di chi parla e di chi deve ricevere,
// da un capo all'altro della rete. Viaggia dentro un frame Ethernet.
export interface Ipv4Packet {
  srcIp: Ipv4Address;
  dstIp: Ipv4Address;
  // Time To Live: ogni router lo diminuisce di uno; a zero il pacchetto muore.
  ttl: number;
  protocol: "ICMP";
  payload: IcmpMessage;
}

// Il messaggio ICMP usato dal ping. Viaggia dentro un pacchetto IP.
export interface IcmpMessage {
  type: "echo-request" | "echo-reply";
  // Identificativo e numero di sequenza tornano uguali nella risposta:
  // servono a chi ha fatto il ping per riconoscerla.
  identifier: number;
  sequence: number;
}
