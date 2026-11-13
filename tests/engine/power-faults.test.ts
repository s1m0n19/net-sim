import { describe, expect, test } from "vitest";
import { ping, powerOff, powerOn } from "../../src/engine/actions";
import { ARP_TIMEOUT_TICKS } from "../../src/engine/protocols/arp";
import { ECHO_TIMEOUT_TICKS } from "../../src/engine/protocols/icmp";
import type { Simulator } from "../../src/engine/simulator";
import { PC1_IP, PC1_MAC, PC2_IP, PC2_MAC, buildLan, buildTwoHosts } from "./builders";
import { macTableOf } from "../../src/engine/model/vlans";

// Nella LAN di prova: d1, d2 e d3 sono i tre PC, s1 è lo switch.

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function results(sim: Simulator) {
  return sim.traces.filter((t) => t.kind === "ping-result").map((r) => [r.time, r.outcome]);
}

function framesInFlight(sim: Simulator): number {
  return sim.queue.filter((event) => event.kind === "frame-arrival").length;
}

describe("spegnere e accendere", () => {
  test("i dispositivi nascono accesi", () => {
    const { sw, pc1 } = buildLan();

    expect([sw.powered, pc1.powered]).toEqual([true, true]);
  });

  test("spegnere un dispositivo lo registra tra le tracce", () => {
    const { sim, pc2 } = buildLan();

    const traces = sim.dispatch(powerOff("d2"));

    expect(pc2.powered).toBe(false);
    expect(traces).toEqual([{ time: 0, kind: "power-changed", deviceId: "d2", powered: false }]);
  });

  test("spegnere un dispositivo già spento non fa nulla", () => {
    const { sim } = buildLan();
    sim.dispatch(powerOff("d2"));

    expect(sim.dispatch(powerOff("d2"))).toEqual([]);
  });

  test("un dispositivo che non esiste viene rifiutato", () => {
    const { sim } = buildLan();

    expect(() => sim.dispatch(powerOff("d99"))).toThrow("Dispositivo inesistente: d99");
  });
});

describe("un PC spento", () => {
  test("non può fare ping", () => {
    const { sim } = buildLan();
    sim.dispatch(powerOff("d1"));

    expect(() => sim.dispatch(ping("d1", PC2_IP))).toThrow("PC1 è spento");
  });

  test("dimentica la tabella ARP e riparte da zero quando viene riacceso", () => {
    const { sim, pc1 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);
    expect(pc1.arpTable.size).toBe(1);

    sim.dispatch(powerOff("d1"));
    sim.dispatch(powerOn("d1"));

    expect(pc1.arpTable.size).toBe(0);
    expect(pc1.nextEchoSequence).toBe(1);
    expect(pc1.linkUp).toBe(true);
  });

  test("a tabelle vuote, chi gli fa ping ottiene: host di destinazione non raggiungibile", () => {
    const { sim } = buildLan();
    sim.dispatch(powerOff("d2"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim)).toEqual([[ARP_TIMEOUT_TICKS, "unreachable"]]);
  });

  test("se chi fa ping ne conosce già il MAC, ottiene: richiesta scaduta", () => {
    const { sim, pc1, pc2 } = buildLan();
    pc1.arpTable.set(PC2_IP, PC2_MAC);
    pc2.arpTable.set(PC1_IP, PC1_MAC);
    sim.dispatch(powerOff("d2"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim)).toEqual([[ECHO_TIMEOUT_TICKS, "timeout"]]);
  });

  test("lo switch dimentica il suo MAC e non gli inoltra più nulla", () => {
    const { sim, sw } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);
    expect(macTableOf(sw).has(PC2_MAC)).toBe(true);

    sim.dispatch(powerOff("d2"));
    sim.dispatch(ping("d1", "192.168.1.99", 1)); // un broadcast: andrebbe a tutti
    run(sim);

    expect(macTableOf(sw).has(PC2_MAC)).toBe(false);
    const reachedPc2 = sim.traces.some((t) => t.kind === "frame-sent" && t.time > 8 && t.to.deviceId === "d2");
    expect(reachedPc2).toBe(false);
  });

  test("riacceso, torna raggiungibile", () => {
    const { sim } = buildLan();
    sim.dispatch(powerOff("d2"));
    sim.dispatch(powerOn("d2"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim)).toEqual([[8, "reply"]]);
  });

  test("collegato direttamente a un altro PC, gli toglie il segnale: trasmissione non riuscita", () => {
    const { sim, pc1 } = buildTwoHosts();
    sim.dispatch(powerOff("d2"));

    sim.dispatch(ping("d1", PC2_IP, 1));

    expect(pc1.linkUp).toBe(false);
    expect(results(sim)).toEqual([[0, "transmit-failed"]]);
  });
});

