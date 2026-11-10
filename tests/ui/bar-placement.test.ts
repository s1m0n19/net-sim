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

describe("la barretta di un oggetto più alto di ciò che si vede (D-118)", () => {
  test("non copre i comandi in basso: sta in cima al disegno", () => {
    // Un riquadro che va oltre il bordo alto e quello basso; in basso lo zoom e la barra della simulazione.
    const controls = [{ left: 0, top: 520, right: 1000, bottom: 600 }];
    expect(placeBar({ x: 500, top: -200, bottom: 900 }, BAR, AREA, controls)).toEqual({ left: 370, top: 8, side: "below" });
  });

  test("senza comandi in basso resta la regola di sempre", () => {
    expect(placeBar({ x: 500, top: -200, bottom: 900 }, BAR, AREA, []).top).toBe(600 - 60 - 8);
  });
});

describe("la barretta e i dispositivi vicini (D-129)", () => {
  const OBJECT = { x: 500, top: 300, bottom: 400 };

  test("con un vicino sopra e un po' di lato, scivola quanto basta, restando sopra l'oggetto", () => {
    // Centrata andrebbe da 370 a 630, sul vicino: si sposta alla sua sinistra.
    const above = { left: 560, top: 200, right: 640, bottom: 290 };
    const placed = placeBar(OBJECT, BAR, AREA, [], [above]);
    expect(placed.side).toBe("above");
    expect(placed.left + BAR.width).toBeLessThanOrEqual(above.left);
  });

  test("con un vicino proprio sopra, o una fila di vicini, va sotto le scritte, se lì è libera", () => {
    const right = { left: 460, top: 200, right: 540, bottom: 290 };
    expect(placeBar(OBJECT, BAR, AREA, [], [right]).side).toBe("below");
    const row = { left: 0, top: 200, right: 1000, bottom: 290 };
    expect(placeBar(OBJECT, BAR, AREA, [], [row])).toEqual({ left: 370, top: 410, side: "below" });
  });

  test("chiuso tra vicini sopra e sotto, vale la regola di sempre: sopra", () => {
    const rowAbove = { left: 0, top: 200, right: 1000, bottom: 290 };
    const rowBelow = { left: 0, top: 405, right: 1000, bottom: 500 };
    expect(placeBar(OBJECT, BAR, AREA, [], [rowAbove, rowBelow]).side).toBe("above");
  });

  test("i comandi contano più dei vicini: non si va sotto se lì c'è la barra della simulazione", () => {
    const row = { left: 0, top: 200, right: 1000, bottom: 290 };
    const simulation = { left: 300, top: 405, right: 700, bottom: 470 };
    expect(placeBar(OBJECT, BAR, AREA, [simulation], [row]).side).toBe("above");
  });

  test("vicino al bordo basso non va sotto, dove finirebbe sull'oggetto", () => {
    const row = { left: 0, top: 400, right: 1000, bottom: 490 };
    expect(placeBar({ x: 500, top: 500, bottom: 560 }, BAR, AREA, [], [row]).side).toBe("above");
  });
});
