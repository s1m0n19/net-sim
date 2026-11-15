import { describe, expect, test } from "vitest";
import { disableInterface, disconnectLink, ping, setPortMode } from "../../src/engine/actions";
import type { Router, Switch } from "../../src/engine/model/network";
import { macTableOf } from "../../src/engine/model/vlans";
import type { Simulator } from "../../src/engine/simulator";
import { allowedAfter, configure, describeDevice } from "../../src/shell/ios/configure";
import { complete, helpFor } from "../../src/shell/ios/help";
import { interpret } from "../../src/shell/ios/interpreter";
import { INITIAL_STATE, promptOf, type CliState } from "../../src/shell/ios/modes";
import { vlanListError } from "../../src/shell/ios/parser";
import { show } from "../../src/shell/ios/show";
import { PC1_MAC, PC3_IP, PC3_MAC, PC4_IP, PC4_MAC, buildTrunkSwitches, buildTwoLans } from "../engine/builders";

// La rete di builders.ts con due switch uniti tra le Fa0/24: SW1 con PC1
// (VLAN 10) su Fa0/1 e PC2 (VLAN 20) su Fa0/2, SW2 con PC3 (VLAN 10) e PC4
// (VLAN 20); Fa0/3 libera. Qui le Fa0/24 partono access, nella VLAN 1, e
// il trunk lo configura la CLI.
function accessLink() {
  return buildTrunkSwitches({ mode: "access" }, { mode: "access" });
}

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
    if (outcome.command.kind === "show") {
      return show(outcome.command.topic, sim.network, deviceId, outcome.command.interfaceName);
    }
    return [...outcome.lines, ...(configured?.lines ?? [])];
  }

  return {
    type,
    script: (lines: string[]) => lines.flatMap(type),
    prompt: () => promptOf(device().name, state.mode),
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
const IN_TRUNK = [...CONFIG, "interface fa0/24"];
// "SW1(config-if)#" è lungo 15 caratteri: la riga scritta comincia lì.
const PROMPT_IF = 15;

function trunkPort(sim: Simulator, id = "s1"): Switch["ports"][number] {
  return (sim.network.devices.find((d) => d.id === id) as Switch).ports[3];
}

describe("il modo della porta", () => {
  test("switchport mode trunk la rende trunk, mode access e no switchport mode la riportano access", () => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script(IN_TRUNK);

    expect(cli.type("switchport mode trunk")).toEqual([]);
    expect(trunkPort(sim).mode).toBe("trunk");
    cli.type("switchport mode access");
    expect(trunkPort(sim).mode).toBe("access");
    cli.type("switchport mode trunk");
    cli.type("no switchport mode");
    expect(trunkPort(sim).mode).toBe("access");
  });

  test("tornando access, VLAN access, nativa e consentite restano, e tornando trunk valgono di nuovo", () => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script([...IN_TRUNK, "switchport access vlan 10", "switchport trunk native vlan 99", "switchport trunk allowed vlan 10,20,99"]);

    cli.script(["switchport mode trunk", "switchport mode access"]);
    expect(trunkPort(sim)).toMatchObject({ mode: "access", vlan: 10, nativeVlan: 99, allowedVlans: [10, 20, 99] });
    cli.type("switchport mode trunk");
    expect(trunkPort(sim)).toMatchObject({ mode: "trunk", vlan: 10, nativeVlan: 99, allowedVlans: [10, 20, 99] });
  });

  test("un comando che non cambia nulla non propone azioni", () => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script(IN_TRUNK);
    const before = sim.traces.length;

    cli.script(["switchport mode access", "no switchport mode", "switchport trunk native vlan 1", "no switchport trunk allowed vlan"]);
    cli.script(["switchport mode trunk", "switchport mode trunk", "switchport trunk allowed vlan all", "switchport trunk allowed vlan add 30"]);

    expect(sim.traces.slice(before).map((t) => t.kind)).toEqual(["port-mode-changed"]);
  });
});

describe("la VLAN nativa", () => {
  test("si imposta e torna alla 1 con no; non si crea, e la porta non cambia modo", () => {
    const { sim, sw1 } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script(IN_TRUNK);

    expect(cli.type("switchport trunk native vlan 99")).toEqual([]);
    expect(trunkPort(sim)).toMatchObject({ mode: "access", nativeVlan: 99 });
    expect(sw1.vlans.map((v) => v.id)).toEqual([1, 10, 20]);
    cli.type("no switchport trunk native vlan");
    expect(trunkPort(sim).nativeVlan).toBe(1);
  });

  test("un numero sbagliato si rifiuta, con il segno sotto il numero", () => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script(IN_TRUNK);

    expect(cli.type("switchport trunk native vlan 1002")).toEqual(invalidAt(PROMPT_IF + 29));
    expect(cli.type("switchport trunk native vlan 0")).toEqual(invalidAt(PROMPT_IF + 29));
    expect(cli.type("switchport trunk native vlan dieci")).toEqual(invalidAt(PROMPT_IF + 29));
    expect(cli.type("switchport trunk native vlan")).toEqual(["% Incomplete command."]);
    expect(trunkPort(sim).nativeVlan).toBe(1);
  });
});

