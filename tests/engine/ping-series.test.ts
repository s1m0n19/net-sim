import { describe, expect, test } from "vitest";
import { ping } from "../../src/engine/actions";
import { ARP_TIMEOUT_TICKS } from "../../src/engine/protocols/arp";
import { DEFAULT_PING_COUNT, ECHO_TIMEOUT_TICKS } from "../../src/engine/protocols/icmp";
import type { Simulator } from "../../src/engine/simulator";
import { PC1_IP, PC1_MAC, PC2_IP, PC2_MAC, PC3_MAC, buildLan, buildTwoHosts } from "./builders";

const NOBODY = "192.168.1.99"; // un indirizzo della LAN che nessuno ha

function runToEnd(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function results(sim: Simulator) {
  return sim.traces.filter((t) => t.kind === "ping-result");
}

// Due PC che si conoscono già: ogni echo va e torna in due tick.
function warmTwoHosts() {
  const net = buildTwoHosts();
  net.pc1.arpTable.set(PC2_IP, PC2_MAC);
  net.pc2.arpTable.set(PC1_IP, PC1_MAC);
  return net;
}

describe("un ping manda più echo request, uno alla volta", () => {
  test("se non si chiede altro, sono quattro, come su Windows", () => {
    const { sim } = warmTwoHosts();

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(DEFAULT_PING_COUNT).toBe(4);
    expect(results(sim).map((r) => [r.time, r.sequence, r.outcome, r.remaining])).toEqual([
      [2, 1, "reply", 3],
      [4, 2, "reply", 2],
      [6, 3, "reply", 1],
      [8, 4, "reply", 0],
    ]);
  });

  test("il successivo parte nell'istante in cui arriva la risposta al precedente", () => {
    const { sim } = warmTwoHosts();
    sim.dispatch(ping("d1", PC2_IP));
    sim.step(); // PC2 riceve il primo echo request e risponde

    const traces = sim.step(); // PC1 riceve il primo echo reply

    expect(traces.map((t) => t.kind)).toEqual(["frame-received", "ping-result", "frame-sent"]);
    expect(traces[2]).toMatchObject({
      frame: { payload: { payload: { type: "echo-request", sequence: 2 } } },
    });
  });

  test("non ci sono mai due echo request dello stesso ping in sospeso", () => {
    const { sim, pc1 } = warmTwoHosts();
    sim.dispatch(ping("d1", PC2_IP));

    while (sim.canStep()) {
      expect(pc1.awaitedEchoes.length).toBeLessThanOrEqual(1);
      sim.step();
    }
    expect(pc1.awaitedEchoes).toHaveLength(0);
  });

  test("si può chiedere un numero diverso di echo request", () => {
    const { sim } = warmTwoHosts();

    sim.dispatch(ping("d1", PC2_IP, 2));
    runToEnd(sim);

    expect(results(sim)).toHaveLength(2);
    expect(sim.time).toBe(4);
  });

  test("un numero di richieste che non è un intero positivo viene rifiutato", () => {
    const { sim } = warmTwoHosts();

    expect(() => sim.dispatch(ping("d1", PC2_IP, 0))).toThrow("Numero di richieste non valido");
    expect(() => sim.dispatch(ping("d1", PC2_IP, 1.5))).toThrow("Numero di richieste non valido");
  });

  test("tutti gli echo di un ping appartengono alla stessa conversazione", () => {
    const { sim } = warmTwoHosts();

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(new Set(results(sim).map((r) => r.conversationId)).size).toBe(1);
  });
});

describe("quattro echo request in una LAN con uno switch, a freddo", () => {
  test("l'ARP serve solo per il primo: 8 passi, poi 4 per ciascuno degli altri tre", () => {
    const { sim } = buildLan();

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.time).toBe(8 + 3 * 4);
    expect(results(sim).map((r) => [r.time, r.outcome])).toEqual([
      [8, "reply"],
      [12, "reply"],
      [16, "reply"],
      [20, "reply"],
    ]);
    const arpRequestsFromPc1 = sim.traces.filter(
      (t) => t.kind === "frame-sent" && t.from.deviceId === "d1" && t.frame.etherType === "ARP",
    );
    expect(arpRequestsFromPc1).toHaveLength(1);
  });
});

describe("quattro echo request che non vanno a buon fine", () => {
  test("senza una strada, falliscono tutti e quattro subito e non parte nessun frame", () => {
    const { sim } = buildTwoHosts();

    const traces = sim.dispatch(ping("d1", "10.0.0.5"));

    expect(traces.map((t) => t.kind)).toEqual(["ping-result", "ping-result", "ping-result", "ping-result"]);
    expect(results(sim).map((r) => [r.time, r.sequence, r.outcome])).toEqual([
      [0, 1, "transmit-failed"],
      [0, 2, "transmit-failed"],
      [0, 3, "transmit-failed"],
      [0, 4, "transmit-failed"],
    ]);
    expect(sim.queue).toHaveLength(0);
  });

  test("verso un indirizzo che nessuno ha, ognuno ripete la richiesta ARP e aspetta la scadenza", () => {
    const { sim } = buildLan();

    sim.dispatch(ping("d1", NOBODY));
    runToEnd(sim);

    expect(results(sim).map((r) => [r.time, r.outcome])).toEqual([
      [1 * ARP_TIMEOUT_TICKS, "unreachable"],
      [2 * ARP_TIMEOUT_TICKS, "unreachable"],
      [3 * ARP_TIMEOUT_TICKS, "unreachable"],
      [4 * ARP_TIMEOUT_TICKS, "unreachable"],
    ]);
    const arpRequestsFromPc1 = sim.traces.filter(
      (t) => t.kind === "frame-sent" && t.from.deviceId === "d1" && t.frame.etherType === "ARP",
    );
    expect(arpRequestsFromPc1).toHaveLength(4);
  });

  test("se gli echo request partono ma si perdono, scadono uno dopo l'altro", () => {
    const { sim, pc1 } = buildLan();
    pc1.arpTable.set(PC2_IP, PC3_MAC); // riga sbagliata: l'echo arriva a PC3, che lo scarta

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(results(sim).map((r) => [r.time, r.outcome])).toEqual([
      [1 * ECHO_TIMEOUT_TICKS, "timeout"],
      [2 * ECHO_TIMEOUT_TICKS, "timeout"],
      [3 * ECHO_TIMEOUT_TICKS, "timeout"],
      [4 * ECHO_TIMEOUT_TICKS, "timeout"],
    ]);
  });
});
