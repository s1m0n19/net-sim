import { describe, expect, test } from "vitest";
import { addRoute, disableInterface, ping } from "../../src/engine/actions";
import { receiveFrame } from "../../src/engine/devices/host";
import { receiveFrameOnRouter } from "../../src/engine/devices/router";
import { routingTableOf } from "../../src/engine/protocols/routing";
import type { IcmpError, Ipv4Packet } from "../../src/engine/model/frames";
import { isEcho, makeEchoReply, makeEchoRequest, makeIcmpError } from "../../src/engine/protocols/icmp";
import { makeIpv4Packet } from "../../src/engine/protocols/ipv4";
import type { Simulator, Trace } from "../../src/engine/simulator";
import { buildThreeNetworks, buildTwoLans } from "./builders";

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

type Result = Extract<Trace, { kind: "ping-result" }>;

function results(sim: Simulator): Result[] {
  return sim.traces.filter((t): t is Result => t.kind === "ping-result");
}

// I messaggi ICMP di errore spediti da un dispositivo, con il pacchetto IP
// che li porta.
function errorsSentBy(sim: Simulator, deviceId: string): { packet: Ipv4Packet; error: IcmpError; port: string }[] {
  return sim.traces.flatMap((t) => {
    if (t.kind !== "frame-sent" || t.from.deviceId !== deviceId || t.frame.etherType !== "IPv4") return [];
    const message = t.frame.payload.payload;
    return isEcho(message) ? [] : [{ packet: t.frame.payload, error: message, port: t.from.portName }];
  });
}

const TO_NET_2 = { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" };
const TO_NET_1 = { network: "192.168.1.0", mask: "255.255.255.0", nextHop: "10.0.0.1" };
const DEFAULT_VIA_R2 = { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" };
const DEFAULT_VIA_R1 = { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.1" };

describe("il messaggio ICMP di errore", () => {
  const request = makeIpv4Packet("192.168.1.10", "192.168.2.10", makeEchoRequest(1, 7));

  test("riporta l'intestazione del pacchetto scartato", () => {
    expect(makeIcmpError("ttl-expired", request)).toEqual({
      type: "time-exceeded",
      original: { srcIp: "192.168.1.10", dstIp: "192.168.2.10", type: "echo-request", identifier: 1, sequence: 7 },
    });
  });

  test("rete e host non raggiungibili sono lo stesso tipo, con codice diverso", () => {
    expect(makeIcmpError("net-unreachable", request)).toMatchObject({ type: "destination-unreachable", code: "net" });
    expect(makeIcmpError("host-unreachable", request)).toMatchObject({ type: "destination-unreachable", code: "host" });
  });

  test("anche un echo reply scartato può essere segnalato", () => {
    const reply = makeIpv4Packet("192.168.2.10", "192.168.1.10", makeEchoReply(makeEchoRequest(1, 7)));

    expect(makeIcmpError("net-unreachable", reply)?.original.type).toBe("echo-reply");
  });

  test("su un messaggio di errore non si manda un altro errore", () => {
    const error = makeIcmpError("net-unreachable", request)!;
    const carried = makeIpv4Packet("192.168.1.1", "192.168.1.10", error);

    expect(makeIcmpError("ttl-expired", carried)).toBeNull();
  });
});

describe("rete non raggiungibile", () => {
  test("senza rotta il router avvisa il mittente, dall'interfaccia su cui il pacchetto era arrivato", () => {
    const { sim } = buildThreeNetworks();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const [sent] = errorsSentBy(sim, "r1");
    expect(sent.port).toBe("Gi0/0");
    expect(sent.packet).toMatchObject({ srcIp: "192.168.1.1", dstIp: "192.168.1.10", ttl: 128 });
    expect(sent.error).toMatchObject({ type: "destination-unreachable", code: "net" });
    expect(sent.error.original).toMatchObject({ dstIp: "192.168.2.10", sequence: 1 });
  });

  test("il ping si conclude subito con quell'esito, e dice chi ha avvisato", () => {
    const { sim } = buildThreeNetworks();

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const [result] = results(sim);
    expect(result).toMatchObject({ outcome: "net-unreachable", from: "192.168.1.1", ttl: null });
    // Andata fino al router e ritorno dell'avviso, più lo scambio ARP:
    // molto prima dei 40 tick della scadenza.
    expect(result.time).toBe(4);
  });

  test("se l'avviso arriva dal secondo router, è quello a comparire", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", DEFAULT_VIA_R2));
    sim.dispatch(addRoute("r2", TO_NET_1));

    sim.dispatch(ping("d1", "172.16.0.1", 1)); // R2 non ha una rotta per questa rete
    run(sim);

    expect(results(sim)[0]).toMatchObject({ outcome: "net-unreachable", from: "10.0.0.2" });
  });

  test("con quattro richieste, ciascuna riceve il suo avviso", () => {
    const { sim } = buildThreeNetworks();

    sim.dispatch(ping("d1", "192.168.2.10", 4));
    run(sim);

    expect(results(sim).map((r) => [r.sequence, r.outcome])).toEqual([
      [1, "net-unreachable"],
      [2, "net-unreachable"],
      [3, "net-unreachable"],
      [4, "net-unreachable"],
    ]);
  });
});

describe("host non raggiungibile", () => {
  test("l'ultimo router cerca la destinazione con ARP, non la trova e avvisa il mittente", () => {
    const { sim, pc2 } = buildTwoLans();
    pc2.ip = "192.168.2.99"; // nessuno ha più 192.168.2.10

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const [sent] = errorsSentBy(sim, "r1");
    expect(sent.error).toMatchObject({ type: "destination-unreachable", code: "host" });
    expect(sent.packet).toMatchObject({ srcIp: "192.168.1.1", dstIp: "192.168.1.10" });
    expect(results(sim)[0]).toMatchObject({ outcome: "host-unreachable", from: "192.168.1.1" });
  });

  test("l'avviso arriva dopo l'attesa della risposta ARP, ma prima che il ping scada", () => {
    const { sim, pc2 } = buildTwoLans();
    pc2.ip = "192.168.2.99";

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    const time = results(sim)[0].time;
    expect(time).toBeGreaterThan(20); // l'attesa ARP del router
    expect(time).toBeLessThan(40); // la scadenza dell'echo
  });

  test("con due router, avvisa quello più lontano", () => {
    const { sim, pc2 } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", TO_NET_2));
    sim.dispatch(addRoute("r2", TO_NET_1));
    pc2.ip = "192.168.2.99";

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)[0]).toMatchObject({ outcome: "host-unreachable", from: "10.0.0.2" });
  });

  test("resta distinto dal caso in cui è il PC stesso a non trovare la destinazione nella sua LAN", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.1.77", 1)); // stessa rete di PC1, nessuno lo ha
    run(sim);

    expect(results(sim)[0]).toMatchObject({ outcome: "unreachable", from: null });
    expect(errorsSentBy(sim, "r1")).toEqual([]);
  });
});

