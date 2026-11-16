// Il collaudo integrato dei trunk (L2-2E): scenari di più switch, guasti
// di configurazione visti dalla CLI e dal pannello, e i giri completi
// CLI → pannello → file → CLI e pannello → CLI → Annulla → Ripristina.
// Ciò che i test di ogni parte coprono già da soli non si ripete qui.

import { beforeEach, describe, expect, test } from "vitest";
import { ping } from "../../src/engine/actions";
import { serializeNetwork } from "../../src/storage/save";
import { session } from "../../src/ui/session.svelte";
import { buildTrunkSwitches } from "../engine/builders";

// Tre switch in fila, SW1 — SW2 — SW3, uniti da due trunk (SW1 Fa0/24 —
// SW2 Fa0/23, SW2 Fa0/24 — SW3 Fa0/24). La VLAN 10 è su tutti e tre (PC1
// su SW1, PC3 su SW2, PC5 su SW3), la VLAN 20 solo su SW1 e SW2 (PC2, PC4):
// SW3 non la conosce. Tutti in 192.168.1.0/24.
function threeSwitchesFile(): string {
  const port = (byte: string, n: number, extra: object = {}) => ({ name: `Fa0/${n}`, mac: `02:00:00:00:${byte}:${String(n).padStart(2, "0")}`, ...extra });
  const sw = (id: string, name: string, x: number, ports: object[], vlans: object[]) => ({
    id, kind: "switch", name, position: { x, y: 100 }, ports, vlans,
  });
  const vlans = [{ id: 10, name: "STUDENTI" }, { id: 20, name: "DOCENTI" }];
  const pc = (n: number, x: number) => ({
    id: `d${n}`, kind: "host", name: `PC${n}`, position: { x, y: 300 },
    ports: [{ name: "Fa0", mac: `02:00:00:00:00:0${n}` }], ip: `192.168.1.${9 + n}`, mask: "255.255.255.0", gateway: null,
  });
  const end = (deviceId: string, portName: string) => ({ deviceId, portName });
  return JSON.stringify({
    format: "net-sim",
    version: 4,
    network: {
      devices: [
        sw("s1", "SW1", 100, [port("01", 1, { vlan: 10 }), port("01", 2, { vlan: 20 }), port("01", 24, { mode: "trunk" })], vlans),
        sw("s2", "SW2", 400, [port("02", 1, { vlan: 10 }), port("02", 2, { vlan: 20 }), port("02", 23, { mode: "trunk" }), port("02", 24, { mode: "trunk" })], vlans),
        sw("s3", "SW3", 700, [port("03", 1, { vlan: 10 }), port("03", 24, { mode: "trunk" })], [vlans[0]]),
        pc(1, 50), pc(2, 150), pc(3, 350), pc(4, 450), pc(5, 700),
      ],
      links: [
        { id: "l1", a: end("d1", "Fa0"), b: end("s1", "Fa0/1") },
        { id: "l2", a: end("d2", "Fa0"), b: end("s1", "Fa0/2") },
        { id: "l3", a: end("d3", "Fa0"), b: end("s2", "Fa0/1") },
        { id: "l4", a: end("d4", "Fa0"), b: end("s2", "Fa0/2") },
        { id: "l5", a: end("d5", "Fa0"), b: end("s3", "Fa0/1") },
        { id: "t1", a: end("s1", "Fa0/24"), b: end("s2", "Fa0/23") },
        { id: "t2", a: end("s2", "Fa0/24"), b: end("s3", "Fa0/24") },
      ],
    },
  });
}

function trunkFile(sw1 = {}, sw2 = {}): string {
  const { sim } = buildTrunkSwitches(sw1, sw2);
  return serializeNetwork(sim.network, new Map(sim.network.devices.map((d, i) => [d.id, { x: i * 100, y: 0 }])));
}

const sim = () => (session as any).simulator;
const view = (id: string) => session.view.devices.find((d) => d.id === id)!;
const portView = (id: string, name: string) => view(id).switchPorts.find((p) => p.name === name)!;

function cli(id: string, lines: string[]): string[] {
  if (!session.terminals.some((t) => t.deviceId === id)) {
    session.openTerminal(id);
    session.execute(id, "enable");
  }
  for (const line of lines) session.execute(id, line);
  const terminal = session.terminals.find((t) => t.deviceId === id)!;
  return session.outputOf(id, terminal.entries.at(-1)!);
}

function outcome(from: string, ip: string): string | undefined {
  const before = session.view.pingResults.length;
  session.ping(from, ip, 1);
  while (session.view.nextEvent !== null) session.step();
  return session.view.pingResults.slice(before).at(-1)?.outcome;
}

