import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";
import { loadNetworkFile } from "../../src/storage/load";

const PC = { kind: "host" } as const;

beforeEach(() => {
  session.clear();
});

describe("modifiche non salvate", () => {
  test("un foglio vuoto e un file appena aperto non hanno modifiche", () => {
    expect(session.dirty).toBe(false);

    session.open("lan-switch.netsim.json", lanFile);

    expect(session.dirty).toBe(false);
  });

  test("una modifica alla rete, uno spostamento o un guasto la segnano come modificata", () => {
    session.open("lan-switch.netsim.json", lanFile);

    session.moveDevice("d1", { x: 10, y: 10 });
    expect(session.dirty).toBe(true);

    session.open("lan-switch.netsim.json", lanFile);
    session.togglePower("s1");
    expect(session.dirty).toBe(true);

    session.open("lan-switch.netsim.json", lanFile);
    session.rename("d1", "Aula");
    expect(session.dirty).toBe(true);
  });

  test("il traffico non è una modifica: tabelle e pacchetti non stanno nel file", () => {
    session.open("lan-switch.netsim.json", lanFile);

    session.ping("d1", "192.168.1.11", 1);
    while (session.view.nextEvent !== null) session.step();
    session.restart();

    expect(session.dirty).toBe(false);
  });

  test("annullare l'unica modifica riporta la rete a salvata", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.addDevice(PC, { x: 700, y: 400 });

    session.undo();

    expect(session.dirty).toBe(false);
  });
});

describe("salvare", () => {
  test("il testo da salvare, riaperto, dà la rete che si vede", () => {
    session.addDevice(PC, { x: 100, y: 120 });
    session.addDevice(PC, { x: 400, y: 120 });
    const [a, b] = session.view.devices.map((d) => d.id);
    session.connect(a, b);
    session.configure(a, "ip", "192.168.1.10");

    const { network, positions } = loadNetworkFile(session.serialize());

    expect(network.devices.map((d) => d.name)).toEqual(["PC1", "PC2"]);
    expect(network.devices[0]).toMatchObject({ ip: "192.168.1.10", mask: "255.255.255.0" });
    expect(network.links).toHaveLength(1);
    expect(positions.get(a)).toEqual({ x: 100, y: 120 });
  });

  test("dopo il salvataggio la rete prende il nome del file e non ha più modifiche", () => {
    session.addDevice(PC, { x: 100, y: 120 });
    const text = session.serialize();

    session.markSaved("laboratorio.netsim.json", text);

    expect(session.fileName).toBe("laboratorio");
    expect(session.dirty).toBe(false);
  });

  test("una modifica fatta mentre il file veniva scritto resta da salvare", () => {
    session.addDevice(PC, { x: 100, y: 120 });
    const text = session.serialize();
    session.addDevice(PC, { x: 300, y: 120 });

    session.markSaved("laboratorio.netsim.json", text);

    expect(session.dirty).toBe(true);
  });

  test("salvare non tocca cronologia, selezione né simulazione", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.addDevice(PC, { x: 700, y: 400 });
    session.ping("d1", "192.168.1.11", 1);

    session.markSaved("lan.netsim.json", session.serialize());

    expect(session.canUndo).toBe(true);
    expect(session.view.packets).toHaveLength(1);
  });
});
