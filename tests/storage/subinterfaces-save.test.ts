import { describe, expect, test } from "vitest";
import { addSubinterface, removeSubinterface } from "../../src/engine/actions";
import { takeSnapshot } from "../../src/engine/snapshot";
import { serializeNetwork } from "../../src/storage/save";
import { session } from "../../src/ui/session.svelte";
import { buildRouterOnAStick, buildTrunkSwitches, buildTwoLans } from "../engine/builders";

// Finché il formato non sa scrivere le sottointerfacce (versione 5, L3-1C),
// una rete che ne ha non si salva: meglio un errore che un file senza di
// loro (D-173).

const positionsOf = (devices: { id: string }[]) => new Map(devices.map((d, i) => [d.id, { x: i * 100, y: 0 }]));

describe("salvare una rete con sottointerfacce (L3-1A)", () => {
  test("una rete con un router con sottointerfacce non si salva, con un errore che si può intercettare", () => {
    const { sim } = buildRouterOnAStick();
    const before = JSON.stringify(takeSnapshot(sim.network));

    expect(() => serializeNetwork(sim.network, positionsOf(sim.network.devices))).toThrow("Le sottointerfacce non si possono ancora salvare.");
    expect(() => serializeNetwork(sim.network, positionsOf(sim.network.devices), { tables: true })).toThrow(
      "Le sottointerfacce non si possono ancora salvare.",
    );
    expect(JSON.stringify(takeSnapshot(sim.network))).toBe(before);
  });

  test("tolte le sottointerfacce, si salva di nuovo; le reti di prima e quelle con VLAN e trunk si salvano come sempre", () => {
    const { sim } = buildRouterOnAStick();
    sim.dispatch(removeSubinterface("r1", "Gi0/0.10"));
    sim.dispatch(removeSubinterface("r1", "Gi0/0.20"));

    expect(JSON.parse(serializeNetwork(sim.network, positionsOf(sim.network.devices))).version).toBe(4);
    const lans = buildTwoLans().sim.network;
    expect(JSON.parse(serializeNetwork(lans, positionsOf(lans.devices))).version).toBe(1);
    const trunk = buildTrunkSwitches().sim.network;
    expect(JSON.parse(serializeNetwork(trunk, positionsOf(trunk.devices))).version).toBe(4);
  });

  test("nella sessione, salvare e preparare la copia di recupero falliscono invece di perdere le sottointerfacce", () => {
    const { sim } = buildTwoLans();
    session.open("lan.netsim.json", serializeNetwork(sim.network, positionsOf(sim.network.devices)));
    (session as any).simulator.network.devices.find((d: any) => d.id === "r1").ports.push({
      name: "Gi0/2",
      mac: "02:00:00:00:03:03",
      ip: null,
      mask: null,
      enabled: false,
    });
    (session as any).simulator.dispatch(addSubinterface("r1", "Gi0/2.10"));

    expect(() => session.serialize()).toThrow("Le sottointerfacce non si possono ancora salvare.");
    expect(() => session.draftSave()).toThrow("Le sottointerfacce non si possono ancora salvare.");
  });
});
