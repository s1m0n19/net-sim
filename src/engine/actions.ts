import type { DeviceTemplate } from "./editing";
import type { Ipv4Address } from "./model/addresses";
import type { IpConfig } from "./model/ip-config";
import type { PortRef } from "./model/network";
import { DEFAULT_PING_COUNT } from "./protocols/icmp";

// Le azioni sono l'unico modo in cui l'esterno comanda il motore.
export type Action =
  | { kind: "ping"; deviceId: string; targetIp: Ipv4Address; count: number }
  | { kind: "resolve-address"; deviceId: string; targetIp: Ipv4Address }
  | { kind: "set-link-connected"; linkId: string; connected: boolean }
  | { kind: "set-device-powered"; deviceId: string; powered: boolean }
  // Modifiche alla rete.
  | { kind: "add-device"; template: DeviceTemplate }
  | { kind: "remove-device"; deviceId: string }
  | { kind: "add-link"; a: PortRef; b: PortRef }
  | { kind: "remove-link"; linkId: string }
  | { kind: "move-link-end"; linkId: string; end: "a" | "b"; portName: string }
  | { kind: "rename-device"; deviceId: string; name: string }
  | { kind: "configure-host"; deviceId: string; config: IpConfig };

/**
 * Crea l'azione "questo host fa ping a questo indirizzo IP".
 *
 * @param deviceId - identificativo dell'host che fa il ping
 * @param targetIp - indirizzo IP da raggiungere
 * @param count - quanti echo request mandare, uno dopo l'altro; se manca, quattro
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function ping(
  deviceId: string,
  targetIp: Ipv4Address,
  count: number = DEFAULT_PING_COUNT,
): Action {
  return { kind: "ping", deviceId, targetIp, count };
}

/**
 * Crea l'azione "questo host cerca il MAC di questo indirizzo IP".
 * Nella realtà nessuno lancia un ARP a mano: serve a provare ARP da solo.
 *
 * @param deviceId - identificativo dell'host che fa la richiesta
 * @param targetIp - indirizzo IP di cui si cerca il MAC
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function resolveAddress(deviceId: string, targetIp: Ipv4Address): Action {
  return { kind: "resolve-address", deviceId, targetIp };
}

/**
 * Crea l'azione "stacca questo cavo".
 *
 * @param linkId - identificativo del collegamento
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function disconnectLink(linkId: string): Action {
  return { kind: "set-link-connected", linkId, connected: false };
}

/**
 * Crea l'azione "riattacca questo cavo".
 *
 * @param linkId - identificativo del collegamento
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function connectLink(linkId: string): Action {
  return { kind: "set-link-connected", linkId, connected: true };
}

/**
 * Crea l'azione "spegni questo dispositivo".
 *
 * @param deviceId - identificativo del dispositivo
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function powerOff(deviceId: string): Action {
  return { kind: "set-device-powered", deviceId, powered: false };
}

/**
 * Crea l'azione "accendi questo dispositivo".
 *
 * @param deviceId - identificativo del dispositivo
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function powerOn(deviceId: string): Action {
  return { kind: "set-device-powered", deviceId, powered: true };
}

/**
 * Crea l'azione "aggiungi un PC alla rete".
 *
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function addHost(): Action {
  return { kind: "add-device", template: { kind: "host" } };
}

/**
 * Crea l'azione "aggiungi uno switch alla rete".
 *
 * @param portCount - quante porte ha lo switch
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function addSwitch(portCount: number): Action {
  return { kind: "add-device", template: { kind: "switch", portCount } };
}

/**
 * Crea l'azione "togli questo dispositivo, con i suoi cavi".
 *
 * @param deviceId - identificativo del dispositivo
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function removeDevice(deviceId: string): Action {
  return { kind: "remove-device", deviceId };
}

/**
 * Crea l'azione "collega queste due porte con un cavo".
 *
 * @param a - la porta a un capo
 * @param b - la porta all'altro capo
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function addLink(a: PortRef, b: PortRef): Action {
  return { kind: "add-link", a, b };
}

/**
 * Crea l'azione "togli questo cavo".
 *
 * @param linkId - identificativo del collegamento
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function removeLink(linkId: string): Action {
  return { kind: "remove-link", linkId };
}

/**
 * Crea l'azione "sposta un capo di questo cavo su un'altra porta".
 *
 * @param linkId - identificativo del collegamento
 * @param end - quale capo spostare
 * @param portName - la nuova porta, sullo stesso dispositivo
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function moveLinkEnd(linkId: string, end: "a" | "b", portName: string): Action {
  return { kind: "move-link-end", linkId, end, portName };
}

/**
 * Crea l'azione "cambia il nome di questo dispositivo".
 *
 * @param deviceId - identificativo del dispositivo
 * @param name - il nuovo nome
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function renameDevice(deviceId: string, name: string): Action {
  return { kind: "rename-device", deviceId, name };
}

/**
 * Crea l'azione "cambia la configurazione IP di questo host".
 *
 * @param deviceId - identificativo dell'host
 * @param config - indirizzo, subnet mask e gateway; ciascuno può essere null
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function configureHost(deviceId: string, config: IpConfig): Action {
  return { kind: "configure-host", deviceId, config };
}
