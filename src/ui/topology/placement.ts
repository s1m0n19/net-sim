// Dove mettere sul disegno la copia di un dispositivo (requisito ED-6,
// decisione D-101): accanto all'originale, al primo posto libero verso
// destra. Duplicando più volte, le copie si mettono in fila.

import type { Position } from "../../storage/load";

/**
 * La distanza tra un dispositivo e la sua copia, in coordinate del disegno:
 * abbastanza perché due indirizzi IP scritti sotto i dispositivi non si
 * tocchino, e multiplo del passo della griglia (20).
 */
export const COPY_SPACING = 140;

// Un posto è occupato se un dispositivo ha il centro più vicino di così.
const TOO_CLOSE = COPY_SPACING * 0.6;

/**
 * Il primo posto libero a destra di un dispositivo, alla stessa altezza,
 * a passi di `COPY_SPACING`.
 *
 * @param origin - dove sta il dispositivo da copiare
 * @param occupied - dove stanno tutti i dispositivi del disegno
 * @returns il punto in cui mettere la copia
 */
export function besideFree(origin: Position, occupied: Position[]): Position {
  for (let step = 1; ; step++) {
    const candidate = { x: origin.x + step * COPY_SPACING, y: origin.y };
    const taken = occupied.some((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < TOO_CLOSE);
    if (!taken) return candidate;
  }
}
