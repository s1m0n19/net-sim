// Le porte trunk di uno switch: renderle access o trunk, sceglierne la
// VLAN nativa e le VLAN consentite (model/trunks.ts).
//
// Come le funzioni di editing.ts, cambiano la configurazione e nient'altro:
// a far dimenticare allo switch i MAC che non valgono più pensa
// network-changes.ts. Non correggono nulla: una nativa che lo switch non
// ha, o che il trunk non consente, è permessa, come su uno switch vero, e
// nessun valore si azzera cambiando modo.

import { findDevice, type Network, type SwitchPort } from "./model/network";
import { ALL_VLANS, normalizeVlanList, sameAllowedVlans, type AllowedVlans, type PortMode } from "./model/trunks";
import { checkVlanId } from "./model/vlans";

/**
 * Rende una porta di uno switch access o trunk. VLAN access, nativa e VLAN
 * consentite restano come sono.
 *
 * @param network - la rete da modificare
 * @param deviceId - identificativo dello switch
 * @param portName - la porta
 * @param mode - "access" oppure "trunk"
 * @returns il modo di prima, oppure null se la porta era già in quel modo
 * @throws Error se il dispositivo non è uno switch, la porta non esiste o
 *   il modo non è valido; in quel caso la rete non cambia
 */
export function setPortMode(network: Network, deviceId: string, portName: string, mode: PortMode): PortMode | null {
  const port = findSwitchPort(network, deviceId, portName);
  if (mode !== "access" && mode !== "trunk") throw new Error(`Modo della porta non valido: ${String(mode)}.`);
  if (port.mode === mode) return null;
  const before = port.mode;
  port.mode = mode;
  return before;
}

/**
 * Sceglie la VLAN nativa di una porta: quella che sul trunk passa senza tag.
 *
 * @param network - la rete da modificare
 * @param deviceId - identificativo dello switch
 * @param portName - la porta
 * @param vlan - il numero della VLAN, da 1 a 1001, anche se lo switch non ce l'ha
 * @returns la nativa di prima, oppure null se era già quella
 * @throws Error se il dispositivo non è uno switch, la porta non esiste o
 *   il numero non è valido; in quel caso la rete non cambia
 */
export function setNativeVlan(network: Network, deviceId: string, portName: string, vlan: number): number | null {
  const port = findSwitchPort(network, deviceId, portName);
  const problem = checkVlanId(vlan);
  if (problem !== null) throw new Error(problem);
  if (port.nativeVlan === vlan) return null;
  const before = port.nativeVlan;
  port.nativeVlan = vlan;
  return before;
}

/**
 * Sceglie le VLAN che una porta trunk lascia passare. L'elenco viene messo
 * in ordine e senza doppioni, e prende il posto di quello di prima.
 *
 * @param network - la rete da modificare
 * @param deviceId - identificativo dello switch
 * @param portName - la porta
 * @param vlans - "all", oppure i numeri delle VLAN; vuoto = nessuna
 * @returns le VLAN consentite di prima, oppure null se non cambia nulla
 * @throws Error se il dispositivo non è uno switch, la porta non esiste o
 *   un numero non è una VLAN valida; in quel caso la rete non cambia
 */
export function setAllowedVlans(network: Network, deviceId: string, portName: string, vlans: AllowedVlans): AllowedVlans | null {
  const port = findSwitchPort(network, deviceId, portName);
  let wanted: AllowedVlans;
  if (vlans === ALL_VLANS) wanted = ALL_VLANS;
  else if (Array.isArray(vlans)) wanted = normalizeVlanList(vlans);
  else throw new Error(`VLAN consentite non valide: ${String(vlans)}.`);
  if (sameAllowedVlans(port.allowedVlans, wanted)) return null;
  const before = port.allowedVlans;
  port.allowedVlans = wanted;
  return before;
}

// La porta di uno switch, o un errore che dice che cosa non va.
function findSwitchPort(network: Network, deviceId: string, portName: string): SwitchPort {
  const device = findDevice(network, deviceId);
  if (device.kind !== "switch") throw new Error(`${device.name} non è uno switch: non ha porte trunk.`);
  const port = device.ports.find((p) => p.name === portName);
  if (port === undefined) throw new Error(`${device.name} non ha una porta ${portName}.`);
  return port;
}
