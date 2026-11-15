import { describe, expect, test } from "vitest";
import {
  addVlan,
  disableInterface,
  disconnectLink,
  duplicateDevice,
  ping,
  powerOff,
  removeVlan,
  resolveAddress,
  restoreConfiguration,
  setAllowedVlans,
  setNativeVlan,
  setPortMode,
  setPortVlan,
} from "../../src/engine/actions";
import { frameLeaving, receiveFrameOnSwitch } from "../../src/engine/devices/switch";
import { receiveFrameOnRouter } from "../../src/engine/devices/router";
import { BROADCAST_MAC } from "../../src/engine/model/addresses";
import type { EthernetFrame } from "../../src/engine/model/frames";
import { createRouter, createSwitch, type Network, type Switch } from "../../src/engine/model/network";
import {
  carriesVlan,
  copyAllowedVlans,
  formatVlanList,
  ingressVlanOf,
  isAllowed,
  normalizeVlanList,
  parseVlanList,
} from "../../src/engine/model/trunks";
import { macEntries, macTableOf } from "../../src/engine/model/vlans";
import type { Simulator, Trace } from "../../src/engine/simulator";
import { takeSnapshot } from "../../src/engine/snapshot";
import {
  PC1_IP,
  PC1_MAC,
  PC2_IP,
  PC2_MAC,
  PC3_IP,
  PC3_MAC,
  PC4_IP,
  PC4_MAC,
  buildLan,
  buildTrunkSwitches,
  buildTwoVlanSwitches,
  buildVlanLan,
} from "./builders";

// Fa avanzare la rete finché c'è qualcosa da fare; `limit` protegge il
// test da un ciclo senza fine.
function run(sim: Simulator, limit = 3000): void {
  let steps = 0;
  while (sim.canStep()) {
    sim.step();
    steps += 1;
    if (steps > limit) throw new Error("La simulazione non si ferma.");
  }
}

// Lancia un ping, lo porta in fondo e restituisce gli esiti degli echo.
function pingOutcomes(sim: Simulator, fromId: string, targetIp: string, count = 1): string[] {
  const start = sim.traces.length;
  sim.dispatch(ping(fromId, targetIp, count));
  run(sim);
  return sim.traces
    .slice(start)
    .filter((t) => t.kind === "ping-result" && t.deviceId === fromId)
    .map((t) => (t.kind === "ping-result" ? t.outcome : ""));
}

// Le tracce dei frame spediti da un dispositivo a un altro.
function sent(traces: Trace[], fromId: string, toId?: string): Extract<Trace, { kind: "frame-sent" }>[] {
  return traces.filter(
    (t): t is Extract<Trace, { kind: "frame-sent" }> =>
      t.kind === "frame-sent" && t.from.deviceId === fromId && (toId === undefined || t.to.deviceId === toId),
  );
}

// I motivi degli scarti avvenuti su un dispositivo.
function dropsAt(traces: Trace[], deviceId: string): string[] {
  return traces.flatMap((t) => (t.kind === "frame-dropped" && t.at.deviceId === deviceId ? [t.reason] : []));
}

// I PC a cui è arrivata una richiesta ARP, tenuta o scartata.
function arpReached(traces: Trace[]): string[] {
  const at = traces.flatMap((t) =>
    (t.kind === "frame-received" || t.kind === "frame-dropped") && t.frame.etherType === "ARP" && t.at.deviceId.startsWith("d")
      ? [t.at.deviceId]
      : [],
  );
  return [...new Set(at)].sort();
}

function switchOf(network: Network, id: string): Switch {
  return network.devices.find((d) => d.id === id) as Switch;
}

// Un frame di prova: una richiesta ARP, eventualmente con il tag.
function arpFrame(src: string, dst: string, vlanTag?: number): EthernetFrame {
  const frame: EthernetFrame = {
    dstMac: dst,
    srcMac: src,
    etherType: "ARP",
    payload: { operation: "request", senderMac: src, senderIp: PC1_IP, targetMac: null, targetIp: PC3_IP },
  };
  return vlanTag === undefined ? frame : { ...frame, vlanTag };
}

// Uno switch da solo: Fa0/1 e Fa0/2 access nella VLAN 10, Fa0/3 nella 20,
// Fa0/24 trunk (nativa 1, tutte consentite); VLAN 10 e 20 configurate.
function lonelySwitch(): Switch {
  return createSwitch({
    id: "s1",
    name: "SW1",
    ports: [
      { name: "Fa0/1", mac: "02:00:00:00:01:01", vlan: 10 },
      { name: "Fa0/2", mac: "02:00:00:00:01:02", vlan: 10 },
      { name: "Fa0/3", mac: "02:00:00:00:01:03", vlan: 20 },
      { name: "Fa0/24", mac: "02:00:00:00:01:24", mode: "trunk" },
    ],
    vlans: [
      { id: 10, name: "STUDENTI" },
      { id: 20, name: "DOCENTI" },
    ],
  });
}

