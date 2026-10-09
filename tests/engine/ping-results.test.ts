import { describe, expect, test } from "vitest";
import { ping } from "../../src/engine/actions";
import { ARP_TIMEOUT_TICKS } from "../../src/engine/protocols/arp";
import { ECHO_TIMEOUT_TICKS } from "../../src/engine/protocols/icmp";
import type { Simulator } from "../../src/engine/simulator";
import { PC1_IP, PC1_MAC, PC2_IP, PC2_MAC, PC3_MAC, buildLan, buildTwoHosts } from "./builders";

const NOBODY = "192.168.1.99"; // un indirizzo della LAN che nessuno ha

function runToEnd(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function results(sim: Simulator) {
  return sim.traces.filter((t) => t.kind === "ping-result");
}

describe("esito del ping: risposta", () => {
  test("quando arriva l'echo reply il ping si conclude con una risposta", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    pc1.arpTable.set(PC2_IP, PC2_MAC);
    pc2.arpTable.set(PC1_IP, PC1_MAC);

    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);

    expect(results(sim)).toEqual([
      {
        time: 2,
        kind: "ping-result",
        deviceId: "d1",
        targetIp: PC2_IP,
        sequence: 1,
        outcome: "reply",
        remaining: 0,
        conversationId: 1,
      },
    ]);
  });

  test("la risposta annulla l'attesa: la rete si ferma subito, non alla scadenza", () => {
    const { sim, pc1 } = buildLan();

    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);

    expect(sim.time).toBe(8);
    expect(results(sim)).toEqual([expect.objectContaining({ time: 8, outcome: "reply" })]);
    expect(pc1.awaitedEchoes).toHaveLength(0);
  });

  test("solo chi ha lanciato il ping riceve un esito", () => {
    const { sim } = buildLan();

    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);

    expect(results(sim).map((r) => r.deviceId)).toEqual(["d1"]);
  });

  test("ogni ping ha il suo esito, con il suo numero di sequenza", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);
    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);

    expect(results(sim).map((r) => [r.sequence, r.outcome])).toEqual([
      [1, "reply"],
      [2, "reply"],
    ]);
  });
});

describe("esito del ping: host non raggiungibile", () => {
  test("se nessuno risponde all'ARP, il ping finisce allo scadere dell'attesa ARP", () => {
    const { sim, pc1 } = buildLan();

    sim.dispatch(ping("d1", NOBODY, 1));
    runToEnd(sim);

    expect(sim.time).toBe(ARP_TIMEOUT_TICKS); // non si aspetta anche la scadenza dell'echo
    expect(results(sim)).toEqual([
      expect.objectContaining({ time: ARP_TIMEOUT_TICKS, targetIp: NOBODY, outcome: "unreachable" }),
    ]);
    expect(pc1.awaitedEchoes).toHaveLength(0);
  });

  test("due ping verso lo stesso indirizzo inesistente finiscono insieme", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", NOBODY, 1));
    sim.dispatch(ping("d1", NOBODY, 1));
    runToEnd(sim);

    expect(results(sim).map((r) => [r.time, r.sequence, r.outcome])).toEqual([
      [ARP_TIMEOUT_TICKS, 1, "unreachable"],
      [ARP_TIMEOUT_TICKS, 2, "unreachable"],
    ]);
  });
});

describe("esito del ping: trasmissione non riuscita", () => {
  test("verso un'altra rete senza gateway, l'esito è immediato e non parte nessun frame", () => {
    const { sim } = buildTwoHosts();

    const traces = sim.dispatch(ping("d1", "10.0.0.5", 1));

    expect(traces).toEqual([
      expect.objectContaining({ time: 0, kind: "ping-result", targetIp: "10.0.0.5", outcome: "transmit-failed" }),
    ]);
    expect(sim.queue).toHaveLength(0);
  });

  test("un host senza indirizzo IP non riesce a trasmettere", () => {
    const { sim, pc1 } = buildTwoHosts();
    pc1.ip = null;

    const traces = sim.dispatch(ping("d1", PC2_IP, 1));

    expect(traces).toEqual([expect.objectContaining({ kind: "ping-result", outcome: "transmit-failed" })]);
  });

  test("verso un'altra rete con un gateway che non risponde, l'esito è invece \"non raggiungibile\"", () => {
    const { sim, pc1 } = buildTwoHosts();
    pc1.gateway = "192.168.1.1"; // configurato, ma nessun dispositivo ha questo indirizzo

    sim.dispatch(ping("d1", "10.0.0.5", 1));
    runToEnd(sim);

    expect(results(sim)).toEqual([
      expect.objectContaining({ time: ARP_TIMEOUT_TICKS, targetIp: "10.0.0.5", outcome: "unreachable" }),
    ]);
  });
});

describe("esito del ping: richiesta scaduta", () => {
  test("se l'echo request parte ma nessuno risponde, il ping finisce allo scadere dell'attesa dell'echo", () => {
    const { sim, pc1 } = buildLan();
    // PC1 ha una riga sbagliata in tabella: l'echo request parte, ma arriva
    // a PC3, che lo scarta perché l'indirizzo IP non è il suo.
    pc1.arpTable.set(PC2_IP, PC3_MAC);

    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);

    expect(sim.time).toBe(ECHO_TIMEOUT_TICKS);
    expect(results(sim)).toEqual([
      expect.objectContaining({ time: ECHO_TIMEOUT_TICKS, targetIp: PC2_IP, outcome: "timeout" }),
    ]);
    expect(pc1.awaitedEchoes).toHaveLength(0);
  });

  test("l'attesa dell'echo è più lunga di quella dell'ARP", () => {
    expect(ECHO_TIMEOUT_TICKS).toBeGreaterThan(ARP_TIMEOUT_TICKS);
  });
});
