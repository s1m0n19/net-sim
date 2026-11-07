// Disegnare un riquadro trascinando sullo sfondo, con lo strumento Riquadro
// della colonna (D-117). Mentre si trascina si vede l'anteprima
// (`session.sketch`); lasciando il pulsante il riquadro nasce, selezionato,
// come un solo passo da annullare. Un clic senza trascinare non crea nulla,
// ed Esc a metà trascinamento rinuncia.

import type { Position } from "../../storage/load";
import { preferences } from "../preferences.svelte";
import { session } from "../session.svelte";
import { rectBetween } from "./annotation-geometry";

// Di quanti pixel deve muoversi il puntatore perché il clic diventi un riquadro.
const THRESHOLD = 4;

/**
 * Collega al disegno il gesto che disegna i riquadri. Si usa come azione
 * di Svelte: `<svg use:boxDrawing>`.
 *
 * @param svg - il disegno
 * @returns ciò che serve a Svelte per scollegare il gesto
 */
export function boxDrawing(svg: SVGSVGElement) {
  function toDrawing(clientX: number, clientY: number): Position {
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  let from: { client: Position; drawing: Position } | null = null;
  let drawing = false;
  let justDrew = false;

  function onDown(event: PointerEvent) {
    // Solo sullo sfondo, con lo strumento scelto, e mai in presentazione.
    if (event.button !== 0 || event.target !== svg || session.annotating !== "box" || preferences.presenting) return;
    from = { client: { x: event.clientX, y: event.clientY }, drawing: toDrawing(event.clientX, event.clientY) };
    svg.setPointerCapture?.(event.pointerId);
  }

  function onMove(event: PointerEvent) {
    if (from === null) return;
    if (!drawing) {
      if (Math.hypot(event.clientX - from.client.x, event.clientY - from.client.y) < THRESHOLD) return;
      drawing = true;
    } else if (session.sketch === null) {
      // Esc ha tolto l'anteprima: il riquadro non si disegna più.
      from = null;
      drawing = false;
      return;
    }
    session.sketch = rectBetween(from.drawing, toDrawing(event.clientX, event.clientY));
  }

  function onUp(event: PointerEvent) {
    const sketch = session.sketch;
    if (drawing && sketch !== null && event.type === "pointerup") {
      const id = session.addBox(sketch);
      session.select({ kind: "annotation", id });
      justDrew = true;
    }
    session.sketch = null;
    from = null;
    drawing = false;
  }

  // Dopo aver disegnato il browser manda comunque un clic sullo sfondo, che
  // toglierebbe la selezione: lo si ferma qui.
  function onClick(event: MouseEvent) {
    if (!justDrew) return;
    justDrew = false;
    event.stopPropagation();
  }

  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);
  svg.addEventListener("click", onClick, { capture: true });

  return {
    destroy() {
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("click", onClick, { capture: true });
    },
  };
}
