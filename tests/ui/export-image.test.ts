import { describe, expect, test } from "vitest";
import { EXPORT_SCALE, exportFrame, imageFileName } from "../../src/ui/topology/export-image";

describe("l'immagine esportata", () => {
  test("mostra tutto ciò che il disegno contiene, con un margine, a coordinate intere", () => {
    expect(exportFrame({ x: 10.4, y: -20.6, width: 300.2, height: 100 }, 32)).toEqual({ x: -22, y: -53, width: 365, height: 165 });
  });

  test("è a doppia risoluzione", () => {
    expect(EXPORT_SCALE).toBe(2);
  });

  test("prende il nome della rete, oppure «rete»", () => {
    expect(imageFileName("lezione-routing")).toBe("lezione-routing.png");
    expect(imageFileName(null)).toBe("rete.png");
  });
});
