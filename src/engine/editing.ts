// Modifiche alla rete: aggiungere e togliere dispositivi e cavi,
// rinominare, configurare.
//
// Queste funzioni cambiano la configurazione della rete e nient'altro: non
// sanno nulla di frame in viaggio, attese o tracce. A tenere in ordine la
// simulazione dopo una modifica pensa il simulatore.

import { checkIpConfig, type IpConfig } from "./model/ip-config";
import {
  createHost,
  createRouter,
  createSwitch,
  findDevice,
  findLink,
  linkAt,
  type Device,
  type Host,
  type Link,
  type Network,
  type PortRef,
  type RouterInterface,
  type SwitchPort,
} from "./model/network";
import { DEFAULT_VLAN } from "./model/vlans";

// Le modifiche che riguardano solo i router stanno in router-editing.ts,
// accendere e spegnere una porta in port-editing.ts, le VLAN degli switch
// in vlan-editing.ts; chi usa questo file le trova anche qui.
export * from "./port-editing";
export * from "./router-editing";
export * from "./vlan-editing";

// Che cosa si può aggiungere: un PC, uno switch con un certo numero di
// porte, oppure un router con un certo numero di interfacce.
export type DeviceTemplate =
  | { kind: "host" }
  | { kind: "server" }
  | { kind: "switch"; portCount: number }
  | { kind: "router"; interfaceCount: number };

/**
 * Aggiunge alla rete un dispositivo nuovo, acceso e senza cavi.
 * Identificativo, nome e indirizzi MAC li sceglie questa funzione, in modo
 * che non coincidano con quelli già presenti.
 *
 * @param network - la rete da modificare
 * @param template - che cosa aggiungere
 * @returns il dispositivo aggiunto
 * @throws Error se uno switch viene chiesto con meno di una porta, o un
 *   router con meno di un'interfaccia
 */
export function addDevice(network: Network, template: DeviceTemplate): Device {
  const device = newDevice(network, template);
  network.devices.push(device);
  return device;
}

function newDevice(network: Network, template: DeviceTemplate): Device {
  switch (template.kind) {
    case "host":
      return newHost(network, "pc");
    case "server":
      return newHost(network, "server");
    case "switch":
      return newSwitch(network, template.portCount);
    case "router":
      return newRouter(network, template.interfaceCount);
  }
}

// Un PC e un server nascono uguali, salvo il nome: PC1, PC2… e SRV1, SRV2…
function newHost(network: Network, role: Host["role"]): Host {
  const [mac] = freeMacs(network, 1);
  return createHost({
    role,
    id: freeName(usedIds(network), "d"),
    name: freeName(usedNames(network), role === "server" ? "SRV" : "PC"),
    ports: [{ name: "Fa0", mac }],
    ip: null,
    mask: null,
    gateway: null,
  });
}

function newSwitch(network: Network, portCount: number): Device {
  if (!Number.isInteger(portCount) || portCount < 1) {
    throw new Error(`Numero di porte non valido: ${portCount}`);
  }
  // Le porte di uno switch nascono accese, nella VLAN 1: basta attaccare il cavo.
  const ports: SwitchPort[] = freeMacs(network, portCount).map((mac, index) => ({
    name: `Fa0/${index + 1}`,
    mac,
    enabled: true,
    vlan: DEFAULT_VLAN,
  }));
  return createSwitch({
    id: freeName(usedIds(network), "s"),
    name: freeName(usedNames(network), "SW"),
    ports,
  });
}

// Un router nasce con le interfacce spente e senza indirizzo, come un
// Cisco appena tolto dalla scatola, e senza rotte.
function newRouter(network: Network, interfaceCount: number): Device {
  if (!Number.isInteger(interfaceCount) || interfaceCount < 1) {
    throw new Error(`Numero di interfacce non valido: ${interfaceCount}`);
  }
  const ports: RouterInterface[] = freeMacs(network, interfaceCount).map((mac, index) => ({
    name: `Gi0/${index}`,
    mac,
    ip: null,
    mask: null,
    enabled: false,
  }));
  return createRouter({
    id: freeName(usedIds(network), "r"),
    name: freeName(usedNames(network), "R"),
    ports,
    routes: [],
  });
}

/**
 * Toglie un dispositivo dalla rete, insieme ai cavi che gli erano attaccati.
 *
 * @param network - la rete da modificare
 * @param deviceId - il dispositivo da togliere
 * @returns i cavi tolti insieme a lui
 * @throws Error se il dispositivo non esiste
 */
export function removeDevice(network: Network, deviceId: string): Link[] {
  findDevice(network, deviceId);
  const attached = network.links.filter(
    (link) => link.a.deviceId === deviceId || link.b.deviceId === deviceId,
  );
  network.links = network.links.filter((link) => !attached.includes(link));
  network.devices = network.devices.filter((device) => device.id !== deviceId);
  return attached;
}

/**
 * Collega due porte con un cavo nuovo.
 *
 * @param network - la rete da modificare
 * @param a - la porta a un capo
 * @param b - la porta all'altro capo
 * @returns il cavo aggiunto
 * @throws Error se una porta non esiste, se è già occupata, o se i due
 *   capi sono la stessa porta
 */
