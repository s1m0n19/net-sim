import { describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import {
  addVlan,
  duplicateDevice,
  ping,
  removeVlan,
  renameVlan,
  restoreConfiguration,
  setPortVlan,
} from "../../src/engine/actions";
import type { Network, Switch } from "../../src/engine/model/network";
import { macTableOf, vlanExists } from "../../src/engine/model/vlans";
import { Simulator } from "../../src/engine/simulator";
import { takeSnapshot } from "../../src/engine/snapshot";
import type { Annotation } from "../../src/storage/annotations-file";
import { loadNetworkFile, type Position } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";
import { session } from "../../src/ui/session.svelte";
import { PC1_IP, PC1_MAC, PC2_IP, PC2_MAC, PC3_MAC, PC4_IP, PC4_MAC, buildVlanLan } from "../engine/builders";

// La LAN divisa in due VLAN di builders.ts (VLAN 10: PC1, PC2, PC5 su
// Fa0/1, Fa0/2, Fa0/5; VLAN 20: PC3, PC4 su Fa0/3, Fa0/4; Fa0/6 nella 1).

function positionsOf(network: Network): Map<string, Position> {
  return new Map(network.devices.map((device, index) => [device.id, { x: index * 100, y: 0 }]));
}

function save(network: Network, options: { tables?: boolean; annotations?: Annotation[] } = {}): string {
  return serializeNetwork(network, positionsOf(network), options);
}

// Riapre un file come fa l'app: le tabelle del file le mette il simulatore.
function reopen(text: string): { sim: Simulator; sw: Switch } {
  const loaded = loadNetworkFile(text);
  const sim = new Simulator(loaded.network, loaded.tables ?? new Map());
  return { sim, sw: loaded.network.devices.find((d) => d.kind === "switch") as Switch };
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

function switchInFile(text: string): any {
  return JSON.parse(text).network.devices.find((d: any) => d.kind === "switch");
}

// Il file della LAN divisa in VLAN, con una modifica fatta a mano allo
// switch, che è il primo dispositivo.
function vlanFileWith(change: (sw: any, data: any) => void): string {
  const data = JSON.parse(save(buildVlanLan().sim.network));
  change(data.network.devices[0], data);
  return JSON.stringify(data);
}

const NOTE: Annotation = { kind: "note", id: "a1", x: 10, y: 10, color: "blue", text: "Consegna" };

describe("scrivere le VLAN", () => {
  test("uno switch con la sola VLAN 1 si scrive come prima: nessun campo nuovo, versione 1", () => {
    const { network, positions } = loadNetworkFile(lanFile);

    const text = serializeNetwork(network, positions);

    expect(JSON.parse(text).version).toBe(1);
    expect(text).not.toContain("vlan");
  });

  test("con più VLAN il file è di versione 3, con le VLAN oltre la 1 e la VLAN delle porte fuori dalla 1", () => {
    const text = save(buildVlanLan().sim.network);

    expect(JSON.parse(text).version).toBe(3);
    const sw = switchInFile(text);
    expect(sw.vlans).toEqual([
      { id: 10, name: "STUDENTI" },
      { id: 20, name: "DOCENTI" },
    ]);
    expect(sw.ports.map((port: any) => port.vlan)).toEqual([10, 10, 20, 20, 10, undefined]);
  });

  test("la versione 3 vince sulle annotazioni", () => {
    expect(JSON.parse(save(buildVlanLan().sim.network, { annotations: [NOTE] })).version).toBe(3);
  });

  test("basta una porta fuori dalla VLAN 1, anche senza VLAN nel registro, per la versione 3", () => {
    const { network, positions } = loadNetworkFile(lanFile);
    new Simulator(network).dispatch(setPortVlan("s1", "Fa0/2", 30));

    const text = serializeNetwork(network, positions);

    expect(JSON.parse(text).version).toBe(3);
    expect(switchInFile(text).vlans).toBeUndefined();
    expect(switchInFile(text).ports[1]).toEqual({ name: "Fa0/2", mac: "02:00:00:00:01:02", vlan: 30 });
  });

  test("tolte tutte le VLAN, il file torna alla versione più bassa", () => {
    const { sim } = buildVlanLan();
    for (const port of ["Fa0/1", "Fa0/2", "Fa0/3", "Fa0/4", "Fa0/5"]) sim.dispatch(setPortVlan("s1", port, 1));
    sim.dispatch(removeVlan("s1", 10));
    sim.dispatch(removeVlan("s1", 20));

    const text = save(sim.network);

    expect(JSON.parse(text).version).toBe(1);
    expect(text).not.toContain("vlan");
  });
});

describe("salvare e riaprire", () => {
  test("le VLAN, i loro nomi e la VLAN di ogni porta tornano uguali", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(renameVlan("s1", 10, "CLASSE3A"));

    const { sw } = reopen(save(sim.network));

    expect(sw.vlans).toEqual([
      { id: 1, name: "default" },
      { id: 10, name: "CLASSE3A" },
      { id: 20, name: "DOCENTI" },
    ]);
    expect(sw.ports.map((port) => port.vlan)).toEqual([10, 10, 20, 20, 10, 1]);
  });

  test("una VLAN senza porte resta", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(addVlan("s1", 30, "LAB"));

    const { sw } = reopen(save(sim.network));

    expect(sw.vlans.find((vlan) => vlan.id === 30)).toEqual({ id: 30, name: "LAB" });
  });

  test("una porta su una VLAN eliminata si salva e si riapre inattiva", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(removeVlan("s1", 20));

    const text = save(sim.network);
    const { sim: reopened, sw } = reopen(text);

    expect(switchInFile(text).vlans).toEqual([{ id: 10, name: "STUDENTI" }]);
    expect(sw.ports[2].vlan).toBe(20);
    expect(vlanExists(sw, 20)).toBe(false);
    expect(pingOutcomes(reopened, "d3", PC4_IP)).toEqual(["unreachable"]);
    reopened.dispatch(addVlan("s1", 20));
    expect(pingOutcomes(reopened, "d3", PC4_IP)).toEqual(["reply"]);
  });

  test("quattro PC divisi tra VLAN 10 e VLAN 20 restano isolati dopo il salvataggio", () => {
    const { sim: reopened } = reopen(save(buildVlanLan().sim.network));

    expect(pingOutcomes(reopened, "d1", PC2_IP)).toEqual(["reply"]);
    expect(pingOutcomes(reopened, "d3", PC4_IP)).toEqual(["reply"]);
    expect(pingOutcomes(reopened, "d1", PC4_IP)).toEqual(["unreachable"]);
    expect(pingOutcomes(reopened, "d4", PC1_IP)).toEqual(["unreachable"]);
  });

  test("un file di versione 3 risalvato resta identico", () => {
    const text = save(buildVlanLan().sim.network);
    const loaded = loadNetworkFile(text);

    expect(serializeNetwork(loaded.network, loaded.positions)).toBe(text);
  });

  test("annullare e ripristinare, poi salvare, scrive la configurazione a cui si è tornati", () => {
    const { sim } = buildVlanLan();
    const original = save(sim.network);
    const before = takeSnapshot(sim.network);
    sim.dispatch(addVlan("s1", 30));
    sim.dispatch(setPortVlan("s1", "Fa0/1", 30));
    sim.dispatch(removeVlan("s1", 20));
    const changed = save(sim.network);
    const after = takeSnapshot(sim.network);

    sim.dispatch(restoreConfiguration(before));
    expect(save(sim.network)).toBe(original);

    sim.dispatch(restoreConfiguration(after));
    expect(save(sim.network)).toBe(changed);
  });

  test("la copia di uno switch si salva con le sue VLAN", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(removeVlan("s1", 20));
    sim.dispatch(duplicateDevice("s1"));
    const copyId = sim.network.devices.at(-1)!.id;

    const loaded = loadNetworkFile(save(sim.network));
    const copy = loaded.network.devices.find((d) => d.id === copyId) as Switch;

    expect(copy.vlans).toEqual([
      { id: 1, name: "default" },
      { id: 10, name: "STUDENTI" },
    ]);
    expect(copy.ports.map((port) => port.vlan)).toEqual([10, 10, 20, 20, 10, 1]);
  });
});