// Le tracce dei frame, con chi li manda e il tag, da una certa posizione.
function framesSince(start: number): { from: string; to: string; tag: number | undefined; dropped?: string }[] {
  return sim()
    .traces.slice(start)
    .flatMap((t: any) =>
      t.kind === "frame-sent"
        ? [{ from: t.from.deviceId, to: t.to.deviceId, tag: t.frame.vlanTag }]
        : t.kind === "frame-dropped"
          ? [{ from: "", to: t.at.deviceId, tag: t.frame.vlanTag, dropped: t.reason }]
          : [],
    );
}

describe("scenario C: tre switch e due trunk", () => {
  beforeEach(() => session.open("tre.netsim.json", threeSwitchesFile()));

  test("la VLAN 10 arriva fino a SW3; la 20 vive su SW1 e SW2, e SW3 scarta i suoi frame", () => {
    expect(outcome("d1", "192.168.1.14")).toBe("reply"); // PC1 → PC5, attraverso due trunk
    expect(outcome("d2", "192.168.1.13")).toBe("reply"); // PC2 → PC4
    expect(outcome("d1", "192.168.1.13")).toBe("unreachable");

    const start = sim().traces.length;
    sim().dispatch({ kind: "resolve-address", deviceId: "d2", targetIp: "192.168.1.99" });
    while (sim().canStep()) sim().step();
    const frames = framesSince(start);
    expect(frames.filter((f) => f.from === "s2" && f.to === "s3").map((f) => f.tag)).toEqual([20]);
    expect(frames.filter((f) => f.to === "s3" && f.dropped !== undefined).map((f) => f.dropped)).toEqual(["vlan-not-configured"]);
    expect(frames.some((f) => f.to === "d5")).toBe(false);
  });

  test("i MAC si imparano un salto alla volta, sul trunk giusto e nella VLAN giusta", () => {
    outcome("d1", "192.168.1.14");

    expect(view("s1").macRows).toContainEqual(["10", "02:00:00:00:00:05", "Fa0/24"]);
    expect(view("s2").macRows).toContainEqual(["10", "02:00:00:00:00:01", "Fa0/23"]);
    expect(view("s2").macRows).toContainEqual(["10", "02:00:00:00:00:05", "Fa0/24"]);
    expect(view("s3").macRows).toContainEqual(["10", "02:00:00:00:00:01", "Fa0/24"]);
    expect(view("s2").macRows.some(([vlan]) => vlan === "20")).toBe(false);
  });

  test("un broadcast della 10 va in flooding su tutti e tre; un unicast noto segue la sua strada senza flooding", () => {
    outcome("d1", "192.168.1.14");
    const start = sim().traces.length;
    sim().dispatch(ping("d1", "192.168.1.14", 1)); // ARP già risolti: l'echo è un unicast noto
    while (sim().canStep()) sim().step();
    const echo = framesSince(start).filter((f) => f.from.startsWith("s"));

    expect(echo.some((f) => f.to === "d3" || f.to === "d2" || f.to === "d4")).toBe(false);
    expect(echo.filter((f) => f.from === "s1" && f.to === "s2").every((f) => f.tag === 10)).toBe(true);
  });
});

describe("scenario D: VLAN nativa diversa da 1", () => {
  test("la nativa 10 passa senza tag nei due sensi, la 20 con il suo tag; ingresso e isolamento corretti", () => {
    session.open("t.netsim.json", trunkFile({ nativeVlan: 10 }, { nativeVlan: 10 }));
    const start = sim().traces.length;

    expect(outcome("d1", "192.168.1.12")).toBe("reply");
    expect(outcome("d2", "192.168.1.13")).toBe("reply");
    expect(outcome("d1", "192.168.1.13")).toBe("unreachable");
    const onTrunk = framesSince(start).filter((f) => (f.from === "s1" && f.to === "s2") || (f.from === "s2" && f.to === "s1"));
    const directions = new Set(onTrunk.map((f) => `${f.from}>${f.to}:${f.tag ?? "senza"}`));
    expect([...directions].sort()).toEqual(["s1>s2:20", "s1>s2:senza", "s2>s1:20", "s2>s1:senza"]);
  });
});

describe("scenario E: VLAN consentite cambiate a traffico in corso", () => {
  test("togliere la 20 da un capo mentre i ping viaggiano: la 20 si ferma, la 10 no; rimetterla la riattiva", () => {
    session.open("t.netsim.json", trunkFile({ allowedVlans: [10, 20] }, { allowedVlans: [10, 20] }));
    session.ping("d2", "192.168.1.13", 3);
    for (let i = 0; i < 4; i++) session.step();
    session.setAllowedVlans("s2", "Fa0/24", [10]);
    while (session.view.nextEvent !== null) session.step();

    expect(view("s2").macRows.some(([vlan, , port]) => vlan === "20" && port === "Fa0/24")).toBe(false);
    expect(outcome("d2", "192.168.1.13")).not.toBe("reply");
    expect(outcome("d1", "192.168.1.12")).toBe("reply");
    session.addAllowedVlans("s2", "Fa0/24", "20");
    expect(outcome("d2", "192.168.1.13")).toBe("reply");
  });
});