// Gli invarianti dei trunk: ogni riga della tabella MAC sta in una VLAN che
// esiste e indica una porta che la porta; nessun frame esce da una porta
// access con il tag, o da un trunk con il tag della sua nativa.
function expectTrunkInvariants(network: Network, traces: Trace[]): void {
  for (const sw of network.devices) {
    if (sw.kind !== "switch") continue;
    for (const { vlan, port } of macEntries(sw)) {
      expect(sw.vlans.some((v) => v.id === vlan)).toBe(true);
      expect(carriesVlan(sw.ports.find((p) => p.name === port)!, vlan)).toBe(true);
    }
  }
  for (const t of traces) {
    if (t.kind !== "frame-sent") continue;
    const sw = network.devices.find((d) => d.id === t.from.deviceId);
    if (sw?.kind !== "switch") {
      expect("vlanTag" in t.frame).toBe(false); // PC e router non mettono tag
      continue;
    }
    const port = sw.ports.find((p) => p.name === t.from.portName)!;
    if (port.mode === "access") expect("vlanTag" in t.frame).toBe(false);
    else expect(t.frame.vlanTag).not.toBe(port.nativeVlan);
  }
}

describe("il modello: porte e frame", () => {
  test("le porte nascono access, nella VLAN 1, con nativa 1 e tutte le VLAN consentite", () => {
    const { sim } = buildLan();
    sim.dispatch({ kind: "add-device", template: { kind: "switch", portCount: 2 } });
    const added = sim.network.devices.at(-1) as Switch;

    for (const port of [...switchOf(sim.network, "s1").ports, ...added.ports]) {
      expect(port).toMatchObject({ mode: "access", vlan: 1, nativeVlan: 1, allowedVlans: "all" });
    }
  });

  test("un frame senza tag non ha nemmeno il campo: i frame di sempre restano identici", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC3_IP, 1));
    run(sim);

    const frames = sim.traces.flatMap((t) => (t.kind === "frame-sent" ? [t.frame] : []));
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) expect(Object.keys(frame)).not.toContain("vlanTag");
  });
});

describe("le VLAN consentite", () => {
  test("tutte, un elenco, nessuna", () => {
    expect(isAllowed("all", 999)).toBe(true);
    expect(isAllowed([10, 20], 20)).toBe(true);
    expect(isAllowed([10, 20], 30)).toBe(false);
    expect(isAllowed([], 1)).toBe(false);
  });

  test("un elenco si mette in ordine, senza doppioni, e non si può modificare", () => {
    const list = normalizeVlanList([30, 10, 20, 10]);

    expect(list).toEqual([10, 20, 30]);
    expect(Object.isFrozen(list)).toBe(true);
    expect(() => normalizeVlanList([10, 1002])).toThrow("Numero di VLAN non valido: 1002");
    expect(() => normalizeVlanList([0])).toThrow("Numero di VLAN non valido: 0");
  });

  test("si leggono numeri e intervalli, e si riscrivono compatti", () => {
    expect(parseVlanList("10,20,30-33")).toEqual([10, 20, 30, 31, 32, 33]);
    expect(parseVlanList("20,10,10")).toEqual([10, 20]);
    expect(formatVlanList([1, 10, 11, 20, 30, 31, 32, 33])).toBe("1,10,11,20,30-33");
    expect(formatVlanList([])).toBe("");
    for (const wrong of ["", "10,", "10,,20", "10-", "a", "10 20"]) {
      expect(() => parseVlanList(wrong)).toThrow("Elenco di VLAN non valido");
    }
    expect(() => parseVlanList("20-10")).toThrow("Intervallo di VLAN al contrario: 20-10.");
    expect(() => parseVlanList("1000-1002")).toThrow("Numero di VLAN non valido: 1002");
  });

  test("una copia non condivide l'elenco", () => {
    const list = normalizeVlanList([10]);
    const copy = copyAllowedVlans(list);

    expect(copy).toEqual(list);
    expect(copy).not.toBe(list);
    expect(copyAllowedVlans("all")).toBe("all");
  });
});

describe("in quale VLAN entra un frame", () => {
  test("porta access: senza tag la sua VLAN; con il tag, o sulla VLAN eliminata, scartato", () => {
    const sw = lonelySwitch();

    expect(ingressVlanOf(sw, "Fa0/1", arpFrame(PC1_MAC, BROADCAST_MAC))).toEqual({ vlan: 10 });
    expect(ingressVlanOf(sw, "Fa0/1", arpFrame(PC1_MAC, BROADCAST_MAC, 10))).toEqual({ dropped: "tagged-on-access" });
    expect(ingressVlanOf(sw, "Fa0/1", arpFrame(PC1_MAC, BROADCAST_MAC, 20))).toEqual({ dropped: "tagged-on-access" });
    sw.vlans = sw.vlans.filter((v) => v.id !== 10);
    expect(ingressVlanOf(sw, "Fa0/1", arpFrame(PC1_MAC, BROADCAST_MAC))).toEqual({ dropped: "inactive-vlan" });
  });

  test("porta trunk: la VLAN del tag, o la nativa senza tag; anche un tag uguale alla nativa", () => {
    const sw = lonelySwitch();

    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC, 20))).toEqual({ vlan: 20 });
    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC))).toEqual({ vlan: 1 });
    sw.ports[3].nativeVlan = 10;
    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC))).toEqual({ vlan: 10 });
    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC, 10))).toEqual({ vlan: 10 });
  });

  test("porta trunk: una VLAN non consentita o non configurata si scarta; prima si guarda se è consentita", () => {
    const sw = lonelySwitch();
    sw.ports[3].allowedVlans = [10, 30];

    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC, 20))).toEqual({ dropped: "vlan-not-allowed" });
    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC))).toEqual({ dropped: "vlan-not-allowed" });
    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC, 30))).toEqual({ dropped: "vlan-not-configured" });
    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC, 40))).toEqual({ dropped: "vlan-not-allowed" });
    sw.ports[3].nativeVlan = 30;
    expect(ingressVlanOf(sw, "Fa0/24", arpFrame(PC1_MAC, BROADCAST_MAC))).toEqual({ dropped: "vlan-not-configured" });
  });

  test("un frame rifiutato non fa imparare nulla e non si inoltra", () => {
    const sw = lonelySwitch();

    const reaction = receiveFrameOnSwitch(sw, "Fa0/1", arpFrame(PC1_MAC, BROADCAST_MAC, 10));

    expect(reaction).toEqual({ forwardTo: [], vlan: null, dropped: "tagged-on-access", tableChanged: false });
    expect(macEntries(sw)).toEqual([]);
  });
});

