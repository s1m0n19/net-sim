// Scrittura di un file di rete. Il formato è descritto in docs/formato-file.md.
//
// È il contrario di load.ts: ciò che questa funzione scrive, quella lo
// rilegge uguale.

import type { Network } from "../engine/model/network";
import { FILE_FORMAT, FILE_VERSION, type Position } from "./load";

/**
 * Trasforma una rete nel testo di un file.
 *
 * Nel file va la configurazione: dispositivi con porte e indirizzi, cavi,
 * posizioni sul disegno, e i guasti (dispositivi spenti, cavi staccati).
 * Lo stato di esecuzione non viene scritto: tabelle, pacchetti in viaggio,
 * attese e tempo restano fuori.
 *
 * @param network - la rete da salvare
 * @param positions - dove sta ogni dispositivo sul disegno; chi manca
 *   finisce nell'origine
 * @returns il contenuto del file, in JSON leggibile
 */
export function serializeNetwork(network: Network, positions: Map<string, Position>): string {
  const devices = network.devices.map((device) => {
    const position = positions.get(device.id) ?? { x: 0, y: 0 };
    return {
      id: device.id,
      kind: device.kind,
      name: device.name,
      position: { x: position.x, y: position.y },
      ports: device.ports.map((port) => ({ name: port.name, mac: port.mac })),
      // Solo gli host hanno una configurazione IP.
      ...(device.kind === "host" ? { ip: device.ip, mask: device.mask, gateway: device.gateway } : {}),
      // I guasti si scrivono solo quando ci sono: un dispositivo nasce acceso.
      ...(device.powered ? {} : { powered: false }),
    };
  });

  const links = network.links.map((link) => ({
    id: link.id,
    a: { deviceId: link.a.deviceId, portName: link.a.portName },
    b: { deviceId: link.b.deviceId, portName: link.b.portName },
    ...(link.connected ? {} : { connected: false }),
  }));

  const file = { format: FILE_FORMAT, version: FILE_VERSION, network: { devices, links } };
  return `${JSON.stringify(file, null, 2)}\n`;
}