describe("i guasti di configurazione: sintomo, tabelle e indizi dalla CLI, senza spiegazioni", () => {
  test("trunk su un solo capo: il capo access scarta i frame con il tag, e show interfaces trunk lo mostra da una parte sola", () => {
    session.open("t.netsim.json", trunkFile({}, { mode: "access", vlan: 1 }));

    expect(outcome("d1", "192.168.1.12")).toBe("unreachable");
    expect(cli("s1", ["show interfaces trunk"])[1]).toMatch(/^Fa0\/24 +on +802\.1q +trunking +1$/);
    expect(cli("s2", ["show interfaces trunk"])).toEqual([]);
    expect(cli("s2", ["show interfaces fa0/24 switchport"])[2]).toBe("Administrative Mode: static access");
    expect(view("s2").macRows.some(([, , port]) => port === "Fa0/24")).toBe(false);
    expect(session.notice).toBeNull();
  });

  test("due porte access con VLAN diverse tra gli switch: le VLAN si fondono, e le tabelle MAC lo rivelano", () => {
    session.open("t.netsim.json", trunkFile({ mode: "access", vlan: 10 }, { mode: "access", vlan: 20 }));

    expect(outcome("d1", "192.168.1.13")).toBe("reply"); // PC1 (VLAN 10 di SW1) raggiunge PC4 (VLAN 20 di SW2)
    expect(view("s2").macRows).toContainEqual(["20", "02:00:00:00:00:01", "Fa0/24"]);
    expect(framesSince(0).some((f) => f.tag !== undefined)).toBe(false);
  });

  test("native diverse: le due VLAN native si mescolano; show interfaces trunk ai due capi dice native diverse", () => {
    session.open("t.netsim.json", trunkFile({ nativeVlan: 10 }, { nativeVlan: 20 }));

    expect(outcome("d1", "192.168.1.13")).toBe("reply");
    expect(cli("s1", ["show interfaces trunk"])[1]).toMatch(/ 10$/);
    expect(cli("s2", ["show interfaces trunk"])[1]).toMatch(/ 20$/);
  });

  test("una porta trunk spenta e un cavo staccato: nessun trunk in show interfaces trunk, e il pannello dice perché a parole", () => {
    session.open("t.netsim.json", trunkFile());
    cli("s1", ["configure terminal", "interface fa0/24", "shutdown", "end"]);
    expect(cli("s1", ["show interfaces trunk"])).toEqual([]);
    expect(portView("s1", "Fa0/24")).toMatchObject({ enabled: false, signal: false, mode: "trunk" });
    expect(outcome("d1", "192.168.1.12")).toBe("unreachable");

    cli("s1", ["configure terminal", "interface fa0/24", "no shutdown", "end"]);
    session.toggleLink("l5");
    expect(cli("s2", ["show interfaces trunk"])).toEqual([]);
    expect(portView("s2", "Fa0/24")).toMatchObject({ enabled: true, signal: false });
    session.toggleLink("l5");
    expect(outcome("d1", "192.168.1.12")).toBe("reply");
  });

  test("una porta su una VLAN eliminata resta inattiva in CLI e nel pannello, e ricreare la VLAN la riattiva", () => {
    session.open("t.netsim.json", trunkFile());
    cli("s2", ["configure terminal", "no vlan 10", "end"]);

    expect(portView("s2", "Fa0/1")).toMatchObject({ vlan: 10, vlanName: null });
    expect(cli("s2", ["show interfaces fa0/1 switchport"])).toContain("Access Mode VLAN: 10 (Inactive)");
    expect(outcome("d1", "192.168.1.12")).toBe("unreachable");
    session.addVlan("s2", "10", "STUDENTI");
    expect(outcome("d1", "192.168.1.12")).toBe("reply");
  });

  test("cambiare access e trunk durante la simulazione dal pannello: nessuna riga MAC sbagliata, e la rete si riprende", () => {
    session.open("t.netsim.json", trunkFile());
    session.ping("d1", "192.168.1.12", 3);
    for (let i = 0; i < 5; i++) session.step();
    session.makeAccess("s2", "Fa0/24", 10);
    while (session.view.nextEvent !== null) session.step();
    for (const id of ["s1", "s2"]) {
      for (const [vlan, , port] of view(id).macRows) {
        const p = portView(id, port);
        expect(p.mode === "trunk" ? p.carriedVlans.includes(Number(vlan)) : p.vlan === Number(vlan)).toBe(true);
      }
    }
    session.makeTrunk("s2", "Fa0/24");
    expect(outcome("d1", "192.168.1.12")).toBe("reply");
  });
});

