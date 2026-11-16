import { describe, expect, test } from "vitest";
import demoFile from "../../examples/trunk-due-switch.netsim.json?raw";
import exerciseFile from "../../examples/trunk-esercitazione.netsim.json?raw";
import { ping, setAllowedVlans, setPortVlan } from "../../src/engine/actions";
import type { Switch } from "../../src/engine/model/network";
import { macTableOf } from "../../src/engine/model/vlans";
import { Simulator } from "../../src/engine/simulator";
import { loadNetworkFile } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";
import { configure, describeDevice } from "../../src/shell/ios/configure";
import { interpret } from "../../src/shell/ios/interpreter";
import { INITIAL_STATE, type CliState } from "../../src/shell/ios/modes";
import { show } from "../../src/shell/ios/show";

// Le due reti di esempio dei trunk (docs/esercitazioni.md): SW1 e SW2 da
// 24 porte, uniti tra le Fa0/24; PC1 (.10) e PC2 (.11) su SW1, PC3 (.12) e
// PC4 (.13) su SW2, sulle Fa0/1 e Fa0/2.

const PC = { PC1: "192.168.1.10", PC2: "192.168.1.11", PC3: "192.168.1.12", PC4: "192.168.1.13" } as const;
const ID = { PC1: "d1", PC2: "d2", PC3: "d3", PC4: "d4" } as const;
type Pc = keyof typeof PC;

function open(text: string) {
  const loaded = loadNetworkFile(text);
  const sim = new Simulator(loaded.network, loaded.tables ?? new Map());
  const sw = (id: string) => loaded.network.devices.find((d) => d.id === id) as Switch;
  return { loaded, sim, sw1: sw("s1"), sw2: sw("s2") };
}

function reaches(sim: Simulator, from: Pc, to: Pc): boolean {
  const start = sim.traces.length;
  sim.dispatch(ping(ID[from], PC[to], 1));
  while (sim.canStep()) sim.step();
  return sim.traces.slice(start).some((t) => t.kind === "ping-result" && t.outcome === "reply");
}

// Chi raggiunge chi, tra tutte le coppie di PC.
function reachability(sim: Simulator): string[] {
  const pairs: string[] = [];
  const pcs = Object.keys(PC) as Pc[];
  for (const from of pcs) for (const to of pcs) if (from < to && reaches(sim, from, to)) pairs.push(`${from}-${to}`);
  return pairs;
}

// Esegue una riga della CLI su uno switch, in modalità privilegiata.
function cliShow(sim: Simulator, deviceId: string, line: string): string[] {
  const device = sim.network.devices.find((d) => d.id === deviceId) as Switch;
  let state: CliState = INITIAL_STATE;
  state = interpret(describeDevice(device), state, "enable").state;
  const outcome = interpret(describeDevice(device), state, line);
  if (outcome.command?.kind !== "show") throw new Error(`${line} non è un show`);
  expect(configure(outcome.command, sim.network, deviceId, outcome.state)).toBeNull();
  return show(outcome.command.topic, sim.network, deviceId, outcome.command.interfaceName);
}

describe("i due file", () => {
  test.each([
    ["trunk-due-switch", demoFile],
    ["trunk-esercitazione", exerciseFile],
  ])("%s: versione 4, due switch e quattro PC con i cavi previsti, MAC diversi, posizioni valide, e risalvato identico", (_name, text) => {
    const { loaded } = open(text);
    const data = JSON.parse(text);

    expect(data.version).toBe(4);
    expect(loaded.network.devices.map((d) => d.name)).toEqual(["SW1", "SW2", "PC1", "PC2", "PC3", "PC4"]);
    expect(loaded.network.devices.slice(0, 2).every((d) => d.ports.length === 24)).toBe(true);
    const ends = loaded.network.links.map((l) => `${l.a.deviceId}:${l.a.portName}-${l.b.deviceId}:${l.b.portName}`);
    expect(ends).toEqual(["d1:Fa0-s1:Fa0/1", "d2:Fa0-s1:Fa0/2", "d3:Fa0-s2:Fa0/1", "d4:Fa0-s2:Fa0/2", "s1:Fa0/24-s2:Fa0/24"]);
    const macs = loaded.network.devices.flatMap((d) => d.ports.map((p) => p.mac));
    expect(new Set(macs).size).toBe(macs.length);
    for (const position of loaded.positions.values()) expect(Number.isFinite(position.x) && Number.isFinite(position.y)).toBe(true);
    expect(loaded.annotations).toHaveLength(1);
    expect(serializeNetwork(loaded.network, loaded.positions, { annotations: loaded.annotations })).toBe(text);
  });
});

