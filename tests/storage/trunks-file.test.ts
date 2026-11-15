import { describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import {
  ping,
  removeVlan,
  restoreConfiguration,
  setAllowedVlans,
  setNativeVlan,
  setPortMode,
} from "../../src/engine/actions";
import type { Network, Switch } from "../../src/engine/model/network";
import { copyTables, fillTables, type NetworkTables } from "../../src/engine/model/tables";
import { macEntries, macTableOf } from "../../src/engine/model/vlans";
import { Simulator } from "../../src/engine/simulator";
import { takeSnapshot } from "../../src/engine/snapshot";
import type { Annotation } from "../../src/storage/annotations-file";
import { loadNetworkFile, type Position } from "../../src/storage/load";
import { migrateToLatest, versionToWrite } from "../../src/storage/migrations";
import { serializeNetwork } from "../../src/storage/save";
import { session } from "../../src/ui/session.svelte";
import { PC1_MAC, PC2_IP, PC2_MAC, PC3_IP, PC3_MAC, PC4_IP, PC4_MAC, buildTrunkSwitches, buildVlanLan } from "../engine/builders";

// La rete di builders.ts con due switch uniti da un trunk tra le Fa0/24:
// SW1 con PC1 (VLAN 10) su Fa0/1 e PC2 (VLAN 20) su Fa0/2, SW2 con PC3
// (VLAN 10) e PC4 (VLAN 20), Fa0/3 libera nella VLAN 1.

const NOTE: Annotation = { kind: "note", id: "a1", x: 10, y: 10, color: "blue", text: "Consegna" };

function positionsOf(network: Network): Map<string, Position> {
  return new Map(network.devices.map((device, index) => [device.id, { x: index * 100, y: 0 }]));
}

function save(network: Network, options: { tables?: boolean; annotations?: Annotation[] } = {}): string {
  return serializeNetwork(network, positionsOf(network), options);
}

// Riapre un file come fa l'app: le tabelle del file le mette il simulatore.
function reopen(text: string): { sim: Simulator; sw1: Switch; sw2: Switch } {
  const loaded = loadNetworkFile(text);
  const sim = new Simulator(loaded.network, loaded.tables ?? new Map());
  const switchOf = (id: string) => loaded.network.devices.find((d) => d.id === id) as Switch;
  return { sim, sw1: switchOf("s1"), sw2: switchOf("s2") };
}

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function pingOutcomes(sim: Simulator, fromId: string, targetIp: string): string[] {
  const start = sim.traces.length;
  sim.dispatch(ping(fromId, targetIp, 1));
  run(sim);
  return sim.traces.slice(start).flatMap((t) => (t.kind === "ping-result" ? [t.outcome] : []));
}

function portInFile(text: string, switchId: string, portName: string): any {
  const sw = JSON.parse(text).network.devices.find((d: any) => d.id === switchId);
  return sw.ports.find((p: any) => p.name === portName);
}

function switchInFile(text: string, switchId: string): any {
  return JSON.parse(text).network.devices.find((d: any) => d.id === switchId);
}

// Il file della rete con il trunk, con una modifica fatta a mano.
function trunkFileWith(change: (data: any) => void, options: { tables?: boolean } = {}): string {
  const { sim } = buildTrunkSwitches();
  if (options.tables) {
    pingOutcomes(sim, "d1", PC3_IP);
    pingOutcomes(sim, "d2", PC4_IP);
  }
  const data = JSON.parse(save(sim.network, options));
  change(data);
  return JSON.stringify(data);
}

// Il trunk caldo: i ping hanno fatto imparare a SW1 i MAC dietro il trunk,
// nelle VLAN 10 e 20.
function warmTrunk() {
  const built = buildTrunkSwitches();
  pingOutcomes(built.sim, "d1", PC3_IP);
  pingOutcomes(built.sim, "d2", PC4_IP);
  return built;
}

describe("la versione da scrivere", () => {
  test("il passo da 3 a 4 cambia solo il numero", () => {
    const data = JSON.parse(save(buildVlanLan().sim.network));
    expect(data.version).toBe(3);

    expect(migrateToLatest(data)).toEqual({ ...data, version: 4 });
  });

  test("la più bassa che basta: 1, 2 con le annotazioni, 3 con le VLAN, 4 con i trunk", () => {
    expect(versionToWrite(false, false, false)).toBe(1);
    expect(versionToWrite(true, false, false)).toBe(2);
    expect(versionToWrite(true, true, false)).toBe(3);
    expect(versionToWrite(false, false, true)).toBe(4);
    expect(versionToWrite(true, true, true)).toBe(4);

    expect(JSON.parse(save(loadNetworkFile(lanFile).network)).version).toBe(1);
    expect(JSON.parse(save(loadNetworkFile(lanFile).network, { annotations: [NOTE] })).version).toBe(2);
    expect(JSON.parse(save(buildVlanLan().sim.network)).version).toBe(3);
    expect(JSON.parse(save(buildTrunkSwitches().sim.network, { annotations: [NOTE] })).version).toBe(4);
  });

  test("scenario A: un trunk con nativa 1 e tutte le VLAN si scrive con il solo campo mode", () => {
    const text = save(buildTrunkSwitches().sim.network);

    expect(JSON.parse(text).version).toBe(4);
    expect(portInFile(text, "s1", "Fa0/24")).toEqual({ name: "Fa0/24", mac: "02:00:00:00:01:24", mode: "trunk" });
    expect(portInFile(text, "s1", "Fa0/3")).toEqual({ name: "Fa0/3", mac: "02:00:00:00:01:03" });
  });

  test("scenario B: un trunk con nativa e VLAN consentite scrive tutti e tre i campi", () => {
    const text = save(buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 20, 99] }).sim.network);

    expect(portInFile(text, "s1", "Fa0/24")).toEqual({
      name: "Fa0/24",
      mac: "02:00:00:00:01:24",
      mode: "trunk",
      nativeVlan: 99,
      allowedVlans: [10, 20, 99],
    });
  });

  test("scenario C: una porta tornata access tiene nativa e consentite, e il file resta di versione 4", () => {
    const { sim } = buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 20, 99] });
    sim.dispatch(setPortMode("s1", "Fa0/24", "access"));
    sim.dispatch(setPortMode("s2", "Fa0/24", "access"));

    const text = save(sim.network);
    const { sim: reopened, sw1 } = reopen(text);

    expect(JSON.parse(text).version).toBe(4);
    expect(portInFile(text, "s1", "Fa0/24")).toEqual({
      name: "Fa0/24",
      mac: "02:00:00:00:01:24",
      nativeVlan: 99,
      allowedVlans: [10, 20, 99],
    });
    expect(sw1.ports[3]).toMatchObject({ mode: "access", nativeVlan: 99, allowedVlans: [10, 20, 99] });
    reopened.dispatch(setPortMode("s1", "Fa0/24", "trunk"));
    expect(sw1.ports[3]).toMatchObject({ mode: "trunk", nativeVlan: 99, allowedVlans: [10, 20, 99] });
  });

  test("scenario D: nessuna VLAN consentita resta un elenco vuoto, non diventa «tutte»", () => {
    const text = save(buildTrunkSwitches({ allowedVlans: [] }).sim.network);
    const { sim, sw1 } = reopen(text);

    expect(portInFile(text, "s1", "Fa0/24").allowedVlans).toEqual([]);
    expect(sw1.ports[3].allowedVlans).toEqual([]);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
  });

  test("scenario E: nativa e consentite che lo switch non ha si salvano, senza creare VLAN", () => {
    const text = save(buildTrunkSwitches({ nativeVlan: 500, allowedVlans: [10, 20, 300, 500] }).sim.network);
    const { sw1 } = reopen(text);

    expect(sw1.ports[3]).toMatchObject({ nativeVlan: 500, allowedVlans: [10, 20, 300, 500] });
    expect(sw1.vlans.map((v) => v.id)).toEqual([1, 10, 20]);
    expect(switchInFile(text, "s1").vlans.map((v: any) => v.id)).toEqual([10, 20]);
  });

  test("scenario F: tolta l'ultima configurazione di trunk, il file torna alla versione più bassa", () => {
    const { sim } = buildTrunkSwitches({ nativeVlan: 99 });
    sim.dispatch(setPortMode("s1", "Fa0/24", "access"));
    sim.dispatch(setPortMode("s2", "Fa0/24", "access"));
    expect(JSON.parse(save(sim.network)).version).toBe(4); // la nativa 99 è ancora lì

    sim.dispatch(setNativeVlan("s1", "Fa0/24", 1));
    expect(JSON.parse(save(sim.network)).version).toBe(3); // restano le VLAN access

    sim.dispatch(removeVlan("s1", 10));
    sim.dispatch(removeVlan("s1", 20));
    sim.dispatch(removeVlan("s2", 10));
    sim.dispatch(removeVlan("s2", 20));
    for (const sw of ["s1", "s2"]) {
      for (const port of ["Fa0/1", "Fa0/2"]) sim.dispatch({ kind: "set-port-vlan", deviceId: sw, portName: port, vlan: 1 });
    }
    expect(JSON.parse(save(sim.network, { annotations: [NOTE] })).version).toBe(2);
    expect(JSON.parse(save(sim.network)).version).toBe(1);
  });
});