describe("CLI e pannello: una sola fonte di verità, anche attraverso il file e la cronologia", () => {
  test("CLI → pannello → file → riapertura → CLI: modo, VLAN, nativa, consentite, configurazione conservata, porte spente, VLAN eliminate, MAC", () => {
    session.open("t.netsim.json", trunkFile({ mode: "access" }, { mode: "access" }));
    cli("s1", [
      "configure terminal",
      "interface fa0/3",
      "switchport access vlan 30", // crea la VLAN 30, che poi si elimina: la porta resta inattiva
      "switchport trunk native vlan 99",
      "shutdown",
      "exit",
      "no vlan 30",
      "interface fa0/24",
      "switchport mode trunk",
      "switchport trunk native vlan 99",
      "switchport trunk allowed vlan 10,20,99",
      "end",
    ]);
    cli("s2", ["configure terminal", "interface fa0/24", "sw mo tr", "sw tr na vl 99", "end"]);
    expect(outcome("d1", "192.168.1.12")).toBe("reply");

    expect(portView("s1", "Fa0/24")).toMatchObject({ mode: "trunk", nativeVlan: 99, allowedVlans: [10, 20, 99] });
    expect(portView("s1", "Fa0/3")).toMatchObject({ mode: "access", vlan: 30, vlanName: null, nativeVlan: 99, trunkConfigKept: true, enabled: false });
    const before = cli("s1", ["show running-config"]);
    session.saveTables = true;
    const draft = session.draftSave();
    session.markSaved("t", draft);

    session.open("t.netsim.json", draft.text);
    expect(JSON.parse(draft.text).version).toBe(4);
    expect(cli("s1", ["show running-config"])).toEqual(before);
    expect(view("s1").macRows).toContainEqual(["10", "02:00:00:00:00:03", "Fa0/24"]);
    expect(portView("s1", "Fa0/3")).toMatchObject({ vlan: 30, vlanName: null, nativeVlan: 99, enabled: false });
  });

  test("pannello → CLI → Annulla → Ripristina → pannello: ogni gesto è un passo, e la CLI segue", () => {
    session.open("t.netsim.json", trunkFile());
    session.setNativeVlan("s1", "Fa0/24", "99");
    session.setAllowedVlans("s1", "Fa0/24", [10, 20, 99]);
    session.makeAccess("s1", "Fa0/24", 20);

    expect(cli("s1", ["show interfaces fa0/24 switchport"]).slice(2, 8)).toEqual([
      "Administrative Mode: static access",
      "Operational Mode: static access",
      "Administrative Trunking Encapsulation: dot1q",
      "Access Mode VLAN: 20 (DOCENTI)",
      "Trunking Native Mode VLAN: 99 (Inactive)",
      "Trunking VLANs Enabled: 10,20,99",
    ]);
    session.undo(); // makeAccess: un passo solo, modo e VLAN insieme
    expect(portView("s1", "Fa0/24")).toMatchObject({ mode: "trunk", vlan: 1 });
    expect(cli("s1", ["show interfaces trunk"])[4]).toBe("Fa0/24      10,20,99");
    session.undo();
    expect(cli("s1", ["show interfaces trunk"])[4]).toBe("Fa0/24      1-1001");
    session.redo();
    session.redo();
    expect(portView("s1", "Fa0/24")).toMatchObject({ mode: "access", vlan: 20, nativeVlan: 99, allowedVlans: [10, 20, 99] });
    expect(cli("s1", ["show running-config"])).toContain(" switchport trunk allowed vlan 10,20,99");
  });

  test("eliminare uno switch con i suoi trunk e annullare; duplicarlo: la configurazione torna e si copia intera", () => {
    session.open("t.netsim.json", trunkFile({ nativeVlan: 99, allowedVlans: [10, 20, 99] }));
    const before = JSON.stringify(view("s1").switchPorts);
    session.select({ kind: "device", id: "s1" });
    session.removeSelection();
    expect(session.view.devices.some((d) => d.id === "s1")).toBe(false);

    session.undo();
    expect(JSON.stringify(view("s1").switchPorts)).toBe(before);
    expect(outcome("d1", "192.168.1.12")).toBe("reply");

    session.duplicate("s1");
    const copy = session.view.devices.at(-1)!;
    expect(copy.switchPorts.map((p) => [p.mode, p.vlan, p.nativeVlan, p.allowedVlans])).toEqual(
      view("s1").switchPorts.map((p) => [p.mode, p.vlan, p.nativeVlan, p.allowedVlans]),
    );
    expect(copy.macRows).toEqual([]);
    session.undo();
    expect(session.view.devices.some((d) => d.id === copy.id)).toBe(false);
  });
});
