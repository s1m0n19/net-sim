// Muoversi sul disegno con il mouse: la rotella ingrandisce attorno al
// puntatore, trascinando lo sfondo si sposta la vista. I calcoli stanno in
// camera.ts; qui ci sono solo i gesti.

import { session } from "../session.svelte";
import type { Bounds } from "../view";
import { panned, zoomed } from "./camera";

// Di quanti pixel deve muoversi il mouse perché un clic diventi un
// trascinamento.
const THRESHOLD = 4;

/**
 * Collega al disegno i gesti che cambiano l'inquadratura. Si usa come
 * azione di Svelte: `<svg use:viewGestures={() => bounds}>`.
 *
 * @param svg - il disegno
 * @param currentBounds - dice qual è l'inquadratura in questo momento
 * @returns ciò che serve a Svelte per scollegare i gesti
 */
export function viewGestures(svg: SVGSVGElement, currentBounds: () => Bounds) {
  // Trasforma un punto dello schermo in un punto del disegno.
  function toDrawing(clientX: number, clientY: number) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  // La rotella ingrandisce e rimpicciolisce attorno al puntatore.
  function onWheel(event: WheelEvent) {
    // La pagina non deve scorrere mentre si ingrandisce.
    event.preventDefault();
    // Un trackpad manda molti scatti piccoli, una rotella pochi e grandi:
    // l'ingrandimento è proporzionale allo scatto, entro un limite.
    const delta = Math.max(-80, Math.min(80, event.deltaY));
    session.camera = zoomed(currentBounds(), Math.exp(-delta * 0.004), toDrawing(event.clientX, event.clientY));
  }

  // Trascinando lo sfondo si sposta la vista. Come per i dispositivi, si
  // aspetta qualche pixel di movimento: un clic resta un clic.
  let grab: { clientX: number; clientY: number; box: Bounds; scale: number } | null = null;
  let panning = false;
  let justPanned = false;

  function onDown(event: PointerEvent) {
    // Solo sullo sfondo: su un dispositivo o su un cavo il gesto è un altro.
    if (event.button !== 0 || event.target !== svg) return;
    const scale = svg.getScreenCTM()?.a ?? 1;
    grab = { clientX: event.clientX, clientY: event.clientY, box: currentBounds(), scale };
  }

  function onMove(event: PointerEvent) {
    if (grab === null) return;
    const dx = event.clientX - grab.clientX;
    const dy = event.clientY - grab.clientY;
    if (!panning) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      panning = true;
      svg.classList.add("panning");
      svg.setPointerCapture?.(event.pointerId);
    }
    // Il disegno segue il mouse: l'inquadratura va dalla parte opposta.
    session.camera = panned(grab.box, -dx / grab.scale, -dy / grab.scale);
  }

  function onUp() {
    if (panning) justPanned = true;
    grab = null;
    panning = false;
    svg.classList.remove("panning");
  }

  // Dopo uno spostamento della vista il browser manda comunque un clic:
  // lo si ferma qui, prima che posi un dispositivo o tolga la selezione.
  function onClick(event: MouseEvent) {
    if (!justPanned) return;
    justPanned = false;
    event.stopPropagation();
  }

  // Per poter impedire lo scorrimento della pagina, l'ascolto della
  // rotella va dichiarato "non passivo".
  svg.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);
  svg.addEventListener("click", onClick, { capture: true });

  return {
    destroy() {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("click", onClick, { capture: true });
    },
  };
}
