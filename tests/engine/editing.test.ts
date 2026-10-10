import { describe, expect, test } from "vitest";
import {
  addHost,
  addLink,
  addSwitch,
  configureHost,
  moveLinkEnd,
  ping,
  removeDevice,
  removeLink,
  renameDevice,
} from "../../src/engine/actions";
import { freePortsOf } from "../../src/engine/editing";
import { hostsOf, type Host, type Switch } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { PC1_MAC, PC2_IP, PC2_MAC, buildLan } from "./builders";

function emptyNetwork(): Simulator {
  return new Simulator({ devices: [], links: [] });
}

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

function results(sim: Simulator) {
  return sim.traces.filter((t) => t.kind === "ping-result").map((r) => r.outcome);
}

describe("aggiungere dispositivi", () => {
  test("un PC nuovo ha un nome, una porta con il suo MAC, e nessun indirizzo", () => {
    const sim = emptyNetwork();

    const traces = sim.dispatch(addHost());

    const pc = sim.network.devices[0] as Host;
    expect(traces).toEqual([{ time: 0, kind: "device-added", deviceId: "d1" }]);
    expect(pc).toMatchObject({ kind: "host", id: "d1", name: "PC1", powered: true, ip: null, mask: null, gateway: null });
    expect(pc.ports).toEqual([{ name: "Fa0", mac: "02:00:00:00:00:01" }]);
    expect(pc.linkUp).toBe(false); // nessun cavo
  });

  test("i PC successivi prendono nomi e MAC in sequenza", () => {
    const sim = emptyNetwork();
    sim.dispatch(addHost());
    sim.dispatch(addHost());
    sim.dispatch(addHost());

    expect(sim.network.devices.map((d) => d.name)).toEqual(["PC1", "PC2", "PC3"]);
    expect(sim.network.devices.map((d) => d.ports[0].mac)).toEqual([
      "02:00:00:00:00:01",
      "02:00:00:00:00:02",
      "02:00:00:00:00:03",
    ]);
  });

  test("uno switch nuovo ha le porte richieste, ciascuna con il suo MAC", () => {
    const sim = emptyNetwork();

    sim.dispatch(addSwitch(8));

    const sw = sim.network.devices[0] as Switch;
    expect(sw).toMatchObject({ kind: "switch", id: "s1", name: "SW1" });
    expect(sw.ports.map((p) => p.name)).toEqual(["Fa0/1", "Fa0/2", "Fa0/3", "Fa0/4", "Fa0/5", "Fa0/6", "Fa0/7", "Fa0/8"]);
    expect(new Set(sw.ports.map((p) => p.mac)).size).toBe(8);
  });

  test("uno switch a 24 porte ha 24 porte", () => {
    const sim = emptyNetwork();
    sim.dispatch(addSwitch(24));

    expect(sim.network.devices[0].ports).toHaveLength(24);
    expect(sim.network.devices[0].ports.at(-1)!.name).toBe("Fa0/24");
  });

  test("in una rete esistente nomi, identificativi e MAC non coincidono con quelli già presenti", () => {
    const { sim } = buildLan(); // ha già d1, d2, d3, PC1, PC2, PC3 e i loro MAC

    sim.dispatch(addHost());

    const added = sim.network.devices.at(-1)!;
    const macs = sim.network.devices.flatMap((d) => d.ports.map((p) => p.mac));
    expect([added.id, added.name]).toEqual(["d4", "PC4"]);
    expect(new Set(macs).size).toBe(macs.length);
  });

  test("un nome liberato da un dispositivo eliminato viene riusato", () => {
    const sim = emptyNetwork();
    sim.dispatch(addHost());
    sim.dispatch(addHost());
    sim.dispatch(removeDevice("d1"));

    sim.dispatch(addHost());

    expect(sim.network.devices.map((d) => d.name)).toEqual(["PC2", "PC1"]);
  });

  test("uno switch senza porte viene rifiutato", () => {
    expect(() => emptyNetwork().dispatch(addSwitch(0))).toThrow("Numero di porte non valido");
  });
});

