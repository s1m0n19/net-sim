import { describe, expect, test } from "vitest";
import { resolveAddress } from "../../src/engine/actions";
import { BROADCAST_MAC } from "../../src/engine/model/addresses";
import { PC1_MAC, PC2_MAC, buildTwoHosts as twoHosts } from "./builders";

describe("scambio ARP tra due PC", () => {
  test("la richiesta parte in broadcast", () => {
    const { sim } = twoHosts();

    const traces = sim.dispatch(resolveAddress("d1", "192.168.1.11"));

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      kind: "frame-sent",
      time: 0,
      from: { deviceId: "d1" },
      to: { deviceId: "d2" },
      frame: {
        dstMac: BROADCAST_MAC,
        srcMac: PC1_MAC,
        payload: { operation: "request", targetIp: "192.168.1.11", targetMac: null },
      },
    });
  });

  test("il destinatario impara il MAC di chi chiede e risponde in unicast", () => {
    const { sim, pc2 } = twoHosts();
    sim.dispatch(resolveAddress("d1", "192.168.1.11"));

    const traces = sim.step();

    expect(sim.time).toBe(1);
    expect(traces.map((t) => t.kind)).toEqual(["frame-received", "table-changed", "frame-sent"]);
    expect(pc2.arpTable.get("192.168.1.10")).toBe(PC1_MAC);
    expect(traces[2]).toMatchObject({
      frame: {
        dstMac: PC1_MAC,
        srcMac: PC2_MAC,
        payload: { operation: "reply", senderIp: "192.168.1.11", senderMac: PC2_MAC },
      },
    });
  });

  test("dopo due passi entrambe le tabelle ARP sono complete e la rete è ferma", () => {
    const { sim, pc1, pc2 } = twoHosts();
    sim.dispatch(resolveAddress("d1", "192.168.1.11"));

    sim.step();
    sim.step();

    expect(sim.time).toBe(2);
    expect(pc1.arpTable.get("192.168.1.11")).toBe(PC2_MAC);
    expect(pc2.arpTable.get("192.168.1.10")).toBe(PC1_MAC);
    expect(sim.queue).toHaveLength(0);
    expect(sim.step()).toEqual([]);
  });

  test("richiesta e risposta appartengono alla stessa conversazione", () => {
    const { sim } = twoHosts();
    sim.dispatch(resolveAddress("d1", "192.168.1.11"));
    sim.step();
    sim.step();

    const sent = sim.traces.filter((t) => t.kind === "frame-sent");

    expect(sent).toHaveLength(2);
    expect(sent[0].conversationId).toBe(sent[1].conversationId);
  });

  test("nessuno risponde a una richiesta per un indirizzo che non esiste", () => {
    const { sim, pc1, pc2 } = twoHosts();
    sim.dispatch(resolveAddress("d1", "192.168.1.99"));

    const traces = sim.step();

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ kind: "frame-dropped", reason: "arp-not-for-me" });
    expect(pc1.arpTable.size).toBe(0);
    expect(pc2.arpTable.size).toBe(0);
    expect(sim.queue).toHaveLength(0);
  });
});