describe("su quali porte esce, e con quale tag", () => {
  test("il flooding va alle porte access della VLAN e ai trunk che la consentono", () => {
    const sw = lonelySwitch();

    expect(receiveFrameOnSwitch(sw, "Fa0/1", arpFrame(PC1_MAC, BROADCAST_MAC)).forwardTo).toEqual(["Fa0/2", "Fa0/24"]);
    expect(receiveFrameOnSwitch(sw, "Fa0/24", arpFrame(PC3_MAC, BROADCAST_MAC, 20)).forwardTo).toEqual(["Fa0/3"]);
    sw.ports[3].allowedVlans = [20];
    expect(receiveFrameOnSwitch(sw, "Fa0/1", arpFrame(PC2_MAC, BROADCAST_MAC)).forwardTo).toEqual(["Fa0/2"]);
  });

  test("un unicast sconosciuto va in flooding nella sua VLAN, trunk compreso", () => {
    const sw = lonelySwitch();

    expect(receiveFrameOnSwitch(sw, "Fa0/3", arpFrame(PC2_MAC, PC4_MAC)).forwardTo).toEqual(["Fa0/24"]);
    expect(receiveFrameOnSwitch(sw, "Fa0/2", arpFrame(PC1_MAC, PC4_MAC)).forwardTo).toEqual(["Fa0/1", "Fa0/24"]);
  });

  test("un unicast noto va solo alla sua porta; se la porta non porta più la VLAN, la riga non conta", () => {
    const sw = lonelySwitch();
    receiveFrameOnSwitch(sw, "Fa0/24", arpFrame(PC3_MAC, BROADCAST_MAC, 10)); // PC3 sta dietro il trunk, nella 10

    expect(receiveFrameOnSwitch(sw, "Fa0/1", arpFrame(PC1_MAC, PC3_MAC)).forwardTo).toEqual(["Fa0/24"]);
    sw.ports[3].allowedVlans = [20]; // senza passare dal motore, che dimenticherebbe la riga
    expect(receiveFrameOnSwitch(sw, "Fa0/1", arpFrame(PC1_MAC, PC3_MAC)).forwardTo).toEqual(["Fa0/2"]);
  });

  test("access: senza tag; trunk: il tag della VLAN, tranne per la nativa", () => {
    const sw = lonelySwitch();
    const arrived = arpFrame(PC3_MAC, BROADCAST_MAC, 10);

    expect(frameLeaving(sw, "Fa0/1", 10, arrived)).toEqual(arpFrame(PC3_MAC, BROADCAST_MAC));
    expect(Object.keys(frameLeaving(sw, "Fa0/1", 10, arrived))).not.toContain("vlanTag");
    expect(frameLeaving(sw, "Fa0/24", 10, arpFrame(PC1_MAC, BROADCAST_MAC))).toEqual(arpFrame(PC1_MAC, BROADCAST_MAC, 10));
    expect(frameLeaving(sw, "Fa0/24", 1, arpFrame(PC1_MAC, BROADCAST_MAC))).toEqual(arpFrame(PC1_MAC, BROADCAST_MAC));
    sw.ports[3].nativeVlan = 10;
    expect(Object.keys(frameLeaving(sw, "Fa0/24", 10, arpFrame(PC1_MAC, BROADCAST_MAC)))).not.toContain("vlanTag");
  });

  test("ogni porta ha un frame suo, e quello arrivato non cambia", () => {
    const sw = lonelySwitch();
    const arrived = arpFrame(PC1_MAC, BROADCAST_MAC);
    const before = structuredClone(arrived);

    const reaction = receiveFrameOnSwitch(sw, "Fa0/1", arrived);
    const leaving = reaction.forwardTo.map((port) => frameLeaving(sw, port, reaction.vlan!, arrived));

    expect(leaving[0]).not.toBe(arrived);
    expect(leaving[1]).not.toBe(arrived);
    expect(leaving[0]).not.toBe(leaving[1]);
    expect(leaving.map((f) => f.vlanTag)).toEqual([undefined, 10]);
    expect(arrived).toEqual(before);
  });
});

