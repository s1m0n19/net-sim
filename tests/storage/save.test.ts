import { describe, expect, test } from "vitest";
import twoPcFile from "../../examples/due-pc.netsim.json?raw";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import ringFile from "../../examples/anello-switch.netsim.json?raw";
import { addHost, disconnectLink, ping, powerOff } from "../../src/engine/actions";
import { Simulator } from "../../src/engine/simulator";
import { loadNetworkFile } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";

describe("scrittura di un file di rete", () => {
  test.each([
    ["due-pc", twoPcFile],
    ["lan-switch", lanFile],
    ["anello-switch", ringFile],
  ])("la rete di esempio %s, salvata e riaperta, è la stessa", (_name, text) => {
    const original = loadNetworkFile(text);

    const reopened = loadNetworkFile(serializeNetwork(original.network, original.positions));

    expect(reopened.network).toEqual(original.network);
    expect(reopened.positions).toEqual(original.positions);
  });

  test("il file dichiara formato e versione", () => {
    const { network, positions } = loadNetworkFile(twoPcFile);

    const file = JSON.parse(serializeNetwork(network, positions));

    expect(file).toMatchObject({ format: "net-sim", version: 1 });
  });

  test("uno switch non ha campi di configurazione IP", () => {
    const { network, positions } = loadNetworkFile(lanFile);

    const file = JSON.parse(serializeNetwork(network, positions));
    const sw = file.network.devices.find((d: any) => d.kind === "switch");

    expect(Object.keys(sw)).toEqual(["id", "kind", "name", "position", "ports"]);
  });

  test("i guasti si scrivono solo quando ci sono, e si rileggono", () => {
    const { network, positions } = loadNetworkFile(lanFile);
    const healthy = JSON.parse(serializeNetwork(network, positions));
    expect(healthy.network.devices.some((d: any) => "powered" in d)).toBe(false);
    expect(healthy.network.links.some((l: any) => "connected" in l)).toBe(false);

    const sim = new Simulator(network);
    sim.dispatch(powerOff("d3"));
    sim.dispatch(disconnectLink("l1"));
    const reopened = loadNetworkFile(serializeNetwork(network, positions)).network;

    expect(reopened.devices.find((d) => d.id === "d3")!.powered).toBe(false);
    expect(reopened.links.find((l) => l.id === "l1")!.connected).toBe(false);
  });

  test("lo stato di esecuzione resta fuori: una rete calda si riapre fredda", () => {
    const { network, positions } = loadNetworkFile(lanFile);
    const sim = new Simulator(network);
    sim.dispatch(ping("d1", "192.168.1.11", 1));
    while (sim.canStep()) sim.step();

    const text = serializeNetwork(network, positions);

    expect(text).not.toContain("arpTable");
    expect(text).not.toContain("macTable");
    expect(text).toBe(serializeNetwork(loadNetworkFile(lanFile).network, positions));
  });

  test("un PC non configurato si salva con i tre campi a null", () => {
    const sim = new Simulator({ devices: [], links: [] });
    sim.dispatch(addHost());

    const file = JSON.parse(serializeNetwork(sim.network, new Map([["d1", { x: 10, y: 20 }]])));

    expect(file.network.devices[0]).toMatchObject({
      name: "PC1",
      position: { x: 10, y: 20 },
      ip: null,
      mask: null,
      gateway: null,
    });
  });

  test("una rete vuota si salva e si riapre", () => {
    const text = serializeNetwork({ devices: [], links: [] }, new Map());

    expect(loadNetworkFile(text).network).toEqual({ devices: [], links: [] });
  });
});
