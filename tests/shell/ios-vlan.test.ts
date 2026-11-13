import { describe, expect, test } from "vitest";
import { addSwitch, ping } from "../../src/engine/actions";
import type { Router, Switch } from "../../src/engine/model/network";
import { macTableOf, vlanExists } from "../../src/engine/model/vlans";
import { Simulator } from "../../src/engine/simulator";
import { configure, describeDevice } from "../../src/shell/ios/configure";
import { complete, helpFor } from "../../src/shell/ios/help";
import { interpret } from "../../src/shell/ios/interpreter";
import { INITIAL_STATE, promptOf, type CliState } from "../../src/shell/ios/modes";
import { show } from "../../src/shell/ios/show";
import { loadNetworkFile, type Position } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";
import {
  PC1_IP,
  PC1_MAC,
  PC2_IP,
  PC2_MAC,
  PC3_IP,
  PC3_MAC,
  PC4_IP,
  PC4_MAC,
  buildFlatLan,
  buildTwoLans,
} from "../engine/builders";

// La LAN di builders.ts senza VLAN: SW1 con PC1…PC5 su Fa0/1…Fa0/5, tutti
// in 192.168.1.0/24 e nella VLAN 1; Fa0/6 libera.

// Una sessione della CLI su un dispositivo: scrive una riga, esegue le
// azioni che ne escono, e restituisce ciò che viene stampato.
function cliOn(sim: Simulator, deviceId: string) {
  let state: CliState = INITIAL_STATE;
  const device = () => sim.network.devices.find((d) => d.id === deviceId) as Router | Switch;

  function type(line: string): string[] {
    const outcome = interpret(describeDevice(device()), state, line);
    state = outcome.state;
    if (outcome.command === null) return outcome.lines;
    const configured = configure(outcome.command, sim.network, deviceId, state);
    for (const action of configured?.actions ?? []) sim.dispatch(action);
    if (outcome.command.kind === "show") return show(outcome.command.topic, sim.network, deviceId);
    return [...outcome.lines, ...(configured?.lines ?? [])];
  }

  return {
    type,
    script: (lines: string[]) => lines.flatMap(type),
    prompt: () => promptOf(device().name, state.mode),
    state: () => state,
    help: (line: string) => helpFor(describeDevice(device()), state.mode, line),
    complete: (line: string) => complete(describeDevice(device()), state.mode, line),
  };
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

// Le righe di uno scarto di IOS: il segno sotto la colonna sbagliata.
function invalidAt(column: number): string[] {
  return [`${" ".repeat(column)}^`, "% Invalid input detected at '^' marker."];
}

const CONFIG = ["enable", "configure terminal"];

describe("vlan e la modalità config-vlan", () => {
  test("vlan 10 crea la VLAN ed entra a configurarla; name le dà il nome", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");

    expect(cli.script([...CONFIG, "vlan 10"])).toEqual(["Enter configuration commands, one per line.  End with CNTL/Z."]);
    expect(cli.prompt()).toBe("SW1(config-vlan)#");
    expect(cli.state()).toEqual({ mode: "config-vlan", interfaceName: null, vlanId: 10 });
    expect(sw.vlans.find((vlan) => vlan.id === 10)?.name).toBe("VLAN0010");

    expect(cli.type("name STUDENTI")).toEqual([]);
    expect(sw.vlans.find((vlan) => vlan.id === 10)?.name).toBe("STUDENTI");
  });

  test("exit torna alla configurazione globale, end alla modalità privilegiata", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");

    cli.script([...CONFIG, "vlan 10", "exit"]);
    expect(cli.prompt()).toBe("SW1(config)#");

    cli.script(["vlan 10", "end"]);
    expect(cli.prompt()).toBe("SW1#");
  });

  test("vlan su una VLAN che c'è già entra senza toccarla", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "vlan 10", "name STUDENTI", "exit"]);
    const before = sim.traces.length;

    cli.type("vlan 10");

    expect(cli.prompt()).toBe("SW1(config-vlan)#");
    expect(sw.vlans.find((vlan) => vlan.id === 10)?.name).toBe("STUDENTI");
    expect(sim.traces.length).toBe(before);
  });

  test("da una VLAN si passa a un'altra, a un'interfaccia, o si torna con un comando globale", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");

    cli.script([...CONFIG, "vlan 10", "vlan 20", "name DOCENTI"]);
    expect(cli.state()).toMatchObject({ mode: "config-vlan", vlanId: 20 });
    expect(sw.vlans.find((vlan) => vlan.id === 20)?.name).toBe("DOCENTI");

    cli.type("interface fa0/1");
    expect(cli.prompt()).toBe("SW1(config-if)#");

    cli.script(["vlan 30", "hostname SW-AULA"]);
    expect(cli.prompt()).toBe("SW-AULA(config)#");
  });

  test("no name ridà alla VLAN il nome che prende da sé", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");

    cli.script([...CONFIG, "vlan 10", "name STUDENTI", "no name"]);

    expect(sw.vlans.find((vlan) => vlan.id === 10)?.name).toBe("VLAN0010");
  });

  test("la VLAN 1 non si rinomina", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");

    expect(cli.script([...CONFIG, "vlan 1", "name ALTRO"]).slice(1)).toEqual(["Default VLAN 1 may not have its name changed."]);
    expect(sw.vlans[0]).toEqual({ id: 1, name: "default" });
  });

  test("un nome che il motore non accetta viene rifiutato con il motivo del motore", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "vlan 10"]);

    // Qui nessuno esegue il rifiuto: lo fa il motore, quando l'azione arriva.
    expect(() => cli.type(`name ${"X".repeat(33)}`)).toThrow("al massimo 32 caratteri");
    expect(sw.vlans.find((vlan) => vlan.id === 10)?.name).toBe("VLAN0010");
  });
});

