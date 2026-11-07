import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { loadNetworkFile } from "../../src/storage/load";
import { session } from "../../src/ui/session.svelte";

const RECT = { x: 40, y: 60, width: 500, height: 300 };

function annotations() {
  return session.view.annotations;
}

beforeEach(() => {
  session.clear();
});

describe("aggiungere e cambiare annotazioni", () => {
  test("un riquadro e una nota nuovi, blu e senza testo, con identificativi in serie", () => {
    const box = session.addBox(RECT);
    const note = session.addNote({ x: 600.4, y: 79.6 });

    expect([box, note]).toEqual(["a1", "a2"]);
    expect(annotations()).toEqual([
      { kind: "box", id: "a1", ...RECT, color: "blue", label: "" },
      { kind: "note", id: "a2", x: 600, y: 80, color: "blue", text: "" },
    ]);
  });

  test("colore, etichetta e testo si cambiano", () => {
    const box = session.addBox(RECT);
    const note = session.addNote({ x: 600, y: 80 });

    session.recolorAnnotation(box, "green");
    session.setAnnotationText(box, "LAN 192.168.1.0/24");
    session.setAnnotationText(note, "Consegna");

    expect(annotations()).toMatchObject([
      { color: "green", label: "LAN 192.168.1.0/24" },
      { color: "blue", text: "Consegna" },
    ]);
  });

  test("un riquadro si sposta e si ridimensiona, ma non sotto la grandezza minima", () => {
    const box = session.addBox(RECT);

    session.moveAnnotation(box, { x: 100, y: 120 });
    expect(annotations()[0]).toMatchObject({ x: 100, y: 120, width: 500, height: 300 });

    session.resizeBox(box, { x: 100, y: 120, width: 10, height: 200 });
    expect(annotations()[0]).toMatchObject({ width: 40, height: 200 });
  });

  test("eliminare un'annotazione ne libera l'identificativo", () => {
    const box = session.addBox(RECT);
    session.addNote({ x: 600, y: 80 });

    session.removeAnnotation(box);

    expect(annotations().map((a) => a.id)).toEqual(["a2"]);
    expect(session.addBox(RECT)).toBe("a1");
  });
});

describe("annotazioni e cronologia", () => {
  test("aggiungere, cambiare colore e testo, eliminare: ognuno si annulla e si ripristina", () => {
    const box = session.addBox(RECT);
    session.recolorAnnotation(box, "red");
    session.setAnnotationText(box, "Ufficio");
    session.removeAnnotation(box);

    session.undo();
    expect(annotations()[0]).toMatchObject({ color: "red", label: "Ufficio" });
    session.undo();
    expect(annotations()[0]).toMatchObject({ color: "red", label: "" });
    session.undo();
    expect(annotations()[0]).toMatchObject({ color: "blue" });
    session.undo();
    expect(annotations()).toEqual([]);

    session.redo();
    session.redo();
    expect(annotations()[0]).toMatchObject({ color: "red", label: "" });
  });

  test("uno spostamento trascinato è un solo passo da annullare", () => {
    const box = session.addBox(RECT);

    session.holdBounds(true);
    session.moveAnnotation(box, { x: 50, y: 70 });
    session.moveAnnotation(box, { x: 90, y: 110 });
    session.holdBounds(false);
    session.undo();

    expect(annotations()[0]).toMatchObject({ x: 40, y: 60 });
    expect(session.canUndo).toBe(true); // resta l'aggiunta del riquadro
  });

  test("lo stesso colore o lo stesso testo non sono una modifica", () => {
    const box = session.addBox(RECT);
    session.undo();
    session.redo();

    session.recolorAnnotation(box, "blue");
    session.setAnnotationText(box, "");

    expect(session.canRedo).toBe(false);
    session.undo();
    expect(annotations()).toEqual([]);
  });

  test("annullare una modifica alla rete lascia le annotazioni come sono", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.addBox(RECT);
    session.rename("d1", "Aula");

    session.undo();

    expect(annotations()).toHaveLength(1);
  });
});

describe("annotazioni e file", () => {
  test("un'annotazione è una modifica da salvare, e finisce nel file", () => {
    session.open("lan-switch.netsim.json", lanFile);
    expect(session.dirty).toBe(false);

    session.addBox(RECT);

    expect(session.dirty).toBe(true);
    expect(loadNetworkFile(session.draftSave().text).annotations).toHaveLength(1);
  });

  test("dopo il salvataggio la rete torna salvata; annullando l'annotazione, modificata", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.addNote({ x: 10, y: 10 });

    session.markSaved("lan.netsim.json", session.draftSave());
    expect(session.dirty).toBe(false);
    session.undo();

    expect(session.dirty).toBe(true);
  });

  test("aprire un file ne prende le annotazioni; Nuova le toglie", () => {
    session.addBox(RECT);
    const text = session.draftSave().text;

    session.clear();
    expect(annotations()).toEqual([]);
    session.open("disegno.netsim.json", text);

    expect(annotations()).toHaveLength(1);
    expect(session.canUndo).toBe(false);
  });
});

describe("annotazioni a schermo: strumenti, selezione, inquadratura", () => {
  test("lo strumento Riquadro o Nota lascia gli altri strumenti, e un secondo clic lo lascia", () => {
    session.placing = { kind: "host" };
    session.cabling = true;
    session.chooseAnnotationTool("box");
    expect([session.annotating, session.placing, session.cabling]).toEqual(["box", null, false]);
    session.chooseAnnotationTool("note");
    expect(session.annotating).toBe("note");
    session.chooseAnnotationTool("note");
    expect(session.annotating).toBeNull();
  });

  test("un'annotazione selezionata si elimina come un passo da annullare, e la selezione se ne va", () => {
    const id = session.addBox(RECT);
    session.select({ kind: "annotation", id });
    session.removeSelection();
    expect(annotations()).toEqual([]);
    expect(session.selection).toBeNull();
    session.undo();
    expect(annotations().map((a) => a.id)).toEqual([id]);
  });

  test("annullando la nascita di un'annotazione selezionata, la selezione si toglie", () => {
    const id = session.addNote({ x: 10, y: 10 });
    session.select({ kind: "annotation", id });
    session.undo();
    expect(annotations()).toEqual([]);
    expect(session.selection).toBeNull();
  });

  test("Adatta inquadra anche le annotazioni, pure su un foglio senza dispositivi", () => {
    session.addBox({ x: 2000, y: 1500, width: 300, height: 200 });
    session.fitView();
    const camera = session.camera!;
    expect(camera).not.toBeNull();
    expect(camera.x).toBeLessThanOrEqual(2000);
    expect(camera.x + camera.width).toBeGreaterThanOrEqual(2300);
    expect(camera.y + camera.height).toBeGreaterThanOrEqual(1700);
  });

  test("aprire un'altra rete lascia lo strumento e l'anteprima del riquadro", () => {
    session.chooseAnnotationTool("box");
    session.sketch = { x: 0, y: 0, width: 50, height: 50 };
    session.open("lan-switch.netsim.json", lanFile);
    expect(session.annotating).toBeNull();
    expect(session.sketch).toBeNull();
  });
});
