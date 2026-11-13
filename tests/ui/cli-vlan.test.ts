import { beforeEach, describe, expect, test } from "vitest";
import { addVlan, setPortVlan } from "../../src/engine/actions";
import type { Switch } from "../../src/engine/model/network";
import { serializeNetwork } from "../../src/storage/save";
import { session } from "../../src/ui/session.svelte";
import { buildFlatLan } from "../engine/builders";

// La LAN di builders.ts senza VLAN, aperta come un file: SW1 con PC1…PC5 su
// Fa0/1…Fa0/5, tutti nella VLAN 1.
function flatLanFile(): string {
  const { sim } = buildFlatLan();
  const positions = new Map(sim.network.devices.map((device, index) => [device.id, { x: index * 100, y: 0 }]));
  return serializeNetwork(sim.network, positions);
}

function switchNow(): Switch {
  return (session as any).simulator.network.devices.find((d: Switch) => d.id === "s1");
}

function type(lines: string[]): void {
  for (const line of lines) session.execute("s1", line);
}

function lastOutput(): string[] {
  const terminal = session.terminals.find((t) => t.deviceId === "s1")!;
  const entry = terminal.entries.at(-1)!;
  return session.outputOf("s1", entry);
}

// La configurazione delle VLAN di SW1: il registro e la VLAN di ogni porta.
function vlanConfig() {
  const sw = switchNow();
  return { vlans: sw.vlans.map((vlan) => ({ ...vlan })), ports: sw.ports.map((port) => port.vlan) };
}

describe("le VLAN dalla CLI nella sessione", () => {
  beforeEach(() => {
    session.open("lan.netsim.json", flatLanFile());
    session.openTerminal("s1");
    type(["enable", "configure terminal"]);
  });

  test("il prompt della modalità config-vlan è quello di IOS", () => {
    type(["vlan 10"]);

    expect(session.promptOf(session.terminals.find((t) => t.deviceId === "s1")!)).toBe("SW1(config-vlan)#");
  });

  test("Ctrl+Z da dentro una VLAN torna alla modalità privilegiata", () => {
    type(["vlan 10"]);

    session.endConfiguration("s1");

    expect(session.terminals.find((t) => t.deviceId === "s1")!.cli).toEqual({ mode: "privileged", interfaceName: null });
  });

  test("scenario B: switchport access vlan 30 crea la VLAN e sposta la porta; un Annulla toglie tutto, un Ripristina rimette tutto", () => {
    const before = vlanConfig();
    type(["interface fa0/1", "switchport access vlan 30"]);
    expect(lastOutput()).toEqual(["% Access VLAN does not exist. Creating vlan 30"]);
    const after = vlanConfig();
    expect(after.ports[0]).toBe(30);
    expect(after.vlans.map((vlan) => vlan.id)).toEqual([1, 30]);

    session.undo();
    expect(vlanConfig()).toEqual(before);
    expect(session.canUndo).toBe(false);

    session.redo();
    expect(vlanConfig()).toEqual(after);
    expect(session.canRedo).toBe(false);
  });

  test("ogni comando è un passo della cronologia: vlan, name, switchport", () => {
    type(["vlan 10", "name STUDENTI", "interface fa0/2", "switchport access vlan 10"]);

    session.undo();
    expect(vlanConfig().ports[1]).toBe(1);
    expect(vlanConfig().vlans[1]).toEqual({ id: 10, name: "STUDENTI" });
    session.undo();
    expect(vlanConfig().vlans[1]).toEqual({ id: 10, name: "VLAN0010" });
    session.undo();
    expect(vlanConfig().vlans).toEqual([{ id: 1, name: "default" }]);
  });

  test("annullare l'eliminazione di una VLAN la rimette, con il nome, e le porte tornano attive", () => {
    type(["vlan 20", "name DOCENTI", "interface fa0/3", "switchport access vlan 20", "exit", "no vlan 20"]);
    expect(vlanConfig().ports[2]).toBe(20);

    session.undo();

    expect(vlanConfig().vlans[1]).toEqual({ id: 20, name: "DOCENTI" });
    type(["do show vlan brief"]);
    expect(lastOutput().find((line) => line.startsWith("20 "))).toMatch(/DOCENTI +active +Fa0\/3$/);
  });

  test("a simulazione sospesa i comandi sono rifiutati: niente VLAN a metà, e si resta dove si era", () => {
    type(["interface fa0/1"]);
    (session as any).simulator.suspended = true;

    type(["switchport access vlan 30"]);
    expect(vlanConfig().vlans.map((vlan) => vlan.id)).toEqual([1]);
    expect(vlanConfig().ports[0]).toBe(1);

    type(["vlan 40"]);
    const terminal = session.terminals.find((t) => t.deviceId === "s1")!;
    expect(terminal.cli?.mode).toBe("config-if");
    expect(session.canUndo).toBe(false);
    (session as any).simulator.suspended = false;
  });

  test("se una delle azioni di una modifica sola viene rifiutata, la rete torna com'era prima della prima", () => {
    const before = vlanConfig();

    const problem = (session as any).attemptTogether([addVlan("s1", 30), setPortVlan("s1", "Fa0/99", 30)]);

    expect(problem).toBe("SW1 non ha una porta Fa0/99.");
    expect(vlanConfig()).toEqual(before);
    expect(session.canUndo).toBe(false);
  });

  test("la configurazione fatta da CLI si salva, e riaperta dà lo stesso show vlan brief", () => {
    type(["vlan 10", "name STUDENTI", "interface fa0/1", "switchport access vlan 10", "end", "show vlan brief"]);
    const brief = lastOutput();
    const text = session.serialize();

    session.open("lan.netsim.json", text);
    session.openTerminal("s1");
    type(["enable", "show vlan brief"]);

    expect(JSON.parse(text).version).toBe(3);
    expect(lastOutput()).toEqual(brief);
  });
});
