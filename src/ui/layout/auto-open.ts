// Fascia in basso e pannello laterale si aprono e si chiudono da soli
// seguendo ciò che hanno da mostrare (decisione D-107): così il disegno ha
// tutto lo spazio quando non c'è nulla da leggere altrove.
//
// La regola agisce solo quando il contenuto compare o sparisce. In mezzo
// vale la scelta di chi usa l'app: se chiude la fascia mentre ci sono
// eventi, resta chiusa finché il contenuto non sparisce e ricompare.

/**
 * Dice se un'area va aperta, dopo che il suo contenuto è cambiato.
 *
 * @param open - se l'area è aperta adesso
 * @param had - se aveva qualcosa da mostrare prima
 * @param has - se ha qualcosa da mostrare adesso
 * @returns aperta se il contenuto è appena comparso, chiusa se è appena
 *   sparito, altrimenti com'era
 */
export function followContent(open: boolean, had: boolean, has: boolean): boolean {
  if (has && !had) return true;
  if (!has && had) return false;
  return open;
}

/** L'altezza della fascia in basso, sotto le schede, in pixel. */
export const STRIP_HEIGHT = { initial: 190, min: 100 };

/**
 * L'altezza della fascia dopo averne trascinato il bordo, entro i limiti:
 * mai sotto il minimo, e mai oltre il 60% della finestra, perché il
 * disegno resti sempre visibile.
 *
 * @param wanted - l'altezza a cui si è arrivati trascinando
 * @param windowHeight - l'altezza della finestra
 * @returns l'altezza da usare
 */
export function stripHeightWithin(wanted: number, windowHeight: number): number {
  const max = Math.max(STRIP_HEIGHT.min, Math.round(windowHeight * 0.6));
  return Math.min(max, Math.max(STRIP_HEIGHT.min, Math.round(wanted)));
}
