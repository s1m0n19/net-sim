import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";

const PC = { kind: "host" } as const;
const SWITCH_8 = { kind: "switch", portCount: 8 } as const;

function names(): string[] {
  return session.view.devices.map((device) => device.name);
}

beforeEach(() => {
  session.clear();
});

describe("annulla e ripristina", () => {
  test("all'inizio non c'è nulla da annullare né da ripristinare", () => {
    expect([session.canUndo, session.canRedo]).toEqual([false, false]);

    session.undo();
    session.redo();

    expect(session.isEmpty()).toBe(true);
  });

  test("annullare toglie l'ultimo dispositivo posato, ripristinare lo rimette dov'era", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.addDevice(SWITCH_8, { x: 300, y: 120 });

    session.undo();
    expect(names()).toEqual(["PC1"]);
    expect([session.canUndo, session.canRedo]).toEqual([true, true]);

    session.redo();
    expect(session.view.devices.map((d) => [d.name, d.x, d.y])).toEqual([
      ["PC1", 100, 100],
      ["SW1", 300, 120],
    ]);
    expect(session.canRedo).toBe(false);
  });

  test("si torna indietro una modifica alla volta, fino al foglio vuoto", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.addDevice(SWITCH_8, { x: 300, y: 100 });
    const [pc, sw] = session.view.devices.map((d) => d.id);
    session.connect(pc, sw);
    session.configure(pc, "ip", "192.168.1.10");
    session.rename(pc, "Aula");

    session.undo();
    expect(names()).toEqual(["PC1", "SW1"]);
    session.undo();
    expect(session.view.devices[0].ip).toBeNull();
    session.undo();
    expect(session.view.links).toEqual([]);
    session.undo();
    session.undo();

    expect(session.isEmpty()).toBe(true);
    expect(session.canUndo).toBe(false);
  });

  test("una modifica nuova cancella ciò che si poteva ripristinare", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.undo();

    session.addDevice(SWITCH_8, { x: 300, y: 100 });

    expect(session.canRedo).toBe(false);
  });

  test("un dispositivo eliminato torna con i suoi cavi e al suo posto", () => {
    session.open("lan-switch.netsim.json", lanFile);
    const before = session.view.devices.find((d) => d.id === "d2")!;
    session.select({ kind: "device", id: "d2" });
    session.removeSelection();

    session.undo();

    expect(session.view.devices.find((d) => d.id === "d2")).toMatchObject({ name: "PC2", x: before.x, y: before.y });
    expect(session.view.links.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
  });

  test("un trascinamento è una sola modifica, per quanti movimenti contenga", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    const id = session.view.devices[0].id;

    session.holdBounds(true);
    session.moveDevice(id, { x: 150, y: 150 });
    session.moveDevice(id, { x: 400, y: 300 });
    session.holdBounds(false);
    session.undo();

    expect(session.view.devices[0]).toMatchObject({ x: 100, y: 100 });
    expect(names()).toEqual(["PC1"]);
  });

  test("anche il cambio di porta si annulla", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.addDevice(SWITCH_8, { x: 300, y: 100 });
    const [pc, sw] = session.view.devices.map((d) => d.id);
    session.connect(pc, sw);
    session.changePort(session.view.links[0].id, "b", "Fa0/5");

    session.undo();

    expect(session.view.links[0].toPort).toBe("Fa0/1");
  });

  test("ciò che viene rifiutato non entra nella cronologia", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    const id = session.view.devices[0].id;

    session.rename(id, "   ");
    session.configure(id, "ip", "999.1.1.1");
    session.connect(id, id);
    session.undo();

    expect(session.isEmpty()).toBe(true);
  });

  test("guasti e traffico non sono modifiche: annullare li salta", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.addDevice(PC, { x: 700, y: 400 });
    session.togglePower("s1");
    session.toggleLink("l1");
    session.ping("d2", "192.168.1.12", 1);

    session.undo();

    expect(names()).toEqual(["SW1", "PC1", "PC2", "PC3"]);
    expect(session.view.devices.find((d) => d.id === "s1")!.powered).toBe(false);
    expect(session.view.links.find((l) => l.id === "l1")!.connected).toBe(false);
  });

  test("annullare non riavvia la simulazione: le tabelle degli altri restano", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.ping("d1", "192.168.1.11", 1);
    while (session.view.nextEvent !== null) session.step();
    session.addDevice(PC, { x: 700, y: 400 });

    session.undo();

    expect(session.view.devices.find((d) => d.id === "d1")!.arpRows).toHaveLength(1);
    expect(session.view.devices.find((d) => d.id === "s1")!.macRows).toHaveLength(2);
  });

  test("con il dispositivo spariscono selezione, tabella appuntata e terminale", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    const id = session.view.devices[0].id;
    session.togglePin(id);
    session.openTerminal(id);

    session.undo();

    expect(session.selection).toBeNull();
    expect(session.pins).toEqual([]);
    expect(session.terminals).toEqual([]);
  });

  test("aprire un file o cominciare una rete nuova svuota la cronologia", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.open("lan-switch.netsim.json", lanFile);
    expect(session.canUndo).toBe(false);

    session.addDevice(PC, { x: 700, y: 400 });
    session.clear();
    expect(session.canUndo).toBe(false);
  });

  test("Ricomincia non tocca la cronologia", () => {
    session.addDevice(PC, { x: 100, y: 100 });

    session.restart();
    session.undo();

    expect(session.isEmpty()).toBe(true);
  });

  test("a simulazione sospesa viene rifiutato, e la cronologia resta com'è", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    (session as any).simulator.suspended = true;

    session.undo();

    expect(session.notice).toContain("La simulazione è sospesa");
    expect(names()).toEqual(["PC1"]);
    expect(session.canUndo).toBe(true);
  });
});

describe("router", () => {
  test("un router si posa, si collega e si annulla come gli altri dispositivi", () => {
    session.clear();
    session.addDevice({ kind: "router", interfaceCount: 4 }, { x: 300, y: 200 });
    session.addDevice({ kind: "host" }, { x: 100, y: 200 });
    const [router, pc] = session.view.devices;
    expect(router).toMatchObject({ kind: "router", name: "R1", portCount: 4 });
    expect(router.interfaces.every((port) => !port.enabled && port.ipLabel === null)).toBe(true);

    session.connect(pc.id, router.id);
    const cable = session.view.links[0];
    expect(cable.toPort).toBe("Gi0/0");
    expect(cable.signal).toBe(false); // l'interfaccia nasce spenta

    session.undo();
    session.undo();
    session.undo();
    expect(session.isEmpty()).toBe(true);
  });
});