describe("le VLAN consentite", () => {
  test.each([
    ["switchport trunk allowed vlan 10", [10]],
    ["switchport trunk allowed vlan 10,20", [10, 20]],
    ["switchport trunk allowed vlan 10-13", [10, 11, 12, 13]],
    ["switchport trunk allowed vlan 30-32,10,20", [10, 20, 30, 31, 32]],
    ["switchport trunk allowed vlan none", []],
    ["switchport trunk allowed vlan all", "all"],
  ])("%s", (line, expected) => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script([...IN_TRUNK, "switchport trunk allowed vlan 5"]);

    expect(cli.type(line)).toEqual([]);
    expect(trunkPort(sim).allowedVlans).toEqual(expected);
  });

  test("add e remove cambiano l'elenco di adesso; no lo riporta a tutte", () => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script([...IN_TRUNK, "switchport trunk allowed vlan 10,20"]);

    cli.type("switchport trunk allowed vlan add 30");
    expect(trunkPort(sim).allowedVlans).toEqual([10, 20, 30]);
    cli.type("switchport trunk allowed vlan remove 20");
    expect(trunkPort(sim).allowedVlans).toEqual([10, 30]);
    cli.type("switchport trunk allowed vlan add 25-31");
    expect(trunkPort(sim).allowedVlans).toEqual([10, 25, 26, 27, 28, 29, 30, 31]);
    cli.type("no switchport trunk allowed vlan");
    expect(trunkPort(sim).allowedVlans).toBe("all");
  });

  test("con tutte le VLAN, add non cambia nulla e remove lascia tutte le altre", () => {
    expect(allowedAfter("all", { kind: "add", vlans: [30] })).toBe("all");
    const removed = allowedAfter("all", { kind: "remove", vlans: [20] });

    expect(removed).not.toBe("all");
    expect(removed).toHaveLength(1000);
    expect((removed as readonly number[]).includes(20)).toBe(false);
  });

  test("aggiungere ciò che c'è, togliere ciò che non c'è, togliere tutto, aggiungere dopo none", () => {
    expect(allowedAfter([10, 20], { kind: "add", vlans: [10] })).toEqual([10, 20]);
    expect(allowedAfter([10, 20], { kind: "remove", vlans: [30] })).toEqual([10, 20]);
    expect(allowedAfter([10, 20], { kind: "remove", vlans: [10, 20] })).toEqual([]);
    expect(allowedAfter([], { kind: "add", vlans: [20, 10] })).toEqual([10, 20]);
  });

  test("gli elenchi sbagliati si rifiutano, con il segno sotto il primo carattere sbagliato", () => {
    // La parola dell'elenco comincia dopo "switchport trunk allowed vlan ", 30 caratteri.
    const column = PROMPT_IF + 30;
    const cases: [string, number][] = [
      ["10,", 3],
      ["10,,20", 3],
      ["20-10", 3],
      ["10-", 3],
      ["0", 0],
      ["1002", 0],
      ["abc", 0],
      ["10,2000", 3],
      ["10;20", 2],
    ];
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script(IN_TRUNK);

    for (const [list, offset] of cases) {
      expect(vlanListError(list)).toBe(offset);
      expect(cli.type(`switchport trunk allowed vlan ${list}`)).toEqual(invalidAt(column + offset));
    }
    for (const list of ["10", "10,20", "10-15", "10,20,30-35", "1-1001"]) expect(vlanListError(list)).toBeNull();
    expect(cli.type("switchport trunk allowed vlan add 10,,20")).toEqual(invalidAt(column + 4 + 3));
    expect(cli.type("switchport trunk allowed vlan")).toEqual(["% Incomplete command."]);
    expect(cli.type("switchport trunk allowed vlan remove")).toEqual(["% Incomplete command."]);
    expect(trunkPort(sim).allowedVlans).toBe("all");
  });
});

