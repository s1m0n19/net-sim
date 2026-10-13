import { describe, expect, test } from "vitest";
import { addRoute, configureHost, ping, powerOff, resolveAddress, tracert } from "../../src/engine/actions";
import { ROUTER_TTL } from "../../src/engine/devices/router-ping";
import { ECHO_TIMEOUT_TICKS } from "../../src/engine/protocols/icmp";
import type { Simulator } from "../../src/engine/simulator";
import { buildThreeNetworks, buildTwoLans } from "./builders";

// Le reti di prova:
//   buildTwoLans        PC1 192.168.1.10 ── Gi0/0 [R1] Gi0/1 ── PC2 192.168.2.10
//   buildThreeNetworks  PC1 192.168.1.10 ── [R1] 10.0.0.1 ── 10.0.0.2 [R2] ── PC2 192.168.2.10

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function outcomes(sim: Simulator): string[] {
  return sim.traces.filter((t) => t.kind === "ping-result").map((r) => r.outcome);
}

function hops(sim: Simulator) {
  return sim.traces.filter((t) => t.kind === "trace-hop").map((h) => [h.hop, h.outcome, h.from, h.done]);
}

// Tre reti con le due rotte statiche che le uniscono.
function routed() {
  const built = buildThreeNetworks();
  built.sim.dispatch(addRoute("r1", { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" }));
  built.sim.dispatch(addRoute("r2", { network: "192.168.1.0", mask: "255.255.255.0", nextHop: "10.0.0.1" }));
  return built;
}

describe("ping da un router", () => {
  test("verso un PC collegato: cinque echo request, cinque risposte", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("r1", "192.168.2.10", 5));
    run(sim);

    expect(outcomes(sim)).toEqual(["reply", "reply", "reply", "reply", "reply"]);
  });

  test("il primo echo request aspetta l'ARP, e parte quando arriva la risposta", () => {
    const { sim, r1 } = buildTwoLans();

    const traces = sim.dispatch(ping("r1", "192.168.2.10", 1));

    // Sul cavo esce la richiesta ARP, dall'interfaccia verso PC2.
    const sent = traces.filter((t) => t.kind === "frame-sent");
    expect(sent.map((t) => [t.from.portName, t.frame.etherType])).toEqual([["Gi0/1", "ARP"]]);
    expect(r1.pendingPackets).toHaveLength(1);

    run(sim);
    expect(outcomes(sim)).toEqual(["reply"]);
    expect(r1.awaitedEchoes).toEqual([]);
  });

  test("la sorgente è l'indirizzo dell'interfaccia da cui il pacchetto esce, e il TTL è 255", () => {
    const { sim } = routed();

    sim.dispatch(ping("r1", "192.168.2.10", 1));
    run(sim);

    const requests = sim.traces.flatMap((t) =>
      t.kind === "frame-sent" && t.frame.etherType === "IPv4" && t.frame.payload.payload.type === "echo-request"
        ? [t]
        : [],
    );
    // Parte da R1 verso R2: esce da Gi0/1, che ha 10.0.0.1.
    expect(requests[0].from).toEqual({ deviceId: "r1", portName: "Gi0/1" });
    expect(requests[0].frame.payload).toMatchObject({ srcIp: "10.0.0.1", dstIp: "192.168.2.10", ttl: ROUTER_TTL });
    expect(outcomes(sim)).toEqual(["reply"]);
  });

  test("la risposta riporta chi ha risposto e con quale TTL", () => {
    const { sim } = routed();

    sim.dispatch(ping("r1", "192.168.2.10", 1));
    run(sim);

    const result = sim.traces.find((t) => t.kind === "ping-result")!;
    // PC2 risponde con TTL 128, e R2 ne toglie uno.
    expect(result).toMatchObject({ deviceId: "r1", from: "192.168.2.10", ttl: 127, remaining: 0 });
  });

  test("senza una rotta verso la destinazione non parte nulla", () => {
    const { sim } = buildThreeNetworks();

    const traces = sim.dispatch(ping("r1", "192.168.2.10", 2));

    expect(traces.map((t) => t.kind)).toEqual(["ping-result", "ping-result"]);
    expect(outcomes(sim)).toEqual(["transmit-failed", "transmit-failed"]);
  });

  test("se un altro router non ha la rotta, avvisa: rete non raggiungibile", () => {
    const { sim } = buildThreeNetworks();
    // R1 conosce una rete che R2 non ha.
    sim.dispatch(addRoute("r1", { network: "172.16.0.0", mask: "255.255.0.0", nextHop: "10.0.0.2" }));

    sim.dispatch(ping("r1", "172.16.0.5", 1));
    run(sim);

    expect(sim.traces.find((t) => t.kind === "ping-result")).toMatchObject({
      outcome: "net-unreachable",
      from: "10.0.0.2",
    });
  });

  test("verso un indirizzo di una rete collegata a cui nessuno risponde: non raggiungibile", () => {
    const { sim } = buildTwoLans();

    // 192.168.2.99 non è di nessuno: la richiesta ARP resta senza risposta.
    sim.dispatch(ping("r1", "192.168.2.99", 1));
    run(sim);

    expect(outcomes(sim)).toEqual(["unreachable"]);
  });

  test("se la risposta non può tornare, l'echo request scade dopo l'attesa", () => {
    const { sim } = routed();
    // PC2 senza gateway riceve l'echo request, ma non sa a chi consegnare
    // la risposta per 10.0.0.1, che sta in un'altra rete.
    sim.dispatch(configureHost("d2", { ip: "192.168.2.10", mask: "255.255.255.0", gateway: null }));

    sim.dispatch(ping("r1", "192.168.2.10", 1));
    run(sim);

    const result = sim.traces.find((t) => t.kind === "ping-result")!;
    expect(result).toMatchObject({ outcome: "timeout", time: ECHO_TIMEOUT_TICKS, from: null });
  });

  test("a un proprio indirizzo il router si risponde da solo, senza nulla sul cavo", () => {
    const { sim } = buildTwoLans();

    const traces = sim.dispatch(ping("r1", "192.168.1.1", 2));

    expect(traces.map((t) => t.kind)).toEqual(["ping-result", "ping-result"]);
    expect(outcomes(sim)).toEqual(["reply", "reply"]);
  });

  test("ogni ping è una conversazione, che porta il nome dell'azione", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("r1", "192.168.2.10", 1));

    expect(sim.conversations).toEqual([{ id: 1, action: ping("r1", "192.168.2.10", 1) }]);
  });

  test("un router spento non fa ping, e non lancia richieste ARP a mano", () => {
    const { sim } = buildTwoLans();

    expect(() => sim.dispatch(resolveAddress("r1", "192.168.2.10"))).toThrow("non è un host");
    expect(() => sim.dispatch(ping("r1", "192.168.2"))).toThrow();
    expect(() => sim.dispatch(ping("r1", "192.168.2.10", 0))).toThrow("Numero di richieste non valido");
    sim.dispatch(powerOff("r1"));
    expect(() => sim.dispatch(ping("r1", "192.168.2.10"))).toThrow("R1 è spento.");
  });

  test("il router continua a rispondere ai ping degli altri mentre fa il suo", () => {
    const { sim } = routed();

    sim.dispatch(ping("r1", "192.168.2.10", 2));
    sim.dispatch(ping("d1", "192.168.1.1", 1));
    run(sim);

    const byDevice = (id: string) => sim.traces.filter((t) => t.kind === "ping-result" && t.deviceId === id).length;
    expect([byDevice("r1"), byDevice("d1")]).toEqual([2, 1]);
    expect(outcomes(sim)).toEqual(expect.arrayContaining(["reply"]));
    expect(outcomes(sim).every((outcome) => outcome === "reply")).toBe(true);
  });
});

