// Guasti e segnale: che cosa succede alla simulazione quando un cavo viene
// staccato o un dispositivo spento, e come ogni dispositivo torna a sapere
// quali dei suoi cavi portano segnale.
//
// Un cavo staccato o un dispositivo spento non lasciano passare nulla: i
// frame che stavano viaggiando da quella parte vanno persi, e uno switch
// dimentica i MAC imparati su una porta rimasta senza segnale.

import type { FrameArrival, SimEvent, SimulationState } from "./events";
import {
  clearRuntimeState,
  hostsOf,
  linkAt,
  linkCarriesSignal,
  type Device,
  type Link,
  type PortRef,
} from "./model/network";
import type { Trace } from "./traces";

/**
 * Stacca o riattacca un cavo. I frame che viaggiavano su un cavo staccato
 * vanno persi.
 *
 * @param sim - la simulazione da sistemare
 * @param link - il cavo
 * @param connected - true per riattaccarlo, false per staccarlo
 * @param produced - l'elenco a cui aggiungere le tracce di ciò che succede
 */
export function setLinkConnected(sim: SimulationState, link: Link, connected: boolean, produced: Trace[]): void {
  if (link.connected === connected) return;
  link.connected = connected;
  produced.push({ time: sim.time, kind: "link-changed", linkId: link.id, connected });

  if (!connected) {
    loseFramesOn(sim, link, produced);
  }
  refreshLinkState(sim, produced);
}

/**
 * Fa perdere i frame che stavano viaggiando su un cavo.
 *
 * @param sim - la simulazione da sistemare
 * @param link - il cavo
 * @param produced - l'elenco a cui aggiungere le tracce dei frame persi
 */
export function loseFramesOn(sim: SimulationState, link: Link, produced: Trace[]): void {
  loseFrames(sim, (arrival) => linkAt(sim.network, arrival.to)?.id === link.id, produced);
}

/**
 * Spegne o accende un dispositivo. Un dispositivo spento non riceve più
 * nulla, non aspetta più nulla e dimentica ciò che aveva imparato.
 *
 * @param sim - la simulazione da sistemare
 * @param device - il dispositivo
 * @param powered - true per accenderlo, false per spegnerlo
 * @param produced - l'elenco a cui aggiungere le tracce di ciò che succede
 */
export function setDevicePowered(sim: SimulationState, device: Device, powered: boolean, produced: Trace[]): void {
  if (device.powered === powered) return;
  device.powered = powered;
  produced.push({ time: sim.time, kind: "power-changed", deviceId: device.id, powered });

  if (!powered) {
    // Un dispositivo spento non riceve più nulla, non aspetta più nulla
    // e dimentica tutto ciò che aveva imparato.
    loseFrames(sim, (arrival) => arrival.to.deviceId === device.id, produced);
    forgetTimersOf(sim, device.id);
    clearRuntimeState(device);
  }
  refreshLinkState(sim, produced);
}

/**
 * Toglie dalla coda i frame in viaggio indicati da `isLost`, e lo registra.
 *
 * @param sim - la simulazione da sistemare
 * @param isLost - dice, per ogni frame in viaggio, se va perso
 * @param produced - l'elenco a cui aggiungere le tracce dei frame persi
 */
export function loseFrames(sim: SimulationState, isLost: (arrival: FrameArrival) => boolean, produced: Trace[]): void {
  const kept: SimEvent[] = [];
  for (const event of sim.queue) {
    if (event.kind !== "frame-arrival" || !isLost(event)) {
      kept.push(event);
      continue;
    }
    const { frameId, from, to, frame, conversationId } = event;
    produced.push({ time: sim.time, kind: "frame-lost", frameId, from, to, frame, conversationId });
  }
  sim.queue = kept;
}

/**
 * Toglie dalla coda tutte le attese di un dispositivo.
 *
 * @param sim - la simulazione da sistemare
 * @param deviceId - il dispositivo che smette di aspettare
 */
export function forgetTimersOf(sim: SimulationState, deviceId: string): void {
  sim.queue = sim.queue.filter((event) => !(event.kind === "timer" && event.deviceId === deviceId));
}

/**
 * Dice se una porta sente il segnale: le è attaccato un cavo, il cavo non
 * è staccato, e i dispositivi ai due capi sono entrambi accesi.
 *
 * @param sim - la simulazione
 * @param port - la porta
 */
export function hasCarrier(sim: SimulationState, port: PortRef): boolean {
  const link = linkAt(sim.network, port);
  return link !== null && linkCarriesSignal(sim.network, link);
}

/**
 * Aggiorna ciò che i dispositivi sanno dei propri cavi. Va chiamata dopo
 * un guasto, una riparazione o una modifica alla rete: ogni host torna a
 * sapere se sente il segnale, e ogni switch dimentica i MAC imparati su
 * una porta rimasta senza.
 *
 * @param sim - la simulazione da sistemare
 * @param produced - l'elenco a cui aggiungere le tracce delle tabelle cambiate
 */
export function refreshLinkState(sim: SimulationState, produced: Trace[]): void {
  // Ogni host sa se la sua scheda sente il segnale.
  for (const host of hostsOf(sim.network)) {
    host.linkUp = hasCarrier(sim, { deviceId: host.id, portName: host.ports[0].name });
  }
  // Uno switch dimentica i MAC imparati su una porta rimasta senza segnale:
  // chi stava lì dietro non è più raggiungibile da quella parte.
  for (const device of sim.network.devices) {
    if (device.kind !== "switch") continue;
    let changed = false;
    for (const [mac, portName] of device.macTable) {
      if (!hasCarrier(sim, { deviceId: device.id, portName })) {
        device.macTable.delete(mac);
        changed = true;
      }
    }
    if (changed) {
      produced.push({
        time: sim.time,
        kind: "table-changed",
        deviceId: device.id,
        table: "mac",
        conversationId: null,
      });
    }
  }
}