describe("salvare e riaprire i trunk", () => {
  test("la configurazione torna uguale, la rete funziona come prima, e risalvata è identica", () => {
    const { sim } = buildTrunkSwitches({ nativeVlan: 10 }, { nativeVlan: 10, allowedVlans: [1, 10, 20] });
    const before = takeSnapshot(sim.network);

    const text = save(sim.network);
    const { sim: reopened } = reopen(text);

    expect(takeSnapshot(reopened.network)).toEqual(before);
    expect(save(reopened.network)).toBe(text);
    expect(pingOutcomes(reopened, "d1", PC3_IP)).toEqual(["reply"]);
    expect(pingOutcomes(reopened, "d2", PC4_IP)).toEqual(["reply"]);
    expect(pingOutcomes(reopened, "d1", PC4_IP)).toEqual(["unreachable"]);
  });

  test("annullare e ripristinare, poi salvare, scrive la configurazione a cui si è tornati", () => {
    const { sim } = buildTrunkSwitches();
    const plain = takeSnapshot(sim.network);
    sim.dispatch(setNativeVlan("s1", "Fa0/24", 99));
    sim.dispatch(setAllowedVlans("s1", "Fa0/24", [10]));
    const changed = takeSnapshot(sim.network);

    sim.dispatch(restoreConfiguration(plain));
    expect(portInFile(save(sim.network), "s1", "Fa0/24")).toEqual({ name: "Fa0/24", mac: "02:00:00:00:01:24", mode: "trunk" });

    sim.dispatch(restoreConfiguration(changed));
    expect(portInFile(save(sim.network), "s1", "Fa0/24")).toMatchObject({ nativeVlan: 99, allowedVlans: [10] });
  });
});

