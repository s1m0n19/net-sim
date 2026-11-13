// Le tabelle che i dispositivi imparano mentre la rete funziona, copiate
// fuori dai dispositivi: servono a salvarle in un file e a ripartire da lì
// (requisito FILE-5, decisione D-100).
//
// Ogni dispositivo impara una tabella sola: un host o un router la tabella
// ARP (quale MAC ha un indirizzo IP), uno switch la tabella MAC (da quale
// porta si raggiunge un MAC). Entrambe sono coppie di testi, e qui si
// trattano allo stesso modo.

import type { Network } from "./network";
import { activeVlanOf, learnMac, macEntries } from "./vlans";

/**
 * Le righe della tabella di un dispositivo: per un host o un router
 * [indirizzo IP, MAC], per uno switch [MAC, nome della porta].
 *
 * Le righe di uno switch non dicono la VLAN: con le sole porte access la
 * VLAN di una riga è sempre quella della sua porta, perché lo switch
 * impara un MAC solo nella VLAN della porta da cui l'ha visto, e
 * dimentica le righe di una porta quando la porta cambia VLAN. Lo stesso
 * MAC può comparire in due righe, su porte di VLAN diverse.
 */
export type TableRows = Array<[string, string]>;

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
    const rows: TableRows =
      device.kind === "switch"
        ? macEntries(device).map(({ mac, port }) => [mac, port])
        : [...device.arpTable];
    tables.set(device.id, rows);
  }
  return tables;
}

/**
 * Aggiunge alle tabelle dei dispositivi le righe date.
 *
 * Valgono le regole di sempre: un dispositivo spento non sa nulla, quindi
 * le sue righe si saltano, e così le righe di uno switch che indicano una
 * porta che non ha, o una porta inattiva perché la sua VLAN non c'è più.
 * Un dispositivo che non c'è più si ignora.
 *
 * @param network - la rete da riempire
 * @param tables - le righe, per identificativo del dispositivo
 */
export function fillTables(network: Network, tables: NetworkTables): void {
  for (const device of network.devices) {
    const rows = tables.get(device.id);
    if (rows === undefined || !device.powered) continue;
    if (device.kind === "switch") {
      for (const [mac, portName] of rows) {
        // La riga va nella VLAN della sua porta; non va da nessuna parte se
        // la porta non c'è o se la sua VLAN è stata eliminata.
        const vlan = activeVlanOf(device, portName);
        if (vlan !== null) learnMac(device, vlan, mac, portName);
      }
    } else {
      for (const [ip, mac] of rows) device.arpTable.set(ip, mac);
    }
  }
}