describe("traceroute da un router", () => {
  test("verso un PC oltre un altro router: due salti", () => {
    const { sim } = routed();

    sim.dispatch(tracert("r1", "192.168.2.10"));
    run(sim);

    expect(hops(sim)).toEqual([
      [1, "hop", "10.0.0.2", false],
      [2, "reached", "192.168.2.10", true],
    ]);
  });

  test("verso un PC collegato: un salto solo", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(tracert("r1", "192.168.2.10"));
    run(sim);

    expect(hops(sim)).toEqual([[1, "reached", "192.168.2.10", true]]);
  });

  test("se un router lungo la strada non ha la rotta, finisce lì", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", { network: "172.16.0.0", mask: "255.255.0.0", nextHop: "10.0.0.2" }));

    sim.dispatch(tracert("r1", "172.16.0.5"));
    run(sim);

    // La prima sonda, con TTL 1, R2 la ferma prima ancora di cercare la
    // rotta; la seconda scopre che la rotta non c'è.
    expect(hops(sim)).toEqual([
      [1, "hop", "10.0.0.2", false],
      [2, "net-unreachable", "10.0.0.2", true],
    ]);
  });

  test("senza una rotta non parte nemmeno", () => {
    const { sim } = buildThreeNetworks();

    sim.dispatch(tracert("r1", "192.168.2.10"));

    expect(hops(sim)).toEqual([[1, "transmit-failed", null, true]]);
  });
});
