import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";
import { fitted, MAX_WIDTH, MIN_WIDTH, panned, zoomed } from "../../src/ui/topology/camera";

const SHEET = { x: 0, y: 0, width: 800, height: 500 };

// Dove finisce sullo schermo un punto del disegno, come frazione
// dell'inquadratura: se non cambia, il punto è rimasto fermo.
function onScreen(box: typeof SHEET, point: { x: number; y: number }) {
  return { x: (point.x - box.x) / box.width, y: (point.y - box.y) / box.height };
}

describe("ingrandire", () => {
  test("il punto sotto il puntatore resta dov'è", () => {
    const pointer = { x: 600, y: 100 };

    const closer = zoomed(SHEET, 2, pointer);

    expect(closer.width).toBe(400);
    expect(closer.height).toBe(250);
    expect(onScreen(closer, pointer)).toEqual(onScreen(SHEET, pointer));
  });

  test("rimpicciolire dello stesso fattore riporta all'inquadratura di prima", () => {
    const pointer = { x: 123, y: 456 };

    const back = zoomed(zoomed(SHEET, 1.6, pointer), 1 / 1.6, pointer);

    expect(back.x).toBeCloseTo(SHEET.x);
    expect(back.y).toBeCloseTo(SHEET.y);
    expect(back.width).toBeCloseTo(SHEET.width);
  });

  test("le proporzioni non cambiano", () => {
    const closer = zoomed(SHEET, 3, { x: 0, y: 0 });

    expect(closer.width / closer.height).toBeCloseTo(SHEET.width / SHEET.height);
  });

  test("oltre i limiti non si va, né da vicino né da lontano", () => {
    const centre = { x: 400, y: 250 };

    expect(zoomed(SHEET, 1000, centre).width).toBe(MIN_WIDTH);
    expect(zoomed(SHEET, 0.001, centre).width).toBe(MAX_WIDTH);
    // Al limite, insistere non sposta più nulla.
    const closest = zoomed(SHEET, 1000, centre);
    expect(zoomed(closest, 2, { x: 0, y: 0 })).toEqual(closest);
  });
});

describe("spostare la vista", () => {
  test("l'inquadratura si sposta e resta grande uguale", () => {
    expect(panned(SHEET, 50, -20)).toEqual({ x: 50, y: -20, width: 800, height: 500 });
  });
});

describe("Adatta", () => {
  test("senza dispositivi non c'è nulla da inquadrare", () => {
    expect(fitted([])).toBeNull();
  });

  test("tutti i dispositivi stanno dentro, con il margine per le etichette", () => {
    const devices = [
      { x: 0, y: 0 },
      { x: 2000, y: 900 },
    ];

    const box = fitted(devices)!;

    for (const device of devices) {
      expect(device.x - 60).toBeGreaterThan(box.x);
      expect(device.x + 60).toBeLessThan(box.x + box.width);
      expect(device.y - 40).toBeGreaterThan(box.y);
      expect(device.y + 90).toBeLessThan(box.y + box.height);
    }
  });

  test("un dispositivo solo non riempie lo schermo: resta al centro di un riquadro minimo", () => {
    const box = fitted([{ x: 300, y: 200 }])!;

    expect(box.width).toBe(560);
    expect(box.x + box.width / 2).toBe(300);
  });

  test("anche le tabelle appuntate stanno dentro", () => {
    const table = { x: 900, y: 700, width: 200, height: 80 };

    const box = fitted([{ x: 100, y: 100 }], [table])!;

    expect(box.x + box.width).toBeGreaterThan(table.x + table.width);
    expect(box.y + box.height).toBeGreaterThan(table.y + table.height);
  });
});

describe("inquadratura della rete aperta", () => {
  beforeEach(() => {
    session.clear();
  });

  test("un foglio vuoto ha l'inquadratura automatica", () => {
    expect(session.camera).toBeNull();

    session.fitView();

    expect(session.camera).toBeNull();
  });

  test("posare dispositivi non tocca l'inquadratura automatica", () => {
    session.addDevice({ kind: "host" }, { x: 300, y: 200 });

    expect(session.camera).toBeNull();
  });

  test("un file appena aperto viene inquadrato per intero", () => {
    session.open("lan-switch.netsim.json", lanFile);

    const box = session.camera!;
    for (const device of session.view.devices) {
      expect(device.x).toBeGreaterThan(box.x);
      expect(device.x).toBeLessThan(box.x + box.width);
    }
    // Più da vicino del foglio di base.
    expect(box.width).toBeLessThan(session.view.bounds.width);
  });

  test("l'inquadratura scelta resta quella mentre si lavora, e Nuova la azzera", () => {
    session.open("lan-switch.netsim.json", lanFile);
    const chosen = { x: 10, y: 20, width: 400, height: 250 };
    session.camera = chosen;

    session.addDevice({ kind: "host" }, { x: 5000, y: 5000 });
    session.ping("d1", "192.168.1.11", 1);
    session.restart();
    expect(session.camera).toEqual(chosen);

    session.clear();
    expect(session.camera).toBeNull();
  });
});