export function addLink(network: Network, a: PortRef, b: PortRef): Link {
  if (a.deviceId === b.deviceId && a.portName === b.portName) {
    throw new Error("Un cavo non può unire una porta a se stessa.");
  }
  requireFreePort(network, a);
  requireFreePort(network, b);

  const link: Link = {
    id: freeName(new Set(network.links.map((l) => l.id)), "l"),
    a: { ...a },
    b: { ...b },
    connected: true,
  };
  network.links.push(link);
  return link;
}

/**
 * Toglie un cavo dalla rete.
 *
 * @param network - la rete da modificare
 * @param linkId - il cavo da togliere
 * @returns il cavo tolto
 * @throws Error se il cavo non esiste
 */
export function removeLink(network: Network, linkId: string): Link {
  const link = findLink(network, linkId);
  network.links = network.links.filter((l) => l.id !== linkId);
  return link;
}

/**
 * Sposta un capo di un cavo su un'altra porta dello stesso dispositivo.
 *
 * @param network - la rete da modificare
 * @param linkId - il cavo
 * @param end - quale capo spostare
 * @param portName - la nuova porta
 * @throws Error se il cavo o la porta non esistono, o se la porta è occupata
 */
export function moveLinkEnd(network: Network, linkId: string, end: "a" | "b", portName: string): void {
  const link = findLink(network, linkId);
  if (link[end].portName === portName) return;
  requireFreePort(network, { deviceId: link[end].deviceId, portName });
  link[end] = { deviceId: link[end].deviceId, portName };
}

/**
 * Cambia il nome di un dispositivo.
 *
 * @param network - la rete da modificare
 * @param deviceId - il dispositivo
 * @param name - il nuovo nome; gli spazi ai lati vengono tolti
 * @throws Error se il dispositivo non esiste, se il nome è vuoto, o se
 *   un altro dispositivo si chiama già così
 */
export function renameDevice(network: Network, deviceId: string, name: string): void {
  const device = findDevice(network, deviceId);
  const wanted = name.trim();
  if (wanted === "") {
    throw new Error("Il nome non può essere vuoto.");
  }
  const taken = network.devices.some(
    (other) => other.id !== deviceId && other.name.toLowerCase() === wanted.toLowerCase(),
  );
  if (taken) {
    throw new Error(`Esiste già un dispositivo di nome ${wanted}.`);
  }
  device.name = wanted;
}

/**
 * Cambia la configurazione IP di un host, dopo averla controllata con le
 * regole di `checkIpConfig`.
 *
 * @param network - la rete da modificare
 * @param deviceId - l'host da configurare
 * @param config - indirizzo, subnet mask e gateway; ciascuno può essere null
 * @returns l'host configurato
 * @throws Error se il dispositivo non esiste o non è un host, o se la
 *   configurazione non è accettabile; in quel caso l'host resta com'era
 */
export function configureHost(network: Network, deviceId: string, config: IpConfig): Host {
  const device = findDevice(network, deviceId);
  if (device.kind !== "host") {
    throw new Error(`${device.name} non è un host: non ha una configurazione IP.`);
  }
  const problem = checkIpConfig(config);
  if (problem !== null) {
    throw new Error(`${device.name}: ${problem}.`);
  }
  device.ip = config.ip;
  device.mask = config.mask;
  device.gateway = config.gateway;
  return device;
}

/**
 * Elenca le porte di un dispositivo a cui non è attaccato nessun cavo.
 *
 * @param network - la rete
 * @param deviceId - il dispositivo
 * @returns i nomi delle porte libere, nell'ordine del dispositivo
 * @throws Error se il dispositivo non esiste
 */
export function freePortsOf(network: Network, deviceId: string): string[] {
  return findDevice(network, deviceId)
    .ports.map((port) => port.name)
    .filter((portName) => linkAt(network, { deviceId, portName }) === null);
}

function requireFreePort(network: Network, ref: PortRef): void {
  const device = findDevice(network, ref.deviceId);
  if (!device.ports.some((port) => port.name === ref.portName)) {
    throw new Error(`${device.name} non ha una porta ${ref.portName}.`);
  }
  if (linkAt(network, ref) !== null) {
    throw new Error(`La porta ${ref.portName} di ${device.name} è già occupata.`);
  }
}

function usedIds(network: Network): Set<string> {
  return new Set(network.devices.map((device) => device.id));
}

function usedNames(network: Network): Set<string> {
  return new Set(network.devices.map((device) => device.name));
}

// Il primo nome libero della serie: PC1, PC2, PC3...
function freeName(used: Set<string>, prefix: string): string {
  for (let n = 1; ; n++) {
    if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
  }
}

// I primi indirizzi MAC non ancora usati nella rete, in ordine crescente.
// Cominciano per 02, il prefisso degli indirizzi assegnati localmente e
// non da un produttore.
function freeMacs(network: Network, count: number): string[] {
  const used = new Set(
    network.devices.flatMap((device) => device.ports.map((port) => port.mac.toLowerCase())),
  );
  const macs: string[] = [];
  for (let n = 1; macs.length < count; n++) {
    const hex = n.toString(16).padStart(6, "0");
    const mac = `02:00:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
    if (!used.has(mac)) macs.push(mac);
  }
  return macs;
}