describe("spegnere un PC mentre sta lavorando", () => {
  test("i frame diretti a lui vanno persi", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    sim.step(); // lo switch ha inoltrato la richiesta ARP verso PC2 e PC3

    const traces = sim.dispatch(powerOff("d2"));

    expect(traces).toContainEqual(
      expect.objectContaining({ kind: "frame-lost", to: { deviceId: "d2", portName: "Fa0" } }),
    );
    expect(framesInFlight(sim)).toBe(1); // resta la copia per PC3
  });

  test("il suo ping in corso finisce lì: nessun esito, nessuna attesa che scade dopo", () => {
    const { sim, pc1 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP)); // quattro richieste

    sim.dispatch(powerOff("d1"));
    run(sim);

    expect(results(sim)).toEqual([]);
    expect(sim.queue).toHaveLength(0);
    expect(pc1.awaitedEchoes).toHaveLength(0);
    expect(pc1.pendingPackets).toHaveLength(0);
  });

  test("le attese degli altri dispositivi restano", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    sim.dispatch(ping("d3", "192.168.1.99", 1));

    sim.dispatch(powerOff("d1"));
    run(sim);

    expect(results(sim)).toEqual([[ARP_TIMEOUT_TICKS, "unreachable"]]); // solo quello di PC3
  });
});

describe("uno switch spento", () => {
  test("toglie il segnale a tutti i PC collegati", () => {
    const { sim, pc1, pc2, pc3 } = buildLan();

    sim.dispatch(powerOff("s1"));

    expect([pc1.linkUp, pc2.linkUp, pc3.linkUp]).toEqual([false, false, false]);
  });

  test("ogni ping dà subito: trasmissione non riuscita", () => {
    const { sim } = buildLan();
    sim.dispatch(powerOff("s1"));

    sim.dispatch(ping("d1", PC2_IP, 1));

    expect(results(sim)).toEqual([[0, "transmit-failed"]]);
    expect(sim.queue).toHaveLength(0);
  });

  test("dimentica la tabella MAC", () => {
    const { sim, sw } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    sim.dispatch(powerOff("s1"));

    expect(macTableOf(sw).size).toBe(0);
  });

  test("riacceso, la rete riprende a funzionare e lo switch impara da capo", () => {
    const { sim, sw, pc1 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);
    sim.dispatch(powerOff("s1"));
    sim.dispatch(powerOn("s1"));
    expect(pc1.linkUp).toBe(true);

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim).at(-1)?.[1]).toBe("reply");
    expect([...macTableOf(sw).keys()]).toEqual([PC1_MAC, PC2_MAC]);
  });

  test("i PC conservano la propria tabella ARP: sono rimasti accesi", () => {
    const { sim, pc1 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    sim.dispatch(powerOff("s1"));

    expect(pc1.arpTable.get(PC2_IP)).toBe(PC2_MAC);
  });
});

describe("un PC lasciato spento", () => {
  test("resta spento e senza segnale anche se la rete attorno cambia", () => {
    const { sim, pc2 } = buildLan();
    sim.dispatch(powerOff("d2"));

    sim.dispatch(powerOff("s1"));
    sim.dispatch(powerOn("s1"));

    expect(pc2.powered).toBe(false);
    expect(pc2.linkUp).toBe(false);
  });
});
