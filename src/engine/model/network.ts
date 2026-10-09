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
  ip: Ipv4Address | null;
  mask: Ipv4Address | null;
  gateway: Ipv4Address | null;
  // Stato di esecuzione: cambia mentre la rete funziona.
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
  // Stato di esecuzione: per ogni MAC conosciuto, il nome della porta
  // da cui lo si raggiunge.
  macTable: Map<MacAddress, string>;
}

// I router si aggiungeranno qui.
export type Device = Host | Switch;

// La parte di un dispositivo che l'utente imposta e che si salva nel file.
export type HostConfig = Pick<Host, "id" | "name" | "ports" | "ip" | "mask" | "gateway">;
export type SwitchConfig = Pick<Switch, "id" | "name" | "ports">;

/**
 * Crea un host appena acceso: con la configurazione data e lo stato di
 * esecuzione iniziale (tabella ARP vuota, nessun pacchetto in attesa).
 *
 * @param config - identificativo, nome, porte e configurazione IP
 * @returns l'host pronto per essere messo in una rete
 */
export function createHost(config: HostConfig): Host {
  return {
    kind: "host",
    ...config,
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
  return { kind: "switch", ...config, macTable: new Map() };
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
