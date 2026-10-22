import { describe, expect, test } from "vitest";
import { besideFree, COPY_SPACING } from "../../src/ui/topology/placement";

describe("dove nasce una copia", () => {
  test("su un disegno libero, un passo a destra dell'originale", () => {
    expect(besideFree({ x: 100, y: 50 }, [{ x: 100, y: 50 }])).toEqual({ x: 100 + COPY_SPACING, y: 50 });
  });

  test("se il posto è occupato, quello dopo", () => {
    const occupied = [
      { x: 100, y: 50 },
      { x: 240, y: 50 },
      { x: 370, y: 80 },
    ];

    expect(besideFree({ x: 100, y: 50 }, occupied)).toEqual({ x: 520, y: 50 });
  });

  test("un dispositivo abbastanza lontano non toglie il posto", () => {
    expect(besideFree({ x: 100, y: 50 }, [{ x: 240, y: 150 }])).toEqual({ x: 240, y: 50 });
  });
});