describe("aiuto, abbreviazioni e completamento", () => {
  test("? dice che cosa segue switchport trunk e le sue parole", () => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script(IN_TRUNK);

    expect(cli.help("switchport trunk ")).toEqual([
      "  allowed  VLANs the trunk lets through",
      "  native   Native VLAN of the trunk, sent without tag",
    ]);
    expect(cli.help("switchport trunk allowed vlan ")).toEqual([
      "  WORD    VLAN numbers and ranges, like 10,20,30-35",
      "  add     Add VLANs to the list",
      "  all     All VLANs",
      "  none    No VLAN",
      "  remove  Remove VLANs from the list",
    ]);
    expect(cli.help("switchport trunk native vlan ")).toEqual(["  <1-1001>  VLAN number"]);
    expect(cli.help("no switchport ")).toEqual([
      "  access  Settings of an access port",
      "  mode    Make the port an access port again",
      "  trunk   Settings of a trunk port",
    ]);
  });

  test("le abbreviazioni valgono, purché non ambigue; Tab completa le parole", () => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script([...CONFIG, "int fa0/24"]);

    cli.script(["sw mo tr", "sw tr na vl 99", "sw tr al vl 10,20,99", "sw tr al vl rem 20"]);
    expect(trunkPort(sim)).toMatchObject({ mode: "trunk", nativeVlan: 99, allowedVlans: [10, 99] });
    expect(cli.type("sw tr al vl a 30")).toEqual(['% Ambiguous command:  "sw tr al vl a 30"']);
    expect(cli.complete("switchport tr")).toBe("switchport trunk ");
    expect(cli.complete("switchport trunk al")).toBe("switchport trunk allowed ");
    expect(cli.complete("switchport trunk allowed vlan re")).toBe("switchport trunk allowed vlan remove ");
    expect(cli.complete("switchport trunk allowed vlan 1")).toBe("switchport trunk allowed vlan 1");
    cli.type("end");
    expect(cli.type("sh int tr")[0]).toMatch(/^Port +Mode +Encapsulation +Status +Native vlan$/);
    expect(cli.complete("show int")).toBe("show interfaces ");
    expect(cli.complete("show interfaces fa")).toBe("show interfaces FastEthernet");
  });

  test("l'incapsulamento non si sceglie: è sempre 802.1Q, e il comando non c'è", () => {
    const { sim } = accessLink();
    const cli = cliOn(sim, "s1");
    cli.script(IN_TRUNK);

    expect(cli.type("switchport trunk encapsulation dot1q")).toEqual(invalidAt(PROMPT_IF + 17));
    expect(cli.type("switchport mode dynamic desirable")).toEqual(invalidAt(PROMPT_IF + 16));
    expect(cli.type("switchport nonegotiate")).toEqual(invalidAt(PROMPT_IF + 11));
  });

  test("sui router i comandi dei trunk non ci sono", () => {
    const { sim } = buildTwoLans();
    const cli = cliOn(sim, "r1");
    cli.script([...CONFIG, "interface gi0/0"]);

    // Il segno va dopo la "s", che "switchport" ha in comune con "shutdown".
    expect(cli.type("switchport mode trunk")).toEqual(invalidAt(14 + 1));
    expect(cli.type("no switchport trunk native vlan")).toEqual(invalidAt(14 + 3 + 1));
    expect(cli.help("switchport ")).toEqual(["% Unrecognized command"]);
    cli.type("end");
    expect(cli.type("show interfaces trunk")).toEqual(invalidAt(3 + 16));
    expect(cli.type("show interfaces gi0/0 switchport")).toEqual(invalidAt(3 + 22));
    expect(cli.type("show interfaces gi0/0")[0]).toMatch(/^GigabitEthernet0\/0 is /);
  });
});

describe("show interfaces trunk", () => {
  test("le porte trunk che funzionano: modo, incapsulamento, stato, nativa, consentite e attive", () => {
    const { sim } = buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 20, 30, 99] });
    const cli = cliOn(sim, "s1");
    cli.type("enable");

    expect(cli.type("show interfaces trunk")).toEqual([
      "Port        Mode             Encapsulation  Status        Native vlan",
      "Fa0/24      on               802.1q         trunking      99",
      "",
      "Port        Vlans allowed on trunk",
      "Fa0/24      10,20,30,99",
      "",
      "Port        Vlans allowed and active in management domain",
      "Fa0/24      10,20",
    ]);
  });

  test("tutte le VLAN si scrivono 1-1001; nessuna, none", () => {
    const all = buildTrunkSwitches();
    const cli = cliOn(all.sim, "s1");
    cli.type("enable");
    const lines = cli.type("show interfaces trunk");
    expect(lines[4]).toBe("Fa0/24      1-1001");
    expect(lines[7]).toBe("Fa0/24      1,10,20");

    all.sim.dispatch({ kind: "set-allowed-vlans", deviceId: "s1", portName: "Fa0/24", vlans: [] });
    expect(cli.type("show interfaces trunk").slice(4)).toEqual(["Fa0/24      none", "", lines[6], "Fa0/24      none"]);
  });

  test("un trunk spento, senza cavo, o una porta access non compaiono; senza trunk non si stampa nulla", () => {
    const shut = buildTrunkSwitches();
    shut.sim.dispatch(disableInterface("s1", "Fa0/24"));
    const unplugged = buildTrunkSwitches();
    unplugged.sim.dispatch(disconnectLink("l5"));
    const access = accessLink();

    for (const { sim } of [shut, unplugged, access]) {
      const cli = cliOn(sim, "s1");
      cli.type("enable");
      expect(cli.type("show interfaces trunk")).toEqual([]);
    }
  });
});

