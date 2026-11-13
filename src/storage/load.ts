// Lettura di un file di rete. Il formato è descritto in docs/formato-file.md.
//
// Un file può arrivare modificato a mano o danneggiato: se qualcosa non
// torna, il caricamento si ferma e dice che cosa non va. Non tenta di riparare.

import { checkIpConfig } from "../engine/model/ip-config";
import {
  createHost,
  createRouter,
  createSwitch,
  type Device,
  type Link,
  type Network,
  type Port,
  type PortRef,
  type RouterInterface,
  type StaticRoute,
  type SwitchConfig,
} from "../engine/model/network";
import { checkInterfaceAddress, checkInterfacesApart, checkRoute, sameRoute } from "../engine/model/router-config";
import type { NetworkTables } from "../engine/model/tables";
import { checkFields, checkUnique, isUsableMac, readFlag, readNumber, readText, readTextOrNull } from "./fields";
import { LATEST_VERSION, migrateToLatest } from "./migrations";
import { readAnnotations, type Annotation } from "./annotations-file";
import { readTables } from "./tables-file";

export const FILE_FORMAT = "net-sim";
/** La versione più recente del formato, che l'app sa leggere (vedi migrations.ts). */
export const FILE_VERSION = LATEST_VERSION;

// I campi che ogni oggetto del file può avere (D-108): un campo diverso fa
// rifiutare il file, invece di perderlo in silenzio al salvataggio.
const FIELDS = {
  file: ["format", "version", "network", "annotations"],
  network: ["devices", "links"],
  // Le tabelle sono ammesse su tutti: è tables-file.ts a dire, con un
  // messaggio preciso, quale tabella spetta a quale dispositivo.
  device: {
    host: ["id", "kind", "name", "position", "ports", "powered", "ip", "mask", "gateway", "arpTable", "macTable"],
    switch: ["id", "kind", "name", "position", "ports", "powered", "arpTable", "macTable"],
    router: ["id", "kind", "name", "position", "ports", "powered", "routes", "arpTable", "macTable"],
  },
  port: {
    host: ["name", "mac"],
    switch: ["name", "mac", "enabled"],
    router: ["name", "mac", "ip", "mask", "enabled"],
  },
  position: ["x", "y"],
  route: ["network", "mask", "nextHop"],
  link: ["id", "a", "b", "connected"],
  linkEnd: ["deviceId", "portName"],
} as const;

export interface Position {
  x: number;
  y: number;
}

export interface LoadedFile {
  network: Network;
  // La posizione sul disegno riguarda l'interfaccia, non il motore:
  // per questo sta fuori dalla rete.
  positions: Map<string, Position>;
  // Le tabelle con cui la rete parte, se il file le contiene (FILE-5);
  // altrimenti null, e la rete parte con le tabelle vuote.
  tables: NetworkTables | null;
  // Le annotazioni del disegno (ED-9): anche loro fuori dalla rete.
  annotations: Annotation[];
}