describe("due switch uniti da un trunk", () => {
  test("i PC della stessa VLAN si parlano attraverso il trunk; quelli di VLAN diverse no", () => {
    const { sim } = buildTrunkSwitches();

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d1", PC4_IP)).toEqual(["unreachable"]);
    expect(pingOutcomes(sim, "d2", PC3_IP)).toEqual(["unreachable"]);
    expectTrunkInvariants(sim.network, sim.traces);
  });

  test("sul trunk i frame hanno il tag della loro VLAN; verso i PC no", () => {
    const { sim } = buildTrunkSwitches();
    pingOutcomes(sim, "d1", PC3_IP);
    pingOutcomes(sim, "d2", PC4_IP);

    const onTrunk = [...sent(sim.traces, "s1", "s2"), ...sent(sim.traces, "s2", "s1")];
    const vlan10 = onTrunk.filter((t) => [PC1_MAC, PC3_MAC].includes(t.frame.srcMac));
    const vlan20 = onTrunk.filter((t) => [PC2_MAC, PC4_MAC].includes(t.frame.srcMac));
    expect(vlan10.length).toBeGreaterThan(0);
    expect(vlan20.length).toBeGreaterThan(0);
    expect(vlan10.every((t) => t.frame.vlanTag === 10)).toBe(true);
    expect(vlan20.every((t) => t.frame.vlanTag === 20)).toBe(true);
    for (const t of [...sent(sim.traces, "s1", "d1"), ...sent(sim.traces, "s2", "d3"), ...sent(sim.traces, "s2", "d4")]) {
      expect(Object.keys(t.frame)).not.toContain("vlanTag");
    }
  });

  test("il percorso di un broadcast: senza tag dal PC, con il tag sul trunk, senza tag al PC", () => {
    const { sim } = buildTrunkSwitches();
    sim.dispatch(resolveAddress("d1", PC3_IP));
    run(sim);
    const request = (t: Trace) => t.kind === "frame-sent" && t.frame.dstMac === BROADCAST_MAC;

    const steps = sim.traces.filter(request).map((t) => (t.kind === "frame-sent" ? [t.from.deviceId, t.to.deviceId, t.frame.vlanTag] : []));
    expect(steps).toEqual([
      ["d1", "s1", undefined],
      ["s1", "s2", 10],
      ["s2", "d3", undefined],
    ]);
    // Il frame del trunk, nelle tracce, ha ancora il suo tag: nessuno lo ha cambiato dopo.
    expect(sent(sim.traces, "s1", "s2")[0].frame.vlanTag).toBe(10);
  });

  test("i broadcast restano nella loro VLAN, da un capo all'altro del trunk", () => {
    const { sim } = buildTrunkSwitches();
    const start = sim.traces.length;
    sim.dispatch(resolveAddress("d1", "192.168.1.99"));
    run(sim);
    expect(arpReached(sim.traces.slice(start))).toEqual(["d3"]);

    const middle = sim.traces.length;
    sim.dispatch(resolveAddress("d4", "192.168.1.99"));
    run(sim);
    expect(arpReached(sim.traces.slice(middle))).toEqual(["d2"]);
  });

  test("un unicast verso un MAC che lo switch non conosce va in flooding nella VLAN, sul trunk con il tag", () => {
    const { sim } = buildTrunkSwitches();
    pingOutcomes(sim, "d1", PC3_IP); // PC1 conosce già il MAC di PC3
    sim.dispatch(setPortMode("s1", "Fa0/24", "access"));
    sim.dispatch(setPortMode("s1", "Fa0/24", "trunk")); // SW1 dimentica ciò che sapeva del trunk
    expect(macTableOf(switchOf(sim.network, "s1"), 10).has(PC3_MAC)).toBe(false);

    const start = sim.traces.length;
    sim.dispatch(ping("d1", PC3_IP, 1));
    run(sim);

    const echoes = sent(sim.traces.slice(start), "s1").filter((t) => t.frame.etherType === "IPv4" && t.frame.srcMac === PC1_MAC);
    expect(echoes.map((t) => [t.to.deviceId, t.frame.vlanTag])).toEqual([["s2", 10]]);
  });

  test("un unicast noto va solo verso il trunk, senza raggiungere i PC dell'altra VLAN", () => {
    const { sim } = buildTrunkSwitches();
    sim.dispatch(resolveAddress("d1", PC3_IP));
    run(sim);
    const start = sim.traces.length;

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    const fromSw1 = sent(sim.traces.slice(start), "s1");
    expect(fromSw1.filter((t) => t.frame.srcMac === PC1_MAC).map((t) => t.to.deviceId)).toEqual(["s2"]);
    expect(fromSw1.some((t) => t.to.deviceId === "d2")).toBe(false);
  });

  test("ogni switch impara i MAC dietro il trunk nella VLAN giusta", () => {
    const { sim, sw1, sw2 } = buildTrunkSwitches();
    pingOutcomes(sim, "d1", PC3_IP);
    pingOutcomes(sim, "d2", PC4_IP);

    expect(macEntries(sw1)).toEqual([
      { vlan: 10, mac: PC1_MAC, port: "Fa0/1" },
      { vlan: 10, mac: PC3_MAC, port: "Fa0/24" },
      { vlan: 20, mac: PC2_MAC, port: "Fa0/2" },
      { vlan: 20, mac: PC4_MAC, port: "Fa0/24" },
    ]);
    expect(macTableOf(sw2, 10).get(PC1_MAC)).toBe("Fa0/24");
    expect(macTableOf(sw2, 20).get(PC2_MAC)).toBe("Fa0/24");
  });

  test("lo stesso MAC in due VLAN, dietro lo stesso trunk, sta in due righe senza conflitti", () => {
    const { sim, sw1 } = buildTrunkSwitches();
    const pc4 = sim.network.devices.find((d) => d.id === "d4")!;
    pc4.ports[0].mac = PC3_MAC; // PC3 (VLAN 10) e PC4 (VLAN 20) hanno lo stesso MAC

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["reply"]);
    expect(macEntries(sw1).filter((e) => e.mac === PC3_MAC)).toEqual([
      { vlan: 10, mac: PC3_MAC, port: "Fa0/24" },
      { vlan: 20, mac: PC3_MAC, port: "Fa0/24" },
    ]);
  });

  test("un trunk spento, o con il cavo staccato, non porta nulla, e gli switch dimenticano le sue righe", () => {
    const shutdown = buildTrunkSwitches();
    pingOutcomes(shutdown.sim, "d1", PC3_IP);
    shutdown.sim.dispatch(disableInterface("s1", "Fa0/24"));
    expect(macEntries(shutdown.sw1).filter((e) => e.port === "Fa0/24")).toEqual([]);
    expect(pingOutcomes(shutdown.sim, "d2", PC4_IP)).toEqual(["unreachable"]);

    const unplugged = buildTrunkSwitches();
    pingOutcomes(unplugged.sim, "d2", PC4_IP);
    unplugged.sim.dispatch(disconnectLink("l5"));
    expect(macEntries(unplugged.sw2).filter((e) => e.port === "Fa0/24")).toEqual([]);
    expect(pingOutcomes(unplugged.sim, "d1", PC3_IP)).toEqual(["unreachable"]);
  });

  test("uno switch spento dimentica le tabelle ma non la configurazione dei trunk", () => {
    const { sim, sw1 } = buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 20, 99] });
    pingOutcomes(sim, "d1", PC3_IP);

    sim.dispatch(powerOff("s1"));

    expect(macEntries(sw1)).toEqual([]);
    expect(sw1.ports[3]).toMatchObject({ mode: "trunk", nativeVlan: 99, allowedVlans: [10, 20, 99] });
  });

  test("un anello di due trunk fa una tempesta; con una VLAN tolta dal secondo, quella VLAN no", () => {
    const loop = buildTrunkSwitches();
    loop.sim.dispatch(setPortMode("s1", "Fa0/3", "trunk"));
    loop.sim.dispatch(setPortMode("s2", "Fa0/3", "trunk"));
    loop.sim.dispatch({ kind: "add-link", a: { deviceId: "s1", portName: "Fa0/3" }, b: { deviceId: "s2", portName: "Fa0/3" } });
    loop.sim.dispatch(resolveAddress("d1", "192.168.1.99"));
    run(loop.sim);
    expect(loop.sim.suspended).toBe(true);

    const half = buildTrunkSwitches();
    half.sim.dispatch(setPortMode("s1", "Fa0/3", "trunk"));
    half.sim.dispatch(setPortMode("s2", "Fa0/3", "trunk"));
    half.sim.dispatch(setAllowedVlans("s1", "Fa0/3", [20]));
    half.sim.dispatch(setAllowedVlans("s2", "Fa0/3", [20]));
    half.sim.dispatch({ kind: "add-link", a: { deviceId: "s1", portName: "Fa0/3" }, b: { deviceId: "s2", portName: "Fa0/3" } });
    half.sim.dispatch(resolveAddress("d1", "192.168.1.99"));
    run(half.sim);
    expect(half.sim.suspended).toBe(false);
  });
});