describe("no vlan", () => {
  test("elimina la VLAN; le porte tengono il numero e restano inattive", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "interface fa0/3", "switchport access vlan 20", "exit"]);

    expect(cli.type("no vlan 20")).toEqual([]);

    expect(vlanExists(sw, 20)).toBe(false);
    expect(sw.ports[2].vlan).toBe(20);
  });

  test("la VLAN 1 non si elimina, e una VLAN che non c'è lo dice", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");

    expect(cli.script([...CONFIG, "no vlan 1"]).slice(1)).toEqual(["Default VLAN 1 may not be deleted."]);
    expect(cli.type("no vlan 30")).toEqual(["% VLAN 30 not found in current VLAN database"]);
    expect(sw.vlans).toEqual([{ id: 1, name: "default" }]);
  });

  test("scritto da dentro una VLAN riporta alla configurazione globale", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");

    cli.script([...CONFIG, "vlan 10", "no vlan 10"]);

    expect(cli.prompt()).toBe("SW1(config)#");
  });
});

describe("parametri sbagliati e modalità sbagliate", () => {
  test.each(["vlan 0", "vlan 1002", "vlan 4095", "vlan dieci", "vlan -1"])("%s: il numero è fuori dall'intervallo", (line) => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script(CONFIG);

    // "SW1(config)#" è lungo 12 caratteri; il numero comincia alla colonna 5.
    expect(cli.type(line)).toEqual(invalidAt(12 + 5));
    expect(cli.prompt()).toBe("SW1(config)#");
    expect(sw.vlans).toHaveLength(1);
  });

  test("parametri mancanti e in eccesso", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script(CONFIG);

    expect(cli.type("vlan")).toEqual(["% Incomplete command."]);
    expect(cli.type("vlan 10 20")).toEqual(invalidAt(12 + 8));
    cli.type("vlan 10");
    expect(cli.type("name")).toEqual(["% Incomplete command."]);
    expect(cli.type("name DUE PAROLE")).toEqual(invalidAt(17 + 9)); // "SW1(config-vlan)#" è lungo 17
    cli.type("interface fa0/1");
    expect(cli.type("switchport access vlan")).toEqual(["% Incomplete command."]);
  });

  test("ogni comando vale solo nella sua modalità", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");

    cli.type("enable");
    expect(cli.type("vlan 10")).toEqual(invalidAt(4 + 0));
    cli.type("configure terminal");
    // Il segno va sotto il primo carattere che non corrisponde a nessuna
    // parola possibile: la "n" di name è anche quella di "no".
    expect(cli.type("name STUDENTI")).toEqual(invalidAt(12 + 1));
    expect(cli.type("switchport access vlan 10")).toEqual(invalidAt(12 + 0));
    cli.type("vlan 10");
    expect(cli.type("switchport mode access")).toEqual(invalidAt(17 + 0));
  });
});

