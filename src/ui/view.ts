// Che cosa disegnare: una descrizione della rete già pronta per lo schermo.
//
// Il motore non sa nulla di coordinate o di etichette. Questa funzione legge
// il simulatore e le posizioni e prepara ciò che serve ai componenti, così
// i componenti non fanno calcoli e questa parte si può provare senza un
// browser.

import { maskToPrefix } from "../engine/model/addresses";
import type { EthernetFrame } from "../engine/model/frames";
import { linkCarriesSignal, otherEndOf, type Device, type Network } from "../engine/model/network";
import type { Conversation, Simulator, Trace } from "../engine/simulator";
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
  outcome: "reply" | "timeout" | "unreachable" | "transmit-failed";
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
  events: [],
  conversations: [],
  pingResults: [],
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
    fromName: nameOf(network, link.a.deviceId),
    toName: nameOf(network, link.b.deviceId),
    fromPort: link.a.portName,
    toPort: link.b.portName,
    connected: link.connected,
    signal: linkCarriesSignal(network, link),
  }));

  const packets: PacketView[] = [];
  for (const event of simulator.queue) {
    if (event.kind !== "frame-arrival") continue;
    packets.push({
      ...detailsOf(event.frameId, event.frame, nameOf(network, event.from.deviceId), nameOf(network, event.to.deviceId)),
      from: at(event.from.deviceId),
      to: at(event.to.deviceId),
      conversationId: event.conversationId,
      // Un frame resta sul cavo per un tick: è partito un tick prima di arrivare.
      departure: event.time - 1,
      arrival: event.time,
    });
  }

  return {
    devices,
    links,
    packets,
    events: simulator.traces.map((trace, index) => describeTrace(network, trace, index)),
    conversations: simulator.conversations.map((conversation) => ({
      id: conversation.id,
      label: labelOf(network, conversation),
    })),
    pingResults: simulator.traces.flatMap((trace) =>
      trace.kind === "ping-result"
        ? [{ conversationId: trace.conversationId, time: trace.time, outcome: trace.outcome }]
        : [],
    ),
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

// Il nome di un dispositivo. L'elenco degli eventi parla anche di
// dispositivi che nel frattempo sono stati tolti dalla rete: di quelli
// resta solo l'identificativo.
function nameOf(network: Network, deviceId: string): string {
  return network.devices.find((device) => device.id === deviceId)?.name ?? `${deviceId} (eliminato)`;
}

// I due dispositivi collegati da un cavo, per nome: "PC1 e SW1".
function endsOf(network: Network, linkId: string): string {
  const link = network.links.find((l) => l.id === linkId);
  if (link === undefined) return "due dispositivi (cavo eliminato)";
  return `${nameOf(network, link.a.deviceId)} e ${nameOf(network, link.b.deviceId)}`;
}

function detailsOf(id: number, frame: EthernetFrame, fromName: string, toName: string): PacketDetails {
  return { id, fromName, toName, frame, protocol: protocolOf(frame), description: describeFrame(frame) };
}

// Come si chiama una conversazione nel filtro: l'azione che l'ha fatta nascere.
function labelOf(network: Network, conversation: Conversation): string {
  const { action } = conversation;
  switch (action.kind) {
    case "ping":
      return `ping ${nameOf(network, action.deviceId)} → ${action.targetIp}`;
    case "resolve-address":
      return `ARP ${nameOf(network, action.deviceId)} → ${action.targetIp}`;
    default:
      return `conversazione ${conversation.id}`;
  }
}

const OUTCOMES = {
  reply: (targetIp: string) => `ping: risposta da ${targetIp}`,
  timeout: () => "ping: richiesta scaduta",
  unreachable: () => "ping: host di destinazione non raggiungibile",
  "transmit-failed": () => "ping: trasmissione non riuscita",
};

// Trasforma una traccia del motore in una riga dell'elenco degli eventi.
// Dice che cosa è successo, non perché: l'app si comporta come una rete vera.
function describeTrace(network: Network, trace: Trace, index: number): EventView {
  const row = (deviceId: string | null, text: string, extra: Partial<EventView> = {}): EventView => ({
    index,
    time: trace.time,
    // Una riga non può rimandare a un dispositivo che non c'è più.
    deviceId: network.devices.some((device) => device.id === deviceId) ? deviceId : null,
    deviceName: deviceId === null ? "" : nameOf(network, deviceId),
    text,
    protocol: null,
    packet: null,
    conversationId: "conversationId" in trace ? trace.conversationId : null,
    ...extra,
  });
  // Per un frame arrivato a una porta, chi lo ha mandato sta all'altro capo del cavo.
  const senderOf = (at: { deviceId: string; portName: string }): string => {
    const other = otherEndOf(network, at);
    return other === null ? "?" : nameOf(network, other.deviceId);
  };

  switch (trace.kind) {
    case "frame-sent": {
      const packet = detailsOf(trace.frameId, trace.frame, nameOf(network, trace.from.deviceId), nameOf(network, trace.to.deviceId));
      return row(trace.from.deviceId, `invia ${packet.description} dalla porta ${trace.from.portName}, destinazione ${trace.frame.dstMac}`, { protocol: packet.protocol, packet });
    }
    case "frame-received": {
      const packet = detailsOf(trace.frameId, trace.frame, senderOf(trace.at), nameOf(network, trace.at.deviceId));
      return row(trace.at.deviceId, `riceve ${packet.description} sulla porta ${trace.at.portName}`, { protocol: packet.protocol, packet });
    }
    case "frame-dropped": {
      const packet = detailsOf(trace.frameId, trace.frame, senderOf(trace.at), nameOf(network, trace.at.deviceId));
      return row(trace.at.deviceId, `scarta ${packet.description}`, { protocol: packet.protocol, packet });
    }
    case "frame-lost": {
      const packet = detailsOf(trace.frameId, trace.frame, nameOf(network, trace.from.deviceId), nameOf(network, trace.to.deviceId));
      return row(trace.from.deviceId, `${packet.description} verso ${packet.toName} va perso`, { protocol: packet.protocol, packet });
    }
    case "table-changed":
      return row(trace.deviceId, `aggiorna la tabella ${trace.table === "arp" ? "ARP" : "MAC"}`);
    case "packet-dropped":
      return row(trace.deviceId, `rinuncia a spedire ${trace.packet.payload.type.replace("-", " ")} per ${trace.packet.dstIp}`, { protocol: "ICMP" });
    case "ping-result":
      return row(trace.deviceId, OUTCOMES[trace.outcome](trace.targetIp), { protocol: "ICMP" });
    case "power-changed":
      return row(trace.deviceId, trace.powered ? "viene acceso" : "viene spento");
    case "link-changed":
      return row(null, `cavo tra ${endsOf(network, trace.linkId)} ${trace.connected ? "riattaccato" : "staccato"}`);
    case "device-added":
      return row(trace.deviceId, "viene aggiunto alla rete");
    case "device-removed":
      return row(null, `${trace.name} viene tolto dalla rete`);
    case "link-added":
      return row(null, `nuovo cavo tra ${endsOf(network, trace.linkId)}`);
    case "link-removed":
      return row(null, `cavo tra ${trace.between[0]} e ${trace.between[1]} tolto`);
    case "device-renamed":
      return row(trace.deviceId, `cambia nome: prima era ${trace.from}`);
    case "host-configured":
      return row(trace.deviceId, "cambia configurazione IP");
    case "simulation-suspended":
      return row(null, "simulazione sospesa: tempesta di broadcast");
  }
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

// L'inquadratura è il foglio di base, allargato quanto serve per contenere
// tutti i dispositivi con i loro margini. Finché la rete sta nel foglio
// l'inquadratura non cambia: posare o spostare un dispositivo non fa
// "saltare" il disegno.
function boundsOf(devices: DeviceView[]): Bounds {
  const sheet = EMPTY_VIEW.bounds;
  const left = Math.min(sheet.x, ...devices.map((device) => device.x - MARGIN.side));
  const top = Math.min(sheet.y, ...devices.map((device) => device.y - MARGIN.top));
  const right = Math.max(sheet.x + sheet.width, ...devices.map((device) => device.x + MARGIN.side));
  const bottom = Math.max(sheet.y + sheet.height, ...devices.map((device) => device.y + MARGIN.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