describe("configurazioni sbagliate: si comportano come su switch veri", () => {
  test("native diverse ai due capi: le due VLAN si mescolano sul cavo, senza avvisi", () => {
    const { sim, sw2 } = buildTrunkSwitches({ nativeVlan: 10 }, { nativeVlan: 20 });

    // La VLAN 10 di SW1 esce senza tag ed entra nella nativa di SW2, la 20.
    expect(pingOutcomes(sim, "d1", PC4_IP)).toEqual(["reply"]);
    expect(macTableOf(sw2, 20).get(PC1_MAC)).toBe("Fa0/24");
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
    const kinds = new Set(sim.traces.map((t) => t.kind));
    expect([...kinds].every((kind) => ["frame-sent", "frame-received", "frame-dropped", "table-changed", "packet-dropped", "ping-result"].includes(kind))).toBe(true);
    expectTrunkInvariants(sim.network, sim.traces);
  });

  test("access collegato a un trunk: passa solo la nativa; i frame con il tag sono scartati senza imparare", () => {
    const { sim, sw1 } = buildTrunkSwitches({ mode: "access", vlan: 10 }, { nativeVlan: 10 });

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    const start = sim.traces.length;
    expect(pingOutcomes(sim, "d4", PC2_IP)).toEqual(["unreachable"]);
    expect(dropsAt(sim.traces.slice(start), "s1")).toContain("tagged-on-access");
    expect(macTableOf(sw1, 10).has(PC4_MAC)).toBe(false);
  });

  test("trunk collegato a un access: lo stesso, visto dall'altro capo", () => {
    const { sim } = buildTrunkSwitches({ nativeVlan: 20 }, { mode: "access", vlan: 20 });

    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["reply"]);
    const start = sim.traces.length;
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
    expect(dropsAt(sim.traces.slice(start), "s2")).toContain("tagged-on-access");
  });

  test("una VLAN tolta dalle consentite di un solo capo non passa; le altre sì", () => {
    const { sim } = buildTrunkSwitches({}, { allowedVlans: [1, 10] });

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    const start = sim.traces.length;
    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["unreachable"]);
    expect(dropsAt(sim.traces.slice(start), "s2")).toContain("vlan-not-allowed");
  });

  test("una VLAN che uno switch non ha non passa, anche se il trunk la consente", () => {
    const { sim } = buildTrunkSwitches();
    sim.dispatch(setPortVlan("s2", "Fa0/2", 1)); // PC4 lascia la VLAN 20
    sim.dispatch(removeVlan("s2", 20));

    const start = sim.traces.length;
    sim.dispatch(resolveAddress("d2", PC4_IP));
    run(sim);
    expect(dropsAt(sim.traces.slice(start), "s2")).toContain("vlan-not-configured");

    sim.dispatch(addVlan("s2", 20));
    sim.dispatch(setPortVlan("s2", "Fa0/2", 20));
    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["reply"]);
  });

  test("una VLAN eliminata sparisce anche dalle righe del trunk", () => {
    const { sim, sw1 } = buildTrunkSwitches();
    pingOutcomes(sim, "d1", PC3_IP);
    pingOutcomes(sim, "d2", PC4_IP);

    sim.dispatch(removeVlan("s1", 20));

    expect(macEntries(sw1).map((e) => e.vlan)).toEqual([10, 10]);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
  });

  test("un trunk verso un PC: il PC sente la nativa e scarta i frame con il tag", () => {
    const { sim } = buildTrunkSwitches();
    sim.dispatch(setPortMode("s1", "Fa0/1", "trunk"));
    sim.dispatch(setNativeVlan("s1", "Fa0/1", 10));

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]); // nella nativa, senza tag
    const start = sim.traces.length;
    sim.dispatch(resolveAddress("d4", "192.168.1.99")); // un broadcast della VLAN 20
    run(sim);
    expect(dropsAt(sim.traces.slice(start), "d1")).toEqual(["tagged-frame"]);
  });

  test("un router scarta i frame con il tag, prima di guardarci dentro", () => {
    const router = createRouter({
      id: "r1",
      name: "R1",
      ports: [{ name: "Gi0/0", mac: "02:00:00:00:0a:01", ip: "192.168.1.1", mask: "255.255.255.0", enabled: true }],
      routes: [],
    });

    const reaction = receiveFrameOnRouter(router, "Gi0/0", arpFrame(PC1_MAC, BROADCAST_MAC, 10), []);

    expect(reaction.dropped).toBe("tagged-frame");
    expect(reaction.send).toEqual([]);
    expect(router.arpTable.size).toBe(0);
  });
});

