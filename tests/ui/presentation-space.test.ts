// Quando la rete è coperta in presentazione, aprendo la fascia (D-140).

import { describe, expect, test } from "vitest";
import { networkCovered } from "../../src/ui/layout/presentation-space";

const canvas = { x: 0, y: 0, width: 1000, height: 400 };
const simulation = { x: 200, y: 330, width: 600, height: 60 };

describe("la rete coperta", () => {
  test("dispositivi tutti dentro il disegno e lontani dai comandi: non è coperta", () => {
    expect(networkCovered([{ x: 100, y: 100, width: 50, height: 50 }], [simulation], canvas)).toBe(false);
  });

  test("un dispositivo sotto la barra della simulazione: è coperta", () => {
    expect(networkCovered([{ x: 100, y: 100, width: 50, height: 50 }, { x: 300, y: 320, width: 50, height: 50 }], [simulation], canvas)).toBe(true);
  });

  test("un dispositivo uscito dal disegno, anche solo in parte: è coperta", () => {
    expect(networkCovered([{ x: 980, y: 100, width: 50, height: 50 }], [], canvas)).toBe(true);
    expect(networkCovered([{ x: 100, y: 380, width: 50, height: 50 }], [], canvas)).toBe(true);
  });

  test("senza dispositivi non è coperta", () => {
    expect(networkCovered([], [simulation], canvas)).toBe(false);
  });
});
