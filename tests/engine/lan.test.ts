import { describe, expect, test } from "vitest";
import { resolveAddress } from "../../src/engine/actions";
import type { Host, Link, Network, Switch } from "../../src/engine/model/network";
import { Simulator, type Trace } from "../../src/engine/simulator";

const PC1_MAC = "02:00:00:00:00:01";
const PC2_MAC = "02:00:00:00:00:02";
const PC3_MAC = "02:00:00:00:00:03";

function host(id: string, name: string, mac: string, ip: string): Host {
  return {
    kind: "host",
    id,
    name,
    ports: [{ name: "Fa0", mac }],
    ip,
    mask: "255.255.255.0",
    gateway: null,
    arpTable: new Map(),
  };
}

function link(id: string, hostId: string, switchPort: string): Link {
  return {
    id,
    a: { deviceId: hostId, portName: "Fa0" },
    b: { deviceId: "s1", portName: switchPort },
  };
}

// Una LAN: lo switch SW1 con PC1 su Fa0/1, PC2 su Fa0/2 e PC3 su Fa0/3.
// La porta Fa0/4 dello switch resta scollegata.
function lan(): { sim: Simulator; sw: Switch; pc1: Host; pc2: Host; pc3: Host } {
  const pc1 = host("d1", "PC1", PC1_MAC, "192.168.1.10");
  const pc2 = host("d2", "PC2", PC2_MAC, "192.168.1.11");
  const pc3 = host("d3", "PC3", PC3_MAC, "192.168.1.12");
  const sw: Switch = {
    kind: "switch",
    id: "s1",
    name: "SW1",
    ports: [
      { name: "Fa0/1", mac: "02:00:00:00:01:01" },
      { name: "Fa0/2", mac: "02:00:00:00:01:02" },
      { name: "Fa0/3", mac: "02:00:00:00:01:03" },
      { name: "Fa0/4", mac: "02:00:00:00:01:04" },
    ],
    macTable: new Map(),
  };
  const network: Network = {
    devices: [sw, pc1, pc2, pc3],
    links: [link("l1", "d1", "Fa0/1"), link("l2", "d2", "Fa0/2"), link("l3", "d3", "Fa0/3")],
  };
  return { sim: new Simulator(network), sw, pc1, pc2, pc3 };
}

// I dispositivi verso cui lo switch ha spedito un frame in queste tracce.
function sentBySwitchTo(traces: Trace[]): string[] {
  return traces
    .filter((t) => t.kind === "frame-sent")
    .filter((t) => t.from.deviceId === "s1")
    .map((t) => t.to.deviceId);
}

describe("scambio ARP in una LAN con uno switch", () => {
  test("lo switch impara il MAC di chi chiede e inoltra la richiesta a tutti gli altri", () => {
    const { sim, sw } = lan();
    sim.dispatch(resolveAddress("d1", "192.168.1.11"));

    const traces = sim.step(); // la richiesta arriva allo switch

    expect(sim.time).toBe(1);
    expect(sw.macTable.get(PC1_MAC)).toBe("Fa0/1");
    expect(sentBySwitchTo(traces)).toEqual(["d2", "d3"]); // non verso PC1, non su Fa0/4
    expect(sim.queue).toHaveLength(2);
  });

  test("le copie della richiesta arrivano insieme: risponde PC2, PC3 scarta", () => {
    const { sim, pc2, pc3 } = lan();
    sim.dispatch(resolveAddress("d1", "192.168.1.11"));
    sim.step();

    const traces = sim.step(); // le due copie arrivano a PC2 e PC3

    expect(sim.time).toBe(2);
    expect(traces).toContainEqual(expect.objectContaining({ kind: "frame-received", at: { deviceId: "d2", portName: "Fa0" } }));
    expect(traces).toContainEqual(expect.objectContaining({ kind: "frame-dropped", at: { deviceId: "d3", portName: "Fa0" } }));
    expect(pc2.arpTable.get("192.168.1.10")).toBe(PC1_MAC);
    expect(pc3.arpTable.size).toBe(0);
    expect(sim.queue).toHaveLength(1); // solo la risposta di PC2
  });

  test("lo switch inoltra la risposta sulla sola porta di PC1", () => {
    const { sim, sw } = lan();
    sim.dispatch(resolveAddress("d1", "192.168.1.11"));
    sim.step();
    sim.step();

    const traces = sim.step(); // la risposta arriva allo switch

    expect(sim.time).toBe(3);
    expect(sw.macTable.get(PC2_MAC)).toBe("Fa0/2");
    expect(sentBySwitchTo(traces)).toEqual(["d1"]);
  });

  test("dopo quattro passi lo scambio è completo e la rete è ferma", () => {
    const { sim, sw, pc1, pc2, pc3 } = lan();
    sim.dispatch(resolveAddress("d1", "192.168.1.11"));

    sim.step();
    sim.step();
    sim.step();
    sim.step();

    expect(sim.time).toBe(4);
    expect(pc1.arpTable.get("192.168.1.11")).toBe(PC2_MAC);
    expect(pc2.arpTable.get("192.168.1.10")).toBe(PC1_MAC);
    expect(pc3.arpTable.size).toBe(0);
    expect([...sw.macTable]).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC2_MAC, "Fa0/2"],
    ]);
    expect(sim.queue).toHaveLength(0);
  });

  test("lo switch inoltra i frame senza modificarli", () => {
    const { sim } = lan();
    const sent = sim.dispatch(resolveAddress("d1", "192.168.1.11"));
    const original = sent.filter((t) => t.kind === "frame-sent")[0].frame;

    const traces = sim.step();

    const forwarded = traces.filter((t) => t.kind === "frame-sent");
    expect(forwarded.map((t) => t.frame)).toEqual([original, original]);
  });

  test("tutto il traffico dello scambio appartiene a una sola conversazione", () => {
    const { sim } = lan();
    sim.dispatch(resolveAddress("d1", "192.168.1.11"));
    while (sim.queue.length > 0) sim.step();

    const conversations = new Set(
      sim.traces.filter((t) => t.kind === "frame-sent").map((t) => t.conversationId),
    );

    expect(conversations.size).toBe(1);
  });

  test("un'azione di risoluzione rivolta a uno switch viene rifiutata", () => {
    const { sim } = lan();

    expect(() => sim.dispatch(resolveAddress("s1", "192.168.1.11"))).toThrow("non è un host");
  });
});
