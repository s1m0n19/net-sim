// Scrittura di un file di rete. Il formato è descritto in docs/formato-file.md.
//
// È il contrario di load.ts: ciò che questa funzione scrive, quella lo
// rilegge uguale.

import type { Device, Network } from "../engine/model/network";
import { FILE_FORMAT, type Position } from "./load";
import { versionToWrite } from "./migrations";
import { annotationsToWrite, type Annotation } from "./annotations-file";
import { tableToWrite } from "./tables-file";
import { portVlanToWrite, usesVlans, vlansToWrite } from "./vlans-file";

/** Che cosa scrivere nel file oltre alla configurazione e alle posizioni. */
export interface SaveOptions {
  // Le tabelle ARP e MAC di ogni dispositivo, così come sono adesso (FILE-5).
  tables?: boolean;
  // Le annotazioni del disegno (ED-9); se non ce ne sono, il campo non c'è.
  annotations?: Annotation[];
}

/**
 * Trasforma una rete nel testo di un file.
 *
 * Nel file va la configurazione: dispositivi con porte, indirizzi e VLAN, cavi,
 * posizioni sul disegno, e i guasti (dispositivi spenti, cavi staccati).
 * Le annotazioni del disegno, se ce ne sono; le tabelle ARP e MAC solo se
 * chieste (FILE-5). Il resto dello stato di
 * esecuzione non viene mai scritto: pacchetti in viaggio, attese e tempo
 * restano fuori.
 *
 * @param network - la rete da salvare
 * @param positions - dove sta ogni dispositivo sul disegno; chi manca
 *   finisce nell'origine
 * @param options - le tabelle, se vanno scritte, e le annotazioni
 * @returns il contenuto del file, in JSON leggibile
 */
export function serializeNetwork(
  network: Network,
  positions: Map<string, Position>,
  options: SaveOptions = {},
): string {
  const withTables = options.tables ?? false;
  const annotations = options.annotations ?? [];
  const devices = network.devices.map((device) => {
    const position = positions.get(device.id) ?? { x: 0, y: 0 };
    return {
      id: device.id,
      // Un server è un host, ma nel file si scrive con il suo nome.
      kind: device.kind === "host" && device.role === "server" ? "server" : device.kind,
      name: device.name,
      position: { x: position.x, y: position.y },
      ports: portsToWrite(device),
      // Solo gli host hanno una configurazione IP propria, con il gateway.
      ...(device.kind === "host" ? { ip: device.ip, mask: device.mask, gateway: device.gateway } : {}),
      ...(device.kind === "router"
        ? { routes: device.routes.map((r) => ({ network: r.network, mask: r.mask, nextHop: r.nextHop })) }
        : {}),
      // Le VLAN di uno switch, solo se ne ha oltre la 1 (D-143).
      ...(device.kind === "switch" ? vlansToWrite(device) : {}),
      // I guasti si scrivono solo quando ci sono: un dispositivo nasce acceso.
      ...(device.powered ? {} : { powered: false }),
      ...(withTables ? tableToWrite(device) : {}),
    };
  });

  const links = network.links.map((link) => ({
    id: link.id,
    a: { deviceId: link.a.deviceId, portName: link.a.portName },
    b: { deviceId: link.b.deviceId, portName: link.b.portName },
    ...(link.connected ? {} : { connected: false }),
  }));

  const file = {
    format: FILE_FORMAT,
    // La versione più bassa che basta: senza annotazioni e senza VLAN il
    // file resta di versione 1, e lo aprono anche le versioni precedenti
    // dell'app (D-108).
    version: versionToWrite(annotations.length > 0, usesVlans(network)),
    network: { devices, links },
    // Un file senza annotazioni resta com'era prima che esistessero.
    ...(annotations.length > 0 ? { annotations: annotationsToWrite(annotations) } : {}),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

// Le porte di un dispositivo, come si scrivono nel file.
function portsToWrite(device: Device) {
  switch (device.kind) {
    case "host":
      return device.ports.map((port) => ({ name: port.name, mac: port.mac }));
    case "switch":
      // Una porta di switch nasce accesa e nella VLAN 1: stato e VLAN si
      // scrivono solo quando sono diversi, così il file di una LAN resta corto.
      return device.ports.map((port) => ({
        name: port.name,
        mac: port.mac,
        ...(port.enabled ? {} : { enabled: false }),
        ...portVlanToWrite(port),
      }));
    case "router":
      // Le interfacce di un router portano con sé indirizzo e stato:
      // nascono spente, quindi lo stato si scrive sempre.
      return device.ports.map((port) => ({
        name: port.name,
        mac: port.mac,
        ip: port.ip,
        mask: port.mask,
        enabled: port.enabled,
      }));
  }
}
