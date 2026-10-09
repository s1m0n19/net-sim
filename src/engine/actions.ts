import type { Ipv4Address } from "./model/addresses";

// Le azioni sono l'unico modo in cui l'esterno comanda il motore.
// Per ora ne esiste una sola.
export type Action = {
  kind: "resolve-address";
  deviceId: string;
  targetIp: Ipv4Address;
};

export function resolveAddress(deviceId: string, targetIp: Ipv4Address): Action {
  return { kind: "resolve-address", deviceId, targetIp };
}
