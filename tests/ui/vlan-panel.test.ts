import { beforeEach, describe, expect, test } from "vitest";
import type { Switch } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { serializeNetwork } from "../../src/storage/save";
import { session } from "../../src/ui/session.svelte";
import { buildView } from "../../src/ui/view";
import { PC1_MAC, buildFlatLan } from "../engine/builders";

// La LAN di builders.ts senza VLAN, aperta come un file: SW1 con PC1…PC5 su
// Fa0/1…Fa0/5 e Fa0/6 libera, tutti in 192.168.1.0/24 e nella VLAN 1.
function flatLanFile(): string {
  const { sim } = buildFlatLan();
  const positions = new Map(sim.network.devices.map((device, index) => [device.id, { x: index * 100, y: 0 }]));
  return serializeNetwork(sim.network, positions);
}

function switchView() {
  return session.view.devices.find((device) => device.id === "s1")!;
}

function switchNow(): Switch {
  return (session as any).simulator.network.devices.find((d: Switch) => d.id === "s1");
}

function cli(lines: string[]): string[] {
  for (const line of lines) session.execute("s1", line);
  const terminal = session.terminals.find((t) => t.deviceId === "s1")!;
  return session.outputOf("s1", terminal.entries.at(-1)!);
}

function runToEnd(): void {
  while (session.view.nextEvent !== null) session.step();
}

function pingOutcome(fromId: string, ip: string): string | undefined {
  const before = session.view.pingResults.length;
  session.ping(fromId, ip, 1);
  runToEnd();
  return session.view.pingResults.slice(before).at(-1)?.outcome;
}

beforeEach(() => {
  session.open("lan.netsim.json", flatLanFile());
});

describe("ciò che il pannello mostra dello switch", () => {
  test("le VLAN, con la VLAN 1 predefinita e le porte di ciascuna", () => {
    session.addVlan("s1", "10", "STUDENTI");
    session.setPortVlan("s1", "Fa0/1", 10);

    expect(switchView().vlans).toEqual([
      { id: 1, name: "default", isDefault: true, ports: ["Fa0/2", "Fa0/3", "Fa0/4", "Fa0/5", "Fa0/6"], trunks: [] },
      { id: 10, name: "STUDENTI", isDefault: false, ports: ["Fa0/1"], trunks: [] },
    ]);
  });

  test("le porte, con il dispositivo collegato, la VLAN e lo stato", () => {
    session.addVlan("s1", "30", "");
    session.setPortVlan("s1", "Fa0/3", 30);
    session.removeVlan("s1", 30);

    const ports = switchView().switchPorts;
    // Una porta access senza nulla di trunk: nativa 1, tutte le VLAN.
    const access = { mode: "access", nativeVlan: 1, nativeName: "default", allowedVlans: "all", carriedVlans: [1], trunkConfigKept: false };
    expect(ports[0]).toEqual({ name: "Fa0/1", vlan: 1, vlanName: "default", enabled: true, linkedTo: "PC1", signal: true, ...access });
    expect(ports[2]).toEqual({ name: "Fa0/3", vlan: 30, vlanName: null, enabled: true, linkedTo: "PC3", signal: true, ...access });
    expect(ports[5]).toEqual({ name: "Fa0/6", vlan: 1, vlanName: "default", enabled: true, linkedTo: null, signal: false, ...access });
  });

  test("uno switch da 24 porte ha 24 porte, tutte nella VLAN 1", () => {
    session.addDevice({ kind: "switch", portCount: 24 }, { x: 0, y: 300 });
    const added = session.view.devices.at(-1)!;

    expect(added.switchPorts).toHaveLength(24);
    expect(added.vlans[0].ports).toHaveLength(24);
  });

  test("le righe della tabella MAC dicono la VLAN, e lo stesso MAC può stare in due VLAN", () => {
    const { sim, pc4 } = buildFlatLan();
    const sw = sim.network.devices[0] as Switch;
    pc4.ports[0].mac = PC1_MAC;
    sw.ports[3].vlan = 20;
    sw.ports[2].vlan = 20;
    sw.vlans.push({ id: 20, name: "DOCENTI" });
    const run = () => {
      while (sim.canStep()) sim.step();
    };
    sim.dispatch({ kind: "ping", deviceId: "d1", targetIp: "192.168.1.11", count: 1 });
    run();
    sim.dispatch({ kind: "ping", deviceId: "d4", targetIp: "192.168.1.12", count: 1 });
    run();

    const rows = buildView(sim as Simulator, new Map()).devices[0].macRows.filter(([, mac]) => mac === PC1_MAC);

    expect(rows).toEqual([
      ["1", PC1_MAC, "Fa0/1"],
      ["20", PC1_MAC, "Fa0/4"],
    ]);
  });
});

