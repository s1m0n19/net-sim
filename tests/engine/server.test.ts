import { describe, expect, test } from "vitest";
import { addHost, addLink, addServer, configureHost, ping, removeDevice, restoreConfiguration } from "../../src/engine/actions";
import type { Host } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { takeSnapshot } from "../../src/engine/snapshot";
import { loadNetworkFile } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";

function emptyNetwork(): Simulator {
  return new Simulator({ devices: [], links: [] });
}

function hosts(sim: Simulator): Host[] {
  return sim.network.devices as Host[];
}

describe("server", () => {
  test("è un host come un PC, con il suo ruolo e il suo nome", () => {
    const sim = emptyNetwork();

    sim.dispatch(addServer());
    sim.dispatch(addHost());
    sim.dispatch(addServer());

    expect(hosts(sim).map((h) => [h.kind, h.role, h.name])).toEqual([
      ["host", "server", "SRV1"],
      ["host", "pc", "PC1"],
      ["host", "server", "SRV2"],
    ]);
  });

  test("nasce acceso, con una interfaccia e senza configurazione IP", () => {
    const sim = emptyNetwork();

    sim.dispatch(addServer());

    expect(hosts(sim)[0]).toMatchObject({ powered: true, ip: null, mask: null, gateway: null });
    expect(hosts(sim)[0].ports.map((p) => p.name)).toEqual(["Fa0"]);
  });

  test("un PC e un server collegati e configurati si rispondono", () => {
    const sim = emptyNetwork();
    sim.dispatch(addHost());
    sim.dispatch(addServer());
    const [pc, server] = hosts(sim);
    sim.dispatch(addLink({ deviceId: pc.id, portName: "Fa0" }, { deviceId: server.id, portName: "Fa0" }));
    sim.dispatch(configureHost(pc.id, { ip: "192.168.1.10", mask: "255.255.255.0", gateway: null }));
    sim.dispatch(configureHost(server.id, { ip: "192.168.1.100", mask: "255.255.255.0", gateway: null }));

    sim.dispatch(ping(pc.id, "192.168.1.100", 1));
    sim.dispatch(ping(server.id, "192.168.1.10", 1));
    while (sim.canStep()) sim.step();

    expect(sim.traces.filter((t) => t.kind === "ping-result").map((r) => r.outcome)).toEqual(["reply", "reply"]);
  });

  test("eliminato e ripristinato torna server, non PC", () => {
    const sim = emptyNetwork();
    sim.dispatch(addServer());
    const before = takeSnapshot(sim.network);

    sim.dispatch(removeDevice(hosts(sim)[0].id));
    sim.dispatch(restoreConfiguration(before));

    expect(hosts(sim)[0]).toMatchObject({ role: "server", name: "SRV1" });
  });

  test("nel file ha il suo tipo, e si riapre come server", () => {
    const sim = emptyNetwork();
    sim.dispatch(addServer());
    sim.dispatch(addHost());
    const positions = new Map(hosts(sim).map((h, index) => [h.id, { x: index * 100, y: 0 }]));

    const text = serializeNetwork(sim.network, positions);
    const reopened = loadNetworkFile(text).network.devices as Host[];

    expect(JSON.parse(text).network.devices.map((d: { kind: string }) => d.kind)).toEqual(["server", "host"]);
    expect(reopened.map((h) => h.role)).toEqual(["server", "pc"]);
    expect(reopened).toEqual(sim.network.devices);
  });

  test("un file di prima, senza server, si apre come sempre: gli host sono PC", () => {
    const file = {
      format: "net-sim",
      version: 1,
      network: {
        devices: [
          {
            id: "d1",
            kind: "host",
            name: "PC1",
            position: { x: 0, y: 0 },
            ports: [{ name: "Fa0", mac: "02:00:00:00:00:01" }],
            ip: null,
            mask: null,
            gateway: null,
          },
        ],
        links: [],
      },
    };

    const [pc] = loadNetworkFile(JSON.stringify(file)).network.devices as Host[];

    expect(pc.role).toBe("pc");
  });
});
