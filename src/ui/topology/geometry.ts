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
 * @param flipped true per metterla dall'altro lato del cavo: serve quando
 *   il suo posto solito è occupato dall'indirizzo dell'interfaccia
 */
export function portLabelPoint(from: Point, to: Point, end: "a" | "b", scale = 1, flipped = false): Point {
  const side = (flipped ? -13 : 13) * scale;
  const point = end === "a" ? pointNear(from, to, 62 * scale, side) : pointNear(to, from, 62 * scale, -side);
  return { x: point.x, y: point.y + 4 * scale };
}

/**
 * Dove sta scritto l'indirizzo di un'interfaccia di router, accanto al suo
 * capo del cavo, e da che parte si allinea il testo.
 *
 * Il testo comincia appena fuori dal router e si allontana da lui, sopra
 * il cavo. Se il cavo sale, sta invece sotto: così una scritta, che è
 * orizzontale, non attraversa mai un cavo in diagonale.
 *
 * @param from il capo `a` del cavo
 * @param to   il capo `b` del cavo
 * @param end  di quale capo si vuole l'etichetta
 * @param scale di quanto è ingrandito il disegno
 * @param below true per metterla sotto un cavo orizzontale invece che
 *   sopra: serve quando sopra c'è già l'indirizzo dell'altro capo
 * @param centred true per centrarla a metà del cavo invece di farla
 *   partire dal router: serve quando il cavo è troppo corto perché ci
 *   stia per intero, e finirebbe sopra il dispositivo all'altro capo
 * @returns il punto, e l'allineamento del testo rispetto a quel punto
 */
export function addressLabelPoint(
  from: Point,
  to: Point,
  end: "a" | "b",
  scale = 1,
  below = false,
  centred = false,
): Point & { anchor: "start" | "middle" | "end" } {
  const [start, other] = end === "a" ? [from, to] : [to, from];
  const length = Math.hypot(other.x - start.x, other.y - start.y) || 1;
  const ux = (other.x - start.x) / length;
  const uy = (other.y - start.y) / length;

  const along = centred ? length / 2 : 52 * scale;
  let x = start.x + ux * along;
  let y = start.y + uy * along;
  // Sotto il cavo se il cavo sale, o se sopra il posto è preso.
  const under = uy < -0.25 || (Math.abs(uy) <= 0.25 && below);
  y += (under ? 17 : -8) * scale;
  // Un cavo quasi verticale: la scritta sta alla sua destra.
  if (Math.abs(ux) <= 0.25) x += 10 * scale;
  if (centred && Math.abs(ux) > 0.25) return { x, y, anchor: "middle" };
  return { x, y, anchor: ux < -0.25 ? "end" : "start" };
}