describe("le tabelle MAC con le VLAN", () => {
  test("le righe di VLAN diverse si salvano e tornano ciascuna nella sua VLAN", () => {
    const { sim } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);

    const text = save(sim.network, { tables: true });
    const { sw } = reopen(text);

    expect(switchInFile(text).macTable).toEqual([
      { mac: PC1_MAC, port: "Fa0/1" },
      { mac: PC2_MAC, port: "Fa0/2" },
      { mac: PC3_MAC, port: "Fa0/3" },
      { mac: PC4_MAC, port: "Fa0/4" },
    ]);
    expect([...macTableOf(sw, 10)]).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC2_MAC, "Fa0/2"],
    ]);
    expect([...macTableOf(sw, 20)]).toEqual([
      [PC3_MAC, "Fa0/3"],
      [PC4_MAC, "Fa0/4"],
    ]);
  });

  test("le tabelle non si scrivono se non si chiede", () => {
    const { sim } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);

    expect(save(sim.network)).not.toContain("macTable");
  });

  test("lo stesso MAC può stare in due righe, su porte di VLAN diverse", () => {
    const text = vlanFileWith((sw) => {
      sw.macTable = [
        { mac: PC1_MAC, port: "Fa0/1" },
        { mac: PC1_MAC, port: "Fa0/3" },
      ];
    });

    const loaded = loadNetworkFile(text);
    const { sw } = reopen(text);

    expect(loaded.tables?.get("s1")).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC1_MAC, "Fa0/3"],
    ]);
    expect(macTableOf(sw, 10).get(PC1_MAC)).toBe("Fa0/1");
    expect(macTableOf(sw, 20).get(PC1_MAC)).toBe("Fa0/3");
  });

  test("lo stesso MAC due volte nella stessa VLAN no", () => {
    const text = vlanFileWith((sw) => {
      sw.macTable = [
        { mac: PC1_MAC, port: "Fa0/1" },
        { mac: PC1_MAC, port: "Fa0/2" },
      ];
    });

    expect(() => loadNetworkFile(text)).toThrow(`SW1: MAC ripetuto nella tabella MAC della VLAN 10: ${PC1_MAC}.`);
  });

  test("una riga su una porta inattiva viene rifiutata: lo switch non potrebbe averla imparata", () => {
    const text = vlanFileWith((sw) => {
      sw.vlans = [{ id: 10, name: "STUDENTI" }]; // Fa0/3 resta sulla 20, che non c'è
      sw.macTable = [{ mac: PC3_MAC, port: "Fa0/3" }];
    });

    expect(() => loadNetworkFile(text)).toThrow(
      "SW1, tabella MAC, riga n. 1: la porta Fa0/3 è inattiva, perché la VLAN 20 non esiste.",
    );
  });
});

