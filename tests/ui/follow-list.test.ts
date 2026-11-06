import { describe, expect, test } from "vitest";
import { atBottom } from "../../src/ui/strip/follow-list";

describe("l'elenco degli eventi segue quelli nuovi", () => {
  test("solo se lo si sta guardando in fondo", () => {
    expect(atBottom(800, 200, 1000)).toBe(true);
    // Mezza riga sopra il fondo conta ancora come in fondo.
    expect(atBottom(780, 200, 1000)).toBe(true);
  });

  test("non se si è risaliti a leggere eventi di prima", () => {
    expect(atBottom(400, 200, 1000)).toBe(false);
  });

  test("un elenco corto, senza scorrimento, è sempre in fondo", () => {
    expect(atBottom(0, 200, 150)).toBe(true);
  });
});
