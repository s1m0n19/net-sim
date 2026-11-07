import { describe, expect, test } from "vitest";
import { placeMenu } from "../../src/ui/layout/menu-placement";

// Un disegno da 0 a 600 in larghezza e da 0 a 400 in altezza.
const BOUNDS = { left: 0, top: 0, right: 600, bottom: 400 };
const MENU = { width: 250, height: 150 };
const END_BELOW = { align: "end", up: false } as const;

// Un pulsante largo 40 e alto 50, con il bordo alto a `top`.
const button = (left: number, top = 100) => ({ left, top, right: left + 40, bottom: top + 50 });

describe("dove si apre il menu Altro", () => {
  test("con spazio, allineato al bordo destro del pulsante e sotto", () => {
    expect(placeMenu(button(400), MENU, BOUNDS, END_BELOW)).toEqual({ left: 190, top: 156, width: null, maxHeight: null, side: "below" });
  });

  test("vicino al bordo sinistro si allinea al bordo sinistro del pulsante", () => {
    expect(placeMenu(button(20), MENU, BOUNDS, END_BELOW).left).toBe(20);
  });

  test("vicino al bordo destro resta allineato a destra, dentro il disegno", () => {
    const placement = placeMenu(button(552), MENU, BOUNDS, { align: "start", up: false });
    expect(placement.left).toBe(342);
    expect(placement.left + MENU.width).toBeLessThanOrEqual(600 - 8);
  });

  test("se nessun allineamento ci sta, si accosta al bordo", () => {
    // Pulsante in mezzo a un disegno di 300: né a destra né a sinistra ci sta.
    const placement = placeMenu(button(130), MENU, { left: 0, top: 0, right: 300, bottom: 400 }, END_BELOW);
    expect(placement.left).toBe(8);
    expect(placement.width).toBeNull();
  });

  test("in uno spazio più stretto del menu diventa più stretto, e sta tutto dentro", () => {
    const placement = placeMenu(button(60), MENU, { left: 0, top: 0, right: 200, bottom: 400 }, END_BELOW);
    expect(placement).toMatchObject({ left: 8, width: 184 });
  });

  test("se sotto non c'è posto si apre sopra; se c'è poco da tutte e due le parti, dove ce n'è di più, e le voci scorrono", () => {
    expect(placeMenu(button(400, 300), MENU, BOUNDS, END_BELOW)).toMatchObject({ side: "above", top: 144, maxHeight: null });
    const tight = placeMenu(button(400, 120), MENU, { left: 0, top: 0, right: 600, bottom: 300 }, END_BELOW);
    expect(tight).toMatchObject({ side: "below", top: 176, maxHeight: 116 });
  });

  test("la preferenza per l'alto vale quando sopra c'è posto", () => {
    expect(placeMenu(button(400, 250), MENU, BOUNDS, { align: "end", up: true }).side).toBe("above");
    expect(placeMenu(button(400, 60), MENU, BOUNDS, { align: "end", up: true }).side).toBe("below");
  });
});
