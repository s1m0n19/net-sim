import { describe, expect, test } from "vitest";
import { ping } from "../../src/engine/actions";
import type { Host } from "../../src/engine/model/network";
import type { Simulator, Trace } from "../../src/engine/simulator";
import {
  PC1_IP,
  PC1_MAC,
  PC2_IP,
  PC2_MAC,
  PC3_MAC,
  buildLan,
  buildTwoHosts,
} from "./builders";

// "A caldo": i due host conoscono già il MAC l'uno dell'altro,
// come dopo uno scambio ARP.
function warmUp(pc1: Host, pc2: Host): void {
  pc1.arpTable.set(PC2_IP, PC2_MAC);
  pc2.arpTable.set(PC1_IP, PC1_MAC);
}

function runToEnd(sim: Simulator): void {
  while (sim.queue.length > 0) sim.step();
}

function sentFrames(traces: Trace[]) {
  return traces.filter((t) => t.kind === "frame-sent").map((t) => t.frame);
}

describe("ping a caldo tra due PC", () => {
  test("l'echo request parte subito, senza ARP, incapsulato a tre livelli", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);

    const traces = sim.dispatch(ping("d1", PC2_IP));

    expect(sentFrames(traces)).toEqual([
      {
        dstMac: PC2_MAC,
        srcMac: PC1_MAC,
        etherType: "IPv4",
        payload: {
          srcIp: PC1_IP,
          dstIp: PC2_IP,
          ttl: 128,
          protocol: "ICMP",
          payload: { type: "echo-request", identifier: 1, sequence: 1 },
        },
      },
    ]);
  });

  test("il destinatario risponde con un echo reply a indirizzi scambiati", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);
    sim.dispatch(ping("d1", PC2_IP));

    const traces = sim.step();

    expect(traces.map((t) => t.kind)).toEqual(["frame-received", "frame-sent"]);
    expect(sentFrames(traces)).toEqual([
      {
        dstMac: PC1_MAC,
        srcMac: PC2_MAC,
        etherType: "IPv4",
        payload: {
          srcIp: PC2_IP,
          dstIp: PC1_IP,
          ttl: 128,
          protocol: "ICMP",
          payload: { type: "echo-reply", identifier: 1, sequence: 1 },
        },
      },
    ]);
  });

  test("dopo due passi l'echo reply è arrivato e la rete è ferma", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);
    sim.dispatch(ping("d1", PC2_IP));

    sim.step();
    const traces = sim.step();

    expect(sim.time).toBe(2);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ kind: "frame-received", at: { deviceId: "d1" } });
    expect(sim.queue).toHaveLength(0);
  });

  test("il ping non cambia le tabelle ARP", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.traces.some((t) => t.kind === "table-changed")).toBe(false);
    expect(pc1.arpTable.size).toBe(1);
    expect(pc2.arpTable.size).toBe(1);
  });

  test("ogni ping ha un numero di sequenza più alto del precedente", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);

    const first = sentFrames(sim.dispatch(ping("d1", PC2_IP)))[0];
    runToEnd(sim);
    const second = sentFrames(sim.dispatch(ping("d1", PC2_IP)))[0];

    expect(first).toMatchObject({ payload: { payload: { sequence: 1 } } });
    expect(second).toMatchObject({ payload: { payload: { sequence: 2 } } });
  });

  test("richiesta e risposta appartengono alla stessa conversazione, ping diversi no", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);
    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    const conversations = sim.traces.filter((t) => t.kind === "frame-sent").map((t) => t.conversationId);
    expect(conversations).toEqual([1, 1, 2, 2]);
  });
});

describe("ping a caldo in una LAN con uno switch", () => {
  test("con la tabella MAC vuota lo switch manda l'echo request anche a PC3, che lo scarta", () => {
    const { sim, pc1, pc2 } = buildLan();
    warmUp(pc1, pc2);
    sim.dispatch(ping("d1", PC2_IP));

    sim.step(); // l'echo request arriva allo switch, che non conosce PC2
    const traces = sim.step(); // le copie arrivano a PC2 e PC3

    expect(traces).toContainEqual(
      expect.objectContaining({ kind: "frame-dropped", at: { deviceId: "d3", portName: "Fa0" }, reason: "not-my-mac" }),
    );
    expect(traces).toContainEqual(
      expect.objectContaining({ kind: "frame-received", at: { deviceId: "d2", portName: "Fa0" } }),
    );
  });

  test("il ping si completa in quattro passi e lo switch impara entrambi i MAC", () => {
    const { sim, sw, pc1, pc2 } = buildLan();
    warmUp(pc1, pc2);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.time).toBe(4);
    expect([...sw.macTable]).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC2_MAC, "Fa0/2"],
    ]);
  });

  test("al secondo ping lo switch non manda più nulla a PC3", () => {
    const { sim, pc1, pc2 } = buildLan();
    warmUp(pc1, pc2);
    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);
    const before = sim.traces.length;

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    const second = sim.traces.slice(before);
    const reachedPc3 = second.some((t) => t.kind !== "table-changed" && "at" in t && t.at.deviceId === "d3");
    expect(reachedPc3).toBe(false);
  });
});

describe("ping che non arriva o non parte", () => {
  test("un host scarta un pacchetto IP arrivato al suo MAC ma destinato a un altro IP", () => {
    const { sim, pc1 } = buildLan();
    // PC1 ha una riga sbagliata in tabella: crede che l'IP di PC2 stia al MAC di PC3.
    pc1.arpTable.set(PC2_IP, PC3_MAC);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.traces).toContainEqual(
      expect.objectContaining({ kind: "frame-dropped", at: { deviceId: "d3", portName: "Fa0" }, reason: "ip-not-for-me" }),
    );
  });

  test("senza gateway, un ping verso un'altra rete non parte", () => {
    const { sim } = buildTwoHosts();

    const traces = sim.dispatch(ping("d1", "10.0.0.5"));

    expect(traces).toEqual([]);
    expect(sim.queue).toHaveLength(0);
  });

  test("un host senza indirizzo IP non può fare ping", () => {
    const { sim, pc1 } = buildTwoHosts();
    pc1.ip = null;

    expect(sim.dispatch(ping("d1", PC2_IP))).toEqual([]);
  });

  test("un ping verso un testo che non è un indirizzo viene rifiutato", () => {
    const { sim } = buildTwoHosts();

    expect(() => sim.dispatch(ping("d1", "pc2"))).toThrow("non valido");
  });
});
