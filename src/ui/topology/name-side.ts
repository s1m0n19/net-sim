// Da che parte del riquadro sta il nome di uno switch o di un router:
// sotto, come sempre, oppure sopra (D-139).
//
// Nella disposizione delle lezioni, ad albero, i cavi scendono dallo switch
// verso i PC, e quello centrale taglia il nome scritto sotto. La regola è
// semplice e si può spiegare: il nome va sopra quando i cavi del
// dispositivo scendono più di quanto salgono (la strategia "direzionale
// pesata" dello studio M2-C2), ma solo se sotto un cavo lo attraversa
// davvero e sopra ne lo attraversano meno. A parità resta sotto.
//
// Tutto in unità del disegno e sempre con le misure dell'editor: il lato
// non cambia con lo zoom, con la presentazione o con l'ingrandimento.
// Nessuno spostamento laterale, nessuna misura del testo nel browser: la
// larghezza del nome si stima dal numero dei caratteri.

import type { DeviceView, LinkView } from "../view";
import { EDITOR_SHAPE } from "./device-shape";

/** Il lato del nome rispetto al riquadro. */
export type NameSide = "below" | "above";

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Da quanto i cavi devono scendere più di quanto salgono perché il nome
// vada sopra: mezzo cavo verticale.
export const DOWNWARD_THRESHOLD = 0.5;

// La larghezza media di un carattere del nome, in rapporto alla sua
// grandezza (IBM Plex Sans in grassetto medio). È una stima: basta a
// sapere se un cavo passa sul nome, non a disegnarlo.
const CHARACTER_WIDTH = 0.62;

/**
 * Quanto i cavi di un dispositivo scendono, al netto di quanto salgono.
 * Ogni cavo pesa quanto la sua componente verticale: 1 se scende in
 * verticale, −1 se sale in verticale, 0 se è orizzontale. Un cavo di
 * lunghezza nulla non pesa.
 *
 * @param device - il centro del dispositivo
 * @param neighbours - il centro di ogni dispositivo all'altro capo dei suoi cavi
 * @returns la somma dei pesi; positiva se i cavi scendono di più
 */
export function downwardWeight(device: Point, neighbours: Point[]): number {
  let sum = 0;
  for (const other of neighbours) {
    const dx = other.x - device.x;
    const dy = other.y - device.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) sum += dy / length;
  }
  return sum;
}

/**
 * Il rettangolo che il nome occupa sotto o sopra il dispositivo, con le
 * misure dell'editor e la larghezza stimata dai caratteri.
 *
 * @param device - il centro del dispositivo
 * @param name - il nome
 * @param side - sotto o sopra
 */
export function nameRect(device: Point, name: string, side: NameSide): Rect {
  const shape = EDITOR_SHAPE;
  const width = Math.max(1, name.length) * shape.nameSize * CHARACTER_WIDTH;
  // La linea di base, e sopra di lei l'altezza delle maiuscole; sotto, lo
  // spazio delle lettere con la gamba (p, g).
  const baseline = device.y + (side === "below" ? shape.nameY : shape.nameAboveY);
  const top = baseline - shape.nameSize * 0.75;
  return { x: device.x - width / 2, y: top, width, height: shape.nameSize };
}

/**
 * Quanti cavi attraversano un rettangolo. Ogni cavo è il segmento tra i
 * centri dei due dispositivi, come sul disegno.
 *
 * @param rect - il rettangolo
 * @param links - i cavi
 */
export function crossings(rect: Rect, links: Pick<LinkView, "from" | "to">[]): number {
  return links.filter((link) => segmentCrosses(link.from, link.to, rect)).length;
}

/**
 * Il lato del nome di ogni switch e router della rete. PC e server non ci
 * sono: il loro nome resta sempre sotto, con l'indirizzo.
 *
 * @param devices - i dispositivi, con il centro e il nome
 * @param links - i cavi, con i centri dei dispositivi ai due capi
 * @returns il lato per ogni switch e router, per identificativo
 */
export function nameSides(
  devices: Pick<DeviceView, "id" | "kind" | "name" | "x" | "y">[],
  links: Pick<LinkView, "from" | "to">[],
): Map<string, NameSide> {
  const sides = new Map<string, NameSide>();
  for (const device of devices) {
    if (device.kind !== "switch" && device.kind !== "router") continue;
    // I capi di un cavo sono i centri dei dispositivi: quelli del suo sono
    // nel punto in cui sta lui.
    const at = (point: Point) => point.x === device.x && point.y === device.y;
    const neighbours = links.flatMap((link) => (at(link.from) ? [link.to] : at(link.to) ? [link.from] : []));
    let side: NameSide = "below";
    if (downwardWeight(device, neighbours) >= DOWNWARD_THRESHOLD) {
      const below = crossings(nameRect(device, device.name, "below"), links);
      const above = crossings(nameRect(device, device.name, "above"), links);
      if (above < below) side = "above";
    }
    sides.set(device.id, side);
  }
  return sides;
}

// Il segmento passa dentro il rettangolo (ritaglio di Liang-Barsky).
function segmentCrosses(p: Point, q: Point, r: Rect): boolean {
  let enter = 0;
  let leave = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const edges: [number, number][] = [
    [-dx, p.x - r.x],
    [dx, r.x + r.width - p.x],
    [-dy, p.y - r.y],
    [dy, r.y + r.height - p.y],
  ];
  for (const [direction, distance] of edges) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }
    const t = distance / direction;
    if (direction < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  return leave - enter > 1e-9;
}
