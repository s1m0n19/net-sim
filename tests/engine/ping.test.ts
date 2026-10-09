import { describe, expect, test } from "vitest";
import { ping } from "../../src/engine/actions";
import type { Host } from "../../src/engine/model/network";
import type { Simulator, Trace } from "../../src/engine/simulator";
import {
  PC1_IP,
  PC1_MAC,
  PC2_IP,
  PC2_MAC,
  PC3_MAC,
  buildLan,
  buildTwoHosts,
} from "./builders";

// "A caldo": i due host conoscono già il MAC l'uno dell'altro,
// come dopo uno scambio ARP.
function warmUp(pc1: Host, pc2: Host): void {
  pc1.arpTable.set(PC2_IP, PC2_MAC);
  pc2.arpTable.set(PC1_IP, PC1_MAC);
}

function runToEnd(sim: Simulator): void {
  while (sim.queue.length > 0) sim.step();
}

function sentFrames(traces: Trace[]) {
  return traces.filter((t) => t.kind === "frame-sent").map((t) => t.frame);
}

describe("ping a caldo tra due PC", () => {
  test("l'echo request parte subito, senza ARP, incapsulato a tre livelli", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);

    const traces = sim.dispatch(ping("d1", PC2_IP));

    expect(sentFrames(traces)).toEqual([
      {
        dstMac: PC2_MAC,
        srcMac: PC1_MAC,
        etherType: "IPv4",
        payload: {
          srcIp: PC1_IP,
          dstIp: PC2_IP,
          ttl: 128,
          protocol: "ICMP",
          payload: { type: "echo-request", identifier: 1, sequence: 1 },
        },
      },
    ]);
  });

  test("il destinatario risponde con un echo reply a indirizzi scambiati", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);
    sim.dispatch(ping("d1", PC2_IP));

    const traces = sim.step();

    expect(traces.map((t) => t.kind)).toEqual(["frame-received", "frame-sent"]);
    expect(sentFrames(traces)).toEqual([
      {
        dstMac: PC1_MAC,
        srcMac: PC2_MAC,
        etherType: "IPv4",
        payload: {
          srcIp: PC2_IP,
          dstIp: PC1_IP,
          ttl: 128,
          protocol: "ICMP",
          payload: { type: "echo-reply", identifier: 1, sequence: 1 },
        },
      },
    ]);
  });

  test("dopo due passi l'echo reply è arrivato e la rete è ferma", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);
    sim.dispatch(ping("d1", PC2_IP));

    sim.step();
    const traces = sim.step();

    expect(sim.time).toBe(2);
    expect(traces.map((t) => t.kind)).toEqual(["frame-received", "ping-result"]);
    expect(traces[0]).toMatchObject({ kind: "frame-received", at: { deviceId: "d1" } });
    expect(sim.queue).toHaveLength(0);
  });

  test("il ping non cambia le tabelle ARP", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.traces.some((t) => t.kind === "table-changed")).toBe(false);
    expect(pc1.arpTable.size).toBe(1);
    expect(pc2.arpTable.size).toBe(1);
  });

  test("ogni ping ha un numero di sequenza più alto del precedente", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);

    const first = sentFrames(sim.dispatch(ping("d1", PC2_IP)))[0];
    runToEnd(sim);
    const second = sentFrames(sim.dispatch(ping("d1", PC2_IP)))[0];

    expect(first).toMatchObject({ payload: { payload: { sequence: 1 } } });
    expect(second).toMatchObject({ payload: { payload: { sequence: 2 } } });
  });

  test("richiesta e risposta appartengono alla stessa conversazione, ping diversi no", () => {
    const { sim, pc1, pc2 } = buildTwoHosts();
    warmUp(pc1, pc2);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);
    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    const conversations = sim.traces.filter((t) => t.kind === "frame-sent").map((t) => t.conversationId);
    expect(conversations).toEqual([1, 1, 2, 2]);
  });
});

