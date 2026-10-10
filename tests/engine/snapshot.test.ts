import { describe, expect, test } from "vitest";
import {
  addHost,
  addLink,
  configureHost,
  disconnectLink,
  moveLinkEnd,
  ping,
  powerOff,
  removeDevice,
  removeLink,
  renameDevice,
  restoreConfiguration,
  type Action,
} from "../../src/engine/actions";
import type { Simulator } from "../../src/engine/simulator";
import { stepsToRestore, takeSnapshot } from "../../src/engine/snapshot";
import { PC2_IP, PC2_MAC, buildLan } from "./builders";

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

// Fotografa la rete, fa una modifica, e torna alla fotografia: la storia
// di ogni "annulla".
function changeAndUndo(sim: Simulator, action: Action) {
  const before = takeSnapshot(sim.network);
  sim.dispatch(action);
  const traces = sim.dispatch(restoreConfiguration(before));
  return { before, traces };
}

describe("fotografia della configurazione", () => {
  test("contiene dispositivi e cavi, senza stato di esecuzione", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    const snapshot = takeSnapshot(sim.network);

    expect(snapshot.devices.map((d) => d.name)).toEqual(sim.network.devices.map((d) => d.name));
    expect(snapshot.links).toEqual(sim.network.links);
    expect(snapshot.devices.every((d) => !("arpTable" in d) && !("macTable" in d))).toBe(true);
  });

  test("è una copia: le modifiche successive non la toccano", () => {
    const { sim } = buildLan();
    const snapshot = takeSnapshot(sim.network);

    sim.dispatch(renameDevice("d1", "Aula"));
    sim.dispatch(moveLinkEnd("l1", "b", "Fa0/4"));

    expect(snapshot.devices.find((d) => d.id === "d1")!.name).toBe("PC1");
    expect(snapshot.links.find((l) => l.id === "l1")!.b.portName).not.toBe("Fa0/4");
  });

  test("per tornare a una rete uguale non serve nessun passo", () => {
    const { sim } = buildLan();

    expect(stepsToRestore(sim.network, takeSnapshot(sim.network))).toEqual([]);
  });
});

