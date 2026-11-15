import { beforeEach, describe, expect, test } from "vitest";
import type { Switch } from "../../src/engine/model/network";
import { serializeNetwork } from "../../src/storage/save";
import { session } from "../../src/ui/session.svelte";
import { PC3_IP, PC4_IP, buildTrunkSwitches } from "../engine/builders";

// La rete di builders.ts con due switch uniti tra le Fa0/24, che qui
// partono access: il trunk lo configura la CLI, nella sessione.
function accessLinkFile(): string {
  const { sim } = buildTrunkSwitches({ mode: "access" }, { mode: "access" });
  const positions = new Map(sim.network.devices.map((device, index) => [device.id, { x: index * 100, y: 0 }]));
  return serializeNetwork(sim.network, positions);
}

function portNow(switchId = "s1"): Switch["ports"][number] {
  const sw = (session as any).simulator.network.devices.find((d: Switch) => d.id === switchId) as Switch;
  return sw.ports[3];
}

function type(switchId: string, lines: string[]): string[] {
  for (const line of lines) session.execute(switchId, line);
  const terminal = session.terminals.find((t) => t.deviceId === switchId)!;
  return session.outputOf(switchId, terminal.entries.at(-1)!);
}

function pingOutcome(fromId: string, ip: string): string | undefined {
  const before = session.view.pingResults.length;
  session.ping(fromId, ip, 1);
  while (session.view.nextEvent !== null) session.step();
  return session.view.pingResults.slice(before).at(-1)?.outcome;
}

const IN_TRUNK = ["enable", "configure terminal", "interface fa0/24"];

beforeEach(() => {
  session.open("trunk.netsim.json", accessLinkFile());
  session.openTerminal("s1");
  session.openTerminal("s2");
});

describe("i trunk dalla CLI nella sessione", () => {
  test("ogni comando è un passo della cronologia; add e remove sono un passo solo", () => {
    type("s1", IN_TRUNK);
    type("s1", [
      "switchport mode trunk",
      "switchport trunk native vlan 99",
      "switchport trunk allowed vlan 10,20",
      "switchport trunk allowed vlan add 30-35",
      "switchport trunk allowed vlan remove 20",
    ]);
    expect(portNow()).toMatchObject({ mode: "trunk", nativeVlan: 99, allowedVlans: [10, 30, 31, 32, 33, 34, 35] });

    session.undo();
    expect(portNow().allowedVlans).toEqual([10, 20, 30, 31, 32, 33, 34, 35]);
    session.undo();
    expect(portNow().allowedVlans).toEqual([10, 20]);
    session.undo();
    expect(portNow().allowedVlans).toBe("all");
    session.undo();
    expect(portNow().nativeVlan).toBe(1);
    session.undo();
    expect(portNow().mode).toBe("access");
    expect(session.canUndo).toBe(false);

    for (let i = 0; i < 5; i++) session.redo();
    expect(portNow()).toMatchObject({ mode: "trunk", nativeVlan: 99, allowedVlans: [10, 30, 31, 32, 33, 34, 35] });
  });

  test("i comandi no, all e none sono passi che si annullano; un comando che non cambia nulla no", () => {
    type("s1", [...IN_TRUNK, "switchport mode trunk", "switchport trunk native vlan 99", "switchport trunk allowed vlan none"]);
    type("s1", ["no switchport trunk native vlan", "no switchport trunk allowed vlan", "no switchport mode"]);
    expect(portNow()).toMatchObject({ mode: "access", nativeVlan: 1, allowedVlans: "all" });
    type("s1", ["no switchport mode", "switchport trunk allowed vlan all"]); // nulla da cambiare

    session.undo();
    expect(portNow().mode).toBe("trunk");
    session.undo();
    expect(portNow().allowedVlans).toEqual([]);
    session.undo();
    expect(portNow().nativeVlan).toBe(99);
  });

  test("trunk configurati da CLI ai due capi: la rete funziona, i show lo dicono, il file è di versione 4 e si riapre uguale", () => {
    type("s1", [...IN_TRUNK, "switchport mode trunk", "switchport trunk allowed vlan 10,20", "end"]);
    type("s2", [...IN_TRUNK, "sw mo tr", "sw tr al vl 10,20", "end"]);

    expect(pingOutcome("d1", PC3_IP)).toBe("reply");
    expect(pingOutcome("d2", PC4_IP)).toBe("reply");
    expect(pingOutcome("d1", PC4_IP)).toBe("unreachable");
    expect(type("s1", ["show interfaces trunk"])).toEqual([
      "Port        Mode             Encapsulation  Status        Native vlan",
      "Fa0/24      on               802.1q         trunking      1",
      "",
      "Port        Vlans allowed on trunk",
      "Fa0/24      10,20",
      "",
      "Port        Vlans allowed and active in management domain",
      "Fa0/24      10,20",
    ]);

    const text = session.serialize();
    expect(JSON.parse(text).version).toBe(4);
    session.open("trunk.netsim.json", text);
    session.openTerminal("s2");
    expect(portNow("s2")).toMatchObject({ mode: "trunk", allowedVlans: [10, 20] });
    expect(type("s2", ["enable", "show running-config"])).toContain(" switchport trunk allowed vlan 10,20");
    expect(pingOutcome("d2", PC4_IP)).toBe("reply");
  });

  test("CLI e simulazione: un passo dopo l'altro, la porta torna access e poi trunk, e i ping lo seguono", () => {
    type("s1", [...IN_TRUNK, "switchport mode trunk"]);
    type("s2", [...IN_TRUNK, "switchport mode trunk"]);
    expect(pingOutcome("d1", PC3_IP)).toBe("reply");

    type("s2", ["switchport mode access"]);
    expect(pingOutcome("d2", PC4_IP)).toBe("unreachable");
    type("s2", ["switchport mode trunk"]);
    expect(pingOutcome("d2", PC4_IP)).toBe("reply");
  });
});