describe("TTL scaduto", () => {
  // Un echo request di PC1 arrivato al router con il TTL quasi esaurito.
  function almostExpired(ttl: number) {
    const packet = { ...makeIpv4Packet("192.168.1.10", "192.168.2.10", makeEchoRequest(1, 1)), ttl };
    return { dstMac: "02:00:00:00:03:01", srcMac: "02:00:00:00:00:01", etherType: "IPv4" as const, payload: packet };
  }

  test("un pacchetto che arriva con TTL 1 non viene inoltrato: il router avvisa il mittente", () => {
    const { sim, r1 } = buildTwoLans();
    r1.arpTable.set("192.168.1.10", "02:00:00:00:00:01");

    const reaction = receiveFrameOnRouter(r1, "Gi0/0", almostExpired(1), routingTableOf(sim.network, r1));

    expect(reaction.dropped).toBe("ttl-expired");
    const [warning] = reaction.send;
    expect(warning.portName).toBe("Gi0/0");
    expect(warning.frame.etherType === "IPv4" && warning.frame.payload).toMatchObject({
      srcIp: "192.168.1.1",
      dstIp: "192.168.1.10",
      payload: { type: "time-exceeded", original: { dstIp: "192.168.2.10", sequence: 1 } },
    });
  });

  test("con TTL 2 passa, e riparte con TTL 1", () => {
    const { sim, r1 } = buildTwoLans();
    r1.arpTable.set("192.168.2.10", "02:00:00:00:00:02");

    const reaction = receiveFrameOnRouter(r1, "Gi0/0", almostExpired(2), routingTableOf(sim.network, r1));

    expect(reaction.dropped).toBeNull();
    expect(reaction.send[0].frame.etherType === "IPv4" && reaction.send[0].frame.payload.ttl).toBe(1);
  });

  test("il PC che riceve l'avviso chiude quell'echo request con l'esito \"TTL scaduto\"", () => {
    const { sim, pc1 } = buildTwoLans();
    pc1.arpTable.set("192.168.1.1", "02:00:00:00:03:01");
    sim.dispatch(ping("d1", "192.168.2.10", 1)); // PC1 ora aspetta la risposta n. 1
    const request = makeIpv4Packet("192.168.1.10", "192.168.2.10", makeEchoRequest(1, 1));
    const warning = makeIpv4Packet("10.0.0.2", "192.168.1.10", makeIcmpError("ttl-expired", request)!);

    const reaction = receiveFrame(pc1, {
      dstMac: "02:00:00:00:00:01",
      srcMac: "02:00:00:00:03:01",
      etherType: "IPv4",
      payload: warning,
    });

    expect(reaction.pingResults).toMatchObject([{ outcome: "ttl-expired", from: "10.0.0.2", ttl: null }]);
    expect(reaction.cancelTimers).toEqual([{ kind: "echo-timeout", sequence: 1 }]);
    expect(pc1.awaitedEchoes).toEqual([]);
  });

  test("in un ciclo di routing l'avviso parte, ma arriva dopo che il ping è già scaduto", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", DEFAULT_VIA_R2));
    sim.dispatch(addRoute("r2", DEFAULT_VIA_R1));

    sim.dispatch(ping("d1", "172.16.0.1", 1));
    run(sim);

    // Il giro dura 127 tick; il ping rinuncia dopo 40.
    const sent = [...errorsSentBy(sim, "r1"), ...errorsSentBy(sim, "r2")];
    expect(sent[0].error.type).toBe("time-exceeded");
    expect(results(sim)).toHaveLength(1);
    expect(results(sim)[0].outcome).toBe("timeout");
  });
});

