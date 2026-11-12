// Il lato del nome di switch e router (D-139): sotto, oppure sopra quando i
// cavi scendono e uno di loro taglia il nome.

import { describe, expect, test } from "vitest";
import { crossings, downwardWeight, nameRect, nameSides } from "../../src/ui/topology/name-side";

type Kind = "host" | "switch" | "router";
const device = (id: string, kind: Kind, x: number, y: number, name = id.toUpperCase()) => ({ id, kind, name, x, y });
const link = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } });

// Uno switch con dei PC attorno, collegati: il lato del suo nome.
function sideOf(others: { x: number; y: number }[], kind: Kind = "switch"): string | undefined {
  const sw = device("sw", kind, 300, 200);
  const pcs = others.map((p, i) => device(`p${i}`, "host", p.x, p.y));
  return nameSides([sw, ...pcs], pcs.map((p) => link(sw, p))).get("sw");
}

describe("il peso dei cavi verso il basso", () => {
  test("un cavo verticale verso il basso pesa 1, verso l'alto −1, orizzontale 0", () => {
    expect(downwardWeight({ x: 0, y: 0 }, [{ x: 0, y: 100 }])).toBeCloseTo(1);
    expect(downwardWeight({ x: 0, y: 0 }, [{ x: 0, y: -100 }])).toBeCloseTo(-1);
    expect(downwardWeight({ x: 0, y: 0 }, [{ x: 100, y: 0 }])).toBeCloseTo(0);
  });

  test("un cavo in diagonale pesa quanto la sua componente verticale", () => {
    expect(downwardWeight({ x: 0, y: 0 }, [{ x: 100, y: 100 }])).toBeCloseTo(Math.SQRT1_2);
    expect(downwardWeight({ x: 0, y: 0 }, [{ x: 100, y: 50 }])).toBeCloseTo(50 / Math.hypot(100, 50));
  });

  test("un cavo di lunghezza nulla non pesa e non dà errori", () => {
    expect(downwardWeight({ x: 5, y: 5 }, [{ x: 5, y: 5 }])).toBe(0);
  });
});

describe("il lato del nome", () => {
  test("senza cavi il nome resta sotto", () => {
    expect(sideOf([])).toBe("below");
  });

  test("con un cavo verticale verso il basso, che taglia il nome, va sopra", () => {
    expect(sideOf([{ x: 300, y: 350 }])).toBe("above");
  });

  test("con un cavo verso l'alto, o orizzontale, resta sotto", () => {
    expect(sideOf([{ x: 300, y: 50 }])).toBe("below");
    expect(sideOf([{ x: 450, y: 200 }])).toBe("below");
  });

  test("con cavi simmetrici sopra e sotto resta sotto", () => {
    expect(sideOf([{ x: 300, y: 50 }, { x: 300, y: 350 }])).toBe("below");
  });

  test("con i cavi soprattutto verso il basso, come in un albero, va sopra; soprattutto verso l'alto resta sotto", () => {
    // Il cavo verso il router arriva in diagonale, come nella rete delle lezioni.
    expect(sideOf([{ x: 450, y: 60 }, { x: 160, y: 350 }, { x: 300, y: 350 }, { x: 440, y: 350 }])).toBe("above");
    expect(sideOf([{ x: 160, y: 50 }, { x: 300, y: 50 }, { x: 440, y: 50 }, { x: 300, y: 350 }])).toBe("below");
  });

  test("i cavi scendono ma nessuno taglia il nome: resta sotto", () => {
    // Due diagonali larghe, lontane dal nome.
    expect(sideOf([{ x: 100, y: 300 }, { x: 500, y: 300 }])).toBe("below");
  });

  test("l'ordine dei cavi e dei dispositivi non cambia il risultato", () => {
    const sw = device("sw", "switch", 300, 200);
    const pcs = [device("a", "host", 160, 350), device("b", "host", 300, 350), device("c", "host", 300, 50)];
    const links = pcs.map((p) => link(sw, p));
    const one = nameSides([sw, ...pcs], links).get("sw");
    const two = nameSides([...pcs].reverse().concat(sw), [...links].reverse().map((l) => ({ from: l.to, to: l.from }))).get("sw");
    expect(two).toBe(one);
  });

  test("vale anche per i router; PC e server non hanno un lato", () => {
    expect(sideOf([{ x: 300, y: 350 }], "router")).toBe("above");
    const sw = device("sw", "switch", 300, 200);
    const pc = device("pc", "host", 300, 350);
    const sides = nameSides([sw, pc], [link(sw, pc)]);
    expect(sides.has("pc")).toBe(false);
  });

  test("togliendo il cavo che scendeva il nome torna sotto; aggiungendolo va sopra", () => {
    const sw = device("sw", "switch", 300, 200);
    const pc = device("pc", "host", 300, 350);
    expect(nameSides([sw, pc], [link(sw, pc)]).get("sw")).toBe("above");
    expect(nameSides([sw, pc], []).get("sw")).toBe("below");
  });

  test("se anche sopra un cavo taglia il nome, a parità resta sotto (non scambia un incrocio con un altro)", () => {
    // Come SW3 nello studio: un cavo che arriva dall'alto e tre che scendono, uno in verticale.
    const sw = device("sw", "switch", 300, 200);
    const up = device("r", "router", 300, 60);
    const pcs = [device("a", "host", 200, 330), device("b", "host", 300, 330), device("c", "host", 400, 330)];
    const links = [link(up, sw), ...pcs.map((p) => link(sw, p))];
    expect(nameSides([sw, up, ...pcs], links).get("sw")).toBe("below");
  });
});

describe("le misure usate", () => {
  test("il nome sopra sta sopra il riquadro, il nome sotto sotto, alla stessa ascissa", () => {
    const below = nameRect({ x: 0, y: 0 }, "SW1", "below");
    const above = nameRect({ x: 0, y: 0 }, "SW1", "above");
    expect(above.y + above.height).toBeLessThan(-22);
    expect(below.y).toBeGreaterThan(22);
    expect(above.x).toBe(below.x);
  });

  test("un cavo che passa sul nome lo attraversa, uno accanto no", () => {
    const rect = nameRect({ x: 0, y: 0 }, "SW1", "below");
    expect(crossings(rect, [{ from: { x: 0, y: 0 }, to: { x: 0, y: 200 } }])).toBe(1);
    expect(crossings(rect, [{ from: { x: 0, y: 0 }, to: { x: 200, y: 0 } }])).toBe(0);
  });

  test("il lato si calcola con le misure dell'editor, qualunque sia l'ingrandimento", () => {
    // nameSides non riceve l'ingrandimento: lo stesso ingresso, lo stesso lato.
    expect(sideOf([{ x: 300, y: 350 }])).toBe(sideOf([{ x: 300, y: 350 }]));
  });
});
