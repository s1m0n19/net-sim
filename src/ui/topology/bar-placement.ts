// Dove mettere la barretta delle azioni sullo schermo (D-111): accanto a
// ciò che è selezionato, sempre per intero dentro il disegno.
//
// Di preferenza sta sopra l'oggetto, centrata; se sopra non c'è posto va
// sotto le sue scritte, e se nemmeno lì c'è posto si ferma al bordo basso.
// Sopra o sotto, evita se può i comandi che stanno sul disegno (lo zoom,
// la barra della simulazione): copriti, non si potrebbero usare (D-112).
// Di lato non esce mai dal disegno: se con le scritte è troppo larga, la
// barretta le toglie (barFits). Tutto in pixel dello schermo.

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

/** Un rettangolo sullo schermo, misurato dal bordo del disegno. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
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
 * @param obstacles - i comandi sul disegno da non coprire, se si può
 * @returns l'angolo in alto a sinistra della barretta, e da che parte sta
 */
export function placeBar(anchor: ScreenAnchor, bar: Size, area: Size, obstacles: Rect[] = []): BarPlacement {
  const within = (left: number) => clamp(left, MARGIN, area.width - bar.width - MARGIN);
  const centred = within(anchor.x - bar.width / 2);
  const above = anchor.top - GAP - bar.height;
  const below = clamp(anchor.bottom + GAP, MARGIN, area.height - bar.height - MARGIN);
  const aboveFits = above >= MARGIN;

  // A una data altezza, il primo posto libero: centrata, oppure spostata
  // di lato quanto basta per scansare un comando, purché resti sopra (o
  // sotto) l'oggetto.
  const freeLeft = (top: number): number | null => {
    const hits = (left: number) =>
      obstacles.filter((o) => left < o.right && o.left < left + bar.width && top < o.bottom && o.top < top + bar.height);
    const choices = [centred, ...hits(centred).flatMap((o) => [within(o.left - GAP - bar.width), within(o.right + GAP)])];
    return choices.find((left) => hits(left).length === 0 && left <= anchor.x && anchor.x <= left + bar.width) ?? null;
  };

  // Sopra, se c'è posto e non copre nulla; altrimenti sotto, se lì non
  // copre nulla. Se coprirebbe qualcosa in tutti e due i posti, vale la
  // regola di sempre: sopra se c'è posto, altrimenti sotto.
  const leftAbove = aboveFits ? freeLeft(above) : null;
  if (leftAbove !== null) return { left: leftAbove, top: above, side: "above" };
  const leftBelow = freeLeft(below);
  if (leftBelow !== null) return { left: leftBelow, top: below, side: "below" };
  return aboveFits ? { left: centred, top: above, side: "above" } : { left: centred, top: below, side: "below" };
}

/**
 * Dice se una barretta così larga sta nel disegno, margini compresi. Se non
 * ci sta, la barretta passa alla forma compatta, senza scritte (D-112).
 *
 * @param barWidth - la larghezza della barretta con le scritte
 * @param areaWidth - la larghezza del disegno sullo schermo
 */
export function barFits(barWidth: number, areaWidth: number): boolean {
  return barWidth <= areaWidth - 2 * MARGIN;
}

// Un valore tra un minimo e un massimo; se lo spazio non basta, vince il
// minimo, così la barretta comincia comunque dentro il disegno.
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
