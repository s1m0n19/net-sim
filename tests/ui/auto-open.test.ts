import { describe, expect, test } from "vitest";
import { followContent, STRIP_HEIGHT, stripHeightWithin } from "../../src/ui/layout/auto-open";

describe("aprirsi e chiudersi seguendo il contenuto", () => {
  test("un'area chiusa si apre quando il contenuto compare", () => {
    expect(followContent(false, false, true)).toBe(true);
  });

  test("un'area aperta si chiude quando il contenuto sparisce", () => {
    expect(followContent(true, true, false)).toBe(false);
  });

  test("finché il contenuto non compare né sparisce, vale la scelta di chi usa l'app", () => {
    expect(followContent(false, true, true)).toBe(false); // chiusa a mano, con eventi
    expect(followContent(true, false, false)).toBe(true); // aperta a mano, vuota
  });
});

describe("altezza della fascia", () => {
  test("trascinando resta tra il minimo e il 60% della finestra", () => {
    expect(stripHeightWithin(250.4, 800)).toBe(250);
    expect(stripHeightWithin(20, 800)).toBe(STRIP_HEIGHT.min);
    expect(stripHeightWithin(700, 800)).toBe(480);
  });

  test("in una finestra bassissima non scende sotto il minimo", () => {
    expect(stripHeightWithin(300, 120)).toBe(STRIP_HEIGHT.min);
  });
});
