import type { Ipv4Address } from "./model/addresses";
import { DEFAULT_PING_COUNT } from "./protocols/icmp";

// Le azioni sono l'unico modo in cui l'esterno comanda il motore.
export type Action =
  | { kind: "ping"; deviceId: string; targetIp: Ipv4Address; count: number }
  | { kind: "resolve-address"; deviceId: string; targetIp: Ipv4Address }
  | { kind: "set-link-connected"; linkId: string; connected: boolean };

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
