import { describe, expect, test } from "vitest";
import { disconnectLink, ping, powerOff, resolveAddress } from "../../src/engine/actions";
import { PC2_IP, buildLan, buildRing } from "./builders";

describe("ricominciare", () => {
  test("riporta il tempo a zero e svuota coda, tracce e tabelle", () => {
    const { sim, sw, pc1, pc2 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    while (sim.canStep()) sim.step();
    sim.dispatch(ping("d1", "192.168.1.99")); // lascia frame in viaggio e attese

    sim.reset();

    expect(sim.time).toBe(0);
    expect(sim.queue).toEqual([]);
    expect(sim.traces).toEqual([]);
    expect(sw.macTable.size).toBe(0);
    expect(pc1.arpTable.size).toBe(0);
    expect(pc2.arpTable.size).toBe(0);
    expect(pc1.pendingPackets).toEqual([]);
    expect(pc1.awaitedEchoes).toEqual([]);
    expect(pc1.nextEchoSequence).toBe(1);
  });

  test("non tocca la configurazione: indirizzi, guasti e segnale restano", () => {
    const { sim, pc1, pc2, pc3 } = buildLan();
    sim.dispatch(disconnectLink("l2"));
    sim.dispatch(powerOff("d3"));

    sim.reset();

    expect(pc1.ip).toBe("192.168.1.10");
    expect(sim.network.links.find((l) => l.id === "l2")!.connected).toBe(false);
    expect(pc3.powered).toBe(false);
    expect([pc1.linkUp, pc2.linkUp, pc3.linkUp]).toEqual([true, false, false]);
  });

  test("dopo, la rete funziona come una appena accesa", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    while (sim.canStep()) sim.step();

    sim.reset();
    sim.dispatch(ping("d1", PC2_IP, 1));
    while (sim.canStep()) sim.step();

    expect(sim.time).toBe(8); // di nuovo a freddo: serve l'ARP
    expect(sim.traces.at(-1)).toMatchObject({ kind: "ping-result", outcome: "reply", sequence: 1 });
  });

  test("toglie la sospensione dopo una tempesta di broadcast", () => {
    const { sim } = buildRing();
    sim.dispatch(resolveAddress("d1", "192.168.1.99"));
    while (sim.canStep()) sim.step();
    expect(sim.suspended).toBe(true);

    sim.reset();

    expect(sim.suspended).toBe(false);
    expect(() => sim.dispatch(ping("d1", PC2_IP, 1))).not.toThrow();
  });
});
