import { describe, expect, test } from "vitest";
import {
  addServer,
  addSwitch,
  configureHost,
  disableInterface,
  duplicateDevice,
  restoreConfiguration,
} from "../../src/engine/actions";
import type { Host, Router, Switch } from "../../src/engine/model/network";
import { takeSnapshot } from "../../src/engine/snapshot";
import { PC1_MAC, buildLan, buildTwoLans } from "./builders";

const MASK = "255.255.255.0";

describe("duplicare un PC", () => {
  test("la copia prende il primo indirizzo libero dopo l'originale, con la stessa maschera", () => {
    const { sim } = buildLan(); // PC1 .10, PC2 .11, PC3 .12

    const traces = sim.dispatch(duplicateDevice("d1"));

    const copy = sim.network.devices.at(-1) as Host;
    expect(traces).toEqual([{ time: 0, kind: "device-added", deviceId: copy.id }]);
    expect(copy).toMatchObject({ kind: "host", role: "pc", name: "PC4", ip: "192.168.1.13", mask: MASK, gateway: null });
    expect(copy.ports[0].mac).not.toBe(PC1_MAC);
  });

  test("quattro copie dello stesso PC fanno una LAN con indirizzi in fila", () => {
    const { sim } = buildLan();

    for (let i = 0; i < 4; i++) sim.dispatch(duplicateDevice("d1"));

    const copies = sim.network.devices.slice(-4) as Host[];
    expect(copies.map((h) => [h.name, h.ip])).toEqual([
      ["PC4", "192.168.1.13"],
      ["PC5", "192.168.1.14"],
      ["PC6", "192.168.1.15"],
      ["PC7", "192.168.1.16"],
    ]);
  });

  test("la copia nasce accesa, senza cavi e senza tabelle", () => {
    const { sim } = buildLan();

    sim.dispatch(duplicateDevice("d1"));

    const copy = sim.network.devices.at(-1) as Host;
    expect(copy.powered).toBe(true);
    expect(copy.linkUp).toBe(false);
    expect(copy.arpTable.size).toBe(0);
    expect(sim.network.links.some((l) => l.a.deviceId === copy.id || l.b.deviceId === copy.id)).toBe(false);
  });

  test("copia il gateway, e non prende né il suo indirizzo né quello di un router", () => {
    const { sim, r1 } = buildTwoLans(); // PC1 192.168.1.10, gateway .1
    sim.dispatch(configureHost("d1", { ip: "192.168.1.10", mask: MASK, gateway: "192.168.1.11" }));
    r1.ports[0].ip = "192.168.1.12";

    sim.dispatch(duplicateDevice("d1"));

    const copy = sim.network.devices.at(-1) as Host;
    expect(copy).toMatchObject({ ip: "192.168.1.13", mask: MASK, gateway: "192.168.1.11" });
  });

  test("se dopo l'originale la sottorete è finita, la copia nasce non configurata", () => {
    const { sim } = buildLan();
    sim.dispatch(configureHost("d1", { ip: "192.168.1.254", mask: MASK, gateway: null }));

    sim.dispatch(duplicateDevice("d1")); // .255 è il broadcast

    const copy = sim.network.devices.at(-1) as Host;
    expect(copy).toMatchObject({ ip: null, mask: null, gateway: null });
  });

  test("la copia di un PC non configurato è non configurata", () => {
    const { sim } = buildLan();
    sim.dispatch(configureHost("d1", { ip: null, mask: null, gateway: null }));

    sim.dispatch(duplicateDevice("d1"));

    expect(sim.network.devices.at(-1)).toMatchObject({ ip: null, mask: null, gateway: null });
  });

  test("la copia di un server è un server", () => {
    const { sim } = buildLan();
    const [added] = sim.dispatch(addServer());
    const serverId = (added as { deviceId: string }).deviceId;
    sim.dispatch(configureHost(serverId, { ip: "192.168.1.100", mask: MASK, gateway: null }));

    sim.dispatch(duplicateDevice(serverId));

    expect(sim.network.devices.at(-1)).toMatchObject({ role: "server", name: "SRV2", ip: "192.168.1.101" });
  });
});

describe("duplicare uno switch o un router", () => {
  test("la copia di uno switch ha le stesse porte, spente dove l'originale le ha spente", () => {
    const { sim } = buildLan();
    sim.dispatch(addSwitch(8));
    const original = sim.network.devices.at(-1) as Switch;
    sim.dispatch(disableInterface(original.id, "Fa0/3"));

    sim.dispatch(duplicateDevice(original.id));

    const copy = sim.network.devices.at(-1) as Switch;
    expect(copy.name).toBe("SW3");
    expect(copy.ports.map((p) => [p.name, p.enabled])).toEqual(original.ports.map((p) => [p.name, p.enabled]));
    expect(copy.ports.map((p) => p.mac)).not.toContain(original.ports[0].mac);
  });

  test("la copia di un router ha le stesse interfacce, spente e senza indirizzi, e nessuna rotta", () => {
    const { sim, r1 } = buildTwoLans();
    r1.routes.push({ network: "10.0.0.0", mask: "255.0.0.0", nextHop: "192.168.1.254" });

    sim.dispatch(duplicateDevice("r1"));

    const copy = sim.network.devices.at(-1) as Router;
    expect(copy.name).toBe("R2");
    expect(copy.ports.map((p) => [p.name, p.ip, p.mask, p.enabled])).toEqual([
      ["Gi0/0", null, null, false],
      ["Gi0/1", null, null, false],
    ]);
    expect(copy.routes).toEqual([]);
  });

  test("duplicare un dispositivo che non c'è è un errore, e la rete resta com'era", () => {
    const { sim } = buildLan();

    expect(() => sim.dispatch(duplicateDevice("d99"))).toThrow();
    expect(sim.network.devices).toHaveLength(4);
  });

  test("tornando alla configurazione di prima, la copia sparisce", () => {
    const { sim } = buildLan();
    const before = takeSnapshot(sim.network);
    sim.dispatch(duplicateDevice("d1"));

    sim.dispatch(restoreConfiguration(before));

    expect(sim.network.devices.map((d) => d.name)).toEqual(["SW1", "PC1", "PC2", "PC3"]);
  });
});