describe("cambiare la configurazione mentre il traffico viaggia", () => {
  test("un frame con il tag già sul trunk, se la porta diventa access, arrivando è scartato", () => {
    const { sim, sw2 } = buildTrunkSwitches();
    sim.dispatch(resolveAddress("d1", PC3_IP));
    sim.step(); // la richiesta arriva a SW1, che la manda sul trunk con il tag
    expect(sent(sim.traces, "s1", "s2")[0].frame.vlanTag).toBe(10);

    sim.dispatch(setPortMode("s2", "Fa0/24", "access"));
    const traces = sim.step();

    expect(dropsAt(traces, "s2")).toEqual(["tagged-on-access"]);
    expect(macEntries(sw2)).toEqual([]);
  });

  test("un frame senza tag già sul trunk, se cambia la nativa, arrivando entra nella nativa nuova", () => {
    const { sim, sw2 } = buildTrunkSwitches({ nativeVlan: 10 }, { nativeVlan: 10 });
    sim.dispatch(resolveAddress("d1", PC3_IP));
    sim.step(); // la richiesta va sul trunk senza tag: la 10 è la nativa

    sim.dispatch(setNativeVlan("s2", "Fa0/24", 20));
    sim.step();

    expect(macTableOf(sw2, 20).get(PC1_MAC)).toBe("Fa0/24");
    expect(macTableOf(sw2, 10).has(PC1_MAC)).toBe(false);
  });

  test("cambiare modo a metà di un ping non lascia righe sbagliate e la rete torna a funzionare", () => {
    const { sim } = buildTrunkSwitches();
    sim.dispatch(ping("d1", PC3_IP, 3));
    for (let i = 0; i < 6; i++) sim.step();
    sim.dispatch(setPortMode("s1", "Fa0/24", "access"));
    run(sim);
    expectTrunkInvariants(sim.network, []);

    sim.dispatch(setPortMode("s1", "Fa0/24", "trunk"));
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    expectTrunkInvariants(sim.network, sim.traces);
  });
});

