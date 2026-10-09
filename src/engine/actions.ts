import type { Ipv4Address } from "./model/addresses";

// Le azioni sono l'unico modo in cui l'esterno comanda il motore.
// Per ora ne esiste una sola.
export type Action = {
  kind: "resolve-address";
  deviceId: string;
  targetIp: Ipv4Address;
};

/**
 * Crea l'azione "questo host cerca il MAC di questo indirizzo IP".
 *
 * @param deviceId - identificativo dell'host che fa la richiesta
 * @param targetIp - indirizzo IP di cui si cerca il MAC
 * @returns l'azione da passare a `Simulator.dispatch`
 */
export function resolveAddress(deviceId: string, targetIp: Ipv4Address): Action {
  return { kind: "resolve-address", deviceId, targetIp };
}
