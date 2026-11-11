// Ping contemporanei dallo stesso dispositivo (B-1 del collaudo UX 5, D-133).
//
// Ogni ping è una conversazione, e tutto ciò che ne nasce porta il suo
// numero. Il caso difficile: un pacchetto che aspetta il MAC del prossimo
// salto, sbloccato da una risposta ARP chiesta da un altro ping. Quando
// parte, o quando l'attesa scade, deve restare della sua conversazione.

import { describe, expect, test } from "vitest";
import { ping } from "../../src/engine/actions";
import type { Simulator, Trace } from "../../src/engine/simulator";
import { PC2_IP, PC3_IP, buildLan, buildTwoLans } from "./builders";

function runToEnd(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

// Gli esiti dei ping di una conversazione, nell'ordine in cui arrivano.
function outcomes(sim: Simulator, conversationId: number): string[] {
  return sim.traces
    .filter((t): t is Extract<Trace, { kind: "ping-result" }> => t.kind === "ping-result" && t.conversationId === conversationId)
    .map((t) => t.outcome);
}

// Le conversazioni dei frame con un echo request spediti da un dispositivo.
function echoRequestConversations(sim: Simulator, deviceId: string): number[] {
  return sim.traces
    .filter(
      (t): t is Extract<Trace, { kind: "frame-sent" }> =>
        t.kind === "frame-sent" &&
        t.from.deviceId === deviceId &&
        t.frame.etherType === "IPv4" &&
        t.frame.payload.protocol === "ICMP" &&
        t.frame.payload.payload.type === "echo-request",
    )
    .map((t) => t.conversationId);
}

// Le richieste ARP spedite da PC1 (non quelle che lo switch ritrasmette).
function arpRequests(sim: Simulator): number {
  return sim.traces.filter(
    (t) => t.kind === "frame-sent" && t.from.deviceId === "d1" && t.frame.etherType === "ARP" && t.frame.payload.operation === "request",
  ).length;
}

describe("due ping dallo stesso PC verso la stessa destinazione, con una sola risoluzione ARP", () => {
  test("il secondo, partito mentre il primo aspetta l'ARP, ha la sua risposta nella sua conversazione", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1)); // conversazione 1: chiede l'ARP
    sim.step(); // la richiesta ARP è in viaggio
    sim.dispatch(ping("d1", PC2_IP, 1)); // conversazione 2: aspetta la stessa risposta
    runToEnd(sim);

    expect(outcomes(sim, 1)).toEqual(["reply"]);
    expect(outcomes(sim, 2)).toEqual(["reply"]);
    // Una sola richiesta ARP per tutti e due; ciascun echo con il suo numero.
    expect(arpRequests(sim)).toBe(1);
    expect(echoRequestConversations(sim, "d1").sort()).toEqual([1, 2]);
  });

  test("una serie di tre, in attesa dell'ARP chiesto da un altro ping, resta tutta della sua conversazione", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    sim.step();
    sim.dispatch(ping("d1", PC2_IP, 3));
    runToEnd(sim);

    expect(outcomes(sim, 1)).toEqual(["reply"]);
    expect(outcomes(sim, 2)).toEqual(["reply", "reply", "reply"]);
    expect(echoRequestConversations(sim, "d1").filter((id) => id === 2)).toHaveLength(3);
  });

  test("il registro di ciascuna conversazione contiene solo il suo echo request e la sua risposta", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    sim.step();
    sim.dispatch(ping("d1", PC2_IP, 1));
    runToEnd(sim);

    // Ogni conversazione ha un echo request e un echo reply, non due.
    for (const conversationId of [1, 2]) {
      const echoes = sim.traces.filter(
        (t) =>
          t.kind === "frame-sent" &&
          t.conversationId === conversationId &&
          t.frame.etherType === "IPv4" &&
          t.frame.payload.protocol === "ICMP" &&
          (t.from.deviceId === "d1" || t.from.deviceId === "d2"),
      );
      expect(echoes).toHaveLength(2);
    }
    // Le richieste e risposte ARP sono di chi ha chiesto l'ARP.
    const arp = sim.traces.filter((t): t is Extract<Trace, { kind: "frame-sent" }> => t.kind === "frame-sent" && t.frame.etherType === "ARP");
    expect(arp.every((t) => t.conversationId === 1)).toBe(true);
  });

  test("se l'ARP non ha risposta, tutti e due finiscono irraggiungibili, ciascuno nella sua conversazione", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", "192.168.1.99", 1));
    sim.step();
    sim.dispatch(ping("d1", "192.168.1.99", 1));
    runToEnd(sim);

    expect(outcomes(sim, 1)).toEqual(["unreachable"]);
    expect(outcomes(sim, 2)).toEqual(["unreachable"]);
    // Anche lo scarto dei due pacchetti è di ciascuno.
    const dropped = sim.traces.filter((t) => t.kind === "packet-dropped").map((t) => t.conversationId);
    expect(dropped.sort()).toEqual([1, 2]);
  });
});

describe("ping contemporanei verso destinazioni diverse", () => {
  test("ciascuno con il suo ARP e la sua risposta", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    sim.step();
    sim.dispatch(ping("d1", PC3_IP, 1));
    runToEnd(sim);

    expect(outcomes(sim, 1)).toEqual(["reply"]);
    expect(outcomes(sim, 2)).toEqual(["reply"]);
    expect(arpRequests(sim)).toBe(2);
  });

  test("un ping solo resta tutto della sua conversazione, come sempre", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 2));
    runToEnd(sim);

    expect(outcomes(sim, 1)).toEqual(["reply", "reply"]);
    expect(new Set(sim.traces.map((t) => ("conversationId" in t ? t.conversationId : null)).filter((id) => id !== null))).toEqual(new Set([1]));
  });
});

describe("ping contemporanei attraverso un router", () => {
  test("i due echo inoltrati, in attesa dell'ARP del router, restano ciascuno della sua conversazione", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    sim.step();
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    runToEnd(sim);

    expect(outcomes(sim, 1)).toEqual(["reply"]);
    expect(outcomes(sim, 2)).toEqual(["reply"]);
    // Il router inoltra un echo per conversazione.
    expect(echoRequestConversations(sim, "r1").sort()).toEqual([1, 2]);
  });

  test("se oltre il router nessuno risponde all'ARP, ciascuno riceve il suo avviso", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(ping("d1", "192.168.2.99", 1));
    sim.step();
    sim.dispatch(ping("d1", "192.168.2.99", 1));
    runToEnd(sim);

    expect(outcomes(sim, 1)).toEqual(["host-unreachable"]);
    expect(outcomes(sim, 2)).toEqual(["host-unreachable"]);
    const dropped = sim.traces
      .filter((t): t is Extract<Trace, { kind: "packet-dropped" }> => t.kind === "packet-dropped" && t.deviceId === "r1")
      .map((t) => t.conversationId);
    expect(dropped.sort()).toEqual([1, 2]);
  });
});