describe("creare, rinominare ed eliminare dal pannello", () => {
  test("una VLAN senza nome prende quello del motore", () => {
    expect(session.addVlan("s1", "10", "  ")).toBeNull();

    expect(switchView().vlans[1]).toMatchObject({ id: 10, name: "VLAN0010" });
  });

  test("numeri e nomi sbagliati sono rifiutati con il motivo, e la rete non cambia", () => {
    expect(session.addVlan("s1", "", "")).toBe("Scrivi il numero della VLAN, da 1 a 1001.");
    expect(session.addVlan("s1", "dieci", "")).toBe("Scrivi il numero della VLAN, da 1 a 1001.");
    expect(session.addVlan("s1", "0", "")).toBe("Numero di VLAN non valido: 0. Si usano i numeri da 1 a 1001.");
    expect(session.addVlan("s1", "1002", "")).toContain("Numero di VLAN non valido: 1002");
    expect(session.addVlan("s1", "1", "")).toBe("La VLAN 1 c'è già.");
    expect(session.addVlan("s1", "10", "DUE PAROLE")).toBe("Il nome della VLAN non può contenere spazi.");
    expect(session.addVlan("s1", "10", "X".repeat(33))).toBe("Il nome della VLAN può avere al massimo 32 caratteri.");
    session.addVlan("s1", "10", "");
    expect(session.addVlan("s1", "10", "ALTRO")).toBe("La VLAN 10 c'è già.");

    expect(switchView().vlans.map((vlan) => vlan.id)).toEqual([1, 10]);
    expect(session.canUndo).toBe(true);
    session.undo();
    expect(session.canUndo).toBe(false);
  });

  test("rinominare cambia il nome; vuoto ridà quello del motore; un nome sbagliato si rifiuta", () => {
    session.addVlan("s1", "10", "");

    expect(session.renameVlan("s1", 10, "STUDENTI")).toBeNull();
    expect(switchView().vlans[1].name).toBe("STUDENTI");
    expect(session.renameVlan("s1", 10, "UN NOME")).toBe("Il nome della VLAN non può contenere spazi.");
    expect(session.renameVlan("s1", 10, "")).toBeNull();
    expect(switchView().vlans[1].name).toBe("VLAN0010");
  });

  test("la VLAN 1 non si rinomina e non si elimina: lo dice il motore", () => {
    expect(session.renameVlan("s1", 1, "ALTRO")).toBe("Il nome della VLAN 1 non si può cambiare.");
    session.removeVlan("s1", 1);

    expect(session.notice).toBe("La VLAN 1 non si può eliminare.");
    expect(switchView().vlans).toHaveLength(1);
  });

  test("eliminare una VLAN lascia le porte sul suo numero, inattive", () => {
    session.addVlan("s1", "20", "DOCENTI");
    session.setPortVlan("s1", "Fa0/3", 20);
    session.setPortVlan("s1", "Fa0/4", 20);

    session.removeVlan("s1", 20);

    expect(switchView().switchPorts.slice(2, 4).map((port) => [port.vlan, port.vlanName])).toEqual([
      [20, null],
      [20, null],
    ]);
    expect(switchView().vlans.map((vlan) => vlan.id)).toEqual([1]);
  });

  test("una porta inattiva torna attiva scegliendo una VLAN che c'è", () => {
    session.addVlan("s1", "20", "");
    session.setPortVlan("s1", "Fa0/3", 20);
    session.setPortVlan("s1", "Fa0/4", 20);
    session.removeVlan("s1", 20);
    expect(pingOutcome("d3", "192.168.1.13")).not.toBe("reply");

    session.setPortVlan("s1", "Fa0/3", 1);
    session.setPortVlan("s1", "Fa0/4", 1);

    expect(pingOutcome("d3", "192.168.1.13")).toBe("reply");
  });
});

