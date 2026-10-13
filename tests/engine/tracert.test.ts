import { describe, expect, test } from "vitest";
import { addRoute, disconnectLink, ping, tracert } from "../../src/engine/actions";
import { isEcho } from "../../src/engine/protocols/icmp";
import type { Simulator, Trace } from "../../src/engine/simulator";
import { buildThreeNetworks, buildTwoLans } from "./builders";

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

type Hop = Extract<Trace, { kind: "trace-hop" }>;

function hops(sim: Simulator): Hop[] {
  return sim.traces.filter((t): t is Hop => t.kind === "trace-hop");
}

// Che cosa ha scoperto tracert, salto per salto.
function route(sim: Simulator): [number, string, string | null][] {
  return hops(sim).map((h) => [h.hop, h.outcome, h.from]);
}

// Il TTL con cui PC1 ha spedito ogni echo request.
function ttlsSentBy(sim: Simulator, deviceId: string): number[] {
  return sim.traces.flatMap((t) => {
    if (t.kind !== "frame-sent" || t.from.deviceId !== deviceId || t.frame.etherType !== "IPv4") return [];
    const message = t.frame.payload.payload;
    return isEcho(message) && message.type === "echo-request" ? [t.frame.payload.ttl] : [];
  });
}

const TO_NET_2 = { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" };
const TO_NET_1 = { network: "192.168.1.0", mask: "255.255.255.0", nextHop: "10.0.0.1" };
const DEFAULT_VIA_R2 = { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" };
const DEFAULT_VIA_R1 = { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.1" };

function routed() {
  const built = buildThreeNetworks();
  built.sim.dispatch(addRoute("r1", TO_NET_2));
  built.sim.dispatch(addRoute("r2", TO_NET_1));
  return built;
}

describe("tracert", () => {
  test("attraverso due router scopre i due router e poi la destinazione", () => {
    const { sim } = routed();

    sim.dispatch(tracert("d1", "192.168.2.10"));
    run(sim);

    expect(route(sim)).toEqual([
      [1, "hop", "192.168.1.1"],
      [2, "hop", "10.0.0.2"],
      [3, "reached", "192.168.2.10"],
    ]);
    expect(hops(sim).map((h) => h.done)).toEqual([false, false, true]);
  });

  test("le sonde partono con TTL 1, poi 2, poi 3", () => {
    const { sim } = routed();

    sim.dispatch(tracert("d1", "192.168.2.10"));
    run(sim);

    expect(ttlsSentBy(sim, "d1")).toEqual([1, 2, 3]);
  });

  test("ogni router risponde dall'interfaccia su cui la sonda gli è arrivata", () => {
    const { sim } = routed();

    sim.dispatch(tracert("d1", "192.168.2.10"));
    run(sim);

    // R2 ha anche 192.168.2.1, ma la sonda gli arriva da 10.0.0.2.
    expect(hops(sim)[1].from).toBe("10.0.0.2");
  });

  test("una sonda dopo l'altra: la successiva parte quando la precedente si è conclusa", () => {
    const { sim, pc1 } = routed();

    sim.dispatch(tracert("d1", "192.168.2.10"));

    expect(pc1.awaitedEchoes).toHaveLength(1);
    run(sim);
    expect(pc1.awaitedEchoes).toEqual([]);
    const times = hops(sim).map((h) => h.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(3);
  });

  test("verso la propria LAN c'è un solo salto: la destinazione", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(tracert("d1", "192.168.1.1"));
    run(sim);

    expect(route(sim)).toEqual([[1, "reached", "192.168.1.1"]]);
  });

  test("verso se stessi risponde subito, senza che parta nulla", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(tracert("d1", "192.168.1.10"));

    expect(route(sim)).toEqual([[1, "reached", "192.168.1.10"]]);
    expect(sim.traces.some((t) => t.kind === "frame-sent")).toBe(false);
  });

  test("un router senza rotta avvisa, e tracert finisce lì", () => {
    const { sim } = buildThreeNetworks();

    sim.dispatch(tracert("d1", "192.168.2.10"));
    run(sim);

    // La prima sonda muore sul router per il TTL; la seconda scopre che non c'è strada.
    expect(route(sim)).toEqual([
      [1, "hop", "192.168.1.1"],
      [2, "net-unreachable", "192.168.1.1"],
    ]);
    expect(hops(sim).at(-1)!.done).toBe(true);
  });

  test("se l'ultimo router non trova la destinazione, lo dice lui", () => {
    const { sim, pc2 } = routed();
    pc2.ip = "192.168.2.99";

    sim.dispatch(tracert("d1", "192.168.2.10"));
    run(sim);

    expect(route(sim).at(-1)).toEqual([3, "host-unreachable", "10.0.0.2"]);
  });

  test("un salto che non risponde resta ignoto, e tracert prosegue fino al limite", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", TO_NET_2)); // manca la rotta di ritorno su R2

    sim.dispatch(tracert("d1", "192.168.2.10", 4));
    run(sim);

    // R1 risponde; gli avvisi di R2 e la risposta di PC2 non sanno tornare.
    expect(route(sim)).toEqual([
      [1, "hop", "192.168.1.1"],
      [2, "timeout", null],
      [3, "timeout", null],
      [4, "timeout", null],
    ]);
    expect(hops(sim).map((h) => h.done)).toEqual([false, false, false, true]);
  });

  test("in un ciclo di routing i due router si alternano fino al limite", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", DEFAULT_VIA_R2));
    sim.dispatch(addRoute("r2", DEFAULT_VIA_R1));

    sim.dispatch(tracert("d1", "172.16.0.1", 5));
    run(sim);

    expect(route(sim).map(([, , from]) => from)).toEqual([
      "192.168.1.1",
      "10.0.0.2",
      "10.0.0.1",
      "10.0.0.2",
      "10.0.0.1",
    ]);
  });

  test("senza gateway, o con il cavo staccato, non parte nemmeno", () => {
    const noGateway = buildTwoLans();
    noGateway.pc1.gateway = null;
    noGateway.sim.dispatch(tracert("d1", "192.168.2.10"));
    expect(route(noGateway.sim)).toEqual([[1, "transmit-failed", null]]);

    const unplugged = buildTwoLans();
    unplugged.sim.dispatch(disconnectLink("l1"));
    unplugged.sim.dispatch(tracert("d1", "192.168.2.10"));
    expect(route(unplugged.sim)).toEqual([[1, "transmit-failed", null]]);
  });

  test("un indirizzo o un limite di salti non validi vengono rifiutati", () => {
    const { sim } = buildTwoLans();

    expect(() => sim.dispatch(tracert("d1", "192.168.2"))).toThrow();
    expect(() => sim.dispatch(tracert("d1", "192.168.2.10", 0))).toThrow("TTL non valido");
  });

  test("non lascia esiti di ping: tracert e ping sono due cose distinte", () => {
    const { sim } = routed();

    sim.dispatch(tracert("d1", "192.168.2.10"));
    run(sim);

    expect(sim.traces.some((t) => t.kind === "ping-result")).toBe(false);
  });
});