describe("ping a caldo in una LAN con uno switch", () => {
  test("con la tabella MAC vuota lo switch manda l'echo request anche a PC3, che lo scarta", () => {
    const { sim, pc1, pc2 } = buildLan();
    warmUp(pc1, pc2);
    sim.dispatch(ping("d1", PC2_IP));

    sim.step(); // l'echo request arriva allo switch, che non conosce PC2
    const traces = sim.step(); // le copie arrivano a PC2 e PC3

    expect(traces).toContainEqual(
      expect.objectContaining({ kind: "frame-dropped", at: { deviceId: "d3", portName: "Fa0" }, reason: "not-my-mac" }),
    );
    expect(traces).toContainEqual(
      expect.objectContaining({ kind: "frame-received", at: { deviceId: "d2", portName: "Fa0" } }),
    );
  });

  test("il ping si completa in quattro passi e lo switch impara entrambi i MAC", () => {
    const { sim, sw, pc1, pc2 } = buildLan();
    warmUp(pc1, pc2);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.time).toBe(4);
    expect([...sw.macTable]).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC2_MAC, "Fa0/2"],
    ]);
  });

  test("al secondo ping lo switch non manda più nulla a PC3", () => {
    const { sim, pc1, pc2 } = buildLan();
    warmUp(pc1, pc2);
    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);
    const before = sim.traces.length;

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    const second = sim.traces.slice(before);
    const reachedPc3 = second.some((t) => t.kind !== "table-changed" && "at" in t && t.at.deviceId === "d3");
    expect(reachedPc3).toBe(false);
  });
});

// Che cosa viaggia, in ordine: "ARP request", "echo-request", ...
function sentKinds(traces: Trace[]): string[] {
  return sentFrames(traces).map((frame) =>
    frame.etherType === "ARP" ? `ARP ${frame.payload.operation}` : frame.payload.payload.type,
  );
}

describe("ping a freddo tra due PC", () => {
  test("senza il MAC del destinatario parte una richiesta ARP e l'echo request aspetta", () => {
    const { sim, pc1 } = buildTwoHosts();

    const traces = sim.dispatch(ping("d1", PC2_IP));

    expect(sentKinds(traces)).toEqual(["ARP request"]);
    expect(pc1.pendingPackets).toHaveLength(1);
    expect(pc1.pendingPackets[0]).toMatchObject({
      nextHop: PC2_IP,
      packet: { dstIp: PC2_IP, payload: { type: "echo-request" } },
    });
  });

  test("appena arriva la risposta ARP, l'echo request in attesa parte", () => {
    const { sim, pc1 } = buildTwoHosts();
    sim.dispatch(ping("d1", PC2_IP));
    sim.step(); // PC2 riceve la richiesta ARP e risponde

    const traces = sim.step(); // PC1 riceve la risposta ARP

    expect(traces.map((t) => t.kind)).toEqual(["frame-received", "table-changed", "frame-sent"]);
    expect(sentKinds(traces)).toEqual(["echo-request"]);
    expect(pc1.pendingPackets).toHaveLength(0);
  });

  test("il ping completo dura quattro passi: ARP, poi echo", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.time).toBe(4);
    expect(sentKinds(sim.traces)).toEqual(["ARP request", "ARP reply", "echo-request", "echo-reply"]);
  });

  test("chi risponde non ha bisogno di ARP: ha imparato il MAC dalla richiesta", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    const arpRequests = sim.traces.filter(
      (t) => t.kind === "frame-sent" && t.frame.etherType === "ARP" && t.frame.payload.operation === "request",
    );
    expect(arpRequests).toHaveLength(1);
  });

  test("ARP e ping appartengono alla stessa conversazione", () => {
    const { sim } = buildTwoHosts();

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    const conversations = new Set(
      sim.traces.filter((t) => t.kind === "frame-sent").map((t) => t.conversationId),
    );
    expect(conversations.size).toBe(1);
  });

  test("il secondo ping non ha più bisogno di ARP e dura la metà", () => {
    const { sim } = buildTwoHosts();
    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);
    const before = sim.traces.length;

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.time).toBe(6); // 4 passi il primo, 2 il secondo
    expect(sentKinds(sim.traces.slice(before))).toEqual(["echo-request", "echo-reply"]);
  });

  test("due ping lanciati prima della risposta ARP partono entrambi quando arriva", () => {
    const { sim, pc1 } = buildTwoHosts();

    sim.dispatch(ping("d1", PC2_IP));
    sim.dispatch(ping("d1", PC2_IP));
    expect(pc1.pendingPackets).toHaveLength(2);
    runToEnd(sim);

    const kinds = sentKinds(sim.traces);
    expect(kinds.filter((kind) => kind === "ARP request")).toHaveLength(1); // una sola richiesta per entrambi
    expect(kinds.filter((kind) => kind === "echo-request")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "echo-reply")).toHaveLength(2);
    expect(pc1.pendingPackets).toHaveLength(0);
  });
});

