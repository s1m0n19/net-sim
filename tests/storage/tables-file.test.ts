import { describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import { ping } from "../../src/engine/actions";
import { copyTables } from "../../src/engine/model/tables";
import { Simulator } from "../../src/engine/simulator";
import { loadNetworkFile } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";

// Apre un file, fa un ping fino alla fine e restituisce il file salvato
// con le tabelle, insieme alle tabelle che la rete aveva.
function warmedUp(text: string, from: string, to: string) {
  const { network, positions } = loadNetworkFile(text);
  const sim = new Simulator(network);
  sim.dispatch(ping(from, to, 1));
  while (sim.canStep()) sim.step();
  return { saved: serializeNetwork(network, positions, { tables: true }), tables: copyTables(network) };
}

// Il file della LAN di esempio con un campo in più su un dispositivo.
function lanWith(deviceId: string, field: string, value: unknown): string {
  const file = JSON.parse(lanFile);
  file.network.devices.find((d: any) => d.id === deviceId)[field] = value;
  return JSON.stringify(file);
}

describe("tabelle nel file", () => {
  test("un file senza tabelle si apre senza: la rete parte fredda", () => {
    expect(loadNetworkFile(lanFile).tables).toBeNull();
  });

  test("una rete salvata con le tabelle si riapre con le stesse tabelle", () => {
    const { saved, tables } = warmedUp(lanFile, "d1", "192.168.1.11");

    const reopened = loadNetworkFile(saved);

    expect(reopened.tables).toEqual(tables);
    expect(tables.get("d1")).toEqual([["192.168.1.11", "02:00:00:00:00:02"]]);
  });

  test("anche la tabella ARP di un router si salva e si rilegge", () => {
    // PC2 ha il gateway: il ping verso PC1 attraversa R1, che impara i vicini.
    const { saved, tables } = warmedUp(routerFile, "d2", "192.168.1.10");

    expect(tables.get("r1")!.length).toBeGreaterThan(0);
    expect(loadNetworkFile(saved).tables).toEqual(tables);
  });

  test("con le tabelle ogni dispositivo ha la sua, anche vuota: ARP per gli host, MAC per lo switch", () => {
    const { network, positions } = loadNetworkFile(lanFile);

    const file = JSON.parse(serializeNetwork(network, positions, { tables: true }));

    for (const device of file.network.devices) {
      const field = device.kind === "switch" ? "macTable" : "arpTable";
      expect(device[field]).toEqual([]);
    }
  });

  test("le righe si scrivono con nomi leggibili", () => {
    const { saved } = warmedUp(lanFile, "d1", "192.168.1.11");

    const file = JSON.parse(saved);

    expect(file.network.devices.find((d: any) => d.id === "d1").arpTable).toEqual([
      { ip: "192.168.1.11", mac: "02:00:00:00:00:02" },
    ]);
    expect(file.network.devices.find((d: any) => d.id === "s1").macTable).toContainEqual({
      mac: "02:00:00:00:00:01",
      port: "Fa0/1",
    });
  });

  test("una riga sbagliata per quella rete è ammessa: serve agli esercizi", () => {
    const text = lanWith("d1", "arpTable", [{ ip: "10.0.0.99", mac: "02:00:00:00:00:03" }]);

    expect(loadNetworkFile(text).tables!.get("d1")).toEqual([["10.0.0.99", "02:00:00:00:00:03"]]);
  });

  test.each([
    ["la tabella dell'altro tipo", lanWith("s1", "arpTable", []), 'SW1: uno switch non ha il campo "arpTable".'],
    ["la tabella dell'altro tipo", lanWith("d1", "macTable", []), 'PC1: un host o un router non ha il campo "macTable".'],
    ["una tabella che non è un elenco", lanWith("d1", "arpTable", {}), 'PC1: il campo "arpTable" deve essere un elenco.'],
    [
      "un indirizzo scritto male",
      lanWith("d1", "arpTable", [{ ip: "192.168.1.300", mac: "02:00:00:00:00:02" }]),
      "PC1, tabella ARP, riga n. 1: indirizzo IP non valido: 192.168.1.300.",
    ],
    [
      "un MAC scritto male",
      lanWith("d1", "arpTable", [{ ip: "192.168.1.11", mac: "02:00:00:00:00" }]),
      "PC1, tabella ARP, riga n. 1: indirizzo MAC non valido: 02:00:00:00:00.",
    ],
    [
      "un campo mancante",
      lanWith("d1", "arpTable", [{ ip: "192.168.1.11" }]),
      'PC1, tabella ARP, riga n. 1: il campo "mac" manca o non è un testo.',
    ],
    [
      "un indirizzo ripetuto",
      lanWith("d1", "arpTable", [
        { ip: "192.168.1.11", mac: "02:00:00:00:00:02" },
        { ip: "192.168.1.11", mac: "02:00:00:00:00:03" },
      ]),
      "PC1: indirizzo ripetuto nella tabella ARP: 192.168.1.11.",
    ],
    [
      "una porta che lo switch non ha",
      lanWith("s1", "macTable", [{ mac: "02:00:00:00:00:01", port: "Fa0/9" }]),
      "SW1, tabella MAC, riga n. 1: indica una porta inesistente: Fa0/9.",
    ],
    [
      "un MAC ripetuto",
      lanWith("s1", "macTable", [
        { mac: "02:00:00:00:00:01", port: "Fa0/1" },
        { mac: "02:00:00:00:00:01", port: "Fa0/2" },
      ]),
      "SW1: MAC ripetuto nella tabella MAC: 02:00:00:00:00:01.",
    ],
  ])("un file con %s viene rifiutato", (_case, text, message) => {
    expect(() => loadNetworkFile(text)).toThrow(message);
  });
});
