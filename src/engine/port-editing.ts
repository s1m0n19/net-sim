// Accendere e spegnere una porta: un'interfaccia di un router o una porta
// di uno switch.
//
// Come le funzioni di editing.ts, cambia la configurazione e nient'altro:
// a far perdere i frame in viaggio e a ricalcolare il segnale pensa
// network-changes.ts.

import { findDevice, type Network } from "./model/network";

/**
 * Accende o spegne un'interfaccia di un router o una porta di uno switch
 * (su un Cisco: `no shutdown` e `shutdown`). Spenta, è come se il suo cavo
 * non ci fosse.
 *
 * @param network - la rete da modificare
 * @param deviceId - il router o lo switch
 * @param portName - l'interfaccia o la porta, per esempio "Gi0/0" o "Fa0/1"
 * @param enabled - true per accenderla, false per spegnerla
 * @returns true se lo stato è cambiato, false se era già così
 * @throws Error se il dispositivo è un host, la cui scheda non si spegne,
 *   o se non ha quella porta
 */
export function setInterfaceEnabled(
  network: Network,
  deviceId: string,
  portName: string,
  enabled: boolean,
): boolean {
  const device = findDevice(network, deviceId);
  if (device.kind === "host") {
    throw new Error(`${device.name} non ha porte che si possano spegnere.`);
  }
  const port = device.ports.find((p) => p.name === portName);
  if (port === undefined) {
    const what = device.kind === "router" ? "un'interfaccia" : "una porta";
    throw new Error(`${device.name} non ha ${what} ${portName}.`);
  }
  if (port.enabled === enabled) return false;
  port.enabled = enabled;
  return true;
}
