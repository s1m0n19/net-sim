// Le tabelle dei dispositivi nel file di rete (requisito FILE-5, decisione
// D-100). Sono facoltative: un file le contiene solo se chi l'ha salvato
// lo ha chiesto, per preparare una rete che parte "già calda" o con una
// riga sbagliata da scoprire.
//
// Un host, un server o un router possono avere il campo "arpTable", uno
// switch il campo "macTable". Il formato è descritto in docs/formato-file.md.

import { isValidIp } from "../engine/model/ip-config";
import type { Device, Switch } from "../engine/model/network";
import type { NetworkTables, TableRow, TableRows } from "../engine/model/tables";
import { isAllowed } from "../engine/model/trunks";
import { DEFAULT_VLAN, activeVlanOf, checkVlanId, macEntries, vlanExists } from "../engine/model/vlans";
import { checkFields, checkUnique, isUsableMac, readText } from "./fields";

/**
 * Legge le tabelle dai dispositivi del file, dopo averle controllate.
 *
 * Si controlla solo che le righe siano scritte bene e indichino porte che
 * esistono. Una riga sbagliata per quella rete è ammessa: è proprio ciò
 * che serve a un esercizio.
 *
 * @param source - i dispositivi come stanno nel file, nello stesso ordine
 *   di `devices`
 * @param devices - gli stessi dispositivi, già letti
 * @returns le tabelle, per identificativo del dispositivo; null se nessun
 *   dispositivo del file ha una tabella
 * @throws Error se un dispositivo ha la tabella dell'altro tipo, o se una
 *   tabella non è un elenco, ha una riga con un campo mancante o scritto
 *   male, una riga ripetuta (per uno switch, lo stesso MAC nella stessa
 *   VLAN), o indica una porta che lo switch non ha o che è inattiva, o una
 *   VLAN che manca, non esiste o la porta trunk non consente
 */
export function readTables(source: any[], devices: Device[]): NetworkTables | null {
  const tables: NetworkTables = new Map();
  devices.forEach((device, index) => {
    const d = source[index];
    const ownField = device.kind === "switch" ? "macTable" : "arpTable";
    const otherField = device.kind === "switch" ? "arpTable" : "macTable";
    if (d[otherField] !== undefined) {
      const who = device.kind === "switch" ? "uno switch" : "un host o un router";
      throw new Error(`${device.name}: ${who} non ha il campo "${otherField}".`);
    }
    if (d[ownField] === undefined) return;
    if (!Array.isArray(d[ownField])) {
      throw new Error(`${device.name}: il campo "${ownField}" deve essere un elenco.`);
    }
    const rows = device.kind === "switch" ? readMacRows(d.macTable, device) : readArpRows(d.arpTable, device.name);
    tables.set(device.id, rows);
  });
  return tables.size === 0 ? null : tables;
}

// Le righe di una tabella ARP: un indirizzo IP e il MAC che gli corrisponde.
function readArpRows(rows: any[], deviceName: string): TableRows {
  const read: TableRows = rows.map((row, index) => {
    const where = `${deviceName}, tabella ARP, riga n. ${index + 1}`;
    checkFields(row, ["ip", "mac"], where);
    const ip = readText(row, "ip", where);
    const mac = readText(row, "mac", where);
    if (!isValidIp(ip)) throw new Error(`${where}: indirizzo IP non valido: ${ip}.`);
    if (!isUsableMac(mac)) throw new Error(`${where}: indirizzo MAC non valido: ${mac}.`);
    return [ip, mac];
  });
  checkUnique(
    read.map(([ip]) => ip),
    `${deviceName}: indirizzo ripetuto nella tabella ARP`,
  );
  return read;
}

