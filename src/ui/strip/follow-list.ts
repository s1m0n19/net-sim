// Quando un elenco che si allunga deve seguire le righe nuove (D-113).
//
// Lo segue chi sta già guardando il fondo: arriva un evento e l'elenco
// scorre fino a mostrarlo. Chi invece è risalito a leggere gli eventi di
// prima resta dov'è, anche mentre la simulazione va avanti.

// Quanto si può stare sopra il fondo ed essere ancora "in fondo": una riga
// tagliata a metà non deve interrompere il seguire.
const SLACK = 24;

/**
 * Dice se l'elenco mostra il suo fondo, e quindi deve seguire le righe nuove.
 *
 * @param scrollTop - di quanto è scorso l'elenco, in pixel
 * @param clientHeight - l'altezza visibile dell'elenco
 * @param scrollHeight - l'altezza di tutto il contenuto
 */
export function atBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollTop + clientHeight >= scrollHeight - SLACK;
}
