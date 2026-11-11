import { describe, expect, test } from "vitest";
import {
  CANVAS_RESERVE,
  followContent,
  STRIP_FLOOR,
  STRIP_HEIGHT,
  stripFollows,
  stripHeightLimit,
  stripHeightUpTo,
  stripHeightWithin,
} from "../../src/ui/layout/auto-open";

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

describe("la fascia in basso segue i terminali, non gli eventi (D-118)", () => {
  const none = { terminals: 0, events: 0 };

  test("gli eventi, anche i primi, non la aprono: posare un PC scrive un evento", () => {
    expect(stripFollows(false, none, { terminals: 0, events: 1 })).toBe(false);
    expect(stripFollows(false, { terminals: 0, events: 5 }, { terminals: 0, events: 40 })).toBe(false);
  });

  test("il primo terminale la apre, perché si apre sempre con un gesto esplicito", () => {
    expect(stripFollows(false, { terminals: 0, events: 3 }, { terminals: 1, events: 3 })).toBe(true);
  });

  test("chiusa dall'utente resta chiusa, aperta resta aperta, mentre arrivano eventi", () => {
    expect(stripFollows(false, { terminals: 1, events: 3 }, { terminals: 1, events: 9 })).toBe(false);
    expect(stripFollows(true, { terminals: 0, events: 3 }, { terminals: 0, events: 9 })).toBe(true);
  });

  test("si richiude quando non resta nulla: una rete nuova, o Ricomincia senza terminali", () => {
    expect(stripFollows(true, { terminals: 0, events: 12 }, none)).toBe(false);
    expect(stripFollows(true, { terminals: 2, events: 12 }, none)).toBe(false);
  });
});

describe("il limite della fascia in presentazione lascia spazio al disegno (D-134)", () => {
  // La barra in alto (52) e la riga delle schede (37), ingrandite.
  const chrome = (scale: number) => (52 + 37) * scale;
  // Quanto resta al disegno sullo schermo con la fascia al suo limite.
  const canvas = (windowHeight: number, scale: number) =>
    windowHeight - chrome(scale) - stripHeightLimit({ windowHeight, scale, chrome: chrome(scale), presenting: true }) * scale;

  test("fuori dalla presentazione il limite resta il 60% della finestra", () => {
    expect(stripHeightLimit({ windowHeight: 800, scale: 1, chrome: 89, presenting: false })).toBe(480);
  });

  test("a 1366×768 al 200% il disegno conserva barra della simulazione, zoom e la rete", () => {
    const left = canvas(768, 2);
    expect(left).toBeGreaterThanOrEqual(CANVAS_RESERVE.controls * 2 + CANVAS_RESERVE.network - 2);
    expect(left).toBeGreaterThanOrEqual(768 * CANVAS_RESERVE.share);
  });

  test("a ogni finestra e ingrandimento il disegno ha almeno il suo spazio, se la fascia può restare utile", () => {
    for (const windowHeight of [1080, 900, 800, 768, 700]) {
      for (const scale of [1, 1.4, 1.8, 2]) {
        const limit = stripHeightLimit({ windowHeight, scale, chrome: chrome(scale), presenting: true });
        const wanted = Math.max(windowHeight * CANVAS_RESERVE.share, CANVAS_RESERVE.controls * scale + CANVAS_RESERVE.network);
        if (limit > STRIP_FLOOR) expect(canvas(windowHeight, scale)).toBeGreaterThanOrEqual(wanted - scale);
        expect(limit).toBeGreaterThanOrEqual(STRIP_FLOOR);
      }
    }
  });

  test("in una finestra troppo piccola per tutto la fascia non scende sotto tre righe, e il limite non è mai negativo", () => {
    expect(stripHeightLimit({ windowHeight: 400, scale: 2, chrome: chrome(2), presenting: true })).toBe(STRIP_FLOOR);
  });

  test("un'altezza voluta si riporta entro il limite, e sotto il minimo solo se il limite è più basso", () => {
    expect(stripHeightUpTo(500, 109)).toBe(109);
    expect(stripHeightUpTo(20, 300)).toBe(STRIP_HEIGHT.min);
    expect(stripHeightUpTo(20, 75)).toBe(75);
    expect(stripHeightUpTo(150.6, 300)).toBe(151);
  });
});
