import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";

beforeEach(() => {
  session.open("lan-switch.netsim.json", lanFile);
});

describe("tabelle appuntate", () => {
  test("all'apertura di una rete non ce ne sono", () => {
    expect(session.pins).toEqual([]);
    expect(session.isPinned("s1")).toBe(false);
  });

  test("appuntare una tabella la mette sotto il suo dispositivo", () => {
    session.togglePin("s1");

    expect(session.isPinned("s1")).toBe(true);
    expect(session.pins).toHaveLength(1);
    expect(session.pins[0].deviceId).toBe("s1");
    expect(session.pins[0].dy).toBeGreaterThan(0);
  });

  test("sotto un host parte più in basso, per lasciare spazio alle etichette", () => {
    session.togglePin("s1");
    session.togglePin("d1");

    expect(session.pins[1].dy).toBeGreaterThan(session.pins[0].dy);
  });

  test("appuntarla una seconda volta la toglie", () => {
    session.togglePin("s1");
    session.togglePin("s1");

    expect(session.pins).toEqual([]);
  });

  test("ogni dispositivo ha la sua, indipendente dalle altre", () => {
    session.togglePin("s1");
    session.togglePin("d1");
    session.togglePin("s1");

    expect(session.pins.map((pin) => pin.deviceId)).toEqual(["d1"]);
  });

  test("si può spostare", () => {
    session.togglePin("s1");

    session.movePin("s1", 40, -120);

    expect(session.pins[0]).toMatchObject({ dx: 40, dy: -120 });
  });

  test("ricominciare la simulazione le lascia dove sono", () => {
    session.togglePin("s1");
    session.movePin("s1", 40, -120);

    session.restart();

    expect(session.pins).toEqual([{ deviceId: "s1", table: "mac", dx: 40, dy: -120 }]);
  });

  test("aprire un'altra rete, o tornare al foglio vuoto, le toglie", () => {
    session.togglePin("s1");
    session.open("lan-switch.netsim.json", lanFile);
    expect(session.pins).toEqual([]);

    session.togglePin("s1");
    session.clear();
    expect(session.pins).toEqual([]);
  });

  test("un dispositivo che non esiste non si può appuntare", () => {
    session.togglePin("d99");

    expect(session.pins).toEqual([]);
  });
});