describe("le tabelle MAC dopo un cambio di configurazione", () => {
  function warmTrunk() {
    const built = buildTrunkSwitches();
    pingOutcomes(built.sim, "d1", PC3_IP);
    pingOutcomes(built.sim, "d2", PC4_IP);
    return built;
  }
  const trunkRows = (sw: Switch) => macEntries(sw).filter((e) => e.port === "Fa0/24").map((e) => e.vlan);

  test("cambiare modo dimentica tutte le righe della porta, in ogni VLAN", () => {
    const { sim, sw1 } = warmTrunk();

    sim.dispatch(setPortMode("s1", "Fa0/24", "access"));

    expect(trunkRows(sw1)).toEqual([]);
    expect(macEntries(sw1).map((e) => e.port)).toEqual(["Fa0/1", "Fa0/2"]);
  });

  test("cambiare la nativa di un trunk dimentica le righe della nativa di prima, su quella porta", () => {
    const { sim, sw1 } = warmTrunk();
    sw1.macTable.set(1, new Map([["02:00:00:00:00:99", "Fa0/24"]])); // imparato senza tag, nella nativa 1

    sim.dispatch(setNativeVlan("s1", "Fa0/24", 10));

    expect(trunkRows(sw1)).toEqual([10, 20]);
  });

  test("cambiare la nativa o le consentite di una porta access non dimentica nulla", () => {
    const { sim, sw1 } = warmTrunk();
    const before = macEntries(sw1);

    sim.dispatch(setNativeVlan("s1", "Fa0/1", 10));
    sim.dispatch(setAllowedVlans("s1", "Fa0/1", [20]));

    expect(macEntries(sw1)).toEqual(before);
  });

  test("togliere una VLAN dalle consentite dimentica le sue righe sul trunk, e solo quelle", () => {
    const { sim, sw1 } = warmTrunk();

    sim.dispatch(setAllowedVlans("s1", "Fa0/24", [1, 10]));

    expect(trunkRows(sw1)).toEqual([10]);
    expect(macTableOf(sw1, 20).get(PC2_MAC)).toBe("Fa0/2");
  });

  test("cambiare la VLAN access conservata di un trunk non dimentica nulla", () => {
    const { sim, sw1 } = warmTrunk();
    const before = macEntries(sw1);

    sim.dispatch(setPortVlan("s1", "Fa0/24", 20));

    expect(macEntries(sw1)).toEqual(before);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
  });
});

describe("le azioni dei trunk", () => {
  test("cambiano il modo, la nativa e le consentite, e lo dicono con una traccia", () => {
    const { sim, sw1 } = buildTrunkSwitches();

    const traces = [
      ...sim.dispatch(setNativeVlan("s1", "Fa0/24", 99)),
      ...sim.dispatch(setAllowedVlans("s1", "Fa0/24", [20, 10, 99, 10])),
      ...sim.dispatch(setPortMode("s1", "Fa0/24", "access")),
    ];

    expect(sw1.ports[3]).toMatchObject({ mode: "access", nativeVlan: 99, allowedVlans: [10, 20, 99] });
    expect(traces.map((t) => t.kind)).toEqual(["trunk-changed", "trunk-changed", "port-mode-changed"]);
    expect(traces[2]).toMatchObject({ portName: "Fa0/24", mode: "access", from: "trunk" });
  });

  test("il modo non azzera nativa e consentite: tornando trunk ci sono ancora", () => {
    const { sim, sw1 } = buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 99] });

    sim.dispatch(setPortMode("s1", "Fa0/24", "access"));
    sim.dispatch(setPortMode("s1", "Fa0/24", "trunk"));

    expect(sw1.ports[3]).toMatchObject({ mode: "trunk", vlan: 1, nativeVlan: 99, allowedVlans: [10, 99] });
  });

  test("una modifica che non cambia nulla non lascia tracce", () => {
    const { sim } = buildTrunkSwitches({ allowedVlans: [10, 20] });

    expect(sim.dispatch(setPortMode("s1", "Fa0/24", "trunk"))).toEqual([]);
    expect(sim.dispatch(setNativeVlan("s1", "Fa0/24", 1))).toEqual([]);
    expect(sim.dispatch(setAllowedVlans("s1", "Fa0/24", [20, 10]))).toEqual([]);
  });

  test("valori, porte e dispositivi sbagliati vengono rifiutati, e la porta non cambia", () => {
    const { sim, sw1 } = buildTrunkSwitches();
    const before = { ...sw1.ports[3] };

    expect(() => sim.dispatch(setNativeVlan("s1", "Fa0/24", 0))).toThrow("Numero di VLAN non valido");
    expect(() => sim.dispatch(setNativeVlan("s1", "Fa0/24", 1002))).toThrow("Numero di VLAN non valido");
    expect(() => sim.dispatch(setAllowedVlans("s1", "Fa0/24", [10, 2000]))).toThrow("Numero di VLAN non valido: 2000");
    expect(() => sim.dispatch(setAllowedVlans("s1", "Fa0/24", "some" as never))).toThrow("VLAN consentite non valide");
    expect(() => sim.dispatch(setPortMode("s1", "Fa0/24", "dynamic" as never))).toThrow("Modo della porta non valido");
    expect(() => sim.dispatch(setPortMode("s1", "Fa0/9", "trunk"))).toThrow("SW1 non ha una porta Fa0/9.");
    expect(() => sim.dispatch(setPortMode("d1", "Fa0", "trunk"))).toThrow("PC1 non è uno switch");
    expect(sw1.ports[3]).toEqual(before);
  });

  test("una nativa che lo switch non ha, o che il trunk non consente, è permessa", () => {
    const { sim, sw1 } = buildTrunkSwitches();

    sim.dispatch(setNativeVlan("s1", "Fa0/24", 500));
    sim.dispatch(setAllowedVlans("s1", "Fa0/24", []));

    expect(sw1.ports[3]).toMatchObject({ nativeVlan: 500, allowedVlans: [] });
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
  });
});

