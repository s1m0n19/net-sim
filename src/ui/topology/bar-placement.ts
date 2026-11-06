// Dove mettere la barretta delle azioni sullo schermo (D-111): accanto a
// ciò che è selezionato, sempre per intero dentro il disegno.
//
// Di preferenza sta sopra l'oggetto, centrata; se sopra non c'è posto va
// sotto le sue scritte, e se nemmeno lì c'è posto si ferma al bordo basso.
// Di lato non esce mai dal disegno. Tutto in pixel dello schermo.

/** L'oggetto selezionato, sullo schermo: il centro e il bordo alto e basso. */
export interface ScreenAnchor {
  x: number;
  top: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Dove sta la barretta: l'angolo in alto a sinistra, e se è sopra o sotto. */
export interface BarPlacement {
  left: number;
  top: number;
  side: "above" | "below";
}

// Lo spazio tra la barretta e l'oggetto, e quello lasciato dai bordi.
const GAP = 10;
const MARGIN = 8;

/**
 * Sceglie dove mettere la barretta.
 *
 * @param anchor - l'oggetto selezionato, in pixel del disegno sullo schermo
 * @param bar - la grandezza della barretta
 * @param area - la grandezza del disegno sullo schermo
 * @returns l'angolo in alto a sinistra della barretta, e da che parte sta
 */
export function placeBar(anchor: ScreenAnchor, bar: Size, area: Size): BarPlacement {
  const left = clamp(anchor.x - bar.width / 2, MARGIN, area.width - bar.width - MARGIN);

  const above = anchor.top - GAP - bar.height;
  if (above >= MARGIN) return { left, top: above, side: "above" };

  const below = anchor.bottom + GAP;
  const lowest = area.height - bar.height - MARGIN;
  return { left, top: clamp(below, MARGIN, lowest), side: "below" };
}

// Un valore tra un minimo e un massimo; se lo spazio non basta, vince il
// minimo, così la barretta comincia comunque dentro il disegno.
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
