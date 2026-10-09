import { describe, expect, test } from "vitest";
import exampleFile from "../../examples/due-pc.netsim.json?raw";
import { loadNetworkFile } from "../../src/storage/load";

describe("lettura di un file di rete", () => {
  test("il file di esempio contiene due PC collegati, con le tabelle vuote", () => {
    const { network, positions } = loadNetworkFile(exampleFile);

    expect(network.devices.map((d) => d.name)).toEqual(["PC1", "PC2"]);
    expect(network.devices[0].ip).toBe("192.168.1.10");
    expect(network.devices[0].arpTable.size).toBe(0);
    expect(network.links).toHaveLength(1);
    expect(positions.get("d1")).toEqual({ x: 150, y: 130 });
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
