// Le tabelle che i dispositivi imparano mentre la rete funziona, copiate
// fuori dai dispositivi: servono a salvarle in un file e a ripartire da lì
// (requisito FILE-5, decisione D-100).
//
// Ogni dispositivo impara una tabella sola: un host o un router la tabella
// ARP (quale MAC ha un indirizzo IP), uno switch la tabella MAC (da quale
// porta si raggiunge un MAC, in quale VLAN). Le righe sono elenchi di
// testi, come nel file, e qui si trattano allo stesso modo.

import type { Network, Switch } from "./network";
import { carriesVlan } from "./trunks";
import { activeVlanOf, learnMac, macEntries, vlanExists } from "./vlans";

/**
 * Una riga della tabella di un dispositivo, come la scrive il file:
 * - per un host o un router [indirizzo IP, MAC];
 * - per uno switch, su una porta access, [MAC, nome della porta]: la VLAN
 *   della riga è quella della porta, perché una porta access impara solo
 *   nella sua VLAN;
 * - per uno switch, su una porta trunk, [MAC, nome della porta, VLAN]: un
 *   trunk impara in più VLAN, e la VLAN non si ricava dalla porta (D-150).
 */
export type TableRow = [string, string] | [string, string, number];

/**
 * Le righe della tabella di un dispositivo. Lo stesso MAC può comparire in
 * due righe di uno switch, in VLAN diverse.
 */
export type TableRows = TableRow[];

/** Le tabelle di una rete, per identificativo del dispositivo. */
export type NetworkTables = Map<string, TableRows>;

/**
 * Copia le tabelle di tutti i dispositivi della rete, così come sono adesso.
 *
 * @param network - la rete da cui copiarle
 * @returns per ogni dispositivo, anche con la tabella vuota, le sue righe
 */
export function copyTables(network: Network): NetworkTables {
  const tables: NetworkTables = new Map();
  for (const device of network.devices) {
    const rows: TableRows = device.kind === "switch" ? macRowsOf(device) : [...device.arpTable];
    tables.set(device.id, rows);
  }
  return tables;
}

// Le righe della tabella MAC di uno switch: con la VLAN solo quelle delle
// porte trunk, come nel file.
function macRowsOf(sw: Switch): TableRows {
  return macEntries(sw).map(({ vlan, mac, port }): TableRow => {
    const onTrunk = sw.ports.find((p) => p.name === port)?.mode === "trunk";
    return onTrunk ? [mac, port, vlan] : [mac, port];
  });
}

/**
 * Aggiunge alle tabelle dei dispositivi le righe date.
 *
 * Valgono le regole di sempre: un dispositivo spento non sa nulla, quindi
 * le sue righe si saltano, e così le righe di uno switch che lo switch non
 * potrebbe aver imparato: su una porta che non ha, su una porta inattiva
 * perché la sua VLAN non c'è più, in una VLAN che non esiste o che la porta
 * non porta. Una riga senza VLAN va nella VLAN della sua porta, solo se la
 * porta è access; una riga con la VLAN va in quella VLAN. Una VLAN non si
 * ricava mai da un trunk. Un dispositivo che non c'è più si ignora.
 *
 * @param network - la rete da riempire
 * @param tables - le righe, per identificativo del dispositivo
 */
export function fillTables(network: Network, tables: NetworkTables): void {
  for (const device of network.devices) {
    const rows = tables.get(device.id);
    if (rows === undefined || !device.powered) continue;
    if (device.kind === "switch") {
      for (const row of rows) {
        const [mac, portName] = row;
        const vlan = vlanOfRow(device, row);
        if (vlan !== null) learnMac(device, vlan, mac, portName);
      }
    } else {
      for (const [ip, mac] of rows) device.arpTable.set(ip, mac);
    }
  }
}

// La VLAN in cui va una riga della tabella MAC di uno switch, oppure null
// se lo switch non potrebbe averla imparata (vedi fillTables).
function vlanOfRow(sw: Switch, row: TableRow): number | null {
  const [, portName, vlan] = row;
  const port = sw.ports.find((p) => p.name === portName);
  if (port === undefined) return null;
  if (vlan === undefined) return port.mode === "access" ? activeVlanOf(sw, portName) : null;
  return vlanExists(sw, vlan) && carriesVlan(port, vlan) ? vlan : null;
}
