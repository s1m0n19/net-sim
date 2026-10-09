// Lettura di un file di rete. Il formato è descritto in docs/formato-file.md.
//
// Un file può arrivare modificato a mano o danneggiato: se qualcosa non
// torna, il caricamento si ferma e dice che cosa non va. Non tenta di riparare.

import type { Host, Link, Network, PortRef } from "../engine/model/network";

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

  const devices: Host[] = [];
  const positions = new Map<string, Position>();

  for (const d of data.network.devices) {
    if (d.kind !== "host") {
      throw new Error(`Tipo di dispositivo non supportato: ${d.kind}.`);
    }
    devices.push({
      kind: "host",
      id: d.id,
      name: d.name,
      ports: d.ports.map((p: any) => ({ name: p.name, mac: p.mac })),
      ip: d.ip,
      mask: d.mask,
      gateway: d.gateway,
      // Una rete appena aperta è una rete appena accesa: le tabelle sono vuote.
      arpTable: new Map(),
    });
    positions.set(d.id, { x: d.position.x, y: d.position.y });
  }

  const links: Link[] = data.network.links.map((l: any) => ({ id: l.id, a: l.a, b: l.b }));
  const network: Network = { devices, links };

  for (const link of links) {
    checkPortExists(network, link.a, link.id);
    checkPortExists(network, link.b, link.id);
  }

  return { network, positions };
}

function checkPortExists(network: Network, ref: PortRef, linkId: string): void {
  const device = network.devices.find((d) => d.id === ref.deviceId);
  const port = device?.ports.find((p) => p.name === ref.portName);
  if (port === undefined) {
    throw new Error(
      `Il collegamento ${linkId} indica una porta inesistente: ${ref.deviceId} ${ref.portName}.`,
    );
  }
}
