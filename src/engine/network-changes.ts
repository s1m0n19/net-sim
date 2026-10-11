// Modifiche alla rete mentre la simulazione è in corso.
//
// editing.ts cambia la configurazione e nient'altro. Qui si tiene in
// ordine la simulazione attorno a ogni modifica: ciò che viaggiava su un
// cavo tolto va perso, chi cambia configurazione riparte da capo, e ogni
// dispositivo torna a sapere quali cavi ha.

import type { Action } from "./actions";
import * as editing from "./editing";
import type { SimulationState } from "./events";
import { forgetTimersOf, loseFrames, loseFramesOn, refreshLinkState } from "./faults";
import {
  clearRuntimeState,
  createHost,
  createRouter,
  createSwitch,
  findDevice,
  findLink,
  linkAt,
  type Device,
  type Link,
  type StaticRoute,
} from "./model/network";
import { sameRoute } from "./model/router-config";
import type { DeviceSnapshot } from "./snapshot";
import { stepsToRestore, type RestoreStep, type Snapshot } from "./snapshot";
import type { Trace } from "./traces";

// Le azioni che modificano la rete, più i passi con cui si torna a una
// configurazione fotografata.
export type EditAction =
  | Exclude<Action, { kind: "ping" | "resolve-address" | "set-link-connected" | "set-device-powered" }>
  | Extract<RestoreStep, Action>;

/**
 * Esegue una modifica alla rete e tiene in ordine la simulazione.
 *
 * @param sim - la simulazione in corso
 * @param action - la modifica da eseguire
 * @param produced - l'elenco a cui aggiungere le tracce di ciò che succede
 * @throws Error se la modifica indica un dispositivo, una porta o un cavo
 *   che non esiste, o se editing.ts la rifiuta; in quel caso la rete
 *   resta com'era
 */
export function applyEdit(sim: SimulationState, action: EditAction, produced: Trace[]): void {
  const time = sim.time;
  switch (action.kind) {
    case "add-device": {
      const device = editing.addDevice(sim.network, action.template);
      produced.push({ time, kind: "device-added", deviceId: device.id });
      break;
    }
    case "remove-device": {
      const { name } = findDevice(sim.network, action.deviceId);
      // Prima si perdono i frame, finché i cavi ci sono ancora.
      loseFrames(sim, 
        (arrival) => arrival.to.deviceId === action.deviceId || arrival.from.deviceId === action.deviceId,
        produced,
      );
      forgetTimersOf(sim, action.deviceId);
      const links = editing.removeDevice(sim.network, action.deviceId);
      for (const link of links) {
        produced.push({ time, kind: "link-removed", linkId: link.id, between: namesAt(sim, link, action.deviceId, name) });
      }
      produced.push({ time, kind: "device-removed", deviceId: action.deviceId, name });
      break;
    }
    case "add-link": {
      const link = editing.addLink(sim.network, action.a, action.b);
      produced.push({ time, kind: "link-added", linkId: link.id });
      break;
    }
    case "remove-link": {
      const link = findLink(sim.network, action.linkId);
      loseFramesOn(sim, link, produced);
      editing.removeLink(sim.network, action.linkId);
      produced.push({ time, kind: "link-removed", linkId: link.id, between: namesAt(sim, link) });
      break;
    }
    case "move-link-end": {
      // Spostare un capo vuol dire staccarlo e riattaccarlo altrove.
      loseFramesOn(sim, findLink(sim.network, action.linkId), produced);
      editing.moveLinkEnd(sim.network, action.linkId, action.end, action.portName);
      break;
    }
    case "rename-device": {
      const from = findDevice(sim.network, action.deviceId).name;
      editing.renameDevice(sim.network, action.deviceId, action.name);
      produced.push({ time, kind: "device-renamed", deviceId: action.deviceId, from });
      break;
    }
    case "configure-host": {
      const host = editing.configureHost(sim.network, action.deviceId, action.config);
      // Con un indirizzo nuovo, ciò che l'host sapeva e aspettava non vale più.
      forgetTimersOf(sim, host.id);
      clearRuntimeState(host);
      produced.push({ time, kind: "host-configured", deviceId: host.id });
      break;
    }
    case "configure-interface": {
      const { deviceId, portName, ip, mask } = action;
      const router = editing.configureInterface(sim.network, deviceId, portName, ip, mask);
      // Come per un host: con un indirizzo nuovo, ciò che il router
      // sapeva e aspettava non vale più.
      forgetTimersOf(sim, router.id);
      clearRuntimeState(router);
      produced.push({ time, kind: "interface-configured", deviceId, portName });
      break;
    }
    case "set-interface-enabled": {
      const { deviceId, portName, enabled } = action;
      const changed = editing.setInterfaceEnabled(sim.network, deviceId, portName, enabled);
      if (!changed) break;
      if (!enabled) {
        // Spegnere un'interfaccia è come staccarne il cavo: ciò che
        // stava viaggiando lì va perso.
        const link = linkAt(sim.network, { deviceId, portName });
        if (link !== null) loseFramesOn(sim, link, produced);
      }
      produced.push({ time, kind: "interface-changed", deviceId, portName, enabled });
      break;
    }
    case "add-route":
      editing.addRoute(sim.network, action.deviceId, action.route);
      produced.push({ time, kind: "route-added", deviceId: action.deviceId, route: { ...action.route } });
      break;
    case "remove-route":
      editing.removeRoute(sim.network, action.deviceId, action.route);
      produced.push({ time, kind: "route-removed", deviceId: action.deviceId, route: { ...action.route } });
      break;
    case "restore-configuration":
      restore(sim, action.snapshot, produced);
      break;
  }
  refreshLinkState(sim, produced);
}

