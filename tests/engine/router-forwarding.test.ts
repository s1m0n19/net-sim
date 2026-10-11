import { describe, expect, test } from "vitest";
import { addRoute, disableInterface, enableInterface, ping } from "../../src/engine/actions";
import type { Ipv4Packet } from "../../src/engine/model/frames";
import type { Simulator, Trace } from "../../src/engine/simulator";
import { buildThreeNetworks, buildTwoLans } from "./builders";

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function results(sim: Simulator): string[] {
  return sim.traces.filter((t) => t.kind === "ping-result").map((r) => r.outcome);
}

type Sent = Extract<Trace, { kind: "frame-sent" }>;

// I frame spediti da un dispositivo, nell'ordine.
function sentBy(sim: Simulator, deviceId: string): Sent[] {
  return sim.traces.filter((t): t is Sent => t.kind === "frame-sent" && t.from.deviceId === deviceId);
}

function ipPacketsSentBy(sim: Simulator, deviceId: string): { frame: Sent; packet: Ipv4Packet }[] {
  return sentBy(sim, deviceId).flatMap((sent) =>
    sent.frame.etherType === "IPv4" ? [{ frame: sent, packet: sent.frame.payload }] : [],
  );
}

const TO_NET_2 = { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" };
const TO_NET_1 = { network: "192.168.1.0", mask: "255.255.255.0", nextHop: "10.0.0.1" };

describe("un router tra due LAN", () => {
  test("il ping da una LAN all'altra arriva e torna", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["reply"]);
  });

  test("PC1 chiede con ARP il MAC del gateway, non quello di PC2", () => {
    const { sim, pc1 } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const [request] = sentBy(sim, "d1");
    expect(request.frame.etherType === "ARP" && request.frame.payload.targetIp).toBe("192.168.1.1");
    expect([...pc1.arpTable.keys()]).toEqual(["192.168.1.1"]);
  });

  test("il router chiede il MAC di PC2 dall'altra interfaccia, con l'indirizzo di quella", () => {
    const { sim, r1 } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const request = sentBy(sim, "r1").find((s) => s.frame.etherType === "ARP" && s.frame.payload.operation === "request")!;
    expect(request.from.portName).toBe("Gi0/1");
    expect(request.frame.payload).toMatchObject({ senderIp: "192.168.2.1", targetIp: "192.168.2.10" });
    // Il router ha imparato i due PC, ciascuno dal suo lato.
    expect([...r1.arpTable.keys()].sort()).toEqual(["192.168.1.10", "192.168.2.10"]);
  });

  test("attraversando il router gli IP restano, i MAC cambiano e il TTL scende di uno", () => {
    const { sim, pc1, pc2, r1 } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const before = ipPacketsSentBy(sim, "d1")[0];
    const after = ipPacketsSentBy(sim, "r1")[0];
    // Prima del router: da PC1 all'interfaccia del router.
    expect(before.frame.frame).toMatchObject({ srcMac: pc1.ports[0].mac, dstMac: r1.ports[0].mac });
    expect(before.packet).toMatchObject({ srcIp: "192.168.1.10", dstIp: "192.168.2.10", ttl: 128 });
    // Dopo: dall'altra interfaccia del router a PC2.
    expect(after.frame.from.portName).toBe("Gi0/1");
    expect(after.frame.frame).toMatchObject({ srcMac: r1.ports[1].mac, dstMac: pc2.ports[0].mac });
    expect(after.packet).toMatchObject({ srcIp: "192.168.1.10", dstIp: "192.168.2.10", ttl: 127 });
  });

  test("anche la risposta perde un salto di TTL tornando indietro", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const reply = ipPacketsSentBy(sim, "r1").find((p) => p.packet.payload.type === "echo-reply")!;
    expect(reply.packet.ttl).toBe(127);
    expect(reply.frame.from.portName).toBe("Gi0/0");
  });

  test("a caldo non serve più ARP: il secondo ping fa solo andata e ritorno", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);
    const framesBefore = sim.traces.filter((t) => t.kind === "frame-sent").length;

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    // Quattro frame: richiesta fino al router e oltre, risposta indietro.
    expect(sim.traces.filter((t) => t.kind === "frame-sent").length - framesBefore).toBe(4);
  });

  test("senza gateway PC1 non esce dalla sua rete: non parte nulla", () => {
    const { sim, pc1 } = buildTwoLans();
    pc1.gateway = null;

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["transmit-failed"]);
    expect(sentBy(sim, "d1")).toEqual([]);
  });

  test("se PC2 non ha il gateway, la richiesta arriva ma la risposta non può partire", () => {
    const { sim, pc2 } = buildTwoLans();
    pc2.gateway = null;

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["timeout"]);
    expect(sim.traces.some((t) => t.kind === "frame-received" && t.at.deviceId === "d2" && t.frame.etherType === "IPv4")).toBe(true);
  });

  test("con l'interfaccia verso PC2 spenta il router non ha più la rotta, e scarta", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(disableInterface("r1", "Gi0/1"));

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["net-unreachable"]);
    const dropped = sim.traces.find((t) => t.kind === "frame-dropped" && t.at.deviceId === "r1");
    expect(dropped?.kind === "frame-dropped" && dropped.reason).toBe("no-route");

    sim.dispatch(enableInterface("r1", "Gi0/1"));
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);
    expect(results(sim)).toEqual(["net-unreachable", "reply"]);
  });

  test("se PC2 è spento, il router chiede il suo MAC, non ottiene risposta e rinuncia", () => {
    const { sim, pc2, r1 } = buildTwoLans();
    pc2.ip = "192.168.2.99"; // nessuno ha più 192.168.2.10

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["host-unreachable"]);
    const given = sim.traces.find((t) => t.kind === "packet-dropped" && t.deviceId === "r1");
    expect(given).toBeDefined();
    expect(r1.pendingPackets).toEqual([]);
  });
});