describe("i file di prima", () => {
  test("un file di versione 1 si apre con tutte le porte nella VLAN 1, e funziona come prima", () => {
    const { sim, sw } = reopen(lanFile);

    expect(sw.vlans).toEqual([{ id: 1, name: "default" }]);
    expect(sw.ports.every((port) => port.vlan === 1)).toBe(true);
    expect(pingOutcomes(sim, "d1", "192.168.1.11")).toEqual(["reply"]);
    expect([...macTableOf(sw, 1).keys()]).toHaveLength(2);
  });

  test("un file di versione 2 si apre allo stesso modo, e risalvato resta di versione 2", () => {
    const data = { ...JSON.parse(lanFile), version: 2, annotations: [NOTE] };
    const loaded = loadNetworkFile(JSON.stringify(data));
    const sw = loaded.network.devices[0] as Switch;

    expect(sw.ports.every((port) => port.vlan === 1)).toBe(true);
    const text = serializeNetwork(loaded.network, loaded.positions, { annotations: loaded.annotations });
    expect(JSON.parse(text).version).toBe(2);
  });

  test("un file di prima con le tabelle MAC le mette nella VLAN 1", () => {
    const data = JSON.parse(lanFile);
    data.network.devices[0].macTable = [{ mac: "02:00:00:00:00:01", port: "Fa0/1" }];
    const { sw } = reopen(JSON.stringify(data));

    expect([...macTableOf(sw, 1)]).toEqual([["02:00:00:00:00:01", "Fa0/1"]]);
  });

  test.each([
    [1, (sw: any) => (sw.vlans = [{ id: 10, name: "A" }])],
    [2, (sw: any) => (sw.vlans = [])],
    [1, (sw: any) => (sw.ports[0].vlan = 1)],
    [2, (sw: any) => (sw.ports[0].vlan = 10)],
  ])("un file di versione %i con campi delle VLAN non viene dall'app, e si rifiuta", (version, change) => {
    const data = JSON.parse(lanFile);
    data.version = version;
    change(data.network.devices[0]);

    expect(() => loadNetworkFile(JSON.stringify(data))).toThrow("Le VLAN richiedono la versione 3 del formato.");
  });

  test("un file di una versione futura non si apre", () => {
    const data = JSON.parse(save(buildVlanLan().sim.network));
    data.version = 4;

    expect(() => loadNetworkFile(JSON.stringify(data))).toThrow("versione più recente di net-sim (formato 4)");
  });
});

