import { describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { disconnectLink, powerOff } from "../../src/engine/actions";
import { Simulator } from "../../src/engine/simulator";
import { loadNetworkFile } from "../../src/storage/load";
import { buildView, EMPTY_VIEW } from "../../src/ui/view";

// La LAN di esempio: SW1 al centro, PC1 a sinistra, PC2 e PC3 a destra.
function lan() {
  const { network, positions } = loadNetworkFile(lanFile);
  const sim = new Simulator(network);
  return { sim, network, positions, view: () => buildView(network, positions) };
}

describe("dispositivi da disegnare", () => {
  test("ogni dispositivo ha nome, tipo e posizione presi dal file", () => {
    const { view } = lan();

    expect(view().devices.map((d) => [d.name, d.kind, d.x, d.y])).toEqual([
      ["SW1", "switch", 350, 150],
      ["PC1", "host", 100, 150],
      ["PC2", "host", 600, 60],
      ["PC3", "host", 600, 240],
    ]);
  });

  test("un host mostra l'indirizzo con il prefisso, e il suo MAC", () => {
    const { view } = lan();
    const pc1 = view().devices.find((d) => d.name === "PC1")!;

    expect(pc1.ipLabel).toBe("192.168.1.10/24");
    expect(pc1.mac).toBe("02:00:00:00:00:01");
  });

  test("il prefisso segue la maschera", () => {
    const { network, view } = lan();
    const host = network.devices.find((d) => d.name === "PC1")!;
    if (host.kind === "host") host.mask = "255.255.255.128";

    expect(view().devices.find((d) => d.name === "PC1")!.ipLabel).toBe("192.168.1.10/25");
  });

  test("un host non configurato non ha un indirizzo da mostrare", () => {
    const { network, view } = lan();
    const host = network.devices.find((d) => d.name === "PC1")!;
    if (host.kind === "host") {
      host.ip = null;
      host.mask = null;
    }

    expect(view().devices.find((d) => d.name === "PC1")!.ipLabel).toBeNull();
  });

  test("uno switch non ha indirizzo né MAC da mostrare", () => {
    const sw = lan().view().devices.find((d) => d.name === "SW1")!;

    expect([sw.ipLabel, sw.mac]).toEqual([null, null]);
  });

  test("un dispositivo spento risulta spento", () => {
    const { sim, view } = lan();
    sim.dispatch(powerOff("d2"));

    expect(view().devices.find((d) => d.name === "PC2")!.powered).toBe(false);
  });
});

describe("cavi da disegnare", () => {
  test("ogni cavo va dalla posizione di un dispositivo a quella dell'altro, con i nomi delle porte", () => {
    const cable = lan().view().links.find((l) => l.id === "l1")!;

    expect(cable.from).toEqual({ x: 100, y: 150 }); // PC1
    expect(cable.to).toEqual({ x: 350, y: 150 }); // SW1
    expect([cable.fromPort, cable.toPort]).toEqual(["Fa0", "Fa0/1"]);
  });

  test("in una rete appena accesa su ogni cavo passa il segnale", () => {
    expect(lan().view().links.every((l) => l.connected && l.signal)).toBe(true);
  });

  test("un cavo staccato non è collegato e non porta segnale", () => {
    const { sim, view } = lan();
    sim.dispatch(disconnectLink("l2"));

    const cable = view().links.find((l) => l.id === "l2")!;
    expect([cable.connected, cable.signal]).toEqual([false, false]);
  });

  test("con un dispositivo spento il cavo resta collegato, ma senza segnale", () => {
    const { sim, view } = lan();
    sim.dispatch(powerOff("d2"));

    const cable = view().links.find((l) => l.id === "l2")!;
    expect([cable.connected, cable.signal]).toEqual([true, false]);
  });

  test("spento lo switch, nessun cavo porta segnale", () => {
    const { sim, view } = lan();
    sim.dispatch(powerOff("s1"));

    expect(view().links.some((l) => l.signal)).toBe(false);
  });
});

describe("inquadratura", () => {
  test("il rettangolo contiene tutti i dispositivi, con spazio per le etichette sotto", () => {
    const { bounds, devices } = lan().view();

    for (const device of devices) {
      expect(device.x).toBeGreaterThan(bounds.x + 80);
      expect(device.x).toBeLessThan(bounds.x + bounds.width - 80);
      expect(device.y).toBeGreaterThan(bounds.y + 50);
      expect(device.y + 80).toBeLessThan(bounds.y + bounds.height); // nome, indirizzo e MAC
    }
  });

  test("una rete senza dispositivi ha un'inquadratura di ripiego", () => {
    const view = buildView({ devices: [], links: [] }, new Map());

    expect(view.devices).toEqual([]);
    expect(view.bounds).toEqual(EMPTY_VIEW.bounds);
  });
});