describe("trunk-due-switch: la rete giusta", () => {
  test("ha la configurazione dichiarata: VLAN 10 e 20, porte access, trunk con nativa 1 e le VLAN 10 e 20", () => {
    const { sw1, sw2 } = open(demoFile);

    for (const sw of [sw1, sw2]) {
      expect(sw.vlans).toEqual([
        { id: 1, name: "default" },
        { id: 10, name: "STUDENTI" },
        { id: 20, name: "DOCENTI" },
      ]);
      expect(sw.ports[0]).toMatchObject({ mode: "access", vlan: 10 });
      expect(sw.ports[1]).toMatchObject({ mode: "access", vlan: 20 });
      expect(sw.ports[23]).toMatchObject({ mode: "trunk", nativeVlan: 1, allowedVlans: [10, 20] });
    }
  });

  test("si apre e funziona senza altro: la stessa VLAN comunica, VLAN diverse no; il trunk impara in tutte e due", () => {
    const { sim, sw1 } = open(demoFile);

    expect(reachability(sim)).toEqual(["PC1-PC3", "PC2-PC4"]);
    expect(macTableOf(sw1, 10).get("02:00:00:00:00:03")).toBe("Fa0/24");
    expect(macTableOf(sw1, 20).get("02:00:00:00:00:04")).toBe("Fa0/24");
  });
});

describe("trunk-esercitazione: due errori indipendenti", () => {
  test("i sintomi della guida: PC1 non raggiunge PC3, PC2 non raggiunge PC4, PC3 raggiunge PC4", () => {
    const { sim } = open(exerciseFile);

    expect(reachability(sim)).toEqual(["PC3-PC4"]);
  });

  test("gli indizi della guida si leggono con i comandi IOS di SW2", () => {
    const { sim } = open(exerciseFile);
    reaches(sim, "PC3", "PC4");

    expect(cliShow(sim, "s2", "show interfaces trunk")[4]).toBe("Fa0/24      10");
    expect(cliShow(sim, "s1", "show interfaces trunk")[4]).toBe("Fa0/24      10,20");
    const brief = cliShow(sim, "s2", "show vlan brief");
    expect(brief.find((line) => line.startsWith("10 "))).toMatch(/STUDENTI +active$/);
    expect(brief.find((line) => line.startsWith("20 "))).toMatch(/DOCENTI +active +Fa0\/1, Fa0\/2$/);
    expect(cliShow(sim, "s2", "show interfaces fa0/1 switchport")).toContain("Access Mode VLAN: 20 (DOCENTI)");
    expect(cliShow(sim, "s2", "show mac address-table")).toContain("  20    02:00:00:00:00:03    DYNAMIC     Fa0/1");
  });

  test("corretto solo l'errore 1, PC2 raggiunge PC4, e l'errore 2 resta visibile: PC3 sta con PC2 e PC4", () => {
    const { sim } = open(exerciseFile);
    sim.dispatch(setAllowedVlans("s2", "Fa0/24", [10, 20]));

    expect(reachability(sim)).toEqual(["PC2-PC3", "PC2-PC4", "PC3-PC4"]);
  });

  test("corretto solo l'errore 2, PC1 raggiunge PC3, e l'errore 1 resta visibile: PC2 non raggiunge PC4", () => {
    const { sim } = open(exerciseFile);
    sim.dispatch(setPortVlan("s2", "Fa0/1", 10));

    expect(reachability(sim)).toEqual(["PC1-PC3"]);
  });

  test("con le due correzioni della guida la rete fa ciò che chiede la consegna, e coincide con la rete giusta", () => {
    const { sim, loaded } = open(exerciseFile);
    sim.dispatch(setAllowedVlans("s2", "Fa0/24", [10, 20]));
    sim.dispatch(setPortVlan("s2", "Fa0/1", 10));

    expect(reachability(sim)).toEqual(["PC1-PC3", "PC2-PC4"]);
    // Nessun'altra modifica nascosta: la rete è quella dell'esempio giusto.
    const fixed = JSON.parse(serializeNetwork(loaded.network, loaded.positions));
    const demo = JSON.parse(demoFile);
    expect(fixed.network).toEqual(demo.network);
  });
});
