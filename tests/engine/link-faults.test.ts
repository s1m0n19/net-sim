import { describe, expect, test } from "vitest";
import { connectLink, disconnectLink, ping } from "../../src/engine/actions";
import { createHost, type Network } from "../../src/engine/model/network";
import { ARP_TIMEOUT_TICKS } from "../../src/engine/protocols/arp";
import { ECHO_TIMEOUT_TICKS } from "../../src/engine/protocols/icmp";
import { Simulator } from "../../src/engine/simulator";
import { PC1_IP, PC1_MAC, PC2_IP, PC2_MAC, buildLan, buildTwoHosts } from "./builders";
import { macTableOf } from "../../src/engine/model/vlans";

// Nella LAN di prova: l1 è il cavo di PC1, l2 quello di PC2, l3 quello di PC3.

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function results(sim: Simulator) {
  return sim.traces.filter((t) => t.kind === "ping-result").map((r) => [r.time, r.outcome]);
}

function framesInFlight(sim: Simulator): number {
  return sim.queue.filter((event) => event.kind === "frame-arrival").length;
}

describe("segnale sul cavo", () => {
  test("in una rete appena accesa ogni host collegato sente il segnale", () => {
    const { pc1, pc2, pc3 } = buildLan();

    expect([pc1.linkUp, pc2.linkUp, pc3.linkUp]).toEqual([true, true, true]);
  });

  test("un host senza alcun cavo non sente il segnale", () => {
    const alone = createHost({
      id: "d9",
      name: "PC9",
      ports: [{ name: "Fa0", mac: "02:00:00:00:00:09" }],
      ip: "192.168.1.9",
      mask: "255.255.255.0",
      gateway: null,
    });
    const network: Network = { devices: [alone], links: [] };
    new Simulator(network);

    expect(alone.linkUp).toBe(false);
  });

  test("staccando il cavo, l'host a quel capo perde il segnale; gli altri no", () => {
    const { sim, pc1, pc2 } = buildLan();

    const traces = sim.dispatch(disconnectLink("l1"));

    expect(pc1.linkUp).toBe(false);
    expect(pc2.linkUp).toBe(true);
    expect(traces).toEqual([{ time: 0, kind: "link-changed", linkId: "l1", connected: false }]);
  });

  test("tra due PC collegati direttamente, lo perdono entrambi", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();

    sim.dispatch(disconnectLink("l1"));

    expect([pc1.linkUp, pc2.linkUp]).toEqual([false, false]);
  });

  test("riattaccando il cavo il segnale torna", () => {
    const { sim, pc1 } = buildLan();
    sim.dispatch(disconnectLink("l1"));

    sim.dispatch(connectLink("l1"));

    expect(pc1.linkUp).toBe(true);
  });

  test("staccare un cavo già staccato non fa nulla", () => {
    const { sim } = buildLan();
    sim.dispatch(disconnectLink("l1"));

    expect(sim.dispatch(disconnectLink("l1"))).toEqual([]);
  });

  test("un cavo che non esiste viene rifiutato", () => {
    const { sim } = buildLan();

    expect(() => sim.dispatch(disconnectLink("l99"))).toThrow("Collegamento inesistente: l99");
  });
});

describe("ping con il proprio cavo staccato", () => {
  test("la trasmissione non riesce: nessun frame, esito immediato", () => {
    const { sim } = buildLan();
    sim.dispatch(disconnectLink("l1"));

    const traces = sim.dispatch(ping("d1", PC2_IP));

    expect(traces.map((t) => t.kind)).toEqual(["ping-result", "ping-result", "ping-result", "ping-result"]);
    expect(results(sim)).toEqual([
      [0, "transmit-failed"],
      [0, "transmit-failed"],
      [0, "transmit-failed"],
      [0, "transmit-failed"],
    ]);
    expect(sim.queue).toHaveLength(0);
  });

  test("anche se il MAC della destinazione è già in tabella", () => {
    const { sim, pc1 } = buildLan();
    pc1.arpTable.set(PC2_IP, PC2_MAC);
    sim.dispatch(disconnectLink("l1"));

    sim.dispatch(ping("d1", PC2_IP, 1));

    expect(results(sim)).toEqual([[0, "transmit-failed"]]);
  });

  test("il ping a se stessi funziona lo stesso", () => {
    const { sim } = buildLan();
    sim.dispatch(disconnectLink("l1"));

    sim.dispatch(ping("d1", "127.0.0.1", 1));

    expect(results(sim)).toEqual([[0, "reply"]]);
  });

  test("riattaccato il cavo, il ping torna a funzionare", () => {
    const { sim } = buildLan();
    sim.dispatch(disconnectLink("l1"));
    sim.dispatch(connectLink("l1"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim)).toEqual([[8, "reply"]]);
  });
});