describe("ping con un TTL a scelta", () => {
  test("gli echo request partono con quel TTL, tutti", () => {
    const { sim } = routed();

    sim.dispatch(ping("d1", "192.168.2.10", 2, 64));
    run(sim);

    expect(ttlsSentBy(sim, "d1")).toEqual([64, 64]);
  });

  test("con un TTL troppo piccolo il pacchetto si ferma per strada, e il router lo dice", () => {
    const { sim } = routed();

    sim.dispatch(ping("d1", "192.168.2.10", 1, 2));
    run(sim);

    const result = sim.traces.find((t) => t.kind === "ping-result");
    expect(result).toMatchObject({ outcome: "ttl-expired", from: "10.0.0.2" });
  });

  test("così un ciclo di routing si vede in pochi passi", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", DEFAULT_VIA_R2));
    sim.dispatch(addRoute("r2", DEFAULT_VIA_R1));

    sim.dispatch(ping("d1", "172.16.0.1", 1, 6));
    run(sim);

    const result = sim.traces.find((t) => t.kind === "ping-result")!;
    expect(result).toMatchObject({ outcome: "ttl-expired" });
    expect(result.time).toBeLessThan(40); // prima della scadenza del ping
  });

  test("senza l'opzione il TTL resta 128", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(ttlsSentBy(sim, "d1")).toEqual([128]);
  });

  test("un TTL fuori da 1-255 viene rifiutato", () => {
    const { sim } = buildTwoLans();

    expect(() => sim.dispatch(ping("d1", "192.168.2.10", 1, 0))).toThrow("TTL non valido");
    expect(() => sim.dispatch(ping("d1", "192.168.2.10", 1, 256))).toThrow("TTL non valido");
  });
});
