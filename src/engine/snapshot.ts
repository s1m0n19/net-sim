// Una fotografia della configurazione della rete, e il modo di tornarci.
//
// Serve ad annullare e ripristinare le modifiche (requisito ED-5): prima di
// ogni modifica si fotografa la rete, e annullare vuol dire tornare alla
// fotografia. La fotografia contiene solo la configurazione: dispositivi,
// porte, indirizzi, cavi. Tabelle, pacchetti in viaggio e attese non ci
// sono.
//
// Per tornare a una fotografia non si butta via la rete: si calcolano le
// modifiche che la separano dalla rete di adesso e si eseguono, una alla
// volta, come se le facesse l'utente. Così annullare "aggiungi PC3" è in
// tutto e per tutto togliere PC3, e la simulazione in corso viene trattata
// con le stesse regole di qualsiasi altra modifica.

import type { Action } from "./actions";
import type { HostConfig, Link, Network, Router, RouterConfig, Switch } from "./model/network";
import { sameRoute } from "./model/router-config";

// Un dispositivo come sta nella fotografia: la sua configurazione, senza
// stato di esecuzione.
export type DeviceSnapshot =
  | ({ kind: "host" } & Required<HostConfig>)
  | Pick<Switch, "kind" | "id" | "name" | "ports" | "powered">
  | ({ kind: "router" } & Required<RouterConfig>);

export interface Snapshot {
  devices: DeviceSnapshot[];
  links: Link[];
}

// Un passo verso la fotografia. Quasi tutti sono normali azioni di
// modifica; in più servono due passi che rimettono al suo posto qualcosa
// che era stato tolto, con l'identificativo, il nome e i MAC che aveva.
export type RestoreStep =
  | Extract<
      Action,
      {
        kind:
          | "remove-device"
          | "remove-link"
          | "move-link-end"
          | "rename-device"
          | "configure-host"
          | "configure-interface"
          | "set-interface-enabled"
          | "add-route"
          | "remove-route";
      }
    >
  | { kind: "put-device"; device: DeviceSnapshot }
  | { kind: "put-link"; link: Link };

/**
 * Fotografa la configurazione di una rete. La fotografia è una copia:
 * le modifiche successive alla rete non la toccano.
 *
 * @param network - la rete da fotografare
 * @returns dispositivi e cavi, senza stato di esecuzione
 */
export function takeSnapshot(network: Network): Snapshot {
  const devices = network.devices.map((device): DeviceSnapshot => {
    const common = { id: device.id, name: device.name, powered: device.powered };
    switch (device.kind) {
      case "host": {
        const ports = device.ports.map((port) => ({ ...port }));
        const { role, ip, mask, gateway } = device;
        return { kind: "host", ...common, role, ports, ip, mask, gateway };
      }
      case "switch":
        return { kind: "switch", ...common, ports: device.ports.map((port) => ({ ...port })) };
      case "router":
        return {
          kind: "router",
          ...common,
          ports: device.ports.map((port) => ({ ...port })),
          routes: device.routes.map((route) => ({ ...route })),
        };
    }
  });
  return { devices, links: network.links.map(copyLink) };
}

/**
 * Calcola le modifiche che riportano una rete alla configurazione di una
 * fotografia. Non modifica nulla.
 *
 * I guasti non sono modifiche: un dispositivo o un cavo che c'è sia nella
 * rete sia nella fotografia resta acceso o spento, collegato o staccato,
 * com'è adesso. Ciò che invece va rimesso torna com'era nella fotografia.
 *
 * @param network - la rete com'è adesso
 * @param snapshot - la configurazione a cui tornare
 * @returns i passi da eseguire, nell'ordine: prima si toglie, poi si
 *   rimette e si corregge
 */
