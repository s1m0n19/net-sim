// I comandi della CLI che configurano: da ciò che l'utente ha chiesto
// all'azione del motore che lo fa.
//
// Sono le stesse azioni del pannello laterale: per questo ciò che si
// scrive qui compare subito là, e viceversa. Questo file non esegue
// nulla: propone l'azione, e chi lo chiama la passa al simulatore.
//
// Ciò che un apparato rifiuterebbe viene rifiutato prima, con il
// messaggio di IOS. I controlli sono quelli del motore, che resta
// comunque l'ultimo a decidere.

import {
  addRoute,
  addVlan,
  configureInterface,
  disableInterface,
  enableInterface,
  removeRoute,
  removeVlan,
  renameDevice,
  renameVlan,
  setPortVlan,
  type Action,
} from "../../engine/actions";
import { ipToNumber, isValidMask, maskToPrefix, networkAddress, networksOverlap } from "../../engine/model/addresses";
import {
  findDevice,
  linkAt,
  linkCarriesSignal,
  otherEndOf,
  type Network,
  type Router,
  type Switch,
} from "../../engine/model/network";
import {
  checkInterfaceAddress,
  checkRoute,
  nextHopIsOwnAddress,
  sameRoute,
} from "../../engine/model/router-config";
import { DEFAULT_VLAN, defaultVlanName, vlanExists } from "../../engine/model/vlans";
import type { Command, DeviceInfo } from "./grammar";
import type { CliState } from "./modes";
import { fullInterfaceName } from "./interface-names";

// Che cosa fare dopo un comando di configurazione.
export interface Configured {
  // Le azioni da passare al simulatore, nell'ordine, come una modifica
  // sola: si annullano insieme. Di solito una; due quando
  // `switchport access vlan` deve prima creare la VLAN. Nessuna se non c'è
  // nulla da cambiare, perché il comando è stato rifiutato o la rete è già così.
  actions: Action[];
  // Le righe da stampare: un rifiuto, o i messaggi di un'interfaccia che
  // cambia stato.
  lines: string[];
}

const NOTHING: Configured = { actions: [], lines: [] };

/**
 * Dice all'interprete ciò che gli serve sapere di un dispositivo.
 *
 * @param device - il router o lo switch su cui gira la CLI
 */
export function describeDevice(device: Router | Switch): DeviceInfo {
  return { kind: device.kind, name: device.name, interfaces: device.ports.map((port) => port.name) };
}

/**
 * Trasforma un comando di configurazione nell'azione che lo esegue.
 *
 * @param command - il comando capito dall'interprete
 * @param network - la rete com'è adesso; non viene modificata
 * @param deviceId - il router o lo switch su cui gira la CLI
 * @param state - la modalità in cui si trova la sessione dopo il comando:
 *   dice l'interfaccia (nome breve) o la VLAN che si sta configurando, per
 *   i comandi che valgono dentro l'una o l'altra
 * @returns le azioni da eseguire, come una modifica sola, e le righe da
 *   stampare; null se il comando non è di configurazione (`show`, `ping`...)
 * @throws Error se il dispositivo non esiste o è un host
 */
