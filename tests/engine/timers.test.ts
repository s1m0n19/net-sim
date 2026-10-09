import { describe, expect, test } from "vitest";
import { ping } from "../../src/engine/actions";
import { ARP_TIMEOUT_TICKS } from "../../src/engine/protocols/arp";
import type { Simulator } from "../../src/engine/simulator";
import { PC2_IP, buildLan, buildTwoHosts } from "./builders";

const NOBODY = "192.168.1.99"; // un indirizzo della LAN che nessuno ha

function runToEnd(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function timersInQueue(sim: Simulator) {
  return sim.queue.filter((event) => event.kind === "timer");
}

function arpTimersInQueue(sim: Simulator) {
  return timersInQueue(sim).filter((event) => event.timer.kind === "arp-timeout");
}

describe("attesa della risposta ARP", () => {
  test("insieme alla richiesta ARP parte un'attesa che scade dopo il tempo previsto", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", NOBODY, 1));

    expect(arpTimersInQueue(sim)).toEqual([
      {
        time: ARP_TIMEOUT_TICKS,
        kind: "timer",
        deviceId: "d1",
        timer: { kind: "arp-timeout", ip: NOBODY },
        conversationId: 1,
      },
    ]);
  });

  test("se nessuno risponde, allo scadere l'host rinuncia al pacchetto in attesa", () => {
    const { sim, pc1 } = buildTwoHosts();
    sim.dispatch(ping("d1", NOBODY, 1));
    sim.step(); // PC2 scarta la richiesta: non è per lui
    expect(pc1.pendingPackets).toHaveLength(1);

    const traces = sim.step(); // non viaggia più nulla: si salta alla scadenza

    expect(sim.time).toBe(ARP_TIMEOUT_TICKS);
    expect(traces).toContainEqual(
      expect.objectContaining({
        kind: "packet-dropped",
        deviceId: "d1",
        reason: "arp-timeout",
        packet: expect.objectContaining({ dstIp: NOBODY }),
        conversationId: 1,
      }),
    );
    expect(pc1.pendingPackets).toHaveLength(0);
    expect(sim.queue).toHaveLength(0);
  });

  test("se la risposta arriva, l'attesa viene annullata e non resta nulla in coda", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);

    expect(sim.time).toBe(4); // la rete si ferma a ping concluso, non alla scadenza
    expect(sim.traces.some((t) => t.kind === "packet-dropped")).toBe(false);
  });

  test("anche chi risponde al ping annulla la propria attesa, se ne aveva una", () => {
    const { sim, pc1 } = buildTwoHosts();
    // PC1 conosce PC2 ma non il contrario: sarà PC2 a dover fare ARP per rispondere.
    pc1.arpTable.set(PC2_IP, "02:00:00:00:00:02");

    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);

    expect(sim.time).toBe(4); // echo request, ARP request, ARP reply, echo reply
    expect(timersInQueue(sim)).toHaveLength(0);
  });

  test("due ping verso lo stesso indirizzo senza risposta: una sola richiesta, entrambi scartati insieme", () => {
    const { sim, pc1 } = buildTwoHosts();

    sim.dispatch(ping("d1", NOBODY, 1));
    const second = sim.dispatch(ping("d1", NOBODY, 1));

    expect(second).toEqual([]); // il secondo ping non manda nulla: c'è già una richiesta in corso
    expect(arpTimersInQueue(sim)).toHaveLength(1);

    runToEnd(sim);
    expect(sim.traces.filter((t) => t.kind === "packet-dropped")).toHaveLength(2);
    expect(pc1.pendingPackets).toHaveLength(0);
  });

  test("dopo una scadenza, un nuovo ping fa ripartire richiesta e attesa", () => {
    const { sim } = buildTwoHosts();
    sim.dispatch(ping("d1", NOBODY, 1));
    runToEnd(sim);

    const traces = sim.dispatch(ping("d1", NOBODY, 1));

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ kind: "frame-sent", frame: { etherType: "ARP" } });
    expect(arpTimersInQueue(sim)).toEqual([
      expect.objectContaining({ time: 2 * ARP_TIMEOUT_TICKS, conversationId: 2 }),
    ]);
  });

  test("le attese di host diversi sono indipendenti", () => {
    const { sim, pc1, pc3 } = buildLan();

    sim.dispatch(ping("d1", NOBODY, 1));
    sim.dispatch(ping("d3", PC2_IP, 1)); // questo va a buon fine
    runToEnd(sim);

    expect(sim.time).toBe(ARP_TIMEOUT_TICKS);
    expect(pc1.pendingPackets).toHaveLength(0);
    expect(pc3.arpTable.has(PC2_IP)).toBe(true);
    expect(sim.traces.filter((t) => t.kind === "packet-dropped")).toHaveLength(1);
  });
});
