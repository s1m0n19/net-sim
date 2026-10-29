import { describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import { Simulator } from "../../src/engine/simulator";
import type { Annotation } from "../../src/storage/annotations-file";
import { FILE_VERSION, loadNetworkFile } from "../../src/storage/load";
import { LATEST_VERSION, migrateToLatest, versionToWrite } from "../../src/storage/migrations";
import { serializeNetwork } from "../../src/storage/save";

// Le reti di esempio, scritte a mano.
const examples = import.meta.glob("../../examples/*.netsim.json", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

// File salvati dalla versione dell'app pubblicata il 18 ottobre 2026
// (d54bc8b), con il suo stesso codice: una LAN con le tabelle, una con i
// guasti, tre reti con rotte statiche e un server.
const fromStable = import.meta.glob("./fixtures/stabile/*.netsim.json", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const NOTE: Annotation = { kind: "note", id: "a1", x: 10, y: 10, color: "blue", text: "Consegna" };

// Riscrive un file come lo salverebbe l'app adesso, tabelle comprese se le
// ha. Come all'apertura nell'app, è il simulatore a mettere le tabelle del
// file nei dispositivi.
function resaved(text: string, annotations?: Annotation[]): string {
  const loaded = loadNetworkFile(text);
  new Simulator(loaded.network, loaded.tables ?? new Map());
  return serializeNetwork(loaded.network, loaded.positions, {
    tables: loaded.tables !== null,
    annotations: annotations ?? loaded.annotations,
  });
}

// Un file di esempio con una modifica fatta a mano.
function altered(text: string, change: (data: any) => void): string {
  const data = JSON.parse(text);
  change(data);
  return JSON.stringify(data);
}

describe("versioni del formato", () => {
  test("l'app legge fino all'ultima versione, la 2", () => {
    expect(FILE_VERSION).toBe(LATEST_VERSION);
    expect(LATEST_VERSION).toBe(2);
  });

  test.each(Object.keys(examples))("l'esempio %s si apre, e risalvato resta di versione 1", (path) => {
    expect(JSON.parse(resaved(examples[path])).version).toBe(1);
  });

  test.each(Object.keys(fromStable))("il file %s, salvato dalla versione pubblicata, si risalva identico", (path) => {
    expect(resaved(fromStable[path])).toBe(fromStable[path]);
  });

  test("un file con annotazioni si scrive di versione 2, e si riapre con le sue annotazioni", () => {
    const text = resaved(lanFile, [NOTE]);

    expect(JSON.parse(text).version).toBe(2);
    expect(loadNetworkFile(text).annotations).toEqual([NOTE]);
  });

  test("togliendo l'ultima annotazione il file torna alla versione 1", () => {
    const withNote = resaved(lanFile, [NOTE]);

    expect(JSON.parse(resaved(withNote, [])).version).toBe(1);
  });

  test("la versione da scrivere è la più bassa che basta", () => {
    expect(versionToWrite(false)).toBe(1);
    expect(versionToWrite(true)).toBe(2);
  });

  test("un file di versione 1 arriva alla 2 senza cambiare contenuto", () => {
    const data = JSON.parse(lanFile);

    expect(migrateToLatest(data)).toEqual({ ...data, version: 2 });
  });

  test("un file di versione 1 con annotazioni non viene dall'app, e si rifiuta", () => {
    const text = altered(lanFile, (d) => (d.annotations = [NOTE]));

    expect(() => loadNetworkFile(text)).toThrow("Le annotazioni richiedono la versione 2 del formato.");
  });
});

describe("campi sconosciuti", () => {
  test.each([
    ["nel file", lanFile, (d: any) => (d.vlans = []), 'Il file: campo sconosciuto: "vlans".'],
    ["nella rete", lanFile, (d: any) => (d.network.notes = ""), 'La rete: campo sconosciuto: "notes".'],
    ["in un PC", lanFile, (d: any) => (d.network.devices[1].vlan = 10), 'PC1: campo sconosciuto: "vlan".'],
    ["in uno switch", lanFile, (d: any) => (d.network.devices[0].stp = true), 'SW1: campo sconosciuto: "stp".'],
    ["nella posizione", lanFile, (d: any) => (d.network.devices[1].position.z = 0), 'PC1, posizione: campo sconosciuto: "z".'],
    ["in una porta di PC", lanFile, (d: any) => (d.network.devices[1].ports[0].enabled = true), 'PC1 Fa0: campo sconosciuto: "enabled".'],
    ["in una porta di switch", lanFile, (d: any) => (d.network.devices[0].ports[0].vlan = 1), 'SW1 Fa0/1: campo sconosciuto: "vlan".'],
    ["in un cavo", lanFile, (d: any) => (d.network.links[0].speed = 100), 'Collegamento l1: campo sconosciuto: "speed".'],
    ["in un capo di un cavo", lanFile, (d: any) => (d.network.links[0].b.vlan = 1), 'Collegamento l1, capo b: campo sconosciuto: "vlan".'],
    ["in un router", routerFile, (d: any) => (d.network.devices[2].ospf = {}), 'R1: campo sconosciuto: "ospf".'],
    [
      "in una rotta",
      routerFile,
      (d: any) => (d.network.devices[2].routes = [{ network: "10.0.0.0", mask: "255.0.0.0", nextHop: "192.168.1.254", metric: 1 }]),
      'R1, rotta n. 1: campo sconosciuto: "metric".',
    ],
    [
      "in una riga della tabella ARP",
      lanFile,
      (d: any) => (d.network.devices[1].arpTable = [{ ip: "192.168.1.11", mac: "02:00:00:00:00:02", age: 0 }]),
      'PC1, tabella ARP, riga n. 1: campo sconosciuto: "age".',
    ],
    [
      "in un'annotazione",
      lanFile,
      (d: any) => {
        d.version = 2;
        d.annotations = [{ ...NOTE, bold: true }];
      },
      'Annotazione a1: campo sconosciuto: "bold".',
    ],
  ])("un campo sconosciuto %s fa rifiutare il file, dicendo dove sta", (_where, text, change, message) => {
    expect(() => loadNetworkFile(altered(text, change))).toThrow(message);
  });
});
