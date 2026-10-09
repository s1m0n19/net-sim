import { describe, expect, test } from "vitest";
import exampleFile from "../../examples/due-pc.netsim.json?raw";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { resolveAddress } from "../../src/engine/actions";
import { hostsOf } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { loadNetworkFile } from "../../src/storage/load";

describe("lettura di un file di rete", () => {
  test("il file di esempio contiene due PC collegati, con le tabelle vuote", () => {
    const { network, positions } = loadNetworkFile(exampleFile);

    expect(network.devices.map((d) => d.name)).toEqual(["PC1", "PC2"]);
    expect(hostsOf(network)[0].ip).toBe("192.168.1.10");
    expect(hostsOf(network)[0].arpTable.size).toBe(0);
    expect(network.links).toHaveLength(1);
    expect(positions.get("d1")).toEqual({ x: 150, y: 130 });
  });

  test("il file della LAN contiene uno switch con la tabella MAC vuota e tre PC", () => {
    const { network, positions } = loadNetworkFile(lanFile);

    const sw = network.devices.find((d) => d.kind === "switch")!;
    expect(sw.name).toBe("SW1");
    expect(sw.ports.map((p) => p.name)).toEqual(["Fa0/1", "Fa0/2", "Fa0/3", "Fa0/4"]);
    expect(sw.macTable.size).toBe(0);
    expect(hostsOf(network).map((h) => h.name)).toEqual(["PC1", "PC2", "PC3"]);
    expect(network.links).toHaveLength(3);
    expect(positions.size).toBe(4);
  });

  test("la LAN letta dal file funziona: lo scambio ARP si completa in quattro passi", () => {
    const { network } = loadNetworkFile(lanFile);
    const sim = new Simulator(network);
    const [pc1, pc2] = hostsOf(network);

    sim.dispatch(resolveAddress(pc1.id, pc2.ip!));
    while (sim.queue.length > 0) sim.step();

    expect(sim.time).toBe(4);
    expect(pc1.arpTable.get(pc2.ip!)).toBe(pc2.ports[0].mac);
  });

  test("rifiuta un tipo di dispositivo che non conosce", () => {
    const data = JSON.parse(exampleFile);
    data.network.devices[0].kind = "tostapane";

    expect(() => loadNetworkFile(JSON.stringify(data))).toThrow("non supportato: tostapane");
  });

  test("rifiuta un host con una subnet mask non valida", () => {
    const data = JSON.parse(exampleFile);
    data.network.devices[0].mask = "255.0.255.0";

    expect(() => loadNetworkFile(JSON.stringify(data))).toThrow("PC1 ha una subnet mask non valida");
  });

  test("rifiuta un file che non è JSON", () => {
    expect(() => loadNetworkFile("non sono JSON")).toThrow("non è JSON valido");
  });

  test("rifiuta un JSON che non è una rete di net-sim", () => {
    expect(() => loadNetworkFile('{"format":"altro"}')).toThrow("non è una rete di net-sim");
  });

  test("rifiuta una versione che non conosce", () => {
    expect(() => loadNetworkFile('{"format":"net-sim","version":99}')).toThrow("non supportata");
  });

  test("rifiuta un collegamento verso una porta che non esiste", () => {
    const data = JSON.parse(exampleFile);
    data.network.links[0].b.portName = "Fa9";

    expect(() => loadNetworkFile(JSON.stringify(data))).toThrow("porta inesistente");
  });
});