describe("TTL della risposta", () => {
  test("senza router la risposta arriva con TTL 128", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("d1", "192.168.1.1", 1)); // il router stesso: nessun inoltro
    run(sim);

    expect(results(sim)[0]).toMatchObject({ outcome: "reply", from: "192.168.1.1", ttl: 128 });
  });

  test("ogni router attraversato al ritorno toglie uno", () => {
    const one = buildTwoLans();
    one.sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(one.sim);
    expect(results(one.sim)[0]).toMatchObject({ outcome: "reply", from: "192.168.2.10", ttl: 127 });

    const two = buildThreeNetworks();
    two.sim.dispatch(addRoute("r1", TO_NET_2));
    two.sim.dispatch(addRoute("r2", TO_NET_1));
    two.sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(two.sim);
    expect(results(two.sim)[0].ttl).toBe(126);
  });

  test("un ping a se stessi riporta il proprio indirizzo e TTL 128", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(ping("d1", "127.0.0.1", 1));

    expect(results(sim)[0]).toMatchObject({ outcome: "reply", from: "127.0.0.1", ttl: 128 });
  });
});

describe("ciò che non produce avvisi", () => {
  test("se manca la rotta di ritorno, l'avviso va a chi ha risposto, e chi ha fatto il ping aspetta la scadenza", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", TO_NET_2));

    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    // R2 non sa tornare verso 192.168.1.0/24: avvisa PC2, che aveva risposto.
    const [sent] = errorsSentBy(sim, "r2");
    expect(sent.packet.dstIp).toBe("192.168.2.10");
    expect(sent.error.original.type).toBe("echo-reply");
    // PC1 non riceve nulla.
    expect(results(sim)[0]).toMatchObject({ outcome: "timeout", from: null });
  });

  test("un avviso che non trova la strada di ritorno viene scartato in silenzio", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", DEFAULT_VIA_R2)); // R2 riceve, ma non ha rotte

    sim.dispatch(ping("d1", "172.16.0.1", 1));
    run(sim);

    // R2 non ha una rotta né per la destinazione né per tornare a PC1.
    expect(errorsSentBy(sim, "r2")).toEqual([]);
    expect(results(sim)[0].outcome).toBe("timeout");
  });

  test("un'interfaccia senza indirizzo non può avvisare nessuno", () => {
    const { sim, r1 } = buildTwoLans();
    sim.dispatch(disableInterface("r1", "Gi0/1"));
    r1.arpTable.set("192.168.1.10", "02:00:00:00:00:01");
    r1.ports[0].ip = null; // il PC ha ancora la riga ARP del gateway
    r1.ports[0].mask = null;

    expect(errorsSentBy(sim, "r1")).toEqual([]);
  });

  test("un avviso arrivato dopo la scadenza del ping viene ignorato", () => {
    const { sim, pc1 } = buildThreeNetworks();
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);
    const before = results(sim).length;

    // Lo stesso echo, ormai concluso: un secondo avviso non cambia nulla.
    pc1.awaitedEchoes = [];
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(results(sim)).toHaveLength(before + 1);
  });
});