describe("il router come destinazione", () => {
  test("risponde al ping sull'interfaccia vicina", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.1.1", 1));
    run(sim);

    expect(results(sim)).toEqual(["reply"]);
  });

  test("risponde anche sull'indirizzo dell'altra interfaccia, dall'indirizzo interrogato", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.2.1", 1));
    run(sim);

    expect(results(sim)).toEqual(["reply"]);
    const reply = ipPacketsSentBy(sim, "r1")[0];
    expect(reply.packet).toMatchObject({ srcIp: "192.168.2.1", dstIp: "192.168.1.10", ttl: 128 });
    expect(reply.frame.from.portName).toBe("Gi0/0");
  });

  test("non risponde ad ARP per un indirizzo di un'altra rete: niente proxy ARP", () => {
    const { sim, pc1 } = buildTwoLans();
    // PC1 crede che 192.168.2.10 sia nella sua rete: lo cerca con ARP sul cavo.
    pc1.mask = "255.255.0.0";

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["unreachable"]);
    expect(sentBy(sim, "r1")).toEqual([]);
  });

  test("ignora un frame che non è per il MAC della sua interfaccia", () => {
    const { sim, pc1 } = buildTwoLans();
    pc1.arpTable.set("192.168.1.1", "02:aa:aa:aa:aa:aa"); // una riga ARP sbagliata

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["timeout"]);
    const dropped = sim.traces.find((t) => t.kind === "frame-dropped" && t.at.deviceId === "r1");
    expect(dropped?.kind === "frame-dropped" && dropped.reason).toBe("not-my-mac");
  });
});

describe("due router in fila", () => {
  test("senza rotte statiche il primo router non sa dove mandare il pacchetto", () => {
    const { sim } = buildThreeNetworks();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["net-unreachable"]);
    const dropped = sim.traces.find((t) => t.kind === "frame-dropped" && t.at.deviceId === "r1");
    expect(dropped?.kind === "frame-dropped" && dropped.reason).toBe("no-route");
    expect(sentBy(sim, "r2")).toEqual([]);
  });

  test("con la sola rotta di andata la richiesta arriva, ma la risposta si ferma al secondo router", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", TO_NET_2));

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["timeout"]);
    // PC2 ha ricevuto la richiesta e ha risposto.
    expect(ipPacketsSentBy(sim, "d2").map((p) => p.packet.payload.type)).toEqual(["echo-reply"]);
    // R2 non ha una rotta per tornare a 192.168.1.0/24.
    const dropped = sim.traces.find((t) => t.kind === "frame-dropped" && t.at.deviceId === "r2");
    expect(dropped?.kind === "frame-dropped" && dropped.reason).toBe("no-route");
  });

  test("con le due rotte il ping riesce, e il TTL scende di due", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", TO_NET_2));
    sim.dispatch(addRoute("r2", TO_NET_1));

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["reply"]);
    const delivered = ipPacketsSentBy(sim, "r2").find((p) => p.packet.payload.type === "echo-request")!;
    expect(delivered.packet.ttl).toBe(126);
  });

  test("tra i due router il frame porta i MAC dei router, e R1 ha chiesto con ARP il prossimo salto", () => {
    const { sim, r1, r2 } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", TO_NET_2));
    sim.dispatch(addRoute("r2", TO_NET_1));

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const between = ipPacketsSentBy(sim, "r1")[0];
    expect(between.frame.frame).toMatchObject({ srcMac: r1.ports[1].mac, dstMac: r2.ports[0].mac });
    // R1 ha cercato 10.0.0.2 (il vicino), non 192.168.2.10 (la destinazione).
    expect([...r1.arpTable.keys()]).toContain("10.0.0.2");
    expect([...r1.arpTable.keys()]).not.toContain("192.168.2.10");
  });

  test("una rotta di default al posto di quella precisa funziona allo stesso modo", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" }));
    sim.dispatch(addRoute("r2", { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.1" }));

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toEqual(["reply"]);
  });

  test("due rotte di default che si rimandano il pacchetto: gira finché il TTL si esaurisce", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" }));
    sim.dispatch(addRoute("r2", { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.1" }));

    sim.dispatch(ping("d1", "172.16.0.1", 1)); // una rete che non esiste
    run(sim);

    // Il giro dura 127 tick, più della scadenza del ping (40): chi ha fatto
    // il ping ha già rinunciato quando il TTL si esaurisce.
    expect(results(sim)).toEqual(["timeout"]);
    const expired = sim.traces.find((t) => t.kind === "frame-dropped" && t.reason === "ttl-expired");
    expect(expired).toBeDefined();
    // Il pacchetto ha fatto avanti e indietro tra i due router: 127 inoltri.
    const forwards = [...ipPacketsSentBy(sim, "r1"), ...ipPacketsSentBy(sim, "r2")].filter(
      (sent) => sent.packet.payload.type === "echo-request",
    );
    expect(forwards).toHaveLength(127);
    expect(sim.suspended).toBe(false); // non è una tempesta di broadcast
  });

  test("quattro richieste: la prima apre la strada con ARP, le altre passano dirette", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", TO_NET_2));
    sim.dispatch(addRoute("r2", TO_NET_1));

    sim.dispatch(ping("d1", "192.168.2.10", 4));
    run(sim);

    expect(results(sim)).toEqual(["reply", "reply", "reply", "reply"]);
  });
});
