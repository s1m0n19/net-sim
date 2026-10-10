import type { Ipv4Address, MacAddress } from "./addresses";
import type { Ipv4Packet } from "./frames";

export interface Network {
  devices: Device[];
  links: Link[];
}

export interface Port {
  name: string; // "Fa0"
  mac: MacAddress;
}

// Indica una porta precisa della rete: quale dispositivo e quale porta.
export interface PortRef {
  deviceId: string;
  portName: string;
}

// Il cavo tra due porte.
export interface Link {
  id: string;
  a: PortRef;
  b: PortRef;
  // false = il cavo è staccato: c'è, ma non porta nulla.
  connected: boolean;
}

// Un pacchetto IP che non può ancora partire: l'host sta aspettando di
// conoscere il MAC del prossimo salto.
export interface PendingPacket {
  nextHop: Ipv4Address;
  packet: Ipv4Packet;
}

// Un echo request di cui l'host aspetta ancora la risposta.
export interface AwaitedEcho {
  targetIp: Ipv4Address;
  sequence: number;
  // Quanti echo request dello stesso ping devono ancora partire dopo questo.
  remaining: number;
}

export interface Host {
  kind: "host";
  id: string;
  name: string;
  ports: Port[]; // un PC ne ha una sola
  // Configurazione: la imposta l'utente.
  powered: boolean; // false = il dispositivo è spento
  ip: Ipv4Address | null;
  mask: Ipv4Address | null;
  gateway: Ipv4Address | null;
  // Stato di esecuzione: cambia mentre la rete funziona.
  // La scheda di rete sente il segnale sul cavo? Lo tiene aggiornato il
  // simulatore. Senza segnale l'host sa di non poter trasmettere.
  linkUp: boolean;
  arpTable: Map<Ipv4Address, MacAddress>;
  // Numero di sequenza del prossimo echo request: cresce a ogni ping.
  nextEchoSequence: number;
  // Pacchetti in attesa della risposta ARP.
  pendingPackets: PendingPacket[];
  // Echo request spediti (o in attesa di partire) e non ancora conclusi.
  awaitedEchoes: AwaitedEcho[];
}

export interface Switch {
  kind: "switch";
  id: string;
  name: string;
  ports: Port[];
  powered: boolean; // false = il dispositivo è spento
  // Stato di esecuzione: per ogni MAC conosciuto, il nome della porta
  // da cui lo si raggiunge.
  macTable: Map<MacAddress, string>;
}

// I router si aggiungeranno qui.
export type Device = Host | Switch;

// La parte di un dispositivo che l'utente imposta e che si salva nel file.
// `powered` si può omettere: un dispositivo nasce acceso.
export type HostConfig = Pick<Host, "id" | "name" | "ports" | "ip" | "mask" | "gateway"> & {
  powered?: boolean;
};
export type SwitchConfig = Pick<Switch, "id" | "name" | "ports"> & { powered?: boolean };

/**
 * Crea un host appena acceso: con la configurazione data e lo stato di
 * esecuzione iniziale (tabella ARP vuota, nessun pacchetto in attesa).
 * Finché non entra in una simulazione, l'host risulta senza segnale sul cavo.
 *
 * @param config - identificativo, nome, porte e configurazione IP
 * @returns l'host pronto per essere messo in una rete
 */
export function createHost(config: HostConfig): Host {
  return {
    kind: "host",
    ...config,
    powered: config.powered ?? true,
    linkUp: false,
    arpTable: new Map(),
    nextEchoSequence: 1,
    pendingPackets: [],
    awaitedEchoes: [],
  };
}

/**
 * Crea uno switch appena acceso: con la configurazione data e la tabella
 * MAC vuota.
 *
 * @param config - identificativo, nome e porte
 * @returns lo switch pronto per essere messo in una rete
 */
export function createSwitch(config: SwitchConfig): Switch {
  return { kind: "switch", ...config, powered: config.powered ?? true, macTable: new Map() };
}

/**
 * Elenca gli host di una rete, cioè i dispositivi che hanno un indirizzo IP.
 *
 * @param network - la rete da cui estrarli
 * @returns gli host, nell'ordine in cui compaiono nella rete
 */
export function hostsOf(network: Network): Host[] {
  return network.devices.filter((device) => device.kind === "host");
}

/**
 * Cerca un dispositivo della rete a partire dal suo identificativo.
 *
 * @param network - la rete in cui cercare
 * @param deviceId - l'identificativo interno del dispositivo (non il nome)
 * @returns il dispositivo trovato
 * @throws Error se nessun dispositivo ha quell'identificativo
 */
export function findDevice(network: Network, deviceId: string): Device {
  const device = network.devices.find((d) => d.id === deviceId);
  if (device === undefined) {
    throw new Error(`Dispositivo inesistente: ${deviceId}`);
  }
  return device;
}

/**
 * Cerca un collegamento della rete a partire dal suo identificativo.
 *
 * @param network - la rete in cui cercare
 * @param linkId - l'identificativo del collegamento
 * @returns il collegamento trovato
 * @throws Error se nessun collegamento ha quell'identificativo
 */
export function findLink(network: Network, linkId: string): Link {
  const link = network.links.find((l) => l.id === linkId);
  if (link === undefined) {
    throw new Error(`Collegamento inesistente: ${linkId}`);
  }
  return link;
}

/**
 * Cerca il cavo attaccato a una porta.
 *
 * @param network - la rete in cui cercare
 * @param port - la porta
 * @returns il collegamento che ha quella porta a un capo, staccato o no;
 *   null se alla porta non è attaccato nessun cavo
 */
export function linkAt(network: Network, port: PortRef): Link | null {
  return network.links.find((l) => samePort(l.a, port) || samePort(l.b, port)) ?? null;
}

/**
 * Dice se su un cavo passa il segnale: il cavo non è staccato e i
 * dispositivi ai due capi sono entrambi accesi.
 *
 * @param network - la rete a cui il cavo appartiene
 * @param link - il cavo
 * @returns true se le porte ai due capi sentono il segnale
 */
export function linkCarriesSignal(network: Network, link: Link): boolean {
  return (
    link.connected &&
    findDevice(network, link.a.deviceId).powered &&
    findDevice(network, link.b.deviceId).powered
  );
}

function samePort(p: PortRef, q: PortRef): boolean {
  return p.deviceId === q.deviceId && p.portName === q.portName;
}

/**
 * Dice dove finisce il cavo che parte da una porta.
 *
 * @param network - la rete in cui cercare il collegamento
 * @param port - la porta di partenza
 * @returns la porta all'altro capo del cavo, oppure null se la porta è scollegata
 */
export function otherEndOf(network: Network, port: PortRef): PortRef | null {
  for (const link of network.links) {
    if (samePort(link.a, port)) return link.b;
    if (samePort(link.b, port)) return link.a;
  }
  return null;
}

/**
 * Riporta un dispositivo allo stato di uno appena acceso: tabelle vuote,
 * niente in sospeso. È ciò che succede quando lo si spegne. Non tocca la
 * configurazione.
 *
 * @param device - il dispositivo di cui azzerare lo stato di esecuzione
 */
export function clearRuntimeState(device: Device): void {
  if (device.kind === "switch") {
    device.macTable.clear();
    return;
  }
  device.linkUp = false;
  device.arpTable.clear();
  device.nextEchoSequence = 1;
  device.pendingPackets = [];
  device.awaitedEchoes = [];
}