// Le righe di una tabella MAC: un MAC e la porta da cui lo si raggiunge,
// che deve essere una porta di quello switch.
//
// Su una porta access la riga non dice la VLAN: è quella della sua porta,
// perché una porta access impara un MAC solo nella sua VLAN (D-143). Per
// questo la porta deve essere attiva, cioè la sua VLAN deve esistere. I
// file di prima delle VLAN hanno tutte le porte nella VLAN 1, e le loro
// righe si leggono come sempre.
//
// Su una porta trunk la riga dice la VLAN, nel campo "vlan" (D-150): un
// trunk impara in più VLAN. La VLAN deve esistere ed essere consentita
// sul trunk. Non si chiede che il trunk sia acceso o abbia un cavo.
//
// Lo stesso MAC può comparire due volte solo in VLAN diverse.
function readMacRows(rows: any[], sw: Switch): TableRows {
  const vlanOfRow: number[] = [];
  const read: TableRows = rows.map((row, index): TableRow => {
    const where = `${sw.name}, tabella MAC, riga n. ${index + 1}`;
    checkFields(row, ["mac", "port", "vlan"], where);
    const mac = readText(row, "mac", where);
    const port = readText(row, "port", where);
    if (!isUsableMac(mac)) throw new Error(`${where}: indirizzo MAC non valido: ${mac}.`);
    const found = sw.ports.find((p) => p.name === port);
    if (found === undefined) {
      throw new Error(`${where}: indica una porta inesistente: ${port}.`);
    }
    if (found.mode === "trunk") {
      const vlan = readTrunkRowVlan(row, sw, port, where);
      vlanOfRow.push(vlan);
      return [mac, port, vlan];
    }
    if (row.vlan !== undefined) {
      throw new Error(`${where}: il campo "vlan" si scrive solo per le porte trunk; la VLAN di ${port} è quella della porta.`);
    }
    const vlan = activeVlanOf(sw, port);
    if (vlan === null) {
      throw new Error(`${where}: la porta ${port} è inattiva, perché la VLAN ${found.vlan} non esiste.`);
    }
    vlanOfRow.push(vlan);
    return [mac, port];
  });
  // Un MAC si ripete solo in VLAN diverse: ogni VLAN ha la sua tabella.
  for (const vlan of new Set(vlanOfRow)) {
    const where = vlan === DEFAULT_VLAN ? "nella tabella MAC" : `nella tabella MAC della VLAN ${vlan}`;
    checkUnique(
      read.filter((_row, index) => vlanOfRow[index] === vlan).map(([mac]) => mac.toLowerCase()),
      `${sw.name}: MAC ripetuto ${where}`,
    );
  }
  return read;
}

// La VLAN di una riga su una porta trunk: obbligatoria, valida, esistente
// sullo switch e consentita sul trunk.
function readTrunkRowVlan(row: any, sw: Switch, portName: string, where: string): number {
  if (row.vlan === undefined) {
    throw new Error(`${where}: la porta ${portName} è trunk, e la riga deve dire la VLAN nel campo "vlan".`);
  }
  if (typeof row.vlan !== "number") throw new Error(`${where}: il campo "vlan" deve essere un numero.`);
  const problem = checkVlanId(row.vlan);
  if (problem !== null) throw new Error(`${where}: ${problem}`);
  if (!vlanExists(sw, row.vlan)) throw new Error(`${where}: la VLAN ${row.vlan} non esiste su ${sw.name}.`);
  const port = sw.ports.find((p) => p.name === portName)!;
  if (!isAllowed(port.allowedVlans, row.vlan)) {
    throw new Error(`${where}: la VLAN ${row.vlan} non è consentita sul trunk ${portName}.`);
  }
  return row.vlan;
}

/**
 * La tabella di un dispositivo come si scrive nel file: per uno switch
 * il campo "macTable", per gli altri "arpTable".
 *
 * @param device - il dispositivo di cui scrivere la tabella
 * @returns un oggetto con il solo campo della tabella, anche se vuota
 */
export function tableToWrite(device: Device): object {
  if (device.kind === "switch") {
    // Le righe delle porte access non scrivono la VLAN: è quella della loro
    // porta (D-143). Quelle delle porte trunk sì (D-150).
    const onTrunk = (portName: string) => device.ports.find((p) => p.name === portName)?.mode === "trunk";
    const macTable = macEntries(device).map(({ vlan, mac, port }) => ({ mac, port, ...(onTrunk(port) ? { vlan } : {}) }));
    return { macTable };
  }
  return { arpTable: [...device.arpTable].map(([ip, mac]) => ({ ip, mac })) };
}