export function configure(command: Command, network: Network, deviceId: string, state: CliState): Configured | null {
  const { interfaceName } = state;
  const device = findDevice(network, deviceId);
  if (device.kind === "host") {
    throw new Error(`${device.name} non ha una CLI di questo tipo.`);
  }

  switch (command.kind) {
    case "hostname":
      return setHostname(network, device, command.name);
    case "ip-route":
    case "no-ip-route":
      return device.kind === "router" ? changeRoute(device, command) : NOTHING;
    case "vlan":
      return device.kind === "switch" ? createVlan(device, command.id) : NOTHING;
    case "no-vlan":
      return device.kind === "switch" ? deleteVlan(device, command.id) : NOTHING;
    case "vlan-name":
    case "no-vlan-name": {
      if (device.kind !== "switch" || state.vlanId === undefined) return NOTHING;
      const name = command.kind === "vlan-name" ? command.name : defaultVlanName(state.vlanId);
      return nameVlan(device, state.vlanId, name);
    }
    case "switchport-mode-access":
    case "switchport-access-vlan":
    case "no-switchport-access-vlan":
    case "ip-address":
    case "no-ip-address":
    case "shutdown":
    case "no-shutdown":
      break;
    default:
      return null;
  }

  // Da qui in poi, i comandi che valgono dentro un'interfaccia.
  if (interfaceName === null) return NOTHING;
  switch (command.kind) {
    case "ip-address":
      return device.kind === "router" ? setAddress(device, interfaceName, command.ip, command.mask) : NOTHING;
    case "no-ip-address": {
      const port = device.kind === "router" ? device.ports.find((p) => p.name === interfaceName) : undefined;
      if (port === undefined || port.ip === null) return NOTHING;
      return { actions: [configureInterface(deviceId, interfaceName, null, null)], lines: [] };
    }
    case "shutdown":
      return setEnabled(network, device, interfaceName, false);
    case "no-shutdown":
      return setEnabled(network, device, interfaceName, true);
    case "switchport-mode-access":
      // Tutte le porte sono access: non c'è nulla da cambiare.
      return NOTHING;
    case "switchport-access-vlan":
      return device.kind === "switch" ? setAccessVlan(device, interfaceName, command.id) : NOTHING;
    case "no-switchport-access-vlan":
      return device.kind === "switch" ? setAccessVlan(device, interfaceName, DEFAULT_VLAN) : NOTHING;
  }
}

// vlan 10: crea la VLAN, se non c'è. Se c'è già non cambia nulla: si entra
// soltanto a configurarla.
function createVlan(sw: Switch, id: number): Configured {
  if (vlanExists(sw, id)) return NOTHING;
  return { actions: [addVlan(sw.id, id)], lines: [] };
}

// no vlan 10: elimina la VLAN. Le sue porte restano assegnate al numero,
// inattive, come su IOS: nessuna torna da sola nella VLAN 1.
function deleteVlan(sw: Switch, id: number): Configured {
  if (id === DEFAULT_VLAN) return { actions: [], lines: ["Default VLAN 1 may not be deleted."] };
  if (!vlanExists(sw, id)) return { actions: [], lines: [`% VLAN ${id} not found in current VLAN database`] };
  return { actions: [removeVlan(sw.id, id)], lines: [] };
}

// name, dentro una VLAN. Il nome lo controlla il motore, con le stesse
// regole del file e del pannello: un rifiuto torna come messaggio.
function nameVlan(sw: Switch, id: number, name: string): Configured {
  if (id === DEFAULT_VLAN) return { actions: [], lines: ["Default VLAN 1 may not have its name changed."] };
  if (sw.vlans.find((vlan) => vlan.id === id)?.name === name) return NOTHING;
  return { actions: [renameVlan(sw.id, id, name)], lines: [] };
}

// switchport access vlan 30: la porta passa nella VLAN 30. Se la VLAN non
// c'è, IOS la crea e lo dice: creare e spostare sono allora una modifica
// sola, che si annulla in un colpo.
function setAccessVlan(sw: Switch, portName: string, id: number): Configured {
  const port = sw.ports.find((p) => p.name === portName);
  if (port === undefined) return NOTHING;
  const actions: Action[] = [];
  const lines: string[] = [];
  if (!vlanExists(sw, id)) {
    actions.push(addVlan(sw.id, id));
    lines.push(`% Access VLAN does not exist. Creating vlan ${id}`);
  }
  if (port.vlan !== id) actions.push(setPortVlan(sw.id, portName, id));
  return { actions, lines };
}

// hostname: su IOS un nome comincia con una lettera e continua con
// lettere, cifre e trattini. Qui in più i nomi sono unici, perché è dal
// nome che si riconosce un dispositivo sul disegno.
function setHostname(network: Network, device: Router | Switch, name: string): Configured {
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) {
    return { actions: [], lines: ["% Hostname contains one or more illegal characters."] };
  }
  const taken = network.devices.some((other) => other !== device && other.name.toLowerCase() === name.toLowerCase());
  if (taken) {
    return { actions: [], lines: [`% Hostname "${name}" is already in use`] };
  }
  if (device.name === name) return NOTHING;
  return { actions: [renameDevice(device.id, name)], lines: [] };
}

