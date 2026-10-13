// Ciò che i componenti disegnano: la rete descritta con le parole dello
// schermo (nomi, etichette, posizioni), già pronta. La prepara view.ts.

import type { PingResult, TraceHop } from "../engine/devices/host";
import type { EthernetFrame } from "../engine/model/frames";
import type { Device } from "../engine/model/network";
import type { Position } from "../storage/load";

export interface DeviceView {
  id: string;
  kind: Device["kind"];
  // Per un host: PC o server. Null per gli altri dispositivi.
  role: "pc" | "server" | null;
  name: string;
  x: number;
  y: number;
  powered: boolean;
  // Solo per gli host: "192.168.1.10/24", oppure null se non è configurato.
  ipLabel: string | null;
  // Solo per gli host: la configurazione IP, il MAC della scheda, se la
  // scheda sente il segnale, la tabella ARP e i pacchetti in attesa.
  ip: string | null;
  mask: string | null;
  gateway: string | null;
  mac: string | null;
  linkUp: boolean;
  arpRows: [ip: string, mac: string][];
  pending: string[];
  // Quante porte ha; solo per gli switch, la tabella MAC.
  portCount: number;
  macRows: [mac: string, port: string][];
  // Solo per i router: le interfacce, le rotte statiche impostate e la
  // tabella di routing com'è adesso.
  interfaces: InterfaceView[];
  routes: RouteView[];
  routingRows: RoutingRowView[];
}

// Una riga della tabella di routing di un router.
export interface RoutingRowView {
  // "C" per una rete collegata, "S" per una rotta statica, come su un Cisco.
  code: "C" | "S";
  // "192.168.2.0/24"
  destination: string;
  // Il vicino a cui consegnare; null per una rete collegata.
  nextHop: string | null;
  // L'interfaccia di uscita; null se la rotta non è utilizzabile.
  portName: string | null;
  // Rete e maschera come sono state impostate: servono a togliere la rotta.
  network: string;
  mask: string;
}

// Un'interfaccia di un router.
export interface InterfaceView {
  name: string;
  mac: string;
  ip: string | null;
  mask: string | null;
  // "192.168.1.1/24", oppure null se non ha un indirizzo.
  ipLabel: string | null;
  // false = spenta.
  enabled: boolean;
}

// Una rotta statica di un router.
export interface RouteView {
  // "192.168.2.0/24"
  destination: string;
  network: string;
  mask: string;
  nextHop: string;
}

export interface LinkView {
  id: string;
  from: Position;
  to: Position;
  // I nomi dei dispositivi ai due capi.
  fromName: string;
  toName: string;
  fromPort: string;
  toPort: string;
  // Le porte su cui ogni capo potrebbe stare: quella attuale e quelle
  // libere dello stesso dispositivo, nell'ordine del dispositivo.
  fromChoices: string[];
  toChoices: string[];
  // true se quel capo è un'interfaccia di router o una porta di switch spenta.
  fromOff: boolean;
  toOff: boolean;
  // L'indirizzo dell'interfaccia di router a quel capo, "192.168.1.1/24";
  // null se il capo non è un router o se l'interfaccia non ha un indirizzo.
  fromAddress: string | null;
  toAddress: string | null;
  connected: boolean;
  // Sul cavo passa il segnale: è collegato e i due dispositivi sono accesi.
  signal: boolean;
}

export type Protocol = "ARP" | "ICMP";

// Ciò che di un frame serve al pannello laterale per mostrarne il contenuto.
export interface PacketDetails {
  id: number;
  // I nomi dei dispositivi tra cui viaggia.
  fromName: string;
  toName: string;
  // Il contenuto, da mostrare a strati.
  frame: EthernetFrame;
  protocol: Protocol;
  // Che cos'è, in parole: "ARP request", "ICMP echo reply".
  description: string;
}

// Un frame in viaggio su un cavo.
export interface PacketView extends PacketDetails {
  from: Position;
  to: Position;
  conversationId: number;
  // Tra quali istanti viaggia. La sua posizione sul cavo dipende da quanto
  // tempo è passato tra i due.
  departure: number;
  arrival: number;
}

// Una riga dell'elenco degli eventi: un fatto, con chi lo ha compiuto.
export interface EventView {
  // La posizione nell'elenco: fa da identificativo.
  index: number;
  time: number;
  // Il dispositivo a cui il fatto si riferisce; null per i fatti che non
  // riguardano un dispositivo solo (un cavo staccato, la sospensione).
  deviceId: string | null;
  deviceName: string;
  text: string;
  // Se il fatto riguarda un frame: il suo protocollo e il suo contenuto.
  protocol: Protocol | null;
  packet: PacketDetails | null;
  // A quale conversazione appartiene; null se a nessuna (i guasti).
  conversationId: number | null;
}

// Un echo request concluso: serve al terminale per stampare l'output di ping.
export interface PingResultView {
  conversationId: number;
  time: number;
  outcome: PingResult["outcome"];
  // Chi ha risposto, e con quale TTL è arrivata la risposta.
  from: string | null;
  ttl: number | null;
}

// Un salto scoperto da un tracert, e quando.
export interface TraceHopView {
  conversationId: number;
  time: number;
  hop: number;
  outcome: TraceHop["outcome"];
  from: string | null;
  done: boolean;
}

// Una conversazione tra cui scegliere nel filtro.
export interface ConversationView {
  id: number;
  label: string;
}

// La prossima cosa che succederà.
export interface NextEventView {
  time: number;
  // I dispositivi che in quell'istante hanno un'attesa che scade.
  waitingDeviceIds: string[];
}

// Il rettangolo che contiene tutta la rete, margini compresi.
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NetworkView {
  devices: DeviceView[];
  links: LinkView[];
  packets: PacketView[];
  events: EventView[];
  conversations: ConversationView[];
  pingResults: PingResultView[];
  traceHops: TraceHopView[];
  bounds: Bounds;
  // Stato della simulazione.
  time: number;
  nextEvent: NextEventView | null;
  suspended: boolean;
}
