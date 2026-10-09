import type { Ipv4Address } from "./model/addresses";

// Le azioni sono l'unico modo in cui l'esterno comanda il motore.
export type Action =
  | { kind: "ping"; deviceId: string; targetIp: Ipv4Address }
  | { kind: "resolve-address"; deviceId: string; targetIp: Ipv4Address };

/**
 * Crea l'azione "questo host fa ping a questo indirizzo IP".
 *
 * @param deviceId - identificativo dell'host che fa il ping
 * @param targetIp - indirizzo IP da raggiungere
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function ping(deviceId: string, targetIp: Ipv4Address): Action {
  return { kind: "ping", deviceId, targetIp };
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