describe("aiuto, completamento e abbreviazioni", () => {
  test("? dice che cosa segue vlan, name e switchport", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script(CONFIG);

    expect(cli.help("vlan ")).toEqual(["  <1-1001>  VLAN number"]);
    cli.type("vlan 10");
    expect(cli.help("name ")).toEqual(["  WORD  Name of the VLAN, up to 32 characters"]);
    expect(cli.help("na")).toEqual(["name"]);
    cli.type("interface fa0/1");
    expect(cli.help("switchport ")).toEqual([
      "  access  Settings of an access port",
      "  mode    Set the mode of the port",
    ]);
    expect(cli.help("switchport mode ")).toEqual(["  access  Access port, in a single VLAN"]);
    expect(cli.help("switchport access vlan ")).toEqual(["  <1-1001>  VLAN number"]);
  });

  test("Tab completa le parole nuove, e le abbreviazioni valgono", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script(CONFIG);

    expect(cli.complete("vl")).toBe("vlan ");
    cli.type("int fa0/1");
    expect(cli.complete("sw")).toBe("switchport ");
    expect(cli.complete("switchport acc")).toBe("switchport access ");

    cli.type("sw acc vl 10");
    expect(sw.ports[0].vlan).toBe(10);
    cli.type("end");
    expect(cli.type("sh vl br").find((line) => line.startsWith("10 "))).toMatch(/^10 {3}VLAN0010 +active +Fa0\/1$/);
  });
});

describe("le porte access", () => {
  test("switchport mode access si accetta e non cambia nulla", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "interface fa0/1"]);
    const before = sim.traces.length;

    expect(cli.type("switchport mode access")).toEqual([]);
    expect(sim.traces.length).toBe(before);
    expect(sw.ports[0].vlan).toBe(1);
    expect(cli.type("switchport mode trunk")).toEqual(invalidAt(15 + 16));
  });

  test("switchport access vlan su una VLAN che c'è sposta la porta, senza messaggi", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "vlan 10", "exit", "interface fa0/1"]);

    expect(cli.type("switchport access vlan 10")).toEqual([]);
    expect(sw.ports[0].vlan).toBe(10);
  });

  test("su una VLAN che non c'è la crea, lo dice, e sposta la porta", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "interface fa0/2"]);

    expect(cli.type("switchport access vlan 30")).toEqual(["% Access VLAN does not exist. Creating vlan 30"]);
    expect(sw.vlans.find((vlan) => vlan.id === 30)).toEqual({ id: 30, name: "VLAN0030" });
    expect(sw.ports[1].vlan).toBe(30);
  });

  test("le due modifiche escono insieme, come una sola", () => {
    const { sim } = buildFlatLan();
    const state: CliState = { mode: "config-if", interfaceName: "Fa0/2" };

    const configured = configure({ kind: "switchport-access-vlan", id: 30 }, sim.network, "s1", state);

    expect(configured?.actions).toEqual([
      { kind: "add-vlan", deviceId: "s1", vlan: 30, name: null },
      { kind: "set-port-vlan", deviceId: "s1", portName: "Fa0/2", vlan: 30 },
    ]);
  });

  test("su una porta rimasta su una VLAN eliminata, ricrea soltanto la VLAN", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "interface fa0/2", "switchport access vlan 30", "no vlan 30", "interface fa0/2"]);

    expect(cli.type("switchport access vlan 30")).toEqual(["% Access VLAN does not exist. Creating vlan 30"]);
    expect(configure({ kind: "switchport-access-vlan", id: 30 }, sim.network, "s1", cli.state())?.actions).toEqual([]);
    expect(vlanExists(sw, 30)).toBe(true);
  });

  test("no switchport access vlan riporta la porta nella VLAN 1 e lascia la VLAN", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "interface fa0/1", "switchport access vlan 10", "interface fa0/2", "switchport access vlan 10"]);

    cli.script(["interface fa0/1", "no switchport access vlan"]);

    expect(sw.ports.map((port) => port.vlan)).toEqual([1, 10, 1, 1, 1, 1]);
    expect(vlanExists(sw, 10)).toBe(true);
  });
});

