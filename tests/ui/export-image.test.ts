import { describe, expect, test } from "vitest";
import { EXPORT_SCALE, exportFrame, exportScale, imageFileName, MAX_IMAGE_AREA, MAX_IMAGE_SIDE } from "../../src/ui/topology/export-image";

describe("l'immagine esportata", () => {
  test("mostra tutto ciò che il disegno contiene, con un margine, a coordinate intere", () => {
    expect(exportFrame({ x: 10.4, y: -20.6, width: 300.2, height: 100 }, 32)).toEqual({ x: -22, y: -53, width: 365, height: 165 });
  });

  test("è a doppia risoluzione", () => {
    expect(EXPORT_SCALE).toBe(2);
  });

  test("una rete normale resta a doppia risoluzione", () => {
    expect(exportScale({ x: 0, y: 0, width: 1200, height: 800 })).toBe(2);
  });

  test("un disegno lunghissimo si rimpicciolisce fino al lato più lungo possibile, con le stesse proporzioni", () => {
    const frame = { x: -50, y: 0, width: 20_000, height: 400 };
    const scale = exportScale(frame);
    expect(frame.width * scale).toBe(MAX_IMAGE_SIDE);
    expect((frame.width * scale) / (frame.height * scale)).toBeCloseTo(frame.width / frame.height, 9);
  });

  test("un disegno enorme in entrambe le direzioni resta entro l'area di una tela", () => {
    const frame = { x: 0, y: 0, width: 9000, height: 8000 };
    const scale = exportScale(frame);
    expect(scale).toBeLessThan(1);
    expect(Math.max(frame.width, frame.height) * scale).toBeLessThanOrEqual(MAX_IMAGE_SIDE);
    expect(Math.floor(frame.width * scale) * Math.floor(frame.height * scale)).toBeLessThanOrEqual(MAX_IMAGE_AREA);
  });

  test("prende il nome della rete, oppure «rete»", () => {
    expect(imageFileName("lezione-routing")).toBe("lezione-routing.png");
    expect(imageFileName(null)).toBe("rete.png");
  });
});
