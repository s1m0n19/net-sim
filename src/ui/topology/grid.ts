// La griglia magnetica del disegno (requisito ED-7, decisione D-102).
// È invisibile: serve solo a far cadere i dispositivi su punti allineati.

import type { Position } from "../../storage/load";

/** La distanza tra due punti della griglia, in coordinate del disegno. */
export const GRID_STEP = 20;

/**
 * Il punto della griglia più vicino a una posizione.
 *
 * @param position - una posizione qualsiasi sul disegno
 * @returns la posizione spostata sul punto della griglia più vicino
 */
export function snapToGrid(position: Position): Position {
  return {
    x: Math.round(position.x / GRID_STEP) * GRID_STEP,
    y: Math.round(position.y / GRID_STEP) * GRID_STEP,
  };
}
