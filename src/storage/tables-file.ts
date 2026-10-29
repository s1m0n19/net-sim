// Le tabelle dei dispositivi nel file di rete (requisito FILE-5, decisione
// D-100). Sono facoltative: un file le contiene solo se chi l'ha salvato
// lo ha chiesto, per preparare una rete che parte "già calda" o con una
// riga sbagliata da scoprire.
//
// Un host, un server o un router possono avere il campo "arpTable", uno
// switch il campo "macTable". Il formato è descritto in docs/formato-file.md.

import { isValidIp } from "../engine/model/ip-config";
import type { Device } from "../engine/model/network";
import type { NetworkTables, TableRows } from "../engine/model/tables";
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
 *   male, una riga ripetuta, o indica una porta che lo switch non ha
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
function readMacRows(rows: any[], device: Device): TableRows {
  const read: TableRows = rows.map((row, index) => {
    const where = `${device.name}, tabella MAC, riga n. ${index + 1}`;
    checkFields(row, ["mac", "port"], where);
    const mac = readText(row, "mac", where);
    const port = readText(row, "port", where);
    if (!isUsableMac(mac)) throw new Error(`${where}: indirizzo MAC non valido: ${mac}.`);
    if (!device.ports.some((p) => p.name === port)) {
      throw new Error(`${where}: indica una porta inesistente: ${port}.`);
    }
    return [mac, port];
  });
  checkUnique(
    read.map(([mac]) => mac.toLowerCase()),
    `${device.name}: MAC ripetuto nella tabella MAC`,
  );
  return read;
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
    return { macTable: [...device.macTable].map(([mac, port]) => ({ mac, port })) };
  }
  return { arpTable: [...device.arpTable].map(([ip, mac]) => ({ ip, mac })) };
}
