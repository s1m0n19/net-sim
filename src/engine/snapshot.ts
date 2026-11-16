// Una fotografia della configurazione della rete, e il modo di tornarci.
//
// Serve ad annullare e ripristinare le modifiche (requisito ED-5): prima di
// ogni modifica si fotografa la rete, e annullare vuol dire tornare alla
// fotografia. La fotografia contiene solo la configurazione: dispositivi,
// porte, indirizzi, VLAN, cavi. Tabelle, pacchetti in viaggio e attese non ci
// sono.
//
// Per tornare a una fotografia non si butta via la rete: si calcolano le
// modifiche che la separano dalla rete di adesso e si eseguono, una alla
// volta, come se le facesse l'utente. Così annullare "aggiungi PC3" è in
// tutto e per tutto togliere PC3, e la simulazione in corso viene trattata
// con le stesse regole di qualsiasi altra modifica.

import type { Action } from "./actions";
import type { HostConfig, Link, Network, Router, RouterConfig, Subinterface, Switch } from "./model/network";
import { networksOverlap, type Ipv4Address } from "./model/addresses";
import { sameRoute } from "./model/router-config";
import { copyAllowedVlans, sameAllowedVlans } from "./model/trunks";

// Un dispositivo come sta nella fotografia: la sua configurazione, senza
// stato di esecuzione.
export type DeviceSnapshot =
  | ({ kind: "host" } & Required<HostConfig>)
  | Pick<Switch, "kind" | "id" | "name" | "ports" | "powered" | "vlans">
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
          | "remove-route"
          | "add-vlan"
          | "rename-vlan"
          | "remove-vlan"
          | "set-port-vlan"
          | "set-port-mode"
          | "set-native-vlan"
          | "set-allowed-vlans"
          | "add-subinterface"
          | "remove-subinterface"
          | "set-subinterface-encapsulation";
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
        return {
          kind: "switch",
          ...common,
          // L'elenco delle VLAN consentite si copia: la fotografia non deve
          // condividere nulla con la rete.
          ports: device.ports.map((port) => ({ ...port, allowedVlans: copyAllowedVlans(port.allowedVlans) })),
          vlans: device.vlans.map((vlan) => ({ ...vlan })),
        };
      case "router":
        return {
          kind: "router",
          ...common,
          ports: device.ports.map((port) => ({ ...port })),
          routes: device.routes.map((route) => ({ ...route })),
          subinterfaces: device.subinterfaces.map((sub) => ({ ...sub })),
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
      steps.push(...vlanSteps(device, wanted));
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

// Le modifiche che riportano le VLAN di uno switch alla sua fotografia.
// L'ordine evita di passare da stati che la fotografia non aveva: prima si
// creano le VLAN che mancano, poi le porte tornano nella loro VLAN e alla
// loro configurazione di trunk, poi si correggono i nomi, e per ultime si
// eliminano le VLAN in più, quando nessuna porta che deve restare attiva
// ci sta più. Modo, nativa e VLAN consentite accettano qualsiasi valore
// valido, quindi il loro ordine non crea stati illegittimi.
function vlanSteps(sw: Switch, wanted: Extract<DeviceSnapshot, { kind: "switch" }>): RestoreStep[] {
  const steps: RestoreStep[] = [];
  const deviceId = sw.id;
  for (const vlan of wanted.vlans) {
    if (!sw.vlans.some((other) => other.id === vlan.id)) {
      steps.push({ kind: "add-vlan", deviceId, vlan: vlan.id, name: vlan.name });
    }
  }
  for (const port of wanted.ports) {
    const now = sw.ports.find((p) => p.name === port.name);
    if (now === undefined) continue;
    if (now.vlan !== port.vlan) {
      steps.push({ kind: "set-port-vlan", deviceId, portName: port.name, vlan: port.vlan });
    }
    if (now.nativeVlan !== port.nativeVlan) {
      steps.push({ kind: "set-native-vlan", deviceId, portName: port.name, vlan: port.nativeVlan });
    }
    if (!sameAllowedVlans(now.allowedVlans, port.allowedVlans)) {
      const vlans = copyAllowedVlans(port.allowedVlans);
      steps.push({ kind: "set-allowed-vlans", deviceId, portName: port.name, vlans });
    }
    if (now.mode !== port.mode) {
      steps.push({ kind: "set-port-mode", deviceId, portName: port.name, mode: port.mode });
    }
  }
  for (const vlan of wanted.vlans) {
    const now = sw.vlans.find((other) => other.id === vlan.id);
    if (now !== undefined && now.name !== vlan.name) {
      steps.push({ kind: "rename-vlan", deviceId, vlan: vlan.id, name: vlan.name });
    }
  }
  for (const vlan of sw.vlans) {
    if (!wanted.vlans.some((other) => other.id === vlan.id)) {
      steps.push({ kind: "remove-vlan", deviceId, vlan: vlan.id });
    }
  }
  return steps;
}

// Le modifiche che riportano un router alla sua fotografia: indirizzi e
// stato delle interfacce, sottointerfacce, rotte statiche.
//
// Le sottointerfacce hanno vincoli che legano interfacce diverse (VLAN unica
// per porta, una sola native, reti non sovrapposte, nessun indirizzo su una
// porta con una native: model/subinterfaces.ts). Per non passare mai da uno
// stato che li viola, prima si smonta e poi si rimonta (D-174, progetto L3-1):
//
//   1. via gli indirizzi che devono sparire o che darebbero fastidio;
//   2. via le VLAN delle sottointerfacce che cambiano VLAN o che verranno tolte;
//   3. via le sottointerfacce che nella fotografia non ci sono;
//   4. le sottointerfacce che mancano, vuote;
//   5. le VLAN della fotografia;
//   6. gli indirizzi della fotografia;
//   7. gli stati, acceso o spento;
//   8. le rotte statiche.
//
// Togliere un indirizzo o una VLAN non viola mai un vincolo; rimettere i
// valori della fotografia, partendo da un sottoinsieme di essi, nemmeno,
// perché la fotografia era valida. Un indirizzo che cambia soltanto, senza
// sovrapporsi a nessun indirizzo della fotografia, si rimette direttamente
// nella fase 6: così un router senza sottointerfacce torna indietro con gli
// stessi passi di sempre.
function routerSteps(router: Router, wanted: Extract<DeviceSnapshot, { kind: "router" }>): RestoreStep[] {
  const steps: RestoreStep[] = [];
  const deviceId = router.id;
  type Address = { ip: Ipv4Address | null; mask: Ipv4Address | null };
  const wantedSubs = new Map(wanted.subinterfaces.map((sub) => [sub.name, sub]));
  const sameAddress = (a: Address, b: Address) => a.ip === b.ip && a.mask === b.mask;
  // L'indirizzo che un'interfaccia logica deve avere; undefined se sparisce.
  const wantedAddress = (name: string): Address | undefined =>
    wanted.ports.find((port) => port.name === name) ?? wantedSubs.get(name);
  const encapsulationChanges = (sub: Subinterface) => {
    const target = wantedSubs.get(sub.name);
    return target === undefined || target.vlan !== sub.vlan || target.native !== sub.native;
  };
  // Gli indirizzi della fotografia, per sapere se uno vecchio darebbe fastidio.
  const wantedNetworks = [...wanted.ports, ...wanted.subinterfaces].filter((i) => i.ip !== null && i.mask !== null);
  const overlapsOthers = (name: string, address: Address) =>
    wantedNetworks.some((other) => other.name !== name && networksOverlap(address.ip!, address.mask!, other.ip!, other.mask!));

  // Lo stato di lavoro: indirizzi e VLAN come saranno passo dopo passo.
  const addresses = new Map<string, Address>();
  for (const port of router.ports) addresses.set(port.name, { ip: port.ip, mask: port.mask });
  for (const sub of router.subinterfaces) addresses.set(sub.name, { ip: sub.ip, mask: sub.mask });
  const encapsulations = new Map(router.subinterfaces.map((sub) => [sub.name, { vlan: sub.vlan, native: sub.native }]));
  const setAddress = (portName: string, address: Address) => {
    steps.push({ kind: "configure-interface", deviceId, portName, ip: address.ip, mask: address.mask });
    addresses.set(portName, address);
  };
  const setEncapsulation = (name: string, vlan: number | null, native: boolean) => {
    steps.push({ kind: "set-subinterface-encapsulation", deviceId, name, vlan, native });
    encapsulations.set(name, { vlan, native });
  };
  const NONE: Address = { ip: null, mask: null };

  // 1. Via gli indirizzi che devono sparire o che darebbero fastidio.
  for (const [name, current] of addresses) {
    if (current.ip === null) continue;
    const target = wantedAddress(name);
    const sub = router.subinterfaces.find((s) => s.name === name);
    const mustGo =
      target === undefined ||
      (sub !== undefined && encapsulationChanges(sub)) ||
      (!sameAddress(target, current) && (target.ip === null || overlapsOthers(name, current)));
    if (mustGo) setAddress(name, NONE);
  }
  // 2. Via le VLAN che cambiano, e quelle delle sottointerfacce da togliere.
  for (const sub of router.subinterfaces) {
    if (sub.vlan !== null && encapsulationChanges(sub)) setEncapsulation(sub.name, null, false);
  }
  // 3. Via le sottointerfacce in più.
  for (const sub of router.subinterfaces) {
    if (wantedSubs.has(sub.name)) continue;
    steps.push({ kind: "remove-subinterface", deviceId, name: sub.name });
    addresses.delete(sub.name);
    encapsulations.delete(sub.name);
  }
  // 4. Le sottointerfacce che mancano, vuote.
  for (const sub of wanted.subinterfaces) {
    if (encapsulations.has(sub.name)) continue;
    steps.push({ kind: "add-subinterface", deviceId, name: sub.name });
    addresses.set(sub.name, NONE);
    encapsulations.set(sub.name, { vlan: null, native: false });
  }
  // 5. Le VLAN della fotografia.
  for (const sub of wanted.subinterfaces) {
    const current = encapsulations.get(sub.name)!;
    if (current.vlan !== sub.vlan || current.native !== sub.native) setEncapsulation(sub.name, sub.vlan, sub.native);
  }
  // 6. Gli indirizzi della fotografia: prima le porte, poi le sottointerfacce.
  for (const target of [...wanted.ports, ...wanted.subinterfaces]) {
    const current = addresses.get(target.name);
    if (current !== undefined && !sameAddress(current, target)) setAddress(target.name, { ip: target.ip, mask: target.mask });
  }
  // 7. Gli stati, acceso o spento.
  steps.push(...portStateSteps(router, wanted));
  for (const sub of wanted.subinterfaces) {
    const enabledNow = router.subinterfaces.find((s) => s.name === sub.name)?.enabled ?? true;
    if (enabledNow !== sub.enabled) {
      steps.push({ kind: "set-interface-enabled", deviceId, portName: sub.name, enabled: sub.enabled });
    }
  }
  // 8. Le rotte statiche.
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
