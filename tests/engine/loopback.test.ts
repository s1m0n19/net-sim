import { describe, expect, test } from "vitest";
import { ping } from "../../src/engine/actions";
import { isLoopbackAddress } from "../../src/engine/model/addresses";
import type { Simulator } from "../../src/engine/simulator";
import { PC1_IP, PC2_IP, buildLan, buildTwoHosts } from "./builders";

function results(sim: Simulator) {
  return sim.traces.filter((t) => t.kind === "ping-result");
}

describe("ping a se stessi", () => {
  test("un ping al proprio indirizzo riceve risposta subito, senza frame sul cavo", () => {
    const { sim } = buildLan();

    const traces = sim.dispatch(ping("d1", PC1_IP, 1));

    expect(traces).toEqual([
      expect.objectContaining({ time: 0, kind: "ping-result", targetIp: PC1_IP, outcome: "reply" }),
    ]);
    expect(sim.queue).toHaveLength(0);
  });

  test("un ping a 127.0.0.1 riceve risposta subito, senza frame sul cavo", () => {
    const { sim } = buildLan();

    const traces = sim.dispatch(ping("d1", "127.0.0.1", 1));

    expect(traces.map((t) => t.kind)).toEqual(["ping-result"]);
    expect(results(sim)[0]).toMatchObject({ targetIp: "127.0.0.1", outcome: "reply" });
    expect(sim.queue).toHaveLength(0);
  });

  test("vale per tutti gli indirizzi 127.x.x.x", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", "127.5.6.7", 1));
    sim.dispatch(ping("d1", "127.255.255.254", 1));

    expect(results(sim).map((r) => r.outcome)).toEqual(["reply", "reply"]);
  });

  test("con quattro richieste, quattro risposte immediate", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", PC1_IP));

    expect(results(sim).map((r) => [r.time, r.sequence, r.outcome])).toEqual([
      [0, 1, "reply"],
      [0, 2, "reply"],
      [0, 3, "reply"],
      [0, 4, "reply"],
    ]);
    expect(sim.queue).toHaveLength(0);
  });

  test("non tocca la tabella ARP e non lascia nulla in sospeso", () => {
    const { sim, pc1 } = buildTwoHosts();

    sim.dispatch(ping("d1", PC1_IP));
    sim.dispatch(ping("d1", "127.0.0.1"));

    expect(pc1.arpTable.size).toBe(0);
    expect(pc1.pendingPackets).toHaveLength(0);
    expect(pc1.awaitedEchoes).toHaveLength(0);
  });

  test("un host senza configurazione IP risponde a 127.0.0.1", () => {
    const { sim, pc1 } = buildTwoHosts();
    pc1.ip = null;
    pc1.mask = null;

    sim.dispatch(ping("d1", "127.0.0.1", 1));

    expect(results(sim)[0]).toMatchObject({ outcome: "reply" });
  });

  test("il proprio indirizzo è riconosciuto anche se scritto con zeri davanti", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", "192.168.001.010", 1));

    expect(results(sim)[0]).toMatchObject({ outcome: "reply" });
    expect(sim.queue).toHaveLength(0);
  });

  test("un ping all'indirizzo di un altro host passa dalla rete, come prima", () => {
    const { sim } = buildTwoHosts();

    const traces = sim.dispatch(ping("d1", PC2_IP, 1));

    expect(traces.map((t) => t.kind)).toEqual(["frame-sent"]);
  });
});

describe("indirizzi di loopback", () => {
  test("sono tutti e soli quelli che cominciano per 127", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.255.255.255")).toBe(true);
    expect(isLoopbackAddress("126.255.255.255")).toBe(false);
    expect(isLoopbackAddress("128.0.0.1")).toBe(false);
  });
});