describe("tornare a una fotografia", () => {
  test("un dispositivo aggiunto viene tolto", () => {
    const { sim } = buildLan();

    const { before, traces } = changeAndUndo(sim, addHost());

    expect(takeSnapshot(sim.network)).toEqual(before);
    expect(traces.map((t) => t.kind)).toEqual(["device-removed"]);
  });

  test("un dispositivo tolto torna con il suo nome, i suoi indirizzi e i suoi cavi", () => {
    const { sim } = buildLan();

    const { before, traces } = changeAndUndo(sim, removeDevice("d2"));

    expect(takeSnapshot(sim.network)).toEqual(before);
    expect(traces.map((t) => t.kind)).toEqual(["device-added", "link-added"]);
    const pc2 = sim.network.devices.find((d) => d.id === "d2")!;
    expect(pc2).toMatchObject({ name: "PC2", ip: PC2_IP, linkUp: true });
    expect(pc2.ports[0].mac).toBe(PC2_MAC);
  });

  test("il dispositivo che torna è appena acceso: non ricorda nulla", () => {
    const { sim, pc2 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);
    expect(pc2.arpTable.size).toBe(1);

    changeAndUndo(sim, removeDevice("d2"));

    const back = sim.network.devices.find((d) => d.id === "d2")!;
    expect(back.kind === "host" && back.arpTable.size).toBe(0);
  });

  test("chi non è stato toccato tiene le sue tabelle", () => {
    const { sim, sw, pc1 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    changeAndUndo(sim, addHost());

    expect(pc1.arpTable.size).toBe(1);
    expect(sw.macTable.size).toBe(2);
  });

  test("un cavo tolto torna, uno aggiunto sparisce, uno spostato torna alla sua porta", () => {
    const { sim } = buildLan();
    const original = takeSnapshot(sim.network);

    changeAndUndo(sim, removeLink("l2"));
    expect(takeSnapshot(sim.network)).toEqual(original);

    sim.dispatch(addHost());
    const withHost = takeSnapshot(sim.network);
    const newHost = sim.network.devices.at(-1)!;
    changeAndUndo(sim, addLink({ deviceId: newHost.id, portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/4" }));
    expect(takeSnapshot(sim.network)).toEqual(withHost);

    const { traces } = changeAndUndo(sim, moveLinkEnd("l1", "b", "Fa0/4"));
    expect(takeSnapshot(sim.network)).toEqual(withHost);
    expect(traces).toEqual([]); // spostare un capo non lascia righe, nemmeno al ritorno
  });

  test("nome e configurazione IP tornano quelli di prima", () => {
    const { sim } = buildLan();
    const original = takeSnapshot(sim.network);

    changeAndUndo(sim, renameDevice("d1", "Aula"));
    changeAndUndo(sim, configureHost("d1", { ip: "10.0.0.1", mask: "255.0.0.0", gateway: null }));

    expect(takeSnapshot(sim.network)).toEqual(original);
  });

  test("tornare a una configurazione IP diversa svuota la tabella ARP di quell'host", () => {
    const { sim, pc1, pc2 } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    changeAndUndo(sim, configureHost("d1", { ip: "10.0.0.1", mask: "255.0.0.0", gateway: null }));

    expect(pc1.arpTable.size).toBe(0);
    expect(pc2.arpTable.size).toBe(1); // gli altri tengono la riga vecchia
  });

  test("i guasti non sono modifiche: restano come sono adesso", () => {
    const { sim, sw } = buildLan();
    const before = takeSnapshot(sim.network);
    sim.dispatch(powerOff("s1"));
    sim.dispatch(disconnectLink("l1"));
    sim.dispatch(addHost());

    sim.dispatch(restoreConfiguration(before));

    expect(sw.powered).toBe(false);
    expect(sim.network.links.find((l) => l.id === "l1")!.connected).toBe(false);
    expect(sim.network.devices).toHaveLength(before.devices.length);
  });

  test("ciò che torna, invece, torna acceso o spento com'era", () => {
    const { sim } = buildLan();
    sim.dispatch(powerOff("d2"));

    changeAndUndo(sim, removeDevice("d2"));

    expect(sim.network.devices.find((d) => d.id === "d2")!.powered).toBe(false);
  });

  test("un frame in viaggio verso un dispositivo che sparisce va perso", () => {
    const { sim } = buildLan();
    const before = takeSnapshot(sim.network);
    sim.dispatch(addHost());
    const added = sim.network.devices.at(-1)!;
    sim.dispatch(addLink({ deviceId: added.id, portName: "Fa0" }, { deviceId: "s1", portName: "Fa0/4" }));
    sim.dispatch(ping("d1", PC2_IP, 1));
    sim.step(); // la richiesta ARP arriva allo switch, che la manda a tutti

    sim.dispatch(restoreConfiguration(before));
    run(sim);

    expect(sim.queue).toEqual([]);
    expect(sim.traces.filter((t) => t.kind === "ping-result").map((r) => r.outcome)).toEqual(["reply"]);
  });

  test("dispositivi e cavi tornano nell'ordine che avevano", () => {
    const { sim } = buildLan();
    const before = takeSnapshot(sim.network);

    sim.dispatch(removeDevice("s1"));
    sim.dispatch(restoreConfiguration(before));

    expect(sim.network.devices.map((d) => d.id)).toEqual(before.devices.map((d) => d.id));
    expect(sim.network.links.map((l) => l.id)).toEqual(before.links.map((l) => l.id));
  });

  test("a simulazione sospesa viene rifiutato", () => {
    const { sim } = buildLan();
    const before = takeSnapshot(sim.network);
    sim.suspended = true;

    expect(() => sim.dispatch(restoreConfiguration(before))).toThrow("sospesa");
  });
});
