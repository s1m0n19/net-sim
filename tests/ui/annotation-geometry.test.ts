import { describe, expect, test } from "vitest";
import {
  annotationRect,
  EMPTY_NOTE,
  noteLayout,
  noteLines,
  rectBetween,
  resizedFromCorner,
} from "../../src/ui/topology/annotation-geometry";

describe("il rettangolo disegnato trascinando", () => {
  test("è lo stesso in qualsiasi direzione si trascini", () => {
    const expected = { x: 100, y: 50, width: 200, height: 80 };
    expect(rectBetween({ x: 100, y: 50 }, { x: 300, y: 130 })).toEqual(expected);
    expect(rectBetween({ x: 300, y: 130 }, { x: 100, y: 50 })).toEqual(expected);
    expect(rectBetween({ x: 300, y: 50 }, { x: 100, y: 130 })).toEqual(expected);
  });
});

describe("il riquadro ridimensionato da un angolo", () => {
  const start = { x: 100, y: 100, width: 200, height: 120 };

  test("dall'angolo in basso a destra cresce verso il basso e a destra", () => {
    expect(resizedFromCorner(start, "se", 30, 20, 40)).toEqual({ x: 100, y: 100, width: 230, height: 140 });
  });

  test("dall'angolo in alto a sinistra l'angolo opposto resta fermo", () => {
    expect(resizedFromCorner(start, "nw", -50, 10, 40)).toEqual({ x: 50, y: 110, width: 250, height: 110 });
  });

  test("non scende sotto il minimo, e non si ribalta oltre l'angolo opposto", () => {
    expect(resizedFromCorner(start, "se", -500, -500, 40)).toEqual({ x: 100, y: 100, width: 40, height: 40 });
    // Dall'angolo in alto a destra: il lato sinistro e quello in basso restano.
    expect(resizedFromCorner(start, "ne", -500, 500, 40)).toEqual({ x: 100, y: 180, width: 40, height: 40 });
  });
});

describe("le righe di una nota", () => {
  test("conservano i ritorni a capo", () => {
    expect(noteLines("Prima riga\nSeconda riga")).toEqual(["Prima riga", "Seconda riga"]);
    expect(noteLines("Su\r\nWindows")).toEqual(["Su", "Windows"]);
  });

  test("una riga lunga va a capo tra le parole", () => {
    const lines = noteLines("Configura le rotte statiche necessarie per permettere la comunicazione tra le due reti", 40);
    expect(lines).toEqual(["Configura le rotte statiche necessarie", "per permettere la comunicazione tra le", "due reti"]);
    expect(lines.every((line) => line.length <= 40)).toBe(true);
  });

  test("una parola più lunga di una riga si spezza", () => {
    expect(noteLines("x".repeat(25), 10)).toEqual(["xxxxxxxxxx", "xxxxxxxxxx", "xxxxx"]);
  });

  test("una riga vuota in mezzo resta, una nota tutta vuota non ha righe", () => {
    expect(noteLines("a\n\nb")).toEqual(["a", "", "b"]);
    expect(noteLines("   \n ")).toEqual([]);
  });
});

describe("lo spazio di una nota", () => {
  test("una nota vuota mostra un segnaposto, e occupa comunque uno spazio", () => {
    const layout = noteLayout("");
    expect(layout).toMatchObject({ empty: true, lines: [EMPTY_NOTE] });
    expect(layout.width).toBeGreaterThan(0);
  });

  test("in presentazione il testo e lo spazio crescono con l'ingrandimento", () => {
    const normal = noteLayout("Consegna");
    const big = noteLayout("Consegna", 2);
    expect(big.fontSize).toBe(normal.fontSize * 2);
    expect(big.width).toBeGreaterThanOrEqual(normal.width * 2 - 1);
  });

  test("un riquadro occupa il suo rettangolo, una nota quello del suo testo", () => {
    expect(annotationRect({ kind: "box", id: "a1", x: 10, y: 20, width: 100, height: 60, color: "blue", label: "" })).toEqual({ x: 10, y: 20, width: 100, height: 60 });
    const note = annotationRect({ kind: "note", id: "a2", x: 5, y: 5, color: "green", text: "Due\nrighe" });
    expect(note.height).toBe(noteLayout("Due\nrighe").height);
  });
});