describe("show vlan brief", () => {
  test("elenca le VLAN in ordine, con nome, stato e porte; anche quelle senza porte", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([
      ...CONFIG,
      "vlan 20",
      "name DOCENTI",
      "vlan 10",
      "name STUDENTI",
      "vlan 30",
      "interface fa0/1",
      "switchport access vlan 10",
      "interface fa0/2",
      "switchport access vlan 20",
      "end",
    ]);

    expect(cli.type("show vlan brief")).toEqual([
      "VLAN Name                             Status    Ports",
      "---- -------------------------------- --------- -------------------------------",
      "1    default                          active    Fa0/3, Fa0/4, Fa0/5, Fa0/6",
      "10   STUDENTI                         active    Fa0/1",
      "20   DOCENTI                          active    Fa0/2",
      "30   VLAN0030                         active",
    ]);
  });

  test("le porte di una VLAN eliminata non compaiono da nessuna parte", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "interface fa0/1", "switchport access vlan 10", "exit", "no vlan 10", "end"]);

    const lines = cli.type("show vlan brief");

    expect(lines.slice(2)).toEqual(["1    default                          active    Fa0/2, Fa0/3, Fa0/4, Fa0/5"].concat(["                                                Fa0/6"]));
    expect(lines.join("\n")).not.toContain("Fa0/1");
  });

  test("con 24 porte va a capo ogni quattro, e nessuna riga supera 80 caratteri", () => {
    const sim = new Simulator({ devices: [], links: [] });
    sim.dispatch(addSwitch(24));
    const cli = cliOn(sim, "s1");

    const lines = cli.script(["show vlan brief"]);

    expect(lines).toHaveLength(2 + 6);
    expect(lines[2]).toBe("1    default                          active    Fa0/1, Fa0/2, Fa0/3, Fa0/4");
    expect(lines[7]).toBe("                                                Fa0/21, Fa0/22, Fa0/23, Fa0/24");
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(80);
  });
});

describe("show mac address-table e show running-config", () => {
  test("la tabella MAC scrive la VLAN vera di ogni riga", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "int fa0/3", "sw acc vl 20", "int fa0/4", "sw acc vl 20", "end"]);
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);

    expect(cli.type("show mac address-table").slice(5)).toEqual([
      `   1    ${PC1_MAC}    DYNAMIC     Fa0/1`,
      `   1    ${PC2_MAC}    DYNAMIC     Fa0/2`,
      `  20    ${PC3_MAC}    DYNAMIC     Fa0/3`,
      `  20    ${PC4_MAC}    DYNAMIC     Fa0/4`,
    ]);
  });

  test("lo stesso MAC può comparire in due VLAN", () => {
    const { sim, pc4 } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "int fa0/3", "sw acc vl 20", "int fa0/4", "sw acc vl 20", "end"]);
    pc4.ports[0].mac = PC1_MAC; // per errore, lo stesso MAC di PC1
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d4", PC3_IP);

    const rows = cli.type("show mac address-table").filter((line) => line.includes(PC1_MAC));

    expect(rows).toEqual([`   1    ${PC1_MAC}    DYNAMIC     Fa0/1`, `  20    ${PC1_MAC}    DYNAMIC     Fa0/4`]);
  });

  test("running-config scrive le VLAN e le porte fuori dalla VLAN 1, anche su una VLAN eliminata", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([
      ...CONFIG,
      "vlan 10",
      "name STUDENTI",
      "vlan 30",
      "interface fa0/1",
      "switchport mode access",
      "switchport access vlan 10",
      "interface fa0/2",
      "switchport access vlan 20",
      "shutdown",
      "exit",
      "no vlan 20",
      "end",
    ]);

    const config = cli.type("show running-config");

    expect(config.slice(3, 19)).toEqual([
      "!",
      "hostname SW1",
      "!",
      "vlan 10",
      " name STUDENTI",
      "!",
      "vlan 30",
      "!",
      "interface FastEthernet0/1",
      " switchport access vlan 10",
      "!",
      "interface FastEthernet0/2",
      " switchport access vlan 20",
      " shutdown",
      "!",
      "interface FastEthernet0/3",
    ]);
    expect(config.join("\n")).not.toContain("switchport mode");
  });
});

