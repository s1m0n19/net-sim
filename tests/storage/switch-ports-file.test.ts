import { describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { disableInterface } from "../../src/engine/actions";
import { hostsOf, type Switch } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { loadNetworkFile } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";

// La rete di esempio con una modifica al primo dispositivo, lo switch SW1.
function withSwitch(change: (sw: any) => void): string {
  const data = JSON.parse(lanFile);
  change(data.network.devices[0]);
  return JSON.stringify(data);
}

function switchOf(text: string): Switch {
  return loadNetworkFile(text).network.devices[0] as Switch;
}

describe("porte di uno switch nel file", () => {
  test("una porta senza il campo enabled è accesa, come nasce su uno switch", () => {
    expect(switchOf(lanFile).ports.map((port) => port.enabled)).toEqual([true, true, true, true]);
  });

  test("una porta può essere spenta, e la rete parte già così", () => {
    const { network } = loadNetworkFile(withSwitch((sw) => (sw.ports[0].enabled = false)));
    new Simulator(network);
    const [pc1, pc2] = hostsOf(network);

    expect((network.devices[0] as Switch).ports[0].enabled).toBe(false);
    expect([pc1.linkUp, pc2.linkUp]).toEqual([false, true]);
  });

  test("un campo enabled che non è vero o falso viene rifiutato", () => {
    const text = withSwitch((sw) => (sw.ports[0].enabled = "no"));

    expect(() => loadNetworkFile(text)).toThrow('SW1 Fa0/1: il campo "enabled" deve valere true o false.');
  });

  test("nel file si scrive solo lo stato delle porte spente", () => {
    const { network, positions } = loadNetworkFile(lanFile);
    new Simulator(network).dispatch(disableInterface("s1", "Fa0/2"));

    const file = JSON.parse(serializeNetwork(network, positions));

    expect(file.network.devices[0].ports).toEqual([
      { name: "Fa0/1", mac: "02:00:00:00:01:01" },
      { name: "Fa0/2", mac: "02:00:00:00:01:02", enabled: false },
      { name: "Fa0/3", mac: "02:00:00:00:01:03" },
      { name: "Fa0/4", mac: "02:00:00:00:01:04" },
    ]);
  });

  test("una rete con una porta spenta, salvata e riaperta, è la stessa", () => {
    const original = loadNetworkFile(withSwitch((sw) => (sw.ports[2].enabled = false)));

    const reopened = loadNetworkFile(serializeNetwork(original.network, original.positions));

    expect(reopened.network).toEqual(original.network);
  });
});