describe("i campi dei trunk sbagliati nel file", () => {
  test.each([
    ["un modo sconosciuto", (p: any) => (p.mode = "dynamic"), 'SW1 Fa0/24: il campo "mode" deve essere "access" o "trunk".'],
    ["un modo numerico", (p: any) => (p.mode = 1), 'SW1 Fa0/24: il campo "mode" deve essere "access" o "trunk".'],
    ["un modo vero o falso", (p: any) => (p.mode = true), 'SW1 Fa0/24: il campo "mode" deve essere "access" o "trunk".'],
    ["un modo nullo", (p: any) => (p.mode = null), 'SW1 Fa0/24: il campo "mode" deve essere "access" o "trunk".'],
    ["un modo come elenco", (p: any) => (p.mode = ["trunk"]), 'SW1 Fa0/24: il campo "mode" deve essere "access" o "trunk".'],
    ["una nativa zero", (p: any) => (p.nativeVlan = 0), 'SW1 Fa0/24, campo "nativeVlan": Numero di VLAN non valido: 0.'],
    ["una nativa troppo alta", (p: any) => (p.nativeVlan = 1002), 'SW1 Fa0/24, campo "nativeVlan": Numero di VLAN non valido: 1002.'],
    ["una nativa scritta come testo", (p: any) => (p.nativeVlan = "10"), 'SW1 Fa0/24, campo "nativeVlan": "10" non è un numero di VLAN.'],
    ["una nativa con la virgola", (p: any) => (p.nativeVlan = 10.5), 'SW1 Fa0/24, campo "nativeVlan": Numero di VLAN non valido: 10.5.'],
    ["consentite come testo", (p: any) => (p.allowedVlans = "10,20"), 'SW1 Fa0/24, campo "allowedVlans": deve essere "all" oppure un elenco di numeri di VLAN.'],
    ["consentite nulle", (p: any) => (p.allowedVlans = null), 'SW1 Fa0/24, campo "allowedVlans": deve essere "all" oppure un elenco'],
    ["consentite fuori dai limiti", (p: any) => (p.allowedVlans = [10, 2000]), 'SW1 Fa0/24, campo "allowedVlans": Numero di VLAN non valido: 2000.'],
    ["consentite con un testo", (p: any) => (p.allowedVlans = [10, "20"]), 'SW1 Fa0/24, campo "allowedVlans": "20" non è un numero di VLAN.'],
    ["consentite in disordine", (p: any) => (p.allowedVlans = [20, 10]), "l'elenco deve essere in ordine crescente, senza doppioni."],
    ["consentite ripetute", (p: any) => (p.allowedVlans = [10, 10]), "l'elenco deve essere in ordine crescente, senza doppioni."],
  ])("%s fa rifiutare il file", (_what, change, message) => {
    const text = trunkFileWith((data) => change(data.network.devices[0].ports[3]));

    expect(() => loadNetworkFile(text)).toThrow(message);
  });

  test("un modo access scritto per esteso si accetta, come «all» per le consentite", () => {
    const text = trunkFileWith((data) => {
      const port = data.network.devices[0].ports[2];
      port.mode = "access";
      port.allowedVlans = "all";
    });

    expect((loadNetworkFile(text).network.devices[0] as Switch).ports[2]).toMatchObject({ mode: "access", allowedVlans: "all" });
  });

  test.each([1, 2, 3])("un file di versione %i con i campi dei trunk non viene dall'app, e si rifiuta", (version) => {
    for (const change of [
      (p: any) => (p.mode = "trunk"),
      (p: any) => (p.mode = "access"), // anche con il valore di partenza
      (p: any) => (p.nativeVlan = 1),
      (p: any) => (p.allowedVlans = "all"),
    ]) {
      const data = JSON.parse(lanFile);
      data.version = version;
      change(data.network.devices[0].ports[0]);

      expect(() => loadNetworkFile(JSON.stringify(data))).toThrow("Le configurazioni trunk richiedono la versione 4 del formato.");
    }
  });

  test("una riga MAC con la VLAN in un file di versione 3 si rifiuta", () => {
    const data = JSON.parse(save(buildVlanLan().sim.network));
    data.network.devices[0].macTable = [{ mac: PC1_MAC, port: "Fa0/1", vlan: 10 }];

    expect(() => loadNetworkFile(JSON.stringify(data))).toThrow("Le configurazioni trunk richiedono la versione 4 del formato.");
  });

  test("i campi dei trunk su un PC o su un router sono campi sconosciuti", () => {
    const onPc = trunkFileWith((data) => (data.network.devices[2].ports[0].mode = "trunk"));
    expect(() => loadNetworkFile(onPc)).toThrow('PC1 Fa0: campo sconosciuto: "mode".');

    const withRouter = trunkFileWith((data) =>
      data.network.devices.push({
        id: "r1",
        kind: "router",
        name: "R1",
        position: { x: 0, y: 0 },
        ports: [{ name: "Gi0/0", mac: "02:00:00:00:0a:01", ip: null, mask: null, enabled: false, nativeVlan: 10 }],
      }),
    );
    expect(() => loadNetworkFile(withRouter)).toThrow('R1 Gi0/0: campo sconosciuto: "nativeVlan".');
  });
});

