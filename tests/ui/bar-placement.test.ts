import { describe, expect, test } from "vitest";
import { barFits, placeBar } from "../../src/ui/topology/bar-placement";

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

describe("la barretta e i comandi sul disegno", () => {
  // Lo zoom nell'angolo in alto a destra, come in presentazione.
  const ZOOM = { left: 800, top: 14, right: 986, bottom: 60 };

  test("se sopra coprirebbe lo zoom, va sotto l'oggetto", () => {
    expect(placeBar({ x: 850, top: 120, bottom: 220 }, BAR, AREA, [ZOOM])).toEqual({ left: 720, top: 230, side: "below" });
  });

  test("lontano dai comandi resta sopra, come sempre", () => {
    expect(placeBar({ x: 300, top: 120, bottom: 220 }, BAR, AREA, [ZOOM]).side).toBe("above");
  });

  test("se coprirebbe qualcosa sia sopra sia sotto, sta sopra", () => {
    const below = { left: 0, top: 220, right: 1000, bottom: 300 };
    expect(placeBar({ x: 850, top: 120, bottom: 220 }, BAR, AREA, [ZOOM, below]).side).toBe("above");
  });
});

describe("la barretta compatta", () => {
  test("con le scritte sta nel disegno se c'è posto anche per i margini", () => {
    expect(barFits(300, 316)).toBe(true);
    expect(barFits(301, 316)).toBe(false);
  });
});

describe("la barretta si sposta di lato per non coprire un comando", () => {
  test("se sopra coprirebbe lo zoom, scivola di lato restando sopra l'oggetto", () => {
    const zoom = { left: 700, top: 14, right: 986, bottom: 60 };
    const below = { left: 0, top: 220, right: 1000, bottom: 300 };
    // Centrata andrebbe da 520 a 780, sullo zoom: si ferma alla sua sinistra.
    expect(placeBar({ x: 650, top: 120, bottom: 220 }, BAR, AREA, [zoom, below])).toEqual({ left: 430, top: 50, side: "above" });
  });
});