describe("show interfaces … switchport", () => {
  test("una porta trunk che funziona", () => {
    const { sim } = buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 20, 99] });
    const cli = cliOn(sim, "s1");
    cli.type("enable");

    expect(cli.type("show interfaces fa0/24 switchport")).toEqual([
      "Name: Fa0/24",
      "Switchport: Enabled",
      "Administrative Mode: trunk",
      "Operational Mode: trunk",
      "Administrative Trunking Encapsulation: dot1q",
      "Access Mode VLAN: 1 (default)",
      "Trunking Native Mode VLAN: 99 (Inactive)",
      "Trunking VLANs Enabled: 10,20,99",
    ]);
  });

  test("una porta access che conserva nativa e consentite, una spenta, una senza cavo", () => {
    const { sim } = buildTrunkSwitches({ mode: "access", vlan: 10, nativeVlan: 20, allowedVlans: [] });
    const cli = cliOn(sim, "s1");
    cli.type("enable");

    expect(cli.type("show interfaces fastEthernet 0/24 switchport")).toEqual([
      "Name: Fa0/24",
      "Switchport: Enabled",
      "Administrative Mode: static access",
      "Operational Mode: static access",
      "Administrative Trunking Encapsulation: dot1q",
      "Access Mode VLAN: 10 (STUDENTI)",
      "Trunking Native Mode VLAN: 20 (DOCENTI)",
      "Trunking VLANs Enabled: NONE",
    ]);
    expect(cli.type("show interfaces fa0/3 switchport")[3]).toBe("Operational Mode: down"); // senza cavo
    sim.dispatch(setPortMode("s1", "Fa0/24", "trunk"));
    sim.dispatch(disableInterface("s1", "Fa0/24"));
    expect(cli.type("show interfaces fa0/24 switchport").slice(2, 4)).toEqual(["Administrative Mode: trunk", "Operational Mode: down"]);
    expect(cli.type("show interfaces fa0/9 switchport")[1]).toBe("% Invalid input detected at '^' marker.");
  });
});