// Riporta la rete a una configurazione fotografata prima, eseguendo una
// alla volta le modifiche che la separano da quella di adesso.
function restore(sim: SimulationState, snapshot: Snapshot, produced: Trace[]): void {
  const time = sim.time;
  for (const step of stepsToRestore(sim.network, snapshot)) {
    switch (step.kind) {
      case "put-device": {
        // Torna un dispositivo che era stato tolto: è quello di prima,
        // ma appena acceso, con le tabelle vuote.
        const device = deviceFrom(step.device);
        sim.network.devices.push(device);
        produced.push({ time, kind: "device-added", deviceId: device.id });
        break;
      }
      case "put-link":
        sim.network.links.push(step.link);
        produced.push({ time, kind: "link-added", linkId: step.link.id });
        break;
      default:
        applyEdit(sim, step, produced);
    }
  }
  // Le rotte di ogni router tornano nell'ordine che avevano.
  for (const wanted of snapshot.devices) {
    const device = sim.network.devices.find((d) => d.id === wanted.id);
    if (device?.kind !== "router" || wanted.kind !== "router") continue;
    const position = (route: StaticRoute) => wanted.routes.findIndex((other) => sameRoute(other, route));
    device.routes.sort((a, b) => position(a) - position(b));
  }
  // Dispositivi e cavi tornano anche nell'ordine che avevano.
  const place = (ids: string[]) => (a: { id: string }, b: { id: string }) => ids.indexOf(a.id) - ids.indexOf(b.id);
  sim.network.devices.sort(place(snapshot.devices.map((device) => device.id)));
  sim.network.links.sort(place(snapshot.links.map((link) => link.id)));
}

// Ricrea un dispositivo dalla sua fotografia: stessa configurazione, stato
// di esecuzione da appena acceso.
function deviceFrom(snapshot: DeviceSnapshot): Device {
  switch (snapshot.kind) {
    case "host":
      return createHost(snapshot);
    case "switch":
      return createSwitch(snapshot);
    case "router":
      return createRouter({
        ...snapshot,
        ports: snapshot.ports.map((port) => ({ ...port })),
        routes: snapshot.routes.map((route) => ({ ...route })),
      });
  }
}

// I nomi dei dispositivi ai due capi di un cavo. Se uno dei due è appena
// stato tolto dalla rete, il suo nome va passato a parte.
function namesAt(sim: SimulationState, link: Link, removedId?: string, removedName?: string): [string, string] {
  const nameOf = (deviceId: string) =>
    deviceId === removedId ? (removedName ?? "") : findDevice(sim.network, deviceId).name;
  return [nameOf(link.a.deviceId), nameOf(link.b.deviceId)];
}
