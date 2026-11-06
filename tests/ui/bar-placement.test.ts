import { describe, expect, test } from "vitest";
import { placeBar } from "../../src/ui/topology/bar-placement";

const BAR = { width: 260, height: 60 };
const AREA = { width: 1000, height: 600 };

describe("dove sta la barretta delle azioni", () => {
  test("con spazio, sopra l'oggetto e centrata", () => {
    expect(placeBar({ x: 500, top: 300, bottom: 400 }, BAR, AREA)).toEqual({ left: 370, top: 230, side: "above" });
  });

  test("vicino al bordo alto, sotto le scritte dell'oggetto", () => {
    expect(placeBar({ x: 500, top: 40, bottom: 140 }, BAR, AREA)).toEqual({ left: 370, top: 150, side: "below" });
  });

  test("vicino ai bordi laterali, non esce dal disegno", () => {
    expect(placeBar({ x: 20, top: 300, bottom: 400 }, BAR, AREA).left).toBe(8);
    expect(placeBar({ x: 990, top: 300, bottom: 400 }, BAR, AREA).left).toBe(1000 - 260 - 8);
  });

  test("se non c'è posto né sopra né sotto, si ferma al bordo basso", () => {
    expect(placeBar({ x: 500, top: 30, bottom: 590 }, BAR, AREA)).toEqual({ left: 370, top: 600 - 60 - 8, side: "below" });
  });

  test("in un disegno più stretto della barretta, comincia comunque dal bordo sinistro", () => {
    expect(placeBar({ x: 100, top: 300, bottom: 400 }, BAR, { width: 200, height: 600 }).left).toBe(8);
  });
});