describe("ping verso un host con il cavo staccato", () => {
  test("a tabelle vuote: nessuno risponde all'ARP, host di destinazione non raggiungibile", () => {
    const { sim } = buildLan();
    sim.dispatch(disconnectLink("l2"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim)).toEqual([[ARP_TIMEOUT_TICKS, "unreachable"]]);
  });

  test("lo switch non inoltra sulla porta senza segnale", () => {
    const { sim } = buildLan();
    sim.dispatch(disconnectLink("l2"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    const sentBySwitch = sim.traces.filter((t) => t.kind === "frame-sent" && t.from.deviceId === "s1");
    expect(sentBySwitch.map((t) => (t.kind === "frame-sent" ? t.to.deviceId : ""))).toEqual(["d3"]);
  });

  test("a tabelle piene: l'echo request parte ma si perde, richiesta scaduta", () => {
    const { sim, pc1, pc2 } = buildLan();
    pc1.arpTable.set(PC2_IP, PC2_MAC);
    pc2.arpTable.set(PC1_IP, PC1_MAC);
    sim.dispatch(disconnectLink("l2"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim)).toEqual([[ECHO_TIMEOUT_TICKS, "timeout"]]);
  });
});

describe("lo switch e il cavo staccato", () => {
  test("dimentica i MAC imparati sulla porta rimasta senza segnale", () => {
    const { sim, sw } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);
    expect([...macTableOf(sw).keys()]).toEqual([PC1_MAC, PC2_MAC]);

    const traces = sim.dispatch(disconnectLink("l2"));

    expect([...macTableOf(sw).keys()]).toEqual([PC1_MAC]);
    expect(traces).toContainEqual(expect.objectContaining({ kind: "table-changed", deviceId: "s1", table: "mac" }));
  });

  test("li impara di nuovo quando il cavo è riattaccato e il traffico riprende", () => {
    const { sim, sw } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);
    sim.dispatch(disconnectLink("l2"));
    sim.dispatch(connectLink("l2"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(macTableOf(sw).get(PC2_MAC)).toBe("Fa0/2");
    expect(results(sim).at(-1)?.[1]).toBe("reply");
  });
});

describe("frame in viaggio su un cavo che viene staccato", () => {
  test("vanno persi", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1)); // la richiesta ARP sta viaggiando da PC1 allo switch
    expect(framesInFlight(sim)).toBe(1);

    const traces = sim.dispatch(disconnectLink("l1"));

    expect(framesInFlight(sim)).toBe(0);
    expect(traces).toContainEqual(
      expect.objectContaining({ kind: "frame-lost", from: { deviceId: "d1", portName: "Fa0" } }),
    );
  });

  test("quelli sugli altri cavi proseguono", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    sim.step(); // lo switch ha inoltrato la richiesta verso PC2 e PC3
    expect(framesInFlight(sim)).toBe(2);

    sim.dispatch(disconnectLink("l3"));

    expect(framesInFlight(sim)).toBe(1);
  });

  test("le attese dell'host restano: il ping si conclude comunque, senza risposta", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));

    sim.dispatch(disconnectLink("l1"));
    run(sim);

    expect(results(sim)).toEqual([[ARP_TIMEOUT_TICKS, "unreachable"]]);
  });
});
