// Dove aprire un menu perché stia tutto dentro uno spazio dato (D-116).
//
// Serve al menu "Altro" della barretta delle azioni: la barretta sta sopra
// il disegno, e il disegno taglia ciò che esce dai suoi bordi. Il menu
// sceglie il lato dove ci sta: allineato al bordo destro del pulsante,
// oppure al sinistro; sotto il pulsante, oppure sopra. Se non ci sta in
// nessun modo si accosta al bordo, e diventa più stretto (le scritte vanno a
// capo) o più basso (le voci scorrono). Tutto in pixel della pagina.

/** Un rettangolo: i quattro bordi. */
export interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Dove sta il menu: l'angolo in alto a sinistra, e i limiti se non ci sta intero. */
export interface MenuPlacement {
  left: number;
  top: number;
  // La larghezza, se quella naturale non ci sta.
  width: number | null;
  // L'altezza massima, se le voci non ci stanno tutte: scorrono.
  maxHeight: number | null;
  side: "below" | "above";
}

// Lo spazio tra il pulsante e il menu, e quello lasciato dai bordi.
const GAP = 6;
const MARGIN = 8;

/**
 * Sceglie dove aprire il menu.
 *
 * @param trigger - il pulsante che lo apre
 * @param menu - la grandezza naturale del menu
 * @param bounds - lo spazio da cui il menu non deve uscire
 * @param prefer - da che parte si aprirebbe di solito: allineato all'inizio
 *   o alla fine del pulsante, sotto o sopra
 */
export function placeMenu(
  trigger: Edges,
  menu: Size,
  bounds: Edges,
  prefer: { align: "start" | "end"; up: boolean },
): MenuPlacement {
  // Di lato: la larghezza che c'è, poi il primo allineamento in cui ci sta.
  const room = Math.max(0, bounds.right - bounds.left - 2 * MARGIN);
  const width = Math.min(menu.width, room);
  const lowest = bounds.left + MARGIN;
  const highest = bounds.right - MARGIN - width;
  const atEnd = trigger.right - width;
  const atStart = trigger.left;
  const choices = prefer.align === "end" ? [atEnd, atStart] : [atStart, atEnd];
  const fitting = choices.find((left) => left >= lowest && left <= highest);
  const left = fitting ?? Math.min(Math.max(choices[0], lowest), highest);

  // In verticale: dalla parte preferita se ci sta, altrimenti dall'altra;
  // se non ci sta da nessuna, dove c'è più spazio, e le voci scorrono.
  const below = bounds.bottom - MARGIN - (trigger.bottom + GAP);
  const above = trigger.top - GAP - (bounds.top + MARGIN);
  const sides = prefer.up ? (["above", "below"] as const) : (["below", "above"] as const);
  const space = { below, above };
  const side = sides.find((s) => menu.height <= space[s]) ?? (below >= above ? "below" : "above");
  const height = Math.min(menu.height, Math.max(0, space[side]));
  const top = side === "below" ? trigger.bottom + GAP : trigger.top - GAP - height;

  return {
    left,
    top,
    width: width < menu.width ? width : null,
    maxHeight: height < menu.height ? height : null,
    side,
  };
}
