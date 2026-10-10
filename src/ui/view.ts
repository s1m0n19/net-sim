// Che cosa disegnare: una descrizione della rete già pronta per lo schermo.
//
// Il motore non sa nulla di coordinate o di etichette. Questa funzione legge
// la rete e le posizioni e prepara ciò che serve ai componenti del disegno,
// così i componenti non fanno calcoli e questa parte si può provare senza
// un browser.

import { maskToPrefix } from "../engine/model/addresses";
import { linkCarriesSignal, type Device, type Network } from "../engine/model/network";
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
  // Solo per gli host: l'indirizzo MAC della scheda.
  mac: string | null;
}

export interface LinkView {
  id: string;
  from: Position;
  to: Position;
  fromPort: string;
  toPort: string;
  connected: boolean;
  // Sul cavo passa il segnale: è collegato e i due dispositivi sono accesi.
  signal: boolean;
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
  bounds: Bounds;
}

export const EMPTY_VIEW: NetworkView = {
  devices: [],
  links: [],
  bounds: { x: 0, y: 0, width: 800, height: 500 },
};

/**
 * Prepara la descrizione della rete da disegnare.
 *
 * @param network - la rete, con il suo stato attuale
 * @param positions - dove sta ogni dispositivo sul disegno
 * @returns dispositivi e cavi pronti per i componenti, e il rettangolo
 *   che li contiene tutti
 */
export function buildView(network: Network, positions: Map<string, Position>): NetworkView {
  const at = (deviceId: string): Position => positions.get(deviceId) ?? { x: 0, y: 0 };

  const devices = network.devices.map((device): DeviceView => {
    const { x, y } = at(device.id);
    const base = { id: device.id, kind: device.kind, name: device.name, x, y, powered: device.powered };
    if (device.kind === "switch") {
      return { ...base, ipLabel: null, mac: null };
    }
    return { ...base, ipLabel: ipLabelOf(device.ip, device.mask), mac: device.ports[0].mac };
  });

  const links = network.links.map((link): LinkView => ({
    id: link.id,
    from: at(link.a.deviceId),
    to: at(link.b.deviceId),
    fromPort: link.a.portName,
    toPort: link.b.portName,
    connected: link.connected,
    signal: linkCarriesSignal(network, link),
  }));

  return { devices, links, bounds: boundsOf(devices) };
}

// L'indirizzo come lo si scrive sotto un dispositivo: con il prefisso.
function ipLabelOf(ip: string | null, mask: string | null): string | null {
  if (ip === null || mask === null) return null;
  return `${ip}/${maskToPrefix(mask)}`;
}

// Spazio lasciato attorno ai dispositivi più esterni: sotto ne serve di
// più, perché lì stanno le etichette.
const MARGIN = { side: 110, top: 70, bottom: 120 };

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
