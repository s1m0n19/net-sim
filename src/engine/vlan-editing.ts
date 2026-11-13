// Le VLAN di uno switch: crearle, rinominarle, eliminarle, e decidere in
// quale VLAN sta ogni porta (model/vlans.ts).
//
// Come le funzioni di editing.ts, cambiano la configurazione e nient'altro:
// a far dimenticare allo switch i MAC che non valgono più pensa
// network-changes.ts. Non correggono nulla da sole: eliminare una VLAN che
// ha ancora porte è permesso, e quelle porte restano inattive finché
// qualcuno non le sposta o non ricrea la VLAN, come su uno switch vero.

import { findDevice, type Network, type Switch } from "./model/network";
import { DEFAULT_VLAN, checkVlanId, checkVlanName, defaultVlanName, vlanExists, type Vlan } from "./model/vlans";

/**
 * Crea una VLAN su uno switch (su un Cisco: `vlan 10`, poi `name`).
 *
 * @param network - la rete da modificare
 * @param deviceId - lo switch
 * @param id - il numero della VLAN, da 1 a 1001
 * @param name - il nome; se è null, quello che la VLAN prende da sé
 *   ("VLAN0010")
 * @returns true se la VLAN è stata creata, false se c'era già (il suo
 *   nome resta quello che aveva)
 * @throws Error se il dispositivo non è uno switch, se il numero o il
 *   nome non vanno bene; in quel caso lo switch resta com'era
 */
export function addVlan(network: Network, deviceId: string, id: number, name: string | null): boolean {
  const sw = findSwitch(network, deviceId);
  refuse(checkVlanId(id));
  const wanted = name ?? defaultVlanName(id);
  refuse(checkVlanName(wanted));
  if (vlanExists(sw, id)) return false;
  sw.vlans.push({ id, name: wanted });
  sw.vlans.sort((a, b) => a.id - b.id);
  return true;
}

/**
 * Cambia il nome di una VLAN (su un Cisco: `name` dentro `vlan 10`).
 *
 * @param network - la rete da modificare
 * @param deviceId - lo switch
 * @param id - il numero della VLAN
 * @param name - il nuovo nome, da 1 a 32 caratteri senza spazi
 * @returns true se il nome è cambiato, false se era già quello
 * @throws Error se il dispositivo non è uno switch, se la VLAN è la 1 (il
 *   suo nome non si cambia) o non esiste, o se il nome non va bene
 */
export function renameVlan(network: Network, deviceId: string, id: number, name: string): boolean {
  const sw = findSwitch(network, deviceId);
  if (id === DEFAULT_VLAN) throw new Error("Il nome della VLAN 1 non si può cambiare.");
  const vlan = findVlan(sw, id);
  refuse(checkVlanName(name));
  if (vlan.name === name) return false;
  vlan.name = name;
  return true;
}

/**
 * Elimina una VLAN (su un Cisco: `no vlan 10`). Le porte che ci stavano
 * restano assegnate a quel numero, e diventano inattive.
 *
 * @param network - la rete da modificare
 * @param deviceId - lo switch
 * @param id - il numero della VLAN
 * @throws Error se il dispositivo non è uno switch, se la VLAN è la 1 (non
 *   si elimina) o non esiste
 */
export function removeVlan(network: Network, deviceId: string, id: number): void {
  const sw = findSwitch(network, deviceId);
  if (id === DEFAULT_VLAN) throw new Error("La VLAN 1 non si può eliminare.");
  findVlan(sw, id);
  sw.vlans = sw.vlans.filter((vlan) => vlan.id !== id);
}

/**
 * Mette una porta di uno switch in una VLAN (su un Cisco:
 * `switchport access vlan 10`). La VLAN non deve per forza esistere: se
 * non c'è, la porta è inattiva finché non la si crea.
 *
 * @param network - la rete da modificare
 * @param deviceId - lo switch
 * @param portName - la porta, per esempio "Fa0/1"
 * @param id - il numero della VLAN, da 1 a 1001
 * @returns la VLAN in cui stava prima la porta, oppure null se era già lì
 * @throws Error se il dispositivo non è uno switch, se non ha quella
 *   porta, o se il numero non va bene
 */
export function setPortVlan(network: Network, deviceId: string, portName: string, id: number): number | null {
  const sw = findSwitch(network, deviceId);
  const port = sw.ports.find((p) => p.name === portName);
  if (port === undefined) throw new Error(`${sw.name} non ha una porta ${portName}.`);
  refuse(checkVlanId(id));
  if (port.vlan === id) return null;
  const before = port.vlan;
  port.vlan = id;
  return before;
}

function findSwitch(network: Network, deviceId: string): Switch {
  const device = findDevice(network, deviceId);
  if (device.kind !== "switch") throw new Error(`${device.name} non è uno switch: non ha VLAN.`);
  return device;
}

function findVlan(sw: Switch, id: number): Vlan {
  const vlan = sw.vlans.find((v) => v.id === id);
  if (vlan === undefined) throw new Error(`${sw.name} non ha la VLAN ${id}.`);
  return vlan;
}

// Un controllo che ha trovato un problema ferma la modifica.
function refuse(problem: string | null): void {
  if (problem !== null) throw new Error(problem);
}