describe("le tabelle MAC dei trunk nel file", () => {
  test("le righe dei trunk scrivono la VLAN, quelle delle porte access no", () => {
    const { sim } = warmTrunk();

    const text = save(sim.network, { tables: true });

    expect(switchInFile(text, "s1").macTable).toEqual([
      { mac: PC1_MAC, port: "Fa0/1" },
      { mac: PC3_MAC, port: "Fa0/24", vlan: 10 },
      { mac: PC2_MAC, port: "Fa0/2" },
      { mac: PC4_MAC, port: "Fa0/24", vlan: 20 },
    ]);
  });

  test("riaperte, le righe tornano nelle loro VLAN, e lo switch inoltra come prima senza flooding", () => {
    const { sim } = warmTrunk();
    const learned = macEntries(sim.network.devices[0] as Switch);

    const { sim: reopened, sw1 } = reopen(save(sim.network, { tables: true }));

    expect(macEntries(sw1)).toEqual(learned);
    const start = reopened.traces.length;
    expect(pingOutcomes(reopened, "d1", PC3_IP)).toEqual(["reply"]);
    const fromSw1 = reopened.traces.slice(start).filter((t) => t.kind === "frame-sent" && t.from.deviceId === "s1");
    expect(fromSw1.some((t) => t.kind === "frame-sent" && t.to.deviceId === "d2")).toBe(false);
  });

  test("lo stesso MAC in due VLAN della stessa porta trunk: due righe, scritte e rilette", () => {
    const { sim } = buildTrunkSwitches();
    (sim.network.devices.find((d) => d.id === "d4")!).ports[0].mac = PC3_MAC;
    pingOutcomes(sim, "d1", PC3_IP);
    pingOutcomes(sim, "d2", PC4_IP);
    const written = switchInFile(save(sim.network, { tables: true }), "s1").macTable;
    expect(written.filter((row: any) => row.mac === PC3_MAC)).toEqual([
      { mac: PC3_MAC, port: "Fa0/24", vlan: 10 },
      { mac: PC3_MAC, port: "Fa0/24", vlan: 20 },
    ]);

    // Un file con le stesse due righe (la rete del file ha MAC tutti diversi).
    const text = trunkFileWith((data) => {
      data.network.devices[0].macTable = [
        { mac: "02:00:00:00:00:99", port: "Fa0/24", vlan: 10 },
        { mac: "02:00:00:00:00:99", port: "Fa0/24", vlan: 20 },
      ];
    });
    const { sw1 } = reopen(text);
    expect(macTableOf(sw1, 10).get("02:00:00:00:00:99")).toBe("Fa0/24");
    expect(macTableOf(sw1, 20).get("02:00:00:00:00:99")).toBe("Fa0/24");
    expect(switchInFile(save(reopen(text).sim.network, { tables: true }), "s1").macTable).toEqual([
      { mac: "02:00:00:00:00:99", port: "Fa0/24", vlan: 10 },
      { mac: "02:00:00:00:00:99", port: "Fa0/24", vlan: 20 },
    ]);
  });

  test("lo stesso MAC in due VLAN, su porte diverse, si accetta", () => {
    const text = trunkFileWith((data) => {
      data.network.devices[0].macTable = [
        { mac: PC1_MAC, port: "Fa0/1" },
        { mac: PC1_MAC, port: "Fa0/24", vlan: 20 },
      ];
    });

    expect(loadNetworkFile(text).tables!.get("s1")).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC1_MAC, "Fa0/24", 20],
    ]);
  });

  test("una tabella su un trunk spento o senza cavo si accetta: è uno stato preparato", () => {
    const text = trunkFileWith((data) => {
      data.network.devices[0].ports[3].enabled = false;
      data.network.links = data.network.links.filter((l: any) => l.id !== "l5");
      data.network.devices[0].macTable = [{ mac: PC3_MAC, port: "Fa0/24", vlan: 10 }];
    });

    expect(loadNetworkFile(text).tables!.get("s1")).toEqual([[PC3_MAC, "Fa0/24", 10]]);
  });

  test.each([
    ["la VLAN manca su una riga di un trunk", [{ mac: PC3_MAC, port: "Fa0/24" }], 'la porta Fa0/24 è trunk, e la riga deve dire la VLAN nel campo "vlan".'],
    ["la VLAN è scritta come testo", [{ mac: PC3_MAC, port: "Fa0/24", vlan: "10" }], 'il campo "vlan" deve essere un numero.'],
    ["la VLAN è fuori dai limiti", [{ mac: PC3_MAC, port: "Fa0/24", vlan: 4000 }], "Numero di VLAN non valido: 4000."],
    ["la VLAN non esiste sullo switch", [{ mac: PC3_MAC, port: "Fa0/24", vlan: 30 }], "la VLAN 30 non esiste su SW1."],
    ["la VLAN non è consentita sul trunk", [{ mac: PC3_MAC, port: "Fa0/24", vlan: 1 }], "la VLAN 1 non è consentita sul trunk Fa0/24."],
    ["la VLAN è scritta su una porta access", [{ mac: PC1_MAC, port: "Fa0/1", vlan: 10 }], 'il campo "vlan" si scrive solo per le porte trunk'],
    ["la porta non esiste", [{ mac: PC1_MAC, port: "Fa0/9", vlan: 10 }], "indica una porta inesistente: Fa0/9."],
    [
      "lo stesso MAC due volte nella stessa VLAN",
      [
        { mac: PC1_MAC, port: "Fa0/1" },
        { mac: PC1_MAC, port: "Fa0/24", vlan: 10 },
      ],
      `SW1: MAC ripetuto nella tabella MAC della VLAN 10: ${PC1_MAC}.`,
    ],
  ])("%s: il file si rifiuta", (_what, rows, message) => {
    const text = trunkFileWith((data) => {
      data.network.devices[0].ports[3].allowedVlans = [10, 20];
      data.network.devices[0].macTable = rows;
    });

    expect(() => loadNetworkFile(text)).toThrow(message);
  });

  test("le tabelle non si scrivono se non si chiede", () => {
    const { sim } = warmTrunk();

    expect(save(sim.network)).not.toContain("macTable");
  });
});