describe("collegare", () => {
  // Due PC e uno switch appena posati, senza cavi.
  function loose(): Simulator {
    const sim = emptyNetwork();
    sim.dispatch(addHost());
    sim.dispatch(addHost());
    sim.dispatch(addSwitch(8));
    return sim;
  }

  test("un cavo nuovo è collegato, e i dispositivi sentono subito il segnale", () => {
    const sim = loose();

    const traces = sim.dispatch(addLink({ deviceId: "d1", portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/1" }));

    expect(traces).toEqual([{ time: 0, kind: "link-added", linkId: "l1" }]);
    expect(sim.network.links[0]).toMatchObject({ id: "l1", connected: true });
    expect(hostsOf(sim.network)[0].linkUp).toBe(true);
    expect(hostsOf(sim.network)[1].linkUp).toBe(false);
  });

  test("una porta occupata non accetta un secondo cavo", () => {
    const sim = loose();
    sim.dispatch(addLink({ deviceId: "d1", portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/1" }));

    expect(() =>
      sim.dispatch(addLink({ deviceId: "d2", portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/1" })),
    ).toThrow("La porta Fa0/1 di SW1 è già occupata");
    expect(sim.network.links).toHaveLength(1);
  });

  test("una porta che non esiste, o un cavo da una porta a se stessa, vengono rifiutati", () => {
    const sim = loose();

    expect(() =>
      sim.dispatch(addLink({ deviceId: "d1", portName: "Fa9" }, { deviceId: "s1", portName: "Fa0/1" })),
    ).toThrow("PC1 non ha una porta Fa9");
    expect(() =>
      sim.dispatch(addLink({ deviceId: "d1", portName: "Fa0" }, { deviceId: "d1", portName: "Fa0" })),
    ).toThrow("non può unire una porta a se stessa");
  });

  test("le porte libere di un dispositivo escludono quelle con un cavo", () => {
    const sim = loose();
    sim.dispatch(addLink({ deviceId: "d1", portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/2" }));

    expect(freePortsOf(sim.network, "d1")).toEqual([]);
    expect(freePortsOf(sim.network, "s1").slice(0, 3)).toEqual(["Fa0/1", "Fa0/3", "Fa0/4"]);
  });

  test("un capo si può spostare su un'altra porta libera dello stesso dispositivo", () => {
    const sim = loose();
    sim.dispatch(addLink({ deviceId: "d1", portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/1" }));

    sim.dispatch(moveLinkEnd("l1", "b", "Fa0/5"));

    expect(sim.network.links[0].b).toEqual({ deviceId: "s1", portName: "Fa0/5" });
    expect(freePortsOf(sim.network, "s1")).toContain("Fa0/1");
  });

  test("una rete costruita da zero funziona: il ping arriva", () => {
    const sim = loose();
    sim.dispatch(addLink({ deviceId: "d1", portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/1" }));
    sim.dispatch(addLink({ deviceId: "d2", portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/2" }));
    sim.dispatch(configureHost("d1", { ip: "10.0.0.1", mask: "255.0.0.0", gateway: null }));
    sim.dispatch(configureHost("d2", { ip: "10.0.0.2", mask: "255.0.0.0", gateway: null }));

    sim.dispatch(ping("d1", "10.0.0.2", 1));
    run(sim);

    expect(results(sim)).toEqual(["reply"]);
  });
});

describe("togliere", () => {
  test("togliere un cavo toglie il segnale e fa dimenticare i MAC allo switch", () => {
    const { sim, sw, pc2 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    const traces = sim.dispatch(removeLink("l2"));

    expect(sim.network.links.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(pc2.linkUp).toBe(false);
    expect([...sw.macTable.keys()]).toEqual([PC1_MAC]);
    expect(traces).toContainEqual({ time: 8, kind: "link-removed", linkId: "l2", between: ["PC2", "SW1"] });
  });

  test("i frame in viaggio su un cavo tolto vanno persi", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));

    const traces = sim.dispatch(removeLink("l1"));

    expect(traces.map((t) => t.kind)).toContain("frame-lost");
    expect(sim.queue.filter((e) => e.kind === "frame-arrival")).toEqual([]);
  });

  test("togliere un dispositivo toglie anche i suoi cavi", () => {
    const { sim, sw } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    const traces = sim.dispatch(removeDevice("d2"));

    expect(sim.network.devices.map((d) => d.name)).toEqual(["SW1", "PC1", "PC3"]);
    expect(sim.network.links.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(sw.macTable.has(PC2_MAC)).toBe(false);
    expect(traces).toContainEqual({ time: 8, kind: "link-removed", linkId: "l2", between: ["PC2", "SW1"] });
    expect(traces).toContainEqual({ time: 8, kind: "device-removed", deviceId: "d2", name: "PC2" });
  });

  test("togliere un dispositivo che stava facendo ping non lascia nulla in sospeso", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP));

    sim.dispatch(removeDevice("d1"));
    run(sim);

    expect(sim.queue).toEqual([]);
    expect(results(sim)).toEqual([]);
  });

  test("togliere lo switch lascia i PC senza cavi e senza segnale", () => {
    const { sim, pc1, pc2, pc3 } = buildLan();

    sim.dispatch(removeDevice("s1"));

    expect(sim.network.links).toEqual([]);
    expect([pc1.linkUp, pc2.linkUp, pc3.linkUp]).toEqual([false, false, false]);
  });

  test("ciò che non esiste non si può togliere", () => {
    const { sim } = buildLan();

    expect(() => sim.dispatch(removeDevice("d99"))).toThrow("Dispositivo inesistente");
    expect(() => sim.dispatch(removeLink("l99"))).toThrow("Collegamento inesistente");
  });
});

describe("rinominare", () => {
  test("il nome nuovo sostituisce il vecchio, senza gli spazi ai lati", () => {
    const { sim, pc1 } = buildLan();

    const traces = sim.dispatch(renameDevice("d1", "  Segreteria "));

    expect(pc1.name).toBe("Segreteria");
    expect(traces).toEqual([{ time: 0, kind: "device-renamed", deviceId: "d1", from: "PC1" }]);
  });

  test("un nome vuoto, o già usato da un altro dispositivo, viene rifiutato", () => {
    const { sim, pc1 } = buildLan();

    expect(() => sim.dispatch(renameDevice("d1", "   "))).toThrow("non può essere vuoto");
    expect(() => sim.dispatch(renameDevice("d1", "pc2"))).toThrow("Esiste già un dispositivo di nome pc2");
    expect(pc1.name).toBe("PC1");
  });

  test("rinominare non rompe i collegamenti", () => {
    const { sim } = buildLan();
    sim.dispatch(renameDevice("d2", "Server"));

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim)).toEqual(["reply"]);
  });
});

describe("configurare un host", () => {
  test("indirizzo, maschera e gateway cambiano insieme", () => {
    const { sim, pc1 } = buildLan();

    const traces = sim.dispatch(configureHost("d1", { ip: "10.0.0.5", mask: "255.0.0.0", gateway: "10.0.0.1" }));

    expect([pc1.ip, pc1.mask, pc1.gateway]).toEqual(["10.0.0.5", "255.0.0.0", "10.0.0.1"]);
    expect(traces).toEqual([{ time: 0, kind: "host-configured", deviceId: "d1" }]);
  });

  test("una configurazione non accettabile viene rifiutata, e l'host resta com'era", () => {
    const { sim, pc1 } = buildLan();

    expect(() =>
      sim.dispatch(configureHost("d1", { ip: "192.168.1.255", mask: "255.255.255.0", gateway: null })),
    ).toThrow("PC1: l'indirizzo 192.168.1.255 è l'indirizzo di broadcast della sottorete.");
    expect(pc1.ip).toBe("192.168.1.10");
  });

  test("un host si può riportare a non configurato", () => {
    const { sim, pc1 } = buildLan();

    sim.dispatch(configureHost("d1", { ip: null, mask: null, gateway: null }));

    expect([pc1.ip, pc1.mask]).toEqual([null, null]);
  });

  test("uno switch non ha una configurazione IP", () => {
    const { sim } = buildLan();

    expect(() => sim.dispatch(configureHost("s1", { ip: "10.0.0.1", mask: "255.0.0.0", gateway: null }))).toThrow(
      "SW1 non è un host",
    );
  });

  test("cambiando indirizzo l'host dimentica la tabella ARP e ciò che stava aspettando", () => {
    const { sim, pc1 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);
    sim.dispatch(ping("d1", "192.168.1.99")); // lascia un'attesa in corso

    sim.dispatch(configureHost("d1", { ip: "192.168.1.50", mask: "255.255.255.0", gateway: null }));

    expect(pc1.arpTable.size).toBe(0);
    expect(pc1.pendingPackets).toEqual([]);
    expect(sim.queue.filter((e) => e.kind === "timer")).toEqual([]);
    expect(pc1.linkUp).toBe(true); // il cavo c'è ancora
  });

  test("gli altri host ricordano ancora il vecchio indirizzo: il loro ping si perde", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim); // PC1 ha in tabella ARP l'indirizzo di PC2

    sim.dispatch(configureHost("d2", { ip: "192.168.1.77", mask: "255.255.255.0", gateway: null }));
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(results(sim)).toEqual(["reply", "timeout"]); // l'echo arriva a PC2, che non ha più quell'indirizzo
  });

  test("dopo una modifica le azioni restano rifiutate a simulazione sospesa", () => {
    const { sim } = buildLan();
    sim.suspended = true;

    expect(() => sim.dispatch(addHost())).toThrow("La simulazione è sospesa");
  });
});