// ip address: l'indirizzo deve poter essere quello di un dispositivo, e la
// sua rete non deve sovrapporsi a quella di un'altra interfaccia.
function setAddress(router: Router, interfaceName: string, ip: string, mask: string): Configured {
  if (!isValidMask(mask)) {
    // IOS scrive in esadecimale una maschera con i bit non contigui.
    const hex = ipToNumber(mask).toString(16).toUpperCase().padStart(8, "0");
    return { actions: [], lines: [`Bad mask 0x${hex} for address ${ip}`] };
  }
  if (checkInterfaceAddress(ip, mask) !== null) {
    const first = Number(ip.split(".")[0]);
    // 0.x, 127.x e da 224 in su non sono mai indirizzi di un dispositivo;
    // negli altri casi è l'indirizzo di rete o di broadcast della sottorete.
    const line =
      first === 0 || first === 127 || first >= 224
        ? `Not a valid host address - ${ip}`
        : `Bad mask /${maskToPrefix(mask)} for address ${ip}`;
    return { actions: [], lines: [line] };
  }
  for (const other of router.ports) {
    if (other.name === interfaceName || other.ip === null || other.mask === null) continue;
    if (networksOverlap(ip, mask, other.ip, other.mask)) {
      const network = networkAddress(other.ip, other.mask);
      return { actions: [], lines: [`% ${network} overlaps with ${fullInterfaceName(other.name)}`] };
    }
  }
  return { actions: [configureInterface(router.id, interfaceName, ip, mask)], lines: [] };
}

// shutdown e no shutdown. I messaggi sono quelli con cui IOS avvisa che
// un'interfaccia ha cambiato stato: LINK dice se è accesa, LINEPROTO se
// dall'altra parte del cavo c'è qualcuno.
function setEnabled(network: Network, device: Router | Switch, interfaceName: string, enabled: boolean): Configured {
  const port = device.ports.find((p) => p.name === interfaceName);
  if (port === undefined || port.enabled === enabled) return NOTHING;

  const name = fullInterfaceName(interfaceName);
  const link = `%LINK-5-CHANGED: Interface ${name}, changed state to`;
  const protocol = `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to`;

  if (!enabled) {
    const ref = { deviceId: device.id, portName: interfaceName };
    const cable = linkAt(network, ref);
    const wasUp = cable !== null && linkCarriesSignal(network, cable);
    return {
      actions: [disableInterface(device.id, interfaceName)],
      lines: [`${link} administratively down`, ...(wasUp ? [`${protocol} down`] : [])],
    };
  }
  const willBeUp = wouldCarrySignal(network, device, interfaceName);
  return {
    actions: [enableInterface(device.id, interfaceName)],
    lines: willBeUp ? [`${link} up`, `${protocol} up`] : [`${link} down`],
  };
}

// Dice se, una volta accesa, la porta sentirà il segnale: le serve un
// cavo attaccato, e dall'altra parte un dispositivo acceso con la porta accesa.
function wouldCarrySignal(network: Network, device: Router | Switch, portName: string): boolean {
  const here = { deviceId: device.id, portName };
  const cable = linkAt(network, here);
  const there = otherEndOf(network, here);
  if (cable === null || there === null || !cable.connected || !device.powered) return false;

  const neighbour = findDevice(network, there.deviceId);
  if (!neighbour.powered) return false;
  if (neighbour.kind === "host") return true;
  return neighbour.ports.find((port) => port.name === there.portName)?.enabled ?? false;
}

// ip route e no ip route.
function changeRoute(router: Router, command: Extract<Command, { kind: "ip-route" | "no-ip-route" }>): Configured {
  const route = { network: command.network, mask: command.mask, nextHop: command.nextHop };
  const exists = router.routes.some((other) => sameRoute(other, route));

  if (command.kind === "no-ip-route") {
    if (!exists) return { actions: [], lines: ["%No matching route to delete"] };
    return { actions: [removeRoute(router.id, route)], lines: [] };
  }
  // 192.168.2.5 con 255.255.255.0 non è una rete.
  if (checkRoute(route) !== null) {
    return { actions: [], lines: ["%Inconsistent address and mask"] };
  }
  // Il prossimo salto è un vicino, non il router stesso.
  if (nextHopIsOwnAddress(route, router.ports)) {
    return { actions: [], lines: ["%Invalid next hop address (it's this router)"] };
  }
  // Riscrivere una rotta che c'è già non è un errore: non cambia nulla.
  if (exists) return NOTHING;
  return { actions: [addRoute(router.id, route)], lines: [] };
}