describe("le tabelle dentro l'app: copiarle, rimetterle, ricominciare", () => {
  test("copyTables tiene la VLAN delle righe dei trunk, e quelle delle porte access come sempre", () => {
    const { sim } = warmTrunk();

    expect(copyTables(sim.network).get("s1")).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC3_MAC, "Fa0/24", 10],
      [PC2_MAC, "Fa0/2"],
      [PC4_MAC, "Fa0/24", 20],
    ]);
  });

  test("fillTables rimette ogni riga nella sua VLAN, e non ricava mai la VLAN da un trunk", () => {
    const { sim, sw1 } = buildTrunkSwitches({ allowedVlans: [10, 20] });
    const tables: NetworkTables = new Map([
      [
        "s1",
        [
          [PC1_MAC, "Fa0/1"],
          [PC3_MAC, "Fa0/24", 10],
          [PC4_MAC, "Fa0/24", 20],
          ["02:00:00:00:00:77", "Fa0/24"], // senza VLAN su un trunk: non va da nessuna parte
          ["02:00:00:00:00:78", "Fa0/24", 1], // la VLAN 1 non è consentita
          ["02:00:00:00:00:79", "Fa0/24", 30], // la VLAN 30 non esiste
          ["02:00:00:00:00:80", "Fa0/1", 20], // una porta access non porta la VLAN 20
        ],
      ],
    ]);

    fillTables(sim.network, tables);

    expect(macEntries(sw1)).toEqual([
      { vlan: 10, mac: PC1_MAC, port: "Fa0/1" },
      { vlan: 10, mac: PC3_MAC, port: "Fa0/24" },
      { vlan: 20, mac: PC4_MAC, port: "Fa0/24" },
    ]);
  });

  test("Ricomincia torna alle tabelle di partenza con le VLAN dei trunk", () => {
    const { sim, sw1 } = warmTrunk();
    sim.setStartingTables(copyTables(sim.network));
    const learned = macEntries(sw1);

    sim.reset();

    expect(macEntries(sw1)).toEqual(learned);
  });

  test("una porta diventata access dopo il salvataggio non riceve le righe del trunk", () => {
    const { sim, sw1 } = warmTrunk();
    sim.setStartingTables(copyTables(sim.network));
    sim.dispatch(setPortMode("s1", "Fa0/24", "access"));

    sim.reset();

    expect(macEntries(sw1).filter((e) => e.port === "Fa0/24")).toEqual([]);
  });

  test("nella sessione: salvare con le tabelle, riaprire, ricominciare", () => {
    const { sim } = warmTrunk();
    session.open("trunk.netsim.json", save(sim.network));
    session.ping("d1", PC3_IP, 1);
    session.ping("d2", PC4_IP, 1);
    while (session.view.nextEvent !== null) session.step();
    session.saveTables = true;
    const draft = session.draftSave();
    session.markSaved("trunk", draft);

    session.open("trunk.netsim.json", draft.text);
    const rows = () => session.view.devices.find((d) => d.id === "s1")!.macRows;
    const reopened = rows();
    session.restart();

    expect(reopened).toContainEqual(["10", PC3_MAC, "Fa0/24"]);
    expect(reopened).toContainEqual(["20", PC4_MAC, "Fa0/24"]);
    expect(rows()).toEqual(reopened);
    expect(JSON.parse(session.serialize()).version).toBe(4);
    expect(session.saveTables).toBe(true);
  });

  test("un file con i trunk sbagliati non cambia la rete già aperta", () => {
    session.open("trunk.netsim.json", save(buildTrunkSwitches({ nativeVlan: 99 }).sim.network));
    const before = session.serialize();
    const broken = trunkFileWith((data) => (data.network.devices[0].ports[3].allowedVlans = [20, 10]));

    session.open("rotto.netsim.json", broken);

    expect(session.serialize()).toBe(before);
    expect(session.error).toContain("l'elenco deve essere in ordine crescente");
  });
});

