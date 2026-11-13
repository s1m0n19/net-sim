// Le VLAN di uno switch (requisito DEV-6, prima parte: porte access, L2-1).
//
// Una VLAN divide uno switch in più switch indipendenti: un frame entrato
// da una porta della VLAN 10 esce solo da porte della VLAN 10, e lo switch
// tiene una tabella MAC separata per ogni VLAN. Due PC in VLAN diverse non
// si sentono, anche se sono attaccati allo stesso switch e hanno indirizzi
// della stessa sottorete.
//
// Il modello ha due parti, come su uno switch Cisco:
//
// - il registro delle VLAN configurate (`Switch.vlans`): numero e nome.
//   La VLAN 1 c'è sempre, si chiama "default", e non si può eliminare;
// - la VLAN di ogni porta (`SwitchPort.vlan`): un numero, 1 se non si
//   dice altro.
//
// Una porta può indicare una VLAN che nel registro non c'è, perché è
// stata eliminata: allora la porta è accesa ma inattiva, e non fa passare
// nulla finché la VLAN non torna o la porta non cambia VLAN.
//
// Il frame non porta la VLAN: per lo switch, la VLAN di un frame è quella
// della porta da cui è entrato. Il tag 802.1Q verrà con le porte trunk.

import type { MacAddress } from "./addresses";
import type { Switch } from "./network";

/** Una VLAN configurata su uno switch. */
export interface Vlan {
  id: number; // da 1 a 1001
  name: string; // "default" per la 1, "VLAN0010" se non si dice altro
}

/** La VLAN di ogni porta, se non si dice altro, e l'unica che non si elimina. */
export const DEFAULT_VLAN = 1;

/**
 * Il numero più alto di una VLAN. Su uno switch Cisco i numeri da 1002 a
 * 1005 sono riservati e quelli da 1006 in su sono l'intervallo esteso: qui
 * si usano solo quelli normali.
 */
export const MAX_VLAN_ID = 1001;
const MAX_VLAN_NAME_LENGTH = 32;

/**
 * Il nome che una VLAN prende se non gliene si dà uno: "default" per la 1,
 * "VLAN" seguito dal numero su quattro cifre per le altre, come su IOS.
 *
 * @param id - il numero della VLAN
 * @returns il nome, per esempio "VLAN0010"
 */
export function defaultVlanName(id: number): string {
  return id === DEFAULT_VLAN ? "default" : `VLAN${String(id).padStart(4, "0")}`;
}

/**
 * Controlla il numero di una VLAN: un intero da 1 a 1001.
 *
 * @param id - il numero da controllare
 * @returns il motivo per cui non va bene, oppure null se va bene
 */
export function checkVlanId(id: number): string | null {
  if (!Number.isInteger(id) || id < DEFAULT_VLAN || id > MAX_VLAN_ID) {
    return `Numero di VLAN non valido: ${id}. Si usano i numeri da 1 a ${MAX_VLAN_ID}.`;
  }
  return null;
}

/**
 * Controlla il nome di una VLAN: da 1 a 32 caratteri, senza spazi.
 *
 * @param name - il nome da controllare
 * @returns il motivo per cui non va bene, oppure null se va bene
 */
export function checkVlanName(name: string): string | null {
  if (name === "") return "Il nome della VLAN non può essere vuoto.";
  if (/\s/.test(name)) return "Il nome della VLAN non può contenere spazi.";
  if (name.length > MAX_VLAN_NAME_LENGTH) {
    return `Il nome della VLAN può avere al massimo ${MAX_VLAN_NAME_LENGTH} caratteri.`;
  }
  return null;
}

/**
 * Il registro di uno switch appena acceso, che ha solo la VLAN 1.
 *
 * @returns un registro nuovo, da dare a un solo switch
 */
export function defaultVlans(): Vlan[] {
  return [{ id: DEFAULT_VLAN, name: defaultVlanName(DEFAULT_VLAN) }];
}

/**
 * Dice se una VLAN è nel registro di uno switch.
 *
 * @param sw - lo switch
 * @param id - il numero della VLAN
 * @returns true se la VLAN esiste
 */
export function vlanExists(sw: Pick<Switch, "vlans">, id: number): boolean {
  return sw.vlans.some((vlan) => vlan.id === id);
}

/**
 * La VLAN di una porta di uno switch, se la porta può far passare il
 * traffico: cioè se la sua VLAN esiste. Non dice nulla di cavi e
 * accensione, di cui si occupa il simulatore.
 *
 * @param sw - lo switch
 * @param portName - il nome della porta
 * @returns il numero della VLAN, oppure null se la porta non esiste o se
 *   la sua VLAN è stata eliminata (la porta è inattiva)
 */
export function activeVlanOf(sw: Switch, portName: string): number | null {
  const port = sw.ports.find((p) => p.name === portName);
  if (port === undefined || !vlanExists(sw, port.vlan)) return null;
  return port.vlan;
}

/**
 * La tabella MAC di una VLAN di uno switch: per ogni MAC conosciuto, la
 * porta da cui lo si raggiunge. Da leggere soltanto.
 *
 * @param sw - lo switch
 * @param vlan - il numero della VLAN; se manca, la VLAN 1
 * @returns la tabella, vuota se lo switch in quella VLAN non ha ancora
 *   imparato nulla
 */
export function macTableOf(sw: Switch, vlan: number = DEFAULT_VLAN): ReadonlyMap<MacAddress, string> {
  return sw.macTable.get(vlan) ?? new Map();
}

/** Una riga della tabella MAC di uno switch, con la sua VLAN. */
export interface MacEntry {
  vlan: number;
  mac: MacAddress;
  port: string;
}

/**
 * Tutte le righe della tabella MAC di uno switch, VLAN per VLAN in ordine
 * di numero, e dentro ogni VLAN nell'ordine in cui sono state imparate.
 *
 * @param sw - lo switch
 * @returns le righe; lo stesso MAC può comparire in VLAN diverse
 */
export function macEntries(sw: Switch): MacEntry[] {
  const vlans = [...sw.macTable.keys()].sort((a, b) => a - b);
  return vlans.flatMap((vlan) => [...macTableOf(sw, vlan)].map(([mac, port]) => ({ vlan, mac, port })));
}

/**
 * Scrive una riga nella tabella MAC di una VLAN.
 *
 * @param sw - lo switch da modificare
 * @param vlan - la VLAN in cui lo switch ha visto il MAC
 * @param mac - il MAC
 * @param portName - la porta da cui lo si raggiunge
 * @returns true se la tabella è cambiata
 */
export function learnMac(sw: Switch, vlan: number, mac: MacAddress, portName: string): boolean {
  let table = sw.macTable.get(vlan);
  if (table === undefined) {
    table = new Map();
    sw.macTable.set(vlan, table);
  }
  if (table.get(mac) === portName) return false;
  table.set(mac, portName);
  return true;
}

/**
 * Toglie dalla tabella MAC le righe che soddisfano una condizione. Una
 * VLAN rimasta senza righe sparisce dalla tabella.
 *
 * @param sw - lo switch da modificare
 * @param doomed - dice, per VLAN e porta di una riga, se va tolta
 * @returns true se è stata tolta almeno una riga
 */
export function forgetMacs(sw: Switch, doomed: (vlan: number, portName: string) => boolean): boolean {
  let changed = false;
  for (const [vlan, table] of sw.macTable) {
    for (const [mac, portName] of table) {
      if (doomed(vlan, portName)) {
        table.delete(mac);
        changed = true;
      }
    }
    if (table.size === 0) sw.macTable.delete(vlan);
  }
  return changed;
}
