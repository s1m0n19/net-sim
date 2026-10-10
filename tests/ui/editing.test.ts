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

describe("foglio vuoto", () => {
  test("all'inizio la rete è vuota, e si può già posare", () => {
    expect(session.isEmpty()).toBe(true);

    session.addDevice(PC, { x: 120, y: 200 });

    expect(session.isEmpty()).toBe(false);
    expect(names()).toEqual(["PC1"]);
  });
});

describe("posare dispositivi", () => {
  test("il dispositivo nasce nel punto indicato, e viene selezionato", () => {
    session.addDevice(PC, { x: 120.4, y: 199.6 });

    const pc = session.view.devices[0];
    expect([pc.x, pc.y]).toEqual([120, 200]); // coordinate intere
    expect(session.selection).toEqual({ kind: "device", id: pc.id });
  });

  test("un PC nuovo non è configurato e non sente il segnale", () => {
    session.addDevice(PC, { x: 100, y: 100 });

    expect(session.view.devices[0]).toMatchObject({ kind: "host", ipLabel: null, linkUp: false, powered: true });
  });

  test("uno switch nuovo ha le porte della variante scelta", () => {
    session.addDevice(SWITCH_8, { x: 300, y: 200 });
    session.addDevice({ kind: "switch", portCount: 24 }, { x: 500, y: 200 });

    expect(session.view.devices.map((d) => [d.name, d.portCount])).toEqual([
      ["SW1", 8],
      ["SW2", 24],
    ]);
  });

  test("posarne molti di fila dà loro nomi in sequenza", () => {
    for (let i = 0; i < 4; i++) session.addDevice(PC, { x: 100 + i * 100, y: 100 });

    expect(names()).toEqual(["PC1", "PC2", "PC3", "PC4"]);
  });

  test("posare un dispositivo compare nell'elenco degli eventi", () => {
    session.addDevice(PC, { x: 100, y: 100 });

    expect(session.view.events.map((e) => [e.deviceName, e.text])).toEqual([["PC1", "viene aggiunto alla rete"]]);
  });
});

describe("inquadratura", () => {
  test("finché la rete sta nel foglio, posare un dispositivo non la cambia", () => {
    const before = session.view.bounds;

    session.addDevice(PC, { x: 300, y: 200 });

    expect(session.view.bounds).toEqual(before);
  });

  test("un dispositivo posato fuori dal foglio lo allarga", () => {
    const before = session.view.bounds;

    session.addDevice(PC, { x: 1200, y: 200 });

    expect(session.view.bounds.width).toBeGreaterThan(before.width);
  });

  test("durante un trascinamento resta ferma, poi si riadatta", () => {
    session.addDevice(PC, { x: 300, y: 200 });
    const id = session.view.devices[0].id;
    session.holdBounds(true);
    const held = session.frozenBounds;

    session.moveDevice(id, { x: 1500, y: 200 });
    expect(session.frozenBounds).toEqual(held);

    session.holdBounds(false);
    expect(session.frozenBounds).toBeNull();
    expect(session.view.bounds.width).toBeGreaterThan(held!.width);
  });
});

describe("spostare", () => {
  test("il dispositivo cambia posizione, e i suoi cavi lo seguono", () => {
    session.open("lan-switch.netsim.json", lanFile);

    session.moveDevice("d1", { x: 150, y: 300 });

    const pc1 = session.view.devices.find((d) => d.id === "d1")!;
    const cable = session.view.links.find((l) => l.id === "l1")!;
    expect([pc1.x, pc1.y]).toEqual([150, 300]);
    expect(cable.from).toEqual({ x: 150, y: 300 });
  });

  test("spostare non tocca la simulazione", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.ping("d1", "192.168.1.11", 1);
    const events = session.view.events.length;

    session.moveDevice("d1", { x: 150, y: 300 });

    expect(session.view.events.length).toBe(events);
    expect(session.view.packets).toHaveLength(1);
  });
});

describe("eliminare", () => {
  beforeEach(() => {
    session.open("lan-switch.netsim.json", lanFile);
  });

  test("senza selezione non succede nulla", () => {
    session.removeSelection();

    expect(names()).toEqual(["SW1", "PC1", "PC2", "PC3"]);
  });

  test("un dispositivo sparisce con i suoi cavi, e la selezione si toglie", () => {
    session.select({ kind: "device", id: "d2" });

    session.removeSelection();

    expect(names()).toEqual(["SW1", "PC1", "PC3"]);
    expect(session.view.links.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(session.selection).toBeNull();
  });

  test("con lui spariscono la sua tabella appuntata e il suo terminale", () => {
    session.togglePin("d2");
    session.openTerminal("d2");
    session.select({ kind: "device", id: "d2" });

    session.removeSelection();

    expect(session.pins).toEqual([]);
    expect(session.terminals).toEqual([]);
    expect(session.activeTab).toBe("events");
  });

  test("un cavo sparisce, e i dispositivi restano", () => {
    session.select({ kind: "link", id: "l2" });

    session.removeSelection();

    expect(session.view.links.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(names()).toEqual(["SW1", "PC1", "PC2", "PC3"]);
    expect(session.view.devices.find((d) => d.id === "d2")!.linkUp).toBe(false);
  });

  test("l'elenco degli eventi continua a funzionare dopo un'eliminazione", () => {
    session.ping("d1", "192.168.1.11", 1);
    while (session.view.nextEvent !== null) session.step();
    session.select({ kind: "device", id: "d2" });

    session.removeSelection();

    const texts = session.view.events.map((e) => e.text);
    expect(texts).toContain("PC2 viene tolto dalla rete");
    expect(texts).toContain("cavo tra PC2 e SW1 tolto");
    // Le righe vecchie che parlavano di PC2 non rimandano più a un dispositivo.
    expect(session.view.events.every((e) => e.deviceId !== "d2")).toBe(true);
  });

  test("a simulazione sospesa l'eliminazione viene rifiutata, e lo dice", () => {
    session.select({ kind: "device", id: "d2" });
    session.togglePin("d2");
    // Si sospende la simulazione dall'interno, come farebbe una tempesta.
    (session as any).simulator.suspended = true;

    session.removeSelection();

    expect(session.notice).toContain("La simulazione è sospesa");
    expect(names()).toContain("PC2");
    expect(session.selection).toEqual({ kind: "device", id: "d2" });
    expect(session.isPinned("d2")).toBe(true);
    expect(session.view.devices.find((d) => d.id === "d2")).toMatchObject({ x: 600, y: 60 });
  });
});
