// Lettura di un file di rete. Il formato è descritto in docs/formato-file.md.
//
// Un file può arrivare modificato a mano o danneggiato: se qualcosa non
// torna, il caricamento si ferma e dice che cosa non va. Non tenta di riparare.

import { BROADCAST_MAC } from "../engine/model/addresses";
import { checkIpConfig } from "../engine/model/ip-config";
import {
  createHost,
  createSwitch,
  type Device,
  type Link,
  type Network,
  type Port,
  type PortRef,
} from "../engine/model/network";

export const FILE_FORMAT = "net-sim";
export const FILE_VERSION = 1;

export interface Position {
  x: number;
  y: number;
}

export interface LoadedFile {
  network: Network;
  // La posizione sul disegno riguarda l'interfaccia, non il motore:
  // per questo sta fuori dalla rete.
  positions: Map<string, Position>;
}

/**
 * Legge una rete dal testo di un file, dopo averlo controllato.
 * Le tabelle dei dispositivi partono vuote: il file contiene solo la configurazione.
 *
 * @param text - il contenuto del file, in JSON
 * @returns la rete e le posizioni dei dispositivi sul disegno
 * @throws Error con un messaggio che dice che cosa non va, se: il testo non
 *   è JSON valido; non è un file di net-sim o è di una versione sconosciuta;
 *   a un dispositivo o a un collegamento manca un campo, o è del tipo
 *   sbagliato; un tipo di dispositivo è sconosciuto; identificativi,
 *   nomi di porta o indirizzi MAC sono duplicati; la configurazione IP di
 *   un host non è accettabile; un collegamento indica una porta che non
 *   esiste, o una porta ha più di un collegamento
 */
export function loadNetworkFile(text: string): LoadedFile {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Il file non è JSON valido.");
  }

  if (data?.format !== FILE_FORMAT) {
    throw new Error("Il file non è una rete di net-sim.");
  }
  if (data.version !== FILE_VERSION) {
    throw new Error(`Versione del file non supportata: ${data.version}.`);
  }
  if (!Array.isArray(data.network?.devices) || !Array.isArray(data.network?.links)) {
    throw new Error("Il file non contiene l'elenco dei dispositivi e dei collegamenti.");
  }

  const devices: Device[] = [];
  const positions = new Map<string, Position>();
  data.network.devices.forEach((d: any, index: number) => {
    const { device, position } = readDevice(d, `Dispositivo n. ${index + 1}`);
    devices.push(device);
    positions.set(device.id, position);
  });
  checkUnique(
    devices.map((device) => device.id),
    "Identificativo di dispositivo duplicato",
  );
  checkUnique(
    devices.flatMap((device) => device.ports.map((port) => port.mac.toLowerCase())),
    "Indirizzo MAC duplicato",
  );

  const network: Network = { devices, links: [] };
  data.network.links.forEach((l: any, index: number) => {
    network.links.push(readLink(l, `Collegamento n. ${index + 1}`, network));
  });
  checkUnique(
    network.links.map((link) => link.id),
    "Identificativo di collegamento duplicato",
  );
  checkOneLinkPerPort(network);

  return { network, positions };
}

// Costruisce un dispositivo a partire dai suoi dati nel file.
// Una rete appena aperta è una rete appena accesa: le tabelle sono vuote.
function readDevice(d: any, where: string): { device: Device; position: Position } {
  const id = readText(d, "id", where);
  const name = readText(d, "name", where);
  // Da qui in poi i messaggi possono chiamare il dispositivo per nome.
  const kind = readText(d, "kind", name);
  const position = { x: readNumber(d.position, "x", name), y: readNumber(d.position, "y", name) };
  const ports = readPorts(d, name);

  switch (kind) {
    case "host": {
      const config = {
        ip: readTextOrNull(d, "ip", name),
        mask: readTextOrNull(d, "mask", name),
        gateway: readTextOrNull(d, "gateway", name),
      };
      const problem = checkIpConfig(config);
      if (problem !== null) {
        throw new Error(`${name}: ${problem}.`);
      }
      return { device: createHost({ id, name, ports, ...config }), position };
    }
    case "switch":
      return { device: createSwitch({ id, name, ports }), position };
    default:
      throw new Error(`Tipo di dispositivo non supportato: ${kind}.`);
  }
}

function readPorts(d: any, deviceName: string): Port[] {
  if (!Array.isArray(d.ports) || d.ports.length === 0) {
    throw new Error(`${deviceName}: deve avere almeno una porta.`);
  }
  const ports: Port[] = d.ports.map((p: any) => {
    const name = readText(p, "name", `${deviceName}, porta`);
    const mac = readText(p, "mac", `${deviceName} ${name}`);
    if (!isUsableMac(mac)) {
      throw new Error(`${deviceName} ${name}: indirizzo MAC non valido: ${mac}.`);
    }
    return { name, mac };
  });
  checkUnique(
    ports.map((port) => port.name),
    `${deviceName}: nome di porta duplicato`,
  );
  return ports;
}

function readLink(l: any, where: string, network: Network): Link {
  const id = readText(l, "id", where);
  const a = readPortRef(l.a, `Collegamento ${id}`, network);
  const b = readPortRef(l.b, `Collegamento ${id}`, network);
  if (a.deviceId === b.deviceId && a.portName === b.portName) {
    throw new Error(`Il collegamento ${id} unisce una porta a se stessa.`);
  }
  return { id, a, b, connected: true };
}

function readPortRef(ref: any, where: string, network: Network): PortRef {
  const deviceId = readText(ref, "deviceId", where);
  const portName = readText(ref, "portName", where);
  const device = network.devices.find((d) => d.id === deviceId);
  const port = device?.ports.find((p) => p.name === portName);
  if (port === undefined) {
    throw new Error(`${where}: indica una porta inesistente: ${deviceId} ${portName}.`);
  }
  return { deviceId, portName };
}

// A ogni porta si attacca un solo cavo.
function checkOneLinkPerPort(network: Network): void {
  const used = new Set<string>();
  for (const link of network.links) {
    for (const end of [link.a, link.b]) {
      const key = `${end.deviceId} ${end.portName}`;
      if (used.has(key)) {
        const device = network.devices.find((d) => d.id === end.deviceId)!;
        throw new Error(`La porta ${end.portName} di ${device.name} ha più di un collegamento.`);
      }
      used.add(key);
    }
  }
}

function checkUnique(values: string[], problem: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${problem}: ${value}.`);
    }
    seen.add(value);
  }
}

// Sei coppie di cifre esadecimali separate da due punti. Il broadcast
// non può essere l'indirizzo di una porta.
function isUsableMac(mac: string): boolean {
  return /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(mac) && mac.toLowerCase() !== BROADCAST_MAC;
}

function readText(source: any, field: string, where: string): string {
  const value = source?.[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${where}: il campo "${field}" manca o non è un testo.`);
  }
  return value;
}

function readTextOrNull(source: any, field: string, where: string): string | null {
  const value = source?.[field];
  if (value === null) return null;
  return readText(source, field, where);
}

function readNumber(source: any, field: string, where: string): number {
  const value = source?.[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${where}: la posizione "${field}" manca o non è un numero.`);
  }
  return value;
}
