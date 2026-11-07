import { describe, expect, test } from "vitest";
import { followContent, STRIP_HEIGHT, stripFollows, stripHeightWithin } from "../../src/ui/layout/auto-open";

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
