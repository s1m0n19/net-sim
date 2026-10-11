import type { Ipv4Address, MacAddress } from "./addresses";

// L'incapsulamento è rappresentato alla lettera: il frame Ethernet
// contiene nel campo `payload` l'unità del livello superiore.
// Il campo `etherType` dice che cosa c'è dentro, come nel frame vero.
export type EthernetFrame =
  | { dstMac: MacAddress; srcMac: MacAddress; etherType: "ARP"; payload: ArpPacket }
  | { dstMac: MacAddress; srcMac: MacAddress; etherType: "IPv4"; payload: Ipv4Packet };

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
// I due messaggi del ping.
export interface EchoMessage {
  type: "echo-request" | "echo-reply";
  identifier: number;
  sequence: number;
}

// Un messaggio di errore: un router avvisa il mittente che il suo
// pacchetto non è arrivato. Porta con sé l'intestazione del pacchetto
// scartato, così chi lo riceve capisce a quale si riferisce.
export type IcmpError =
  // Il TTL è arrivato a zero prima della destinazione.
  | { type: "time-exceeded"; original: OriginalPacket }
  // La destinazione non si raggiunge: manca la rotta verso la sua rete
  // ("net"), oppure l'ultimo router non l'ha trovata sul cavo ("host").
  | { type: "destination-unreachable"; code: "net" | "host"; original: OriginalPacket };

// Ciò che un messaggio di errore riporta del pacchetto scartato.
export interface OriginalPacket {
  srcIp: Ipv4Address;
  dstIp: Ipv4Address;
  type: EchoMessage["type"];
  identifier: number;
  sequence: number;
}

export type IcmpMessage = EchoMessage | IcmpError;