export function stepsToRestore(network: Network, snapshot: Snapshot): RestoreStep[] {
  const steps: RestoreStep[] = [];
  const wantedDevices = new Map(snapshot.devices.map((device) => [device.id, device]));
  const wantedLinks = new Map(snapshot.links.map((link) => [link.id, link]));

  // 1. Via i cavi che nella fotografia non ci sono, o che univano altri
  //    dispositivi. Un cavo che ha solo cambiato porta si sposta.
  const linksToPut = new Map(wantedLinks);
  for (const link of network.links) {
    const wanted = wantedLinks.get(link.id);
    const sameDevices =
      wanted !== undefined &&
      wanted.a.deviceId === link.a.deviceId &&
      wanted.b.deviceId === link.b.deviceId;
    if (!sameDevices) {
      steps.push({ kind: "remove-link", linkId: link.id });
      continue;
    }
    linksToPut.delete(link.id);
    for (const end of ["a", "b"] as const) {
      if (wanted[end].portName !== link[end].portName) {
        steps.push({ kind: "move-link-end", linkId: link.id, end, portName: wanted[end].portName });
      }
    }
  }

  // 2. Via i dispositivi che nella fotografia non ci sono.
  for (const device of network.devices) {
    if (!wantedDevices.has(device.id)) steps.push({ kind: "remove-device", deviceId: device.id });
  }

  // 3. Tornano i dispositivi tolti; gli altri riprendono nome e indirizzi.
  for (const wanted of snapshot.devices) {
    const device = network.devices.find((d) => d.id === wanted.id);
    if (device === undefined) {
      steps.push({ kind: "put-device", device: wanted });
      continue;
    }
    if (device.name !== wanted.name) {
      steps.push({ kind: "rename-device", deviceId: device.id, name: wanted.name });
    }
    if (device.kind === "host" && wanted.kind === "host") {
      const changed = device.ip !== wanted.ip || device.mask !== wanted.mask || device.gateway !== wanted.gateway;
      if (changed) {
        const config = { ip: wanted.ip, mask: wanted.mask, gateway: wanted.gateway };
        steps.push({ kind: "configure-host", deviceId: device.id, config });
      }
    }
    if (device.kind === "switch" && wanted.kind === "switch") {
      steps.push(...portStateSteps(device, wanted));
    }
    if (device.kind === "router" && wanted.kind === "router") {
      steps.push(...routerSteps(device, wanted));
    }
  }

  // 4. Tornano i cavi tolti, ora che i loro dispositivi ci sono tutti.
  for (const link of linksToPut.values()) {
    steps.push({ kind: "put-link", link: copyLink(link) });
  }
  return steps;
}

// Le modifiche che riaccendono o rispengono le porte di uno switch, o le
// interfacce di un router, come nella fotografia. Lo stato acceso o spento
// di una porta è configurazione, non un guasto: lo si imposta con un
// comando (`shutdown`), e si salva nel file.
function portStateSteps(
  device: Switch | Router,
  wanted: Extract<DeviceSnapshot, { kind: "switch" | "router" }>,
): RestoreStep[] {
  const steps: RestoreStep[] = [];
  for (const port of wanted.ports) {
    const now = device.ports.find((p) => p.name === port.name);
    if (now !== undefined && now.enabled !== port.enabled) {
      steps.push({ kind: "set-interface-enabled", deviceId: device.id, portName: port.name, enabled: port.enabled });
    }
  }
  return steps;
}

// Le modifiche che riportano un router alla sua fotografia: indirizzo e
// stato di ogni interfaccia, e le rotte statiche.
function routerSteps(router: Router, wanted: Extract<DeviceSnapshot, { kind: "router" }>): RestoreStep[] {
  const steps: RestoreStep[] = [];
  const deviceId = router.id;
  for (const port of wanted.ports) {
    const now = router.ports.find((p) => p.name === port.name);
    if (now === undefined) continue;
    if (now.ip !== port.ip || now.mask !== port.mask) {
      steps.push({ kind: "configure-interface", deviceId, portName: port.name, ip: port.ip, mask: port.mask });
    }
  }
  steps.push(...portStateSteps(router, wanted));
  for (const route of router.routes) {
    if (!wanted.routes.some((other) => sameRoute(other, route))) {
      steps.push({ kind: "remove-route", deviceId, route: { ...route } });
    }
  }
  for (const route of wanted.routes) {
    if (!router.routes.some((other) => sameRoute(other, route))) {
      steps.push({ kind: "add-route", deviceId, route: { ...route } });
    }
  }
  return steps;
}

function copyLink(link: Link): Link {
  return { id: link.id, a: { ...link.a }, b: { ...link.b }, connected: link.connected };
}