describe("fotografia, annulla e ripristina, duplicare", () => {
  test("la fotografia copia la configurazione dei trunk, senza condividere l'elenco", () => {
    const { sim, sw1 } = buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 20, 99] });

    const snapshot = takeSnapshot(sim.network);
    const port = (snapshot.devices[0] as Switch).ports[3];

    expect(port).toMatchObject({ mode: "trunk", nativeVlan: 99, allowedVlans: [10, 20, 99] });
    expect(port.allowedVlans).not.toBe(sw1.ports[3].allowedVlans);
    sim.dispatch(setAllowedVlans("s1", "Fa0/24", [10]));
    expect(port.allowedVlans).toEqual([10, 20, 99]);
  });

  test("ogni modifica ai trunk si annulla e si ripristina, e la rete funziona come prima", () => {
    const { sim, sw1 } = buildTrunkSwitches();
    const before = takeSnapshot(sim.network);

    sim.dispatch(setNativeVlan("s1", "Fa0/24", 99));
    sim.dispatch(setAllowedVlans("s1", "Fa0/24", [10]));
    sim.dispatch(setPortMode("s1", "Fa0/24", "access"));
    sim.dispatch(setPortVlan("s1", "Fa0/24", 10));
    const after = takeSnapshot(sim.network);
    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["unreachable"]);

    sim.dispatch(restoreConfiguration(before));
    expect(takeSnapshot(sim.network)).toEqual(before);
    expect(pingOutcomes(sim, "d2", PC4_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);

    sim.dispatch(restoreConfiguration(after));
    expect(takeSnapshot(sim.network)).toEqual(after);
    expect(sw1.ports[3]).toMatchObject({ mode: "access", vlan: 10, nativeVlan: 99, allowedVlans: [10] });
    expectTrunkInvariants(sim.network, []);
  });

  test("annullare passo per passo torna a ogni stato intermedio", () => {
    const { sim } = buildTrunkSwitches();
    const changes = [
      setPortMode("s2", "Fa0/3", "trunk"),
      setNativeVlan("s2", "Fa0/3", 20),
      setAllowedVlans("s2", "Fa0/3", [1, 20]),
      setAllowedVlans("s2", "Fa0/3", "all"),
      setPortMode("s2", "Fa0/3", "access"),
    ];
    const states = [takeSnapshot(sim.network)];
    for (const change of changes) {
      sim.dispatch(change);
      states.push(takeSnapshot(sim.network));
    }

    for (let i = states.length - 2; i >= 0; i--) {
      sim.dispatch(restoreConfiguration(states[i]));
      expect(takeSnapshot(sim.network)).toEqual(states[i]);
    }
  });

  test("uno switch tolto torna con i suoi trunk", () => {
    const { sim } = buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 20, 99] });
    const before = takeSnapshot(sim.network);

    sim.dispatch({ kind: "remove-device", deviceId: "s1" });
    sim.dispatch(restoreConfiguration(before));

    expect(takeSnapshot(sim.network)).toEqual(before);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
  });

  test("la copia di uno switch ha gli stessi trunk, con un elenco suo, e nessuna riga imparata", () => {
    const { sim, sw1 } = buildTrunkSwitches({ nativeVlan: 99, allowedVlans: [10, 99] });
    pingOutcomes(sim, "d1", PC3_IP);

    sim.dispatch(duplicateDevice("s1"));
    const copy = sim.network.devices.at(-1) as Switch;

    expect(copy.ports.map((p) => [p.mode, p.vlan, p.nativeVlan, p.allowedVlans])).toEqual(
      sw1.ports.map((p) => [p.mode, p.vlan, p.nativeVlan, p.allowedVlans]),
    );
    expect(copy.ports[3].allowedVlans).not.toBe(sw1.ports[3].allowedVlans);
    expect(copy.vlans).toEqual(sw1.vlans);
    expect(macEntries(copy)).toEqual([]);
  });
});

describe("le reti di L2-1, senza trunk, non cambiano", () => {
  test("una LAN, una LAN con VLAN e due switch access: nessun frame con il tag", () => {
    for (const { sim } of [buildLan(), buildVlanLan(), buildTwoVlanSwitches(10), buildTwoVlanSwitches(20)]) {
      for (const device of sim.network.devices) {
        if (device.kind !== "host" || device.ip === null) continue;
        for (const other of sim.network.devices) {
          if (other.kind === "host" && other !== device && other.ip !== null) pingOutcomes(sim, device.id, other.ip);
        }
      }
      expect(sim.traces.some((t) => t.kind === "frame-sent" && "vlanTag" in t.frame)).toBe(false);
    }
  });

  test("access-access con VLAN diverse ai due capi: il traffico passa, come in L2-1", () => {
    const { sim } = buildTwoVlanSwitches(20);

    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
  });
});