describe("i file di prima", () => {
  test("un file di versione 1, 2 o 3 si apre con le porte access, nativa 1 e tutte le VLAN, e risalvato non cambia", () => {
    for (const text of [
      lanFile,
      JSON.stringify({ ...JSON.parse(lanFile), version: 2, annotations: [NOTE] }),
      save(buildVlanLan().sim.network),
    ]) {
      const loaded = loadNetworkFile(text);
      for (const device of loaded.network.devices) {
        if (device.kind !== "switch") continue;
        for (const port of device.ports) expect(port).toMatchObject({ mode: "access", nativeVlan: 1, allowedVlans: "all" });
      }
      const resaved = serializeNetwork(loaded.network, loaded.positions, { annotations: loaded.annotations });
      expect(JSON.parse(resaved).version).toBe(JSON.parse(text).version);
      expect(resaved).not.toMatch(/"mode"|"nativeVlan"|"allowedVlans"/);
    }
  });

  test("un file di prima con le tabelle MAC le rimette come sempre", () => {
    const { sim } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    const text = save(sim.network, { tables: true });

    const loaded = loadNetworkFile(text);

    expect(JSON.parse(text).version).toBe(3);
    expect(loaded.tables!.get("s1")).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC2_MAC, "Fa0/2"],
    ]);
  });
});
