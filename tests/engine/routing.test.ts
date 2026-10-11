import { describe, expect, test } from "vitest";
import { disconnectLink } from "../../src/engine/actions";
import { lookupRoute, routingTableOf, type Route } from "../../src/engine/protocols/routing";
import { buildThreeNetworks, buildTwoLans } from "./builders";

// Una rotta utilizzabile, per provare la scelta senza costruire una rete.
function route(network: string, mask: string, portName: string, nextHop: string | null = null): Route {
  return { kind: nextHop === null ? "connected" : "static", network, mask, nextHop, portName };
}

describe("tabella di routing", () => {
  test("le reti delle interfacce accese e collegate entrano da sole", () => {
    const { sim, r1 } = buildTwoLans();

    const table = routingTableOf(sim.network, r1);

    expect(table.map((r) => [r.kind, r.network, r.mask, r.portName])).toEqual([
      ["connected", "192.168.1.1", "255.255.255.0", "Gi0/0"],
      ["connected", "192.168.2.1", "255.255.255.0", "Gi0/1"],
    ]);
  });

  test("un'interfaccia spenta, o senza indirizzo, non porta la sua rete in tabella", () => {
    const { sim, r1 } = buildTwoLans();
    r1.ports[0].enabled = false;
    r1.ports[1].ip = null;
    r1.ports[1].mask = null;

    expect(routingTableOf(sim.network, r1)).toEqual([]);
  });

  test("staccando il cavo la rete collegata sparisce dalla tabella", () => {
    const { sim, r1 } = buildTwoLans();

    sim.dispatch(disconnectLink("l2"));

    expect(routingTableOf(sim.network, r1).map((r) => r.portName)).toEqual(["Gi0/0"]);
  });

  test("una rotta statica esce dall'interfaccia della rete in cui sta il prossimo salto", () => {
    const { sim, r1 } = buildThreeNetworks();
    r1.routes.push({ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" });

    const [, , added] = routingTableOf(sim.network, r1);

    expect(added).toEqual({
      kind: "static",
      network: "192.168.2.0",
      mask: "255.255.255.0",
      nextHop: "10.0.0.2",
      portName: "Gi0/1",
    });
  });

  test("una rotta statica il cui prossimo salto non sta su una rete collegata resta, ma senza interfaccia", () => {
    const { sim, r1 } = buildThreeNetworks();
    r1.routes.push({ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "172.16.0.1" });

    const added = routingTableOf(sim.network, r1).at(-1)!;

    expect(added.portName).toBeNull();
    expect(lookupRoute([added], "192.168.2.10")).toBeNull();
  });

  test("se il cavo verso il vicino si stacca, la rotta statica diventa inutilizzabile", () => {
    const { sim, r1 } = buildThreeNetworks();
    r1.routes.push({ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" });

    sim.dispatch(disconnectLink("l2"));

    expect(lookupRoute(routingTableOf(sim.network, r1), "192.168.2.10")).toBeNull();
  });
});

describe("scelta della rotta", () => {
  test("vince la rete che contiene la destinazione", () => {
    const table = [route("192.168.1.0", "255.255.255.0", "Gi0/0"), route("192.168.2.0", "255.255.255.0", "Gi0/1")];

    expect(lookupRoute(table, "192.168.2.77")?.portName).toBe("Gi0/1");
  });

  test("tra più reti che la contengono vince la maschera più lunga", () => {
    const table = [
      route("10.0.0.0", "255.0.0.0", "Gi0/0", "192.168.1.2"),
      route("10.1.0.0", "255.255.0.0", "Gi0/1", "192.168.2.2"),
      route("10.1.2.0", "255.255.255.0", "Gi0/2", "192.168.3.2"),
    ];

    expect(lookupRoute(table, "10.1.2.3")?.portName).toBe("Gi0/2");
    expect(lookupRoute(table, "10.1.9.9")?.portName).toBe("Gi0/1");
    expect(lookupRoute(table, "10.200.0.1")?.portName).toBe("Gi0/0");
  });

  test("la rotta di default vince solo quando non c'è di meglio", () => {
    const table = [route("0.0.0.0", "0.0.0.0", "Gi0/1", "10.0.0.2"), route("192.168.1.0", "255.255.255.0", "Gi0/0")];

    expect(lookupRoute(table, "192.168.1.5")?.portName).toBe("Gi0/0");
    expect(lookupRoute(table, "8.8.8.8")?.portName).toBe("Gi0/1");
  });

  test("a parità di maschera vince la prima della tabella", () => {
    const table = [
      route("172.16.0.0", "255.255.0.0", "Gi0/0", "10.0.0.2"),
      route("172.16.0.0", "255.255.0.0", "Gi0/1", "10.0.1.2"),
    ];

    expect(lookupRoute(table, "172.16.5.5")?.portName).toBe("Gi0/0");
  });

  test("senza una rete che contenga la destinazione non c'è rotta", () => {
    expect(lookupRoute([route("192.168.1.0", "255.255.255.0", "Gi0/0")], "10.0.0.1")).toBeNull();
    expect(lookupRoute([], "10.0.0.1")).toBeNull();
  });
});
