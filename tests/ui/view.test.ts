import { describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { disconnectLink, ping, powerOff } from "../../src/engine/actions";
import { Simulator } from "../../src/engine/simulator";
import { loadNetworkFile } from "../../src/storage/load";
import { buildView, EMPTY_VIEW } from "../../src/ui/view";

// La LAN di esempio: SW1 al centro, PC1 a sinistra, PC2 e PC3 a destra.
function lan() {
  const { network, positions } = loadNetworkFile(lanFile);
  const sim = new Simulator(network);
  return { sim, network, positions, view: () => buildView(sim, positions) };
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
    expect(sw.portCount).toBe(4);
  });

  test("dopo un ping, le tabelle da mostrare sono quelle dei dispositivi", () => {
    const { sim, view } = lan();
    sim.dispatch(ping("d1", "192.168.1.11", 1));
    while (sim.canStep()) sim.step();

    const devices = view().devices;
    expect(devices.find((d) => d.name === "PC1")!.arpRows).toEqual([["192.168.1.11", "02:00:00:00:00:02"]]);
    expect(devices.find((d) => d.name === "PC3")!.arpRows).toEqual([]);
    expect(devices.find((d) => d.name === "SW1")!.macRows).toEqual([
      ["02:00:00:00:00:01", "Fa0/1"],
      ["02:00:00:00:00:02", "Fa0/2"],
    ]);
  });

  test("un host mostra il pacchetto che tiene in attesa del MAC", () => {
    const { sim, view } = lan();
    sim.dispatch(ping("d1", "192.168.1.11", 1));

    expect(view().devices.find((d) => d.name === "PC1")!.pending).toEqual(["echo request per 192.168.1.11"]);
  });

  test("un host sa se sente il segnale sul cavo", () => {
    const { sim, view } = lan();
    sim.dispatch(disconnectLink("l1"));

    const devices = view().devices;
    expect(devices.find((d) => d.name === "PC1")!.linkUp).toBe(false);
    expect(devices.find((d) => d.name === "PC2")!.linkUp).toBe(true);
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
    expect([cable.fromName, cable.toName]).toEqual(["PC1", "SW1"]);
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
    const view = buildView(new Simulator({ devices: [], links: [] }), new Map());

    expect(view.devices).toEqual([]);
    expect(view.bounds).toEqual(EMPTY_VIEW.bounds);
  });
});

describe("pacchetti in viaggio", () => {
  test("in una rete ferma non ce ne sono, e non c'è un prossimo evento", () => {
    const { view } = lan();

    expect(view().packets).toEqual([]);
    expect(view().nextEvent).toBeNull();
    expect(view().time).toBe(0);
  });

  test("un ping a freddo mette in viaggio una richiesta ARP da PC1 allo switch", () => {
    const { sim, view } = lan();
    sim.dispatch(ping("d1", "192.168.1.11", 1));

    expect(view().packets).toEqual([
      expect.objectContaining({
        id: 1,
        from: { x: 100, y: 150 },
        to: { x: 350, y: 150 },
        fromName: "PC1",
        toName: "SW1",
        protocol: "ARP",
        description: "ARP request",
        departure: 0,
        arrival: 1,
      }),
    ]);
    expect(view().packets[0].frame).toMatchObject({ etherType: "ARP", dstMac: "ff:ff:ff:ff:ff:ff" });
  });

  test("dopo un passo lo switch ha inoltrato due copie, che viaggiano tra il tick 1 e il 2", () => {
    const { sim, view } = lan();
    sim.dispatch(ping("d1", "192.168.1.11", 1));
    sim.step();

    expect(view().time).toBe(1);
    expect(view().packets.map((p) => [p.to, p.departure, p.arrival])).toEqual([
      [{ x: 600, y: 60 }, 1, 2],
      [{ x: 600, y: 240 }, 1, 2],
    ]);
  });

  test("l'echo request è un pacchetto ICMP", () => {
    const { sim, view } = lan();
    sim.dispatch(ping("d1", "192.168.1.11", 1));
    for (let i = 0; i < 4; i++) sim.step(); // lo scambio ARP è finito

    expect(view().packets.map((p) => [p.protocol, p.description])).toEqual([["ICMP", "ICMP echo request"]]);
  });
});

describe("prossimo evento", () => {
  test("finché viaggia un pacchetto, è il suo arrivo, e nessuno sta solo aspettando", () => {
    const { sim, view } = lan();
    sim.dispatch(ping("d1", "192.168.1.11", 1));

    expect(view().nextEvent).toEqual({ time: 1, waitingDeviceIds: [] });
  });

  test("quando non viaggia più nulla, è la scadenza dell'attesa di chi ha chiesto", () => {
    const { sim, view } = lan();
    sim.dispatch(ping("d1", "192.168.1.99", 1)); // nessuno risponderà
    sim.step();
    sim.step();

    expect(view().packets).toEqual([]);
    expect(view().nextEvent).toEqual({ time: 20, waitingDeviceIds: ["d1"] });
  });

  test("a simulazione sospesa non c'è un prossimo evento", () => {
    const { sim, view } = lan();
    sim.dispatch(ping("d1", "192.168.1.11", 1));
    sim.suspended = true;

    expect(view().nextEvent).toBeNull();
    expect(view().suspended).toBe(true);
  });
});
