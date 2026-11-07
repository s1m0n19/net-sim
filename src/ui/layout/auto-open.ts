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

/** Che cosa c'è nella fascia in basso: quanti terminali aperti, quanti eventi. */
export interface StripContent {
  terminals: number;
  events: number;
}

/**
 * Dice se la fascia in basso va aperta, dopo che il suo contenuto è
 * cambiato (D-118). Si apre da sola solo quando compare il primo terminale,
 * che si apre sempre con un gesto esplicito; gli eventi, che il motore
 * scrive anche per ogni modifica della rete (posare, collegare,
 * rinominare), non la aprono mai. Si chiude da sola quando non resta più
 * nulla da mostrare: una rete nuova o riaperta, oppure Ricomincia senza
 * terminali. In mezzo vale la scelta di chi la usa.
 *
 * @param open - se la fascia è aperta adesso
 * @param before - che cosa conteneva prima
 * @param now - che cosa contiene adesso
 * @returns se deve essere aperta
 */
export function stripFollows(open: boolean, before: StripContent, now: StripContent): boolean {
  if (now.terminals > 0 && before.terminals === 0) return true;
  const had = before.terminals + before.events > 0;
  const has = now.terminals + now.events > 0;
  if (had && !has) return false;
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
