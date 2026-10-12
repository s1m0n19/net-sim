// Che cosa disegnare: una descrizione della rete già pronta per lo schermo.
//
// Il motore non sa nulla di coordinate o di etichette. Questa funzione legge
// il simulatore e le posizioni e prepara ciò che serve ai componenti, così
// i componenti non fanno calcoli e questa parte si può provare senza un
// browser.

import { freePortsOf } from "../engine/editing";
import { maskToPrefix, networkAddress } from "../engine/model/addresses";
import { linkCarriesSignal, type Network } from "../engine/model/network";
import { routingTableOf } from "../engine/protocols/routing";
import type { Simulator } from "../engine/simulator";
import type { Position } from "../storage/load";
import { describeTrace, detailsOf, labelOf, nameOf } from "./event-text";
import type { Bounds, DeviceView, LinkView, NetworkView, NextEventView, PacketView } from "./view-types";

// I tipi di ciò che si disegna stanno in view-types.ts; chi usa la vista
// li trova anche qui.
export type * from "./view-types";
export { describeFrame } from "./event-text";

export const EMPTY_VIEW: NetworkView = {
  devices: [],
  links: [],
  packets: [],
  events: [],
  conversations: [],
  pingResults: [],
  traceHops: [],
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
      interfaces: [],
      routes: [],
      routingRows: [],
    };
    if (device.kind === "switch") {
      return { ...base, ...none, macRows: [...device.macTable] };
    }
    if (device.kind === "router") {
      return {
        ...base,
        ...none,
        arpRows: [...device.arpTable],
        pending: device.pendingPackets.map(
          (waiting) => `${waiting.packet.payload.type.replace("-", " ")} per ${waiting.packet.dstIp}`,
        ),
        routingRows: routingTableOf(network, device).map((route) => ({
          code: route.kind === "connected" ? "C" : "S",
          destination: `${networkAddress(route.network, route.mask)}/${maskToPrefix(route.mask)}`,
          nextHop: route.nextHop,
          portName: route.portName,
          network: route.network,
          mask: route.mask,
        })),
        interfaces: device.ports.map((port) => ({
          name: port.name,
          mac: port.mac,
          ip: port.ip,
          mask: port.mask,
          ipLabel: ipLabelOf(port.ip, port.mask),
          enabled: port.enabled,
        })),
        routes: device.routes.map((route) => ({
          destination: `${route.network}/${maskToPrefix(route.mask)}`,
          network: route.network,
          mask: route.mask,
          nextHop: route.nextHop,
        })),
      };
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
    fromChoices: portChoices(network, link.a.deviceId, link.a.portName),
    toChoices: portChoices(network, link.b.deviceId, link.b.portName),
    fromOff: interfaceIsOff(network, link.a.deviceId, link.a.portName),
    toOff: interfaceIsOff(network, link.b.deviceId, link.b.portName),
    fromAddress: interfaceAddress(network, link.a.deviceId, link.a.portName),
    toAddress: interfaceAddress(network, link.b.deviceId, link.b.portName),
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
        ? [{ conversationId: trace.conversationId, time: trace.time, outcome: trace.outcome, from: trace.from, ttl: trace.ttl }]
        : [],
    ),
    traceHops: simulator.traces.flatMap((trace) =>
      trace.kind === "trace-hop"
        ? [
            {
              conversationId: trace.conversationId,
              time: trace.time,
              hop: trace.hop,
              outcome: trace.outcome,
              from: trace.from,
              done: trace.done,
            },
          ]
        : [],
    ),
    bounds: boundsOf(devices),
    time: simulator.time,
    nextEvent: nextEventOf(simulator),
    suspended: simulator.suspended,
  };
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

// Dice se una porta è un'interfaccia di router spenta.
function interfaceIsOff(network: Network, deviceId: string, portName: string): boolean {
  const device = network.devices.find((d) => d.id === deviceId);
  if (device?.kind !== "router") return false;
  return device.ports.find((port) => port.name === portName)?.enabled === false;
}

// L'indirizzo di un'interfaccia di router, con il prefisso; null per le
// porte degli altri dispositivi e per un'interfaccia senza indirizzo.
function interfaceAddress(network: Network, deviceId: string, portName: string): string | null {
  const device = network.devices.find((d) => d.id === deviceId);
  if (device?.kind !== "router") return null;
  const port = device.ports.find((p) => p.name === portName);
  return port === undefined ? null : ipLabelOf(port.ip, port.mask);
}

// Le porte di un dispositivo su cui un cavo può stare: quella che occupa
// già, più quelle libere.
function portChoices(network: Network, deviceId: string, current: string): string[] {
  const free = freePortsOf(network, deviceId);
  const device = network.devices.find((d) => d.id === deviceId);
  return (device?.ports ?? [])
    .map((port) => port.name)
    .filter((name) => name === current || free.includes(name));
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
