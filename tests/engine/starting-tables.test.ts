import { describe, expect, test } from "vitest";
import { addHost, ping, removeDevice } from "../../src/engine/actions";
import type { Host, Switch } from "../../src/engine/model/network";
import { copyTables, type NetworkTables } from "../../src/engine/model/tables";
import { Simulator } from "../../src/engine/simulator";
import { PC1_MAC, PC2_IP, PC2_MAC, PC3_IP, PC3_MAC, buildLan } from "./builders";

// Una LAN con uno switch e tre PC che riparte "già calda": PC1 conosce il
// MAC di PC2, e lo switch sa dove stanno PC1 e PC2.
function warmLan(tables?: NetworkTables) {
  const { sim: cold } = buildLan();
  const network = cold.network;
  const sim = new Simulator(
    network,
    tables ??
      new Map([
        ["d1", [[PC2_IP, PC2_MAC]]],
        ["s1", [[PC1_MAC, "Fa0/1"], [PC2_MAC, "Fa0/2"]]],
      ]),
  );
  const find = (id: string) => network.devices.find((d) => d.id === id)!;
  return { sim, pc1: find("d1") as Host, pc3: find("d3") as Host, sw: find("s1") as Switch };
}

describe("tabelle di partenza", () => {
  test("una rete può partire con le tabelle già compilate", () => {
    const { pc1, sw } = warmLan();

    expect([...pc1.arpTable]).toEqual([[PC2_IP, PC2_MAC]]);
    expect([...sw.macTable]).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC2_MAC, "Fa0/2"],
    ]);
  });

  test("con il MAC già in tabella l'echo request parte subito, senza richiesta ARP", () => {
    const { sim } = warmLan();

    const traces = sim.dispatch(ping("d1", PC2_IP, 1));
    while (sim.canStep()) sim.step();

    const first = traces.find((t) => t.kind === "frame-sent");
    expect(first).toMatchObject({ frame: { dstMac: PC2_MAC, etherType: "IPv4" } });
    // PC2 invece non conosce PC1: per rispondere deve chiederne il MAC.
    expect(sim.traces.at(-1)).toMatchObject({ kind: "ping-result", outcome: "reply" });
  });

  test("una riga sbagliata si usa come quella giusta: l'echo request va a PC3, che lo scarta", () => {
    // PC1 crede che PC2 abbia il MAC di PC3: è l'errore da scoprire.
    const { sim, pc3 } = warmLan(new Map([["d1", [[PC2_IP, PC3_MAC]]]]));

    sim.dispatch(ping("d1", PC2_IP, 1));
    while (sim.canStep()) sim.step();

    const atPc3 = sim.traces.find((t) => t.kind === "frame-dropped" && t.at.deviceId === pc3.id);
    expect(atPc3).toMatchObject({ frame: { dstMac: PC3_MAC, etherType: "IPv4" }, reason: "ip-not-for-me" });
    expect(sim.traces.at(-1)).toMatchObject({ kind: "ping-result", outcome: "timeout" });
  });

  test("ricominciare riporta alle tabelle di partenza, non a tabelle vuote", () => {
    const { sim, pc1, sw } = warmLan();
    sim.dispatch(ping("d1", PC3_IP, 1));
    while (sim.canStep()) sim.step();
    expect(pc1.arpTable.size).toBe(2);

    sim.reset();

    expect([...pc1.arpTable]).toEqual([[PC2_IP, PC2_MAC]]);
    expect(sw.macTable.size).toBe(2);
  });

  test("le tabelle di partenza nuove valgono da Ricomincia in poi, senza toccare quelle di adesso", () => {
    const { sim, pc1 } = warmLan();
    sim.dispatch(ping("d1", PC3_IP, 1));
    while (sim.canStep()) sim.step();
    const learned = copyTables(sim.network);
    pc1.arpTable.clear();

    sim.setStartingTables(learned);
    expect(pc1.arpTable.size).toBe(0);
    sim.reset();

    expect(pc1.arpTable.size).toBe(2);
  });

  test("un dispositivo spento parte senza tabelle", () => {
    const { sim: cold } = buildLan();
    const pc3 = cold.network.devices.find((d) => d.id === "d3") as Host;
    pc3.powered = false;

    new Simulator(cold.network, new Map([["d3", [[PC2_IP, PC2_MAC]]]]));

    expect(pc3.arpTable.size).toBe(0);
  });

  test("uno switch dimentica le righe di una porta senza segnale, e salta quelle di una porta che non ha", () => {
    const { sim: cold } = buildLan();
    cold.network.links.find((l) => l.id === "l2")!.connected = false;

    const sim = new Simulator(
      cold.network,
      new Map([["s1", [[PC1_MAC, "Fa0/1"], [PC2_MAC, "Fa0/2"], [PC3_MAC, "Fa0/9"]]]]),
    );

    const sw = sim.network.devices.find((d) => d.id === "s1") as Switch;
    expect([...sw.macTable]).toEqual([[PC1_MAC, "Fa0/1"]]);
  });

  test("un dispositivo eliminato non riparte con le sue tabelle, anche se uno nuovo ne prende l'identificativo", () => {
    const { sim } = warmLan(new Map([["d3", [[PC2_IP, PC2_MAC]]]]));

    sim.dispatch(removeDevice("d3"));
    sim.dispatch(addHost());
    sim.reset();

    const newcomer = sim.network.devices.find((d) => d.id === "d3") as Host;
    expect(newcomer.arpTable.size).toBe(0);
  });
});