describe("running-config, show vlan brief, show mac address-table", () => {
  test("running-config scrive i comandi che ricostruiscono i trunk, nell'ordine di IOS, e nulla di superfluo", () => {
    const { sim } = buildTrunkSwitches({ vlan: 10, nativeVlan: 99, allowedVlans: [10, 20, 30, 31, 32, 99] });
    sim.dispatch({ kind: "set-native-vlan", deviceId: "s1", portName: "Fa0/3", vlan: 20 }); // conservata su una porta access
    const cli = cliOn(sim, "s1");
    cli.type("enable");
    const config = cli.type("show running-config");
    const block = (name: string) => {
      const start = config.indexOf(`interface FastEthernet${name}`);
      return config.slice(start, config.indexOf("!", start));
    };

    expect(block("0/24")).toEqual([
      "interface FastEthernet0/24",
      " switchport access vlan 10",
      " switchport trunk native vlan 99",
      " switchport trunk allowed vlan 10,20,30-32,99",
      " switchport mode trunk",
    ]);
    expect(block("0/3")).toEqual(["interface FastEthernet0/3", " switchport trunk native vlan 20"]);
    expect(block("0/1")).toEqual(["interface FastEthernet0/1", " switchport access vlan 10"]);
  });

  test("nessuna VLAN consentita si scrive none; una rete senza trunk resta come prima", () => {
    const { sim } = buildTrunkSwitches({ allowedVlans: [] });
    const cli = cliOn(sim, "s1");
    cli.type("enable");

    expect(cli.type("show running-config")).toContain(" switchport trunk allowed vlan none");
    const flat = accessLink();
    const flatCli = cliOn(flat.sim, "s1");
    flatCli.type("enable");
    expect(flatCli.type("show running-config").filter((line) => line.includes("trunk") || line.includes("mode"))).toEqual([]);
  });

  test("show vlan brief non elenca le porte trunk, e le VLAN restano anche senza porte access", () => {
    const { sim } = buildTrunkSwitches();
    sim.dispatch({ kind: "set-port-vlan", deviceId: "s1", portName: "Fa0/2", vlan: 1 });
    const cli = cliOn(sim, "s1");
    cli.type("enable");
    const brief = cli.type("show vlan brief");

    expect(brief.find((line) => line.startsWith("1 "))).toMatch(/default +active +Fa0\/2, Fa0\/3$/);
    expect(brief.find((line) => line.startsWith("10 "))).toMatch(/STUDENTI +active +Fa0\/1$/);
    expect(brief.find((line) => line.startsWith("20 "))).toMatch(/DOCENTI +active$/);
    expect(brief.join("\n")).not.toContain("Fa0/24");
  });

  test("show mac address-table: il trunk compare in più VLAN, e lo stesso MAC in due VLAN", () => {
    const { sim } = buildTrunkSwitches();
    (sim.network.devices.find((d) => d.id === "d4")!).ports[0].mac = PC3_MAC;
    pingOutcomes(sim, "d1", PC3_IP);
    pingOutcomes(sim, "d2", PC4_IP);
    const cli = cliOn(sim, "s1");
    cli.type("enable");

    const rows = cli.type("show mac address-table").slice(5);
    expect(rows).toEqual([
      `  10    ${PC1_MAC}    DYNAMIC     Fa0/1`,
      `  10    ${PC3_MAC}    DYNAMIC     Fa0/24`,
      `  20    02:00:00:00:00:02    DYNAMIC     Fa0/2`,
      `  20    ${PC3_MAC}    DYNAMIC     Fa0/24`,
    ]);
    expect(PC4_MAC).toBeDefined();
  });
});

describe("i trunk tutti da CLI", () => {
  // Configura i due capi del trunk, uno per switch.
  function trunkByCli(sim: Simulator, sw1Lines: string[] = [], sw2Lines: string[] = []) {
    cliOn(sim, "s1").script([...IN_TRUNK, "switchport mode trunk", ...sw1Lines, "end"]);
    cliOn(sim, "s2").script([...IN_TRUNK, "switchport mode trunk", ...sw2Lines, "end"]);
  }

  test("due switch e quattro PC: la stessa VLAN passa sul trunk, VLAN diverse restano isolate", () => {
    const { sim } = accessLink();
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);

    trunkByCli(sim, ["switchport trunk allowed vlan 10,20"], ["switchport trunk allowed vlan 10,20"]);

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d1", PC4_IP)).toEqual(["unreachable"]);
    expect(pingOutcomes(sim, "d2", PC3_IP)).toEqual(["unreachable"]);
    expect(macTableOf(sim.network.devices[0] as Switch, 10).get(PC3_MAC)).toBe("Fa0/24");
  });

  test("native diverse: lo si vede confrontando show interfaces trunk ai due capi", () => {
    const { sim } = accessLink();
    trunkByCli(sim, ["switchport trunk native vlan 10"], ["switchport trunk native vlan 20"]);

    expect(pingOutcomes(sim, "d1", PC4_IP)).toEqual(["reply"]); // la 10 di SW1 finisce nella 20 di SW2
    const natives = ["s1", "s2"].map((id) => {
      const cli = cliOn(sim, id);
      cli.type("enable");
      return cli.type("show interfaces trunk")[1];
    });
    expect(natives).toEqual([
      "Fa0/24      on               802.1q         trunking      10",
      "Fa0/24      on               802.1q         trunking      20",
    ]);
  });

  test("una VLAN tolta da un solo capo non passa, e show interfaces trunk lo mostra", () => {
    const { sim } = accessLink();
    trunkByCli(sim, [], ["switchport trunk allowed vlan remove 20"]);

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["unreachable"]);
    const cli = cliOn(sim, "s2");
    cli.type("enable");
    expect(cli.type("show interfaces trunk")[4]).toBe("Fa0/24      1-19,21-1001");
  });

  test("cambiare modo a traffico in corso: la rete si riprende", () => {
    const { sim } = accessLink();
    trunkByCli(sim);
    sim.dispatch(ping("d1", PC3_IP, 3));
    for (let i = 0; i < 5; i++) sim.step();
    cliOn(sim, "s2").script([...IN_TRUNK, "switchport mode access"]);
    run(sim);

    cliOn(sim, "s2").script([...IN_TRUNK, "switchport mode trunk"]);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
  });
});
