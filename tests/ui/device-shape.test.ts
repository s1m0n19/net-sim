// Le misure dei dispositivi sul disegno (D-127): compatte nell'editor,
// quelle di prima in presentazione, e coerenti tra loro.

import { describe, expect, test } from "vitest";
import { deviceShape, EDITOR_SHAPE, PRESENTATION_SHAPE, type DeviceShape } from "../../src/ui/topology/device-shape";

describe("le misure dei dispositivi", () => {
  test("nell'editor un PC è largo 44, switch e router 50, tutti alti 44", () => {
    const shape = deviceShape(false);
    expect([shape.hostHalfWidth * 2, shape.otherHalfWidth * 2, shape.halfHeight * 2]).toEqual([44, 50, 44]);
  });

  test("in presentazione restano quelle di prima: 52, 60 e 52", () => {
    const shape = deviceShape(true);
    expect([shape.hostHalfWidth * 2, shape.otherHalfWidth * 2, shape.halfHeight * 2]).toEqual([52, 60, 52]);
  });

  for (const [name, shape] of [
    ["nell'editor", EDITOR_SHAPE],
    ["in presentazione", PRESENTATION_SHAPE],
  ] as [string, DeviceShape][]) {
    test(`${name} ciò che sta lungo il cavo resta fuori dal riquadro, nell'ordine: busta, pallino, indirizzo, nome della porta`, () => {
      const widest = shape.otherHalfWidth;
      expect(shape.packetEdge).toBeGreaterThan(widest);
      expect(shape.signalDistance).toBeGreaterThan(widest);
      expect(shape.addressDistance).toBeGreaterThan(widest);
      expect(shape.portLabelDistance).toBeGreaterThan(shape.signalDistance);
    });

    test(`${name} il nome sta sotto il riquadro e la barretta non tocca né il riquadro né le scritte`, () => {
      expect(shape.nameY - shape.nameSize).toBeGreaterThanOrEqual(shape.halfHeight);
      expect(shape.firstLineY).toBeGreaterThan(shape.nameY);
      expect(shape.barTop).toBeLessThanOrEqual(-(shape.halfHeight + shape.selectionMargin));
      expect(shape.barBottom).toBeGreaterThan(shape.firstLineY);
    });
  }
});
