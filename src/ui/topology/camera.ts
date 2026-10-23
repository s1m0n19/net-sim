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

// Quando si conosce la grandezza del disegno sullo schermo, lo spazio per
// la barra della simulazione (e per i pulsanti dell'inquadratura, alla
// stessa altezza) si riserva in pixel, perché la barra ha sempre la stessa
// grandezza sullo schermo, comunque sia rimpicciolita la rete (D-107).
// Allora sotto la rete bastano le etichette.
export const BAR_RESERVE_PX = 72;
const FIT_MARGIN_WITH_SCREEN = { side: 90, top: 80, bottom: 90 };

/** La grandezza del disegno sullo schermo, in pixel. */
export interface Viewport {
  width: number;
  height: number;
}
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
 * @param scale - di quanto sono ingranditi dispositivi ed etichette (in
 *   presentazione più di 1): i margini crescono con loro, e anche la barra
 * @param viewport - la grandezza del disegno sullo schermo, se si conosce:
 *   allora sotto la rete si lasciano liberi i pixel della barra della
 *   simulazione, e l'inquadratura ha le proporzioni dello schermo
 * @returns l'inquadratura, oppure null se non c'è nulla da inquadrare
 */
export function fitted(devices: Point[], extras: Bounds[] = [], scale = 1, viewport?: Viewport): Bounds | null {
  if (devices.length === 0) return null;
  const base = viewport === undefined ? FIT_MARGIN : FIT_MARGIN_WITH_SCREEN;
  const margin = { side: base.side * scale, top: base.top * scale, bottom: base.bottom * scale };
  let left = Math.min(...devices.map((d) => d.x - margin.side), ...extras.map((e) => e.x - 20));
  let top = Math.min(...devices.map((d) => d.y - margin.top), ...extras.map((e) => e.y - 20));
  let right = Math.max(...devices.map((d) => d.x + margin.side), ...extras.map((e) => e.x + e.width + 20));
  let bottom = Math.max(...devices.map((d) => d.y + margin.bottom), ...extras.map((e) => e.y + e.height + 20));

  // Una rete piccola resta al centro di un riquadro di dimensione minima.
  // Il riquadro minimo non cresce con l'ingrandimento: altrimenti in
  // presentazione una rete piccola non si vedrebbe più grande.
  const missingWidth = Math.max(0, FIT_MIN.width - (right - left));
  const missingHeight = Math.max(0, FIT_MIN.height - (bottom - top));
  left -= missingWidth / 2;
  right += missingWidth / 2;
  top -= missingHeight / 2;
  bottom += missingHeight / 2;
  const box = { x: left, y: top, width: right - left, height: bottom - top };
  return viewport === undefined ? box : onScreenAbove(box, viewport, BAR_RESERVE_PX * scale);
}

// Trasforma il rettangolo da mostrare nell'inquadratura dello schermo
// intero, in modo che il rettangolo stia tutto nella parte sopra la barra
// e sia centrato lì. L'inquadratura ha le proporzioni dello schermo, così
// il disegno non aggiunge altro spazio per conto suo.
function onScreenAbove(box: Bounds, viewport: Viewport, reservedPx: number): Bounds {
  const usableHeight = Math.max(1, viewport.height - reservedPx);
  // Pixel per unità del disegno: quanto si può ingrandire perché ci stia.
  const pixels = Math.min(viewport.width / box.width, usableHeight / box.height);
  const width = viewport.width / pixels;
  const height = viewport.height / pixels;
  return {
    x: box.x - (width - box.width) / 2,
    y: box.y - (usableHeight / pixels - box.height) / 2,
    width,
    height,
  };
}