describe("pannello e CLI: lo stesso switch", () => {
  beforeEach(() => {
    session.openTerminal("s1");
    cli(["enable", "configure terminal"]);
  });

  test("caso A: la VLAN creata da CLI compare subito nel pannello", () => {
    cli(["vlan 10", "name STUDENTI"]);

    expect(switchView().vlans[1]).toMatchObject({ id: 10, name: "STUDENTI" });
  });

  test("caso B: la porta assegnata dal pannello compare in show vlan brief", () => {
    session.addVlan("s1", "10", "STUDENTI");
    session.setPortVlan("s1", "Fa0/1", 10);

    expect(cli(["do show vlan brief"]).find((line) => line.startsWith("10 "))).toMatch(/STUDENTI +active +Fa0\/1$/);
  });

  test("caso C: il nome cambiato dal pannello compare in show running-config", () => {
    cli(["vlan 10", "exit"]);
    session.renameVlan("s1", 10, "CLASSE3A");

    const config = cli(["do show running-config"]);
    expect(config).toContain("vlan 10");
    expect(config).toContain(" name CLASSE3A");
  });

  test("casi D ed E: la VLAN eliminata da CLI lascia le porte inattive nel pannello; ricreata dal pannello, tornano", () => {
    cli(["interface fa0/3", "switchport access vlan 20", "interface fa0/4", "switchport access vlan 20", "exit", "no vlan 20"]);
    expect(switchView().switchPorts[2]).toMatchObject({ vlan: 20, vlanName: null });

    session.addVlan("s1", "20", "");

    expect(switchView().switchPorts[2]).toMatchObject({ vlan: 20, vlanName: "VLAN0020" });
    expect(pingOutcome("d3", "192.168.1.13")).toBe("reply");
  });
});

describe("annulla e ripristina", () => {
  test("ogni gesto del pannello è un passo; si annullano e si ripristinano in ordine", () => {
    const steps = [
      () => session.addVlan("s1", "10", "STUDENTI"),
      () => session.renameVlan("s1", 10, "CLASSE3A"),
      () => session.setPortVlan("s1", "Fa0/1", 10),
      () => session.removeVlan("s1", 10),
    ];
    const states = [JSON.stringify(switchView().vlans) + JSON.stringify(switchView().switchPorts)];
    for (const step of steps) {
      step();
      states.push(JSON.stringify(switchView().vlans) + JSON.stringify(switchView().switchPorts));
    }

    for (let i = states.length - 2; i >= 0; i--) {
      session.undo();
      expect(JSON.stringify(switchView().vlans) + JSON.stringify(switchView().switchPorts)).toBe(states[i]);
    }
    for (let i = 1; i < states.length; i++) {
      session.redo();
      expect(JSON.stringify(switchView().vlans) + JSON.stringify(switchView().switchPorts)).toBe(states[i]);
    }
  });

  test("una modifica da CLI e una dal pannello si annullano una alla volta", () => {
    session.openTerminal("s1");
    cli(["enable", "configure terminal", "vlan 10"]);
    session.setPortVlan("s1", "Fa0/2", 10);

    session.undo();
    expect(switchNow().ports[1].vlan).toBe(1);
    expect(switchNow().vlans.map((vlan) => vlan.id)).toEqual([1, 10]);
    session.undo();
    expect(switchNow().vlans.map((vlan) => vlan.id)).toEqual([1]);
  });

  test("rinominare con lo stesso nome non aggiunge un passo vuoto", () => {
    session.addVlan("s1", "10", "");
    session.renameVlan("s1", 10, "");
    session.undo();

    expect(switchView().vlans.map((vlan) => vlan.id)).toEqual([1]);
  });
});

describe("salvare una configurazione fatta dal pannello", () => {
  test("si salva in versione 3, si riapre uguale, la CLI la vede e i PC restano isolati", () => {
    session.addVlan("s1", "10", "STUDENTI");
    session.addVlan("s1", "20", "DOCENTI");
    for (const [port, vlan] of [["Fa0/1", 10], ["Fa0/2", 10], ["Fa0/3", 20], ["Fa0/4", 20]] as const) {
      session.setPortVlan("s1", port, vlan);
    }
    const vlans = switchView().vlans;
    const ports = switchView().switchPorts;
    const text = session.serialize();

    session.open("lan.netsim.json", text);

    expect(JSON.parse(text).version).toBe(3);
    expect(switchView().vlans).toEqual(vlans);
    expect(switchView().switchPorts).toEqual(ports);
    session.openTerminal("s1");
    expect(cli(["enable", "show vlan brief"]).find((line) => line.startsWith("20 "))).toMatch(/DOCENTI +active +Fa0\/3, Fa0\/4$/);
    expect(pingOutcome("d1", "192.168.1.11")).toBe("reply");
    expect(pingOutcome("d1", "192.168.1.12")).toBe("unreachable");
  });
});