/**
 * Legge una rete dal testo di un file, dopo averlo controllato.
 * Il file contiene la configurazione, compresi i guasti (dispositivi
 * spenti, cavi staccati), e se chi l'ha salvato lo ha chiesto le tabelle
 * ARP e MAC. Le tabelle non si mettono nei dispositivi: le applica il
 * simulatore, che le usa anche per ricominciare.
 *
 * @param text - il contenuto del file, in JSON
 * @returns la rete, le posizioni dei dispositivi sul disegno, le tabelle e
 *   le annotazioni
 * @throws Error con un messaggio che dice che cosa non va, se: il testo non
 *   è JSON valido; non è un file di net-sim; è di una versione più recente
 *   dell'app o non valida; un oggetto ha un campo sconosciuto;
 *   a un dispositivo o a un collegamento manca un campo, o è del tipo
 *   sbagliato; un tipo di dispositivo è sconosciuto; identificativi,
 *   nomi di porta o indirizzi MAC sono duplicati; la configurazione IP di
 *   un host non è accettabile; un collegamento indica una porta che non
 *   esiste, o una porta ha più di un collegamento; una tabella non va
 *   (vedi readTables in tables-file.ts); un'annotazione non va (vedi
 *   readAnnotations in annotations-file.ts)
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
  data = checkedVersion(data);
  checkFields(data, FIELDS.file, "Il file");
  checkFields(data.network, FIELDS.network, "La rete");
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

  const tables = readTables(data.network.devices, devices);

  const annotations = readAnnotations(data.annotations);

  return { network, positions, tables, annotations };
}

// Controlla il numero di versione e porta il file all'ultima versione del
// formato. Un file più recente dell'app non si apre: l'app non saprebbe
// che cosa contiene, e salvandolo lo perderebbe.
function checkedVersion(data: any): any {
  const version = data.version;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Versione del file non valida: ${version}.`);
  }
  if (version > FILE_VERSION) {
    throw new Error(
      `Il file è stato salvato con una versione più recente di net-sim (formato ${version}). Ricarica la pagina per aggiornare l'app.`,
    );
  }
  // Nella versione 1 le annotazioni non esistono: un file che le contiene
  // non può venire dall'app.
  if (version === 1 && data.annotations !== undefined) {
    throw new Error("Le annotazioni richiedono la versione 2 del formato.");
  }
  return migrateToLatest(data);
}

// Costruisce un dispositivo a partire dai suoi dati nel file.
// Il dispositivo nasce appena acceso, con le tabelle vuote: quelle del
// file, se ci sono, le aggiunge il simulatore.
function readDevice(d: any, where: string): { device: Device; position: Position } {
  const id = readText(d, "id", where);
  const name = readText(d, "name", where);
  // Da qui in poi i messaggi possono chiamare il dispositivo per nome.
  const kind = readText(d, "kind", name);
  // Un server, per i campi, è un host.
  const family = kind === "server" ? "host" : kind;
  if (family !== "host" && family !== "switch" && family !== "router") {
    throw new Error(`Tipo di dispositivo non supportato: ${kind}.`);
  }
  checkFields(d, FIELDS.device[family], name);
  checkFields(d.position, FIELDS.position, `${name}, posizione`);
  const position = { x: readNumber(d.position, "x", name), y: readNumber(d.position, "y", name) };
  const ports = readPorts(d, name, family);
  const powered = readFlag(d, "powered", name);

  switch (kind) {
    // Un server è un host come un PC: nel file ha il suo tipo, così si
    // riconosce a colpo d'occhio.
    case "host":
    case "server": {
      const config = {
        ip: readTextOrNull(d, "ip", name),
        mask: readTextOrNull(d, "mask", name),
        gateway: readTextOrNull(d, "gateway", name),
      };
      const problem = checkIpConfig(config);
      if (problem !== null) {
        throw new Error(`${name}: ${problem}.`);
      }
      const role = kind === "server" ? "server" : "pc";
      return { device: createHost({ id, name, role, ports, powered, ...config }), position };
    }
    case "switch":
      return { device: createSwitch({ id, name, ports: readSwitchPorts(d, ports, name), powered }), position };
    case "router": {
      const interfaces = readInterfaces(d, ports, name);
      const routes = readRoutes(d, name);
      return { device: createRouter({ id, name, ports: interfaces, routes, powered }), position };
    }
    default:
      throw new Error(`Tipo di dispositivo non supportato: ${kind}.`);
  }
}

function readPorts(d: any, deviceName: string, family: "host" | "switch" | "router"): Port[] {
  if (!Array.isArray(d.ports) || d.ports.length === 0) {
    throw new Error(`${deviceName}: deve avere almeno una porta.`);
  }
  const ports: Port[] = d.ports.map((p: any) => {
    const name = readText(p, "name", `${deviceName}, porta`);
    checkFields(p, FIELDS.port[family], `${deviceName} ${name}`);
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

// Le porte di uno switch: alle porte, già lette, si aggiunge lo stato. Una
// porta senza il campo "enabled" è accesa, come nasce su uno switch: nel
// file si scrive solo quando è spenta. La VLAN il file non la dice ancora
// (arriva con L2-1B): ogni porta sta nella VLAN 1, come la fa nascere
// `createSwitch`.
function readSwitchPorts(d: any, ports: Port[], switchName: string): SwitchConfig["ports"] {
  return ports.map((port, index) => ({
    ...port,
    enabled: readFlag(d.ports[index], "enabled", `${switchName} ${port.name}`),
  }));
}

// Le interfacce di un router: alle porte, già lette, si aggiungono
// l'indirizzo e lo stato. Un'interfaccia senza il campo "enabled" è
// spenta, come nasce su un router.
function readInterfaces(d: any, ports: Port[], routerName: string): RouterInterface[] {
  const interfaces = ports.map((port, index): RouterInterface => {
    const source = d.ports[index];
    const where = `${routerName} ${port.name}`;
    const ip = source.ip === undefined ? null : readTextOrNull(source, "ip", where);
    const mask = source.mask === undefined ? null : readTextOrNull(source, "mask", where);
    const problem = checkInterfaceAddress(ip, mask);
    if (problem !== null) {
      throw new Error(`${where}: ${problem}.`);
    }
    if (source.enabled !== undefined && typeof source.enabled !== "boolean") {
      throw new Error(`${where}: il campo "enabled" deve essere true o false.`);
    }
    return { ...port, ip, mask, enabled: source.enabled === true };
  });
  const overlap = checkInterfacesApart(interfaces);
  if (overlap !== null) {
    throw new Error(`${routerName}: ${overlap}.`);
  }
  return interfaces;
}

// Le rotte statiche di un router. Il campo è facoltativo: se manca, il
// router non ne ha.
function readRoutes(d: any, routerName: string): StaticRoute[] {
  if (d.routes === undefined) return [];
  if (!Array.isArray(d.routes)) {
    throw new Error(`${routerName}: il campo "routes" deve essere un elenco.`);
  }
  const routes: StaticRoute[] = [];
  d.routes.forEach((r: any, index: number) => {
    const where = `${routerName}, rotta n. ${index + 1}`;
    checkFields(r, FIELDS.route, where);
    const route = {
      network: readText(r, "network", where),
      mask: readText(r, "mask", where),
      nextHop: readText(r, "nextHop", where),
    };
    const problem = checkRoute(route);
    if (problem !== null) {
      throw new Error(`${where}: ${problem}.`);
    }
    if (routes.some((other) => sameRoute(other, route))) {
      throw new Error(`${where}: rotta duplicata.`);
    }
    routes.push(route);
  });
  return routes;
}

function readLink(l: any, where: string, network: Network): Link {
  const id = readText(l, "id", where);
  checkFields(l, FIELDS.link, `Collegamento ${id}`);
  checkFields(l.a, FIELDS.linkEnd, `Collegamento ${id}, capo a`);
  checkFields(l.b, FIELDS.linkEnd, `Collegamento ${id}, capo b`);
  const a = readPortRef(l.a, `Collegamento ${id}`, network);
  const b = readPortRef(l.b, `Collegamento ${id}`, network);
  if (a.deviceId === b.deviceId && a.portName === b.portName) {
    throw new Error(`Il collegamento ${id} unisce una porta a se stessa.`);
  }
  return { id, a, b, connected: readFlag(l, "connected", `Collegamento ${id}`) };
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
