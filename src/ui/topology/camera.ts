// L'inquadratura scelta dall'utente: quale rettangolo del disegno si vede.
//
// Finché l'utente non tocca nulla l'inquadratura è automatica (il foglio
// di base, vedi view.ts). Appena ingrandisce, sposta o preme Adatta,
// diventa un rettangolo fisso, che cambia solo quando lo cambia lui.
// Qui ci sono i calcoli, senza schermo: si provano da soli.

import type { Bounds } from "../view";
import type { Point } from "./geometry";

// Quanto si può ingrandire e rimpicciolire, come larghezza del rettangolo
// inquadrato. Il foglio di base è largo 800: si va da quattro volte più
// vicino a cinque volte più lontano.
export const MIN_WIDTH = 200;
export const MAX_WIDTH = 4000;

// Di quanto ingrandisce o rimpicciolisce un clic su + o su −.
export const ZOOM_STEP = 1.25;

// Spazio lasciato attorno alla rete da Adatta. Sotto ne serve di più: lì
// stanno le etichette, e sopra al disegno c'è la barra della simulazione.
const FIT_MARGIN = { side: 90, top: 80, bottom: 150 };
// Adatta non ingrandisce oltre questo: un PC solo non riempie lo schermo.
const FIT_MIN = { width: 560, height: 350 };

/**
 * Ingrandisce o rimpicciolisce l'inquadratura tenendo fermo un punto: ciò
 * che sta sotto il puntatore resta sotto il puntatore.
 *
 * @param box - l'inquadratura di adesso
 * @param factor - maggiore di 1 ingrandisce, minore di 1 rimpicciolisce
 * @param around - il punto del disegno che deve restare fermo
 * @returns la nuova inquadratura, entro i limiti di ingrandimento
 */
export function zoomed(box: Bounds, factor: number, around: Point): Bounds {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, box.width / factor));
  // Il rapporto davvero applicato: ai limiti è diverso da quello chiesto.
  const scale = width / box.width;
  return {
    x: around.x - (around.x - box.x) * scale,
    y: around.y - (around.y - box.y) * scale,
    width,
    height: box.height * scale,
  };
}

/**
 * Sposta l'inquadratura.
 *
 * @param box - l'inquadratura di partenza
 * @param dx - di quanto spostarla verso destra, in unità del disegno
 * @param dy - di quanto spostarla verso il basso
 * @returns la nuova inquadratura, grande uguale
 */
export function panned(box: Bounds, dx: number, dy: number): Bounds {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

/**
 * L'inquadratura che contiene tutta la rete, con un po' di margine.
 *
 * @param devices - le posizioni dei dispositivi
 * @param extras - altri rettangoli da tenere dentro, come le tabelle appuntate
 * @returns l'inquadratura, oppure null se non c'è nulla da inquadrare
 */
export function fitted(devices: Point[], extras: Bounds[] = []): Bounds | null {
  if (devices.length === 0) return null;
  let left = Math.min(...devices.map((d) => d.x - FIT_MARGIN.side), ...extras.map((e) => e.x - 20));
  let top = Math.min(...devices.map((d) => d.y - FIT_MARGIN.top), ...extras.map((e) => e.y - 20));
  let right = Math.max(...devices.map((d) => d.x + FIT_MARGIN.side), ...extras.map((e) => e.x + e.width + 20));
  let bottom = Math.max(...devices.map((d) => d.y + FIT_MARGIN.bottom), ...extras.map((e) => e.y + e.height + 20));

  // Una rete piccola resta al centro di un riquadro di dimensione minima.
  const missingWidth = Math.max(0, FIT_MIN.width - (right - left));
  const missingHeight = Math.max(0, FIT_MIN.height - (bottom - top));
  left -= missingWidth / 2;
  right += missingWidth / 2;
  top -= missingHeight / 2;
  bottom += missingHeight / 2;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