describe("ping a freddo in una LAN con uno switch", () => {
  test("il ping completo dura otto passi", () => {
    const { sim, pc1, pc2 } = buildLan();

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.time).toBe(8);
    expect(pc1.arpTable.get(PC2_IP)).toBe(PC2_MAC);
    expect(pc2.arpTable.get(PC1_IP)).toBe(PC1_MAC);
  });

  test("PC3 vede solo la richiesta ARP: l'echo viaggia tra le sole porte di PC1 e PC2", () => {
    const { sim } = buildLan();

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    const atPc3 = sim.traces.filter((t) => t.kind !== "table-changed" && "at" in t && t.at.deviceId === "d3");
    expect(atPc3).toHaveLength(1);
    expect(atPc3[0]).toMatchObject({ kind: "frame-dropped", reason: "arp-not-for-me" });
  });

  test("il secondo ping dura quattro passi", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.time).toBe(12);
  });
});

describe("ping che non arriva o non parte", () => {
  test("verso un indirizzo che nessuno ha: la richiesta ARP resta senza risposta e l'echo non parte mai", () => {
    const { sim } = buildLan();

    sim.dispatch(ping("d1", "192.168.1.99"));
    runToEnd(sim);

    expect(sentKinds(sim.traces)).toEqual(["ARP request", "ARP request", "ARP request"]); // PC1, poi SW1 verso PC2 e PC3
  });

  test("verso un'altra rete, con un gateway: la richiesta ARP cerca il gateway, non la destinazione", () => {
    const { sim, pc1 } = buildTwoHosts();
    pc1.gateway = "192.168.1.1";

    const traces = sim.dispatch(ping("d1", "10.0.0.5"));

    expect(sentFrames(traces)[0]).toMatchObject({
      etherType: "ARP",
      payload: { operation: "request", targetIp: "192.168.1.1" },
    });
    expect(pc1.pendingPackets[0]).toMatchObject({ nextHop: "192.168.1.1", packet: { dstIp: "10.0.0.5" } });
  });

  test("un host scarta un pacchetto IP arrivato al suo MAC ma destinato a un altro IP", () => {
    const { sim, pc1 } = buildLan();
    // PC1 ha una riga sbagliata in tabella: crede che l'IP di PC2 stia al MAC di PC3.
    pc1.arpTable.set(PC2_IP, PC3_MAC);

    sim.dispatch(ping("d1", PC2_IP));
    runToEnd(sim);

    expect(sim.traces).toContainEqual(
      expect.objectContaining({ kind: "frame-dropped", at: { deviceId: "d3", portName: "Fa0" }, reason: "ip-not-for-me" }),
    );
  });

  test("senza gateway, un ping verso un'altra rete non parte", () => {
    const { sim } = buildTwoHosts();

    const traces = sim.dispatch(ping("d1", "10.0.0.5"));

    expect(traces.map((t) => t.kind)).toEqual(["ping-result"]); // nessun frame
    expect(sim.queue).toHaveLength(0);
  });

  test("un host senza indirizzo IP non può fare ping", () => {
    const { sim, pc1 } = buildTwoHosts();
    pc1.ip = null;

    const traces = sim.dispatch(ping("d1", PC2_IP));

    expect(traces.map((t) => t.kind)).toEqual(["ping-result"]); // nessun frame
  });

  test("un ping verso un testo che non è un indirizzo viene rifiutato", () => {
    const { sim } = buildTwoHosts();

    expect(() => sim.dispatch(ping("d1", "pc2"))).toThrow("non valido");
  });
});