describe("le VLAN sbagliate nel file", () => {
  test.each([
    ["un registro che non è un elenco", (sw: any) => (sw.vlans = {}), 'SW1: il campo "vlans" deve essere un elenco.'],
    ["una VLAN che non è un oggetto", (sw: any) => (sw.vlans = [10]), "SW1, VLAN n. 1: deve avere un numero e un nome."],
    ["un numero mancante", (sw: any) => (sw.vlans = [{ name: "A" }]), 'SW1, VLAN n. 1: il campo "id" manca o non è un numero.'],
    ["un numero scritto come testo", (sw: any) => (sw.vlans = [{ id: "10", name: "A" }]), 'SW1, VLAN n. 1: il campo "id" manca o non è un numero.'],
    ["il numero zero", (sw: any) => (sw.vlans = [{ id: 0, name: "A" }]), "SW1, VLAN n. 1: Numero di VLAN non valido: 0."],
    ["un numero riservato", (sw: any) => (sw.vlans = [{ id: 1002, name: "A" }]), "SW1, VLAN n. 1: Numero di VLAN non valido: 1002."],
    ["un numero con la virgola", (sw: any) => (sw.vlans = [{ id: 10.5, name: "A" }]), "Numero di VLAN non valido: 10.5."],
    ["la VLAN 1 ridefinita", (sw: any) => (sw.vlans = [{ id: 1, name: "ALTRO" }]), "SW1, VLAN n. 1: la VLAN 1 c'è sempre e non si scrive nel file."],
    [
      "una VLAN ripetuta",
      (sw: any) => (sw.vlans = [{ id: 10, name: "A" }, { id: 10, name: "B" }]),
      "SW1: VLAN ripetuta: 10.",
    ],
    ["un nome mancante", (sw: any) => (sw.vlans = [{ id: 10 }]), 'SW1, VLAN n. 1: il campo "name" manca'],
    ["un nome vuoto", (sw: any) => (sw.vlans = [{ id: 10, name: "" }]), 'SW1, VLAN n. 1: il campo "name" manca'],
    ["un nome con spazi", (sw: any) => (sw.vlans = [{ id: 10, name: "DUE PAROLE" }]), "non può contenere spazi"],
    ["un nome troppo lungo", (sw: any) => (sw.vlans = [{ id: 10, name: "X".repeat(33) }]), "al massimo 32 caratteri"],
    ["un campo sconosciuto in una VLAN", (sw: any) => (sw.vlans = [{ id: 10, name: "A", state: "active" }]), 'SW1, VLAN n. 1: campo sconosciuto: "state".'],
    ["la VLAN di una porta scritta come testo", (sw: any) => (sw.ports[0].vlan = "10"), 'SW1 Fa0/1: il campo "vlan" manca o non è un numero.'],
    ["la VLAN di una porta fuori intervallo", (sw: any) => (sw.ports[0].vlan = 4095), "SW1 Fa0/1: Numero di VLAN non valido: 4095."],
  ])("%s fa rifiutare il file", (_what, change, message) => {
    expect(() => loadNetworkFile(vlanFileWith(change))).toThrow(message);
  });

  test("la VLAN sulla porta di un PC è un campo sconosciuto", () => {
    const text = vlanFileWith((_sw, data) => (data.network.devices[1].ports[0].vlan = 10));

    expect(() => loadNetworkFile(text)).toThrow('PC1 Fa0: campo sconosciuto: "vlan".');
  });

  test("le VLAN su un router sono un campo sconosciuto", () => {
    const data = JSON.parse(save(buildVlanLan().sim.network));
    data.network.devices.push({
      id: "r1",
      kind: "router",
      name: "R1",
      position: { x: 0, y: 0 },
      ports: [{ name: "Gi0/0", mac: "02:00:00:00:09:01", ip: null, mask: null, enabled: false }],
      vlans: [{ id: 10, name: "A" }],
    });

    expect(() => loadNetworkFile(JSON.stringify(data))).toThrow('R1: campo sconosciuto: "vlans".');
  });

  test("un file con le VLAN sbagliate non cambia la rete già aperta", () => {
    session.open("lan.netsim.json", lanFile);
    const before = session.serialize();

    session.open("rotto.netsim.json", vlanFileWith((sw) => (sw.vlans = [{ id: 1, name: "X" }])));

    expect(session.error).toContain("la VLAN 1 c'è sempre");
    expect(session.serialize()).toBe(before);
    expect(session.fileName).toBe("lan");
    session.error = null;
  });
});
