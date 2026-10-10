// Piccoli calcoli sui punti del disegno, usati da più componenti.

export interface Point {
  x: number;
  y: number;
}

/**
 * Un punto lungo il segmento che va da `start` a `other`.
 *
 * Serve a mettere pallini ed etichette vicino a un capo di un cavo, senza
 * finire sopra al dispositivo.
 *
 * @param start    il capo da cui si misura
 * @param other    l'altro capo
 * @param distance quanto allontanarsi da `start`, lungo il cavo
 * @param sideways quanto spostarsi di lato, perpendicolarmente al cavo
 */
export function pointNear(start: Point, other: Point, distance: number, sideways = 0): Point {
  const length = Math.hypot(other.x - start.x, other.y - start.y) || 1;
  const ux = (other.x - start.x) / length;
  const uy = (other.y - start.y) / length;
  return { x: start.x + ux * distance - uy * sideways, y: start.y + uy * distance + ux * sideways };
}

/**
 * Dove sta scritto il nome della porta a un capo di un cavo.
 *
 * @param from il capo `a` del cavo
 * @param to   il capo `b` del cavo
 * @param end  di quale capo si vuole l'etichetta
 * @param scale di quanto è ingrandito il disegno: l'etichetta si allontana
 *   dal dispositivo quanto lui cresce
 */
export function portLabelPoint(from: Point, to: Point, end: "a" | "b", scale = 1): Point {
  const point =
    end === "a" ? pointNear(from, to, 62 * scale, 13 * scale) : pointNear(to, from, 62 * scale, -13 * scale);
  return { x: point.x, y: point.y + 4 * scale };
}