describe("su un router le VLAN non ci sono", () => {
  test("vlan, no vlan, switchport e show vlan brief non esistono", () => {
    const { sim } = buildTwoLans();
    const cli = cliOn(sim, "r1");

    expect(cli.type("show vlan brief")).toEqual(invalidAt(3 + 5));
    cli.script(CONFIG);
    expect(cli.type("vlan 10")).toEqual(invalidAt(11 + 0));
    expect(cli.type("no vlan 10")).toEqual(invalidAt(11 + 3));
    cli.type("interface gi0/0");
    expect(cli.type("switchport access vlan 10")).toEqual(invalidAt(14 + 1)); // la "s" di shutdown
    expect(cli.help("v")).toEqual(["% Unrecognized command"]);
  });
});

describe("le lezioni sulle VLAN, tutte da CLI", () => {
  test("scenario A: VLAN 10 creata, con nome, su due porte; i due PC si parlano", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "vlan 10", "name STUDENTI", "exit"]);
    cli.script(["interface fa0/1", "switchport mode access", "switchport access vlan 10"]);
    cli.script(["interface fa0/2", "switchport mode access", "switchport access vlan 10", "end"]);

    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
  });

  test("scenario C: due VLAN isolate; l'ARP resta nella VLAN e la tabella MAC lo mostra", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "vlan 10", "name STUDENTI", "vlan 20", "name DOCENTI", "exit"]);
    for (const [port, vlan] of [["fa0/1", 10], ["fa0/2", 10], ["fa0/3", 20], ["fa0/4", 20]]) {
      cli.script([`interface ${port}`, `switchport access vlan ${vlan}`]);
    }
    cli.type("end");

    const start = sim.traces.length;
    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
    const arpReached = sim.traces
      .slice(start)
      .flatMap((t) => (t.kind === "frame-sent" && t.frame.etherType === "ARP" && t.from.deviceId === "s1" ? [t.to.deviceId] : []));
    expect(arpReached).not.toContain("d3");
    expect(arpReached).not.toContain("d4");

    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
    expect(pingOutcomes(sim, "d4", PC2_IP)).toEqual(["unreachable"]);
    expect([...macTableOf(sw, 10).keys()]).toEqual([PC1_MAC, PC2_MAC]);
    expect([...macTableOf(sw, 20).keys()]).toEqual([PC3_MAC, PC4_MAC]);
  });

  test("scenario D: VLAN 20 eliminata, le porte inattive tengono il numero; ricreata, tornano", () => {
    const { sim, sw } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "int fa0/3", "sw acc vl 20", "int fa0/4", "sw acc vl 20", "exit"]);
    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["reply"]);

    cli.type("no vlan 20");
    expect(sw.ports.map((port) => port.vlan)).toEqual([1, 1, 20, 20, 1, 1]);
    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["timeout"]); // PC3 conosce già il MAC di PC4
    expect(cli.type("do show vlan brief").join("\n")).not.toMatch(/Fa0\/3|Fa0\/4/);

    cli.type("vlan 20");
    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["reply"]);
  });
});

describe("salvare una configurazione fatta da CLI", () => {
  test("il file è di versione 3, e riaperto dà gli stessi show e lo stesso isolamento", () => {
    const { sim } = buildFlatLan();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "vlan 10", "name STUDENTI", "vlan 20", "name DOCENTI", "vlan 40", "exit"]);
    for (const [port, vlan] of [["fa0/1", 10], ["fa0/2", 10], ["fa0/3", 20], ["fa0/4", 20]]) {
      cli.script([`interface ${port}`, `switchport access vlan ${vlan}`]);
    }
    cli.script(["end"]);
    const brief = cli.type("show vlan brief");
    const running = cli.type("show running-config");
    const positions = new Map<string, Position>(sim.network.devices.map((d) => [d.id, { x: 0, y: 0 }]));

    const text = serializeNetwork(sim.network, positions);
    const loaded = loadNetworkFile(text);
    const reopened = new Simulator(loaded.network);
    const again = cliOn(reopened, "s1");
    again.type("enable");

    expect(JSON.parse(text).version).toBe(3);
    expect(again.type("show vlan brief")).toEqual(brief);
    expect(again.type("show running-config")).toEqual(running);
    expect(pingOutcomes(reopened, "d1", PC2_IP)).toEqual(["reply"]);
    expect(pingOutcomes(reopened, "d3", PC4_IP)).toEqual(["reply"]);
    expect(pingOutcomes(reopened, "d1", PC4_IP)).toEqual(["unreachable"]);
    expect(pingOutcomes(reopened, "d2", PC1_IP)).toEqual(["reply"]);
  });
});
