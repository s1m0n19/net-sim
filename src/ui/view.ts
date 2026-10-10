// Che cosa disegnare: una descrizione della rete già pronta per lo schermo.
//
// Il motore non sa nulla di coordinate o di etichette. Questa funzione legge
// il simulatore e le posizioni e prepara ciò che serve ai componenti, così
// i componenti non fanno calcoli e questa parte si può provare senza un
// browser.

import { maskToPrefix } from "../engine/model/addresses";
import type { EthernetFrame } from "../engine/model/frames";
import { findDevice, linkCarriesSignal, type Device } from "../engine/model/network";
import type { Simulator } from "../engine/simulator";
import type { Position } from "../storage/load";

export interface DeviceView {
  id: string;
  kind: Device["kind"];
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
  // Solo per gli switch: quante porte ha, e la tabella MAC.
  portCount: number;
  macRows: [mac: string, port: string][];
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
  connected: boolean;
  // Sul cavo passa il segnale: è collegato e i due dispositivi sono accesi.
  signal: boolean;
}

export type Protocol = "ARP" | "ICMP";

// Un frame in viaggio su un cavo.
export interface PacketView {
  id: number;
  from: Position;
  to: Position;
  // I nomi dei dispositivi tra cui sta viaggiando.
  fromName: string;
  toName: string;
  // Il contenuto, da mostrare a strati quando la busta è selezionata.
  frame: EthernetFrame;
  protocol: Protocol;
  // Che cos'è, in parole: "ARP request", "ICMP echo reply".
  description: string;
  // Tra quali istanti viaggia. La sua posizione sul cavo dipende da quanto
  // tempo è passato tra i due.
  departure: number;
  arrival: number;
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
  bounds: Bounds;
  // Stato della simulazione.
  time: number;
  nextEvent: NextEventView | null;
  suspended: boolean;
}

export const EMPTY_VIEW: NetworkView = {
  devices: [],
  links: [],
  packets: [],
  bounds: { x: 0, y: 0, width: 800, height: 500 },
  time: 0,
  nextEvent: null,
  suspended: false,
};

/**
 * Prepara la descrizione di ciò che va disegnato.
 *
 * @param simulator - il simulatore, con la rete e il suo stato attuale
 * @param positions - dove sta ogni dispositivo sul disegno
 * @returns dispositivi, cavi e pacchetti in viaggio pronti per i
 *   componenti, il rettangolo che contiene la rete e lo stato della
 *   simulazione
 */
export function buildView(simulator: Simulator, positions: Map<string, Position>): NetworkView {
  const network = simulator.network;
  const at = (deviceId: string): Position => positions.get(deviceId) ?? { x: 0, y: 0 };

  const devices = network.devices.map((device): DeviceView => {
    const { x, y } = at(device.id);
    const base = { id: device.id, kind: device.kind, name: device.name, x, y, powered: device.powered };
    const none = {
      ipLabel: null,
      ip: null,
      mask: null,
      gateway: null,
      mac: null,
      linkUp: false,
      arpRows: [],
      pending: [],
      portCount: device.ports.length,
      macRows: [],
    };
    if (device.kind === "switch") {
      return { ...base, ...none, macRows: [...device.macTable] };
    }
    return {
      ...base,
      ...none,
      ipLabel: ipLabelOf(device.ip, device.mask),
      ip: device.ip,
      mask: device.mask,
      gateway: device.gateway,
      mac: device.ports[0].mac,
      linkUp: device.linkUp,
      arpRows: [...device.arpTable],
      pending: device.pendingPackets.map(
        (waiting) => `${waiting.packet.payload.type.replace("-", " ")} per ${waiting.packet.dstIp}`,
      ),
    };
  });

  const links = network.links.map((link): LinkView => ({
    id: link.id,
    from: at(link.a.deviceId),
    to: at(link.b.deviceId),
    fromName: findDevice(network, link.a.deviceId).name,
    toName: findDevice(network, link.b.deviceId).name,
    fromPort: link.a.portName,
    toPort: link.b.portName,
    connected: link.connected,
    signal: linkCarriesSignal(network, link),
  }));

  const packets: PacketView[] = [];
  for (const event of simulator.queue) {
    if (event.kind !== "frame-arrival") continue;
    packets.push({
      id: event.frameId,
      from: at(event.from.deviceId),
      to: at(event.to.deviceId),
      fromName: findDevice(network, event.from.deviceId).name,
      toName: findDevice(network, event.to.deviceId).name,
      frame: event.frame,
      protocol: protocolOf(event.frame),
      description: describeFrame(event.frame),
      // Un frame resta sul cavo per un tick: è partito un tick prima di arrivare.
      departure: event.time - 1,
      arrival: event.time,
    });
  }

  return {
    devices,
    links,
    packets,
    bounds: boundsOf(devices),
    time: simulator.time,
    nextEvent: nextEventOf(simulator),
    suspended: simulator.suspended,
  };
}

/**
 * Dice che cosa contiene un frame, con le parole che si usano a voce.
 *
 * @param frame - il frame da descrivere
 * @returns per esempio "ARP request" oppure "ICMP echo reply"
 */
export function describeFrame(frame: EthernetFrame): string {
  if (frame.etherType === "ARP") {
    return `ARP ${frame.payload.operation}`;
  }
  return `ICMP ${frame.payload.payload.type.replace("-", " ")}`;
}

// Il protocollo più interno: è quello che dà colore e sigla alla busta.
function protocolOf(frame: EthernetFrame): Protocol {
  return frame.etherType === "ARP" ? "ARP" : "ICMP";
}

function nextEventOf(simulator: Simulator): NextEventView | null {
  if (!simulator.canStep()) return null;

  const time = simulator.queue[0].time;
  const waitingDeviceIds: string[] = [];
  for (const event of simulator.queue) {
    if (event.time !== time) break;
    if (event.kind === "timer" && !waitingDeviceIds.includes(event.deviceId)) {
      waitingDeviceIds.push(event.deviceId);
    }
  }
  return { time, waitingDeviceIds };
}

// L'indirizzo come lo si scrive sotto un dispositivo: con il prefisso.
function ipLabelOf(ip: string | null, mask: string | null): string | null {
  if (ip === null || mask === null) return null;
  return `${ip}/${maskToPrefix(mask)}`;
}

// Spazio lasciato attorno ai dispositivi più esterni: sotto ne serve di
// più, perché lì stanno le etichette.
const MARGIN = { side: 110, top: 96, bottom: 120 };

function boundsOf(devices: DeviceView[]): Bounds {
  if (devices.length === 0) return EMPTY_VIEW.bounds;

  const xs = devices.map((device) => device.x);
  const ys = devices.map((device) => device.y);
  const left = Math.min(...xs) - MARGIN.side;
  const top = Math.min(...ys) - MARGIN.top;
  return {
    x: left,
    y: top,
    width: Math.max(...xs) + MARGIN.side - left,
    height: Math.max(...ys) + MARGIN.bottom - top,
  };
}
