import { describe, expect, test } from "vitest";
import { addSwitch, disableInterface, enableInterface, ping, restoreConfiguration } from "../../src/engine/actions";
import type { Switch } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { takeSnapshot } from "../../src/engine/snapshot";
import { PC1_MAC, PC2_IP, PC2_MAC, PC3_IP, buildLan } from "./builders";

// Nella LAN di prova PC1 sta sulla porta Fa0/1 di SW1 (cavo l1), PC2 sulla
// Fa0/2 e PC3 sulla Fa0/3.

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function outcomes(sim: Simulator): string[] {
  return sim.traces.filter((t) => t.kind === "ping-result").map((r) => r.outcome);
}

describe("porte di uno switch", () => {
  test("su uno switch nuovo nascono tutte accese", () => {
    const sim = new Simulator({ devices: [], links: [] });

    sim.dispatch(addSwitch(8));

    const sw = sim.network.devices[0] as Switch;
    expect(sw.ports.map((port) => port.enabled)).toEqual(Array(8).fill(true));
  });

  test("spegnendo una porta, il PC collegato perde il segnale; gli altri no", () => {
    const { sim, sw, pc1, pc2 } = buildLan();

    const traces = sim.dispatch(disableInterface("s1", "Fa0/1"));

    expect(sw.ports.map((port) => port.enabled)).toEqual([false, true, true, true]);
    expect([pc1.linkUp, pc2.linkUp]).toEqual([false, true]);
    expect(traces).toEqual([
      { time: 0, kind: "interface-changed", deviceId: "s1", portName: "Fa0/1", enabled: false },
    ]);
  });

  test("il PC dietro una porta spenta non riesce a trasmettere", () => {
    const { sim } = buildLan();
    sim.dispatch(disableInterface("s1", "Fa0/1"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(outcomes(sim)).toEqual(["transmit-failed"]);
  });

  test("un broadcast non esce da una porta spenta", () => {
    const { sim } = buildLan();
    sim.dispatch(disableInterface("s1", "Fa0/1"));

    // PC2 cerca PC3: la richiesta ARP va a tutte le porte dello switch.
    sim.dispatch(ping("d2", PC3_IP, 1));
    run(sim);

    const reached = sim.traces.filter((t) => t.kind === "frame-sent").map((t) => t.to.deviceId);
    expect(reached).not.toContain("d1");
    expect(outcomes(sim)).toEqual(["reply"]);
  });

  test("il frame che stava viaggiando verso la porta va perso", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1)); // la richiesta ARP è sul cavo di PC1

    const traces = sim.dispatch(disableInterface("s1", "Fa0/1"));

    expect(traces.map((t) => t.kind)).toEqual(["frame-lost", "interface-changed"]);
    expect(sim.queue.filter((event) => event.kind === "frame-arrival")).toEqual([]);
  });

  test("lo switch dimentica i MAC imparati su quella porta, e solo quelli", () => {
    const { sim, sw } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);
    expect([...sw.macTable.keys()].sort()).toEqual([PC1_MAC, PC2_MAC]);

    const traces = sim.dispatch(disableInterface("s1", "Fa0/1"));

    expect([...sw.macTable.keys()]).toEqual([PC2_MAC]);
    expect(traces.map((t) => t.kind)).toEqual(["interface-changed", "table-changed"]);
  });

  test("riaccesa la porta, tutto riprende", () => {
    const { sim, pc1 } = buildLan();
    sim.dispatch(disableInterface("s1", "Fa0/1"));

    sim.dispatch(enableInterface("s1", "Fa0/1"));
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(pc1.linkUp).toBe(true);
    expect(outcomes(sim)).toEqual(["reply"]);
  });

  test("accendere una porta già accesa non fa nulla", () => {
    const { sim } = buildLan();

    expect(sim.dispatch(enableInterface("s1", "Fa0/1"))).toEqual([]);
  });

  test("una porta che non esiste viene rifiutata, e la scheda di un PC non si spegne", () => {
    const { sim } = buildLan();

    expect(() => sim.dispatch(disableInterface("s1", "Fa0/9"))).toThrow("SW1 non ha una porta Fa0/9.");
    expect(() => sim.dispatch(disableInterface("d1", "Fa0"))).toThrow("PC1 non ha porte che si possano spegnere.");
  });

  test("tornando a una configurazione fotografata prima, la porta spenta si riaccende", () => {
    const { sim, sw, pc1 } = buildLan();
    const before = takeSnapshot(sim.network);
    sim.dispatch(disableInterface("s1", "Fa0/1"));

    sim.dispatch(restoreConfiguration(before));

    expect(sw.ports[0].enabled).toBe(true);
    expect(pc1.linkUp).toBe(true);
  });
});
