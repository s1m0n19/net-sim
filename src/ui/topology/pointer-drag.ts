// Un trascinamento su un elemento del disegno, misurato in unità del disegno
// (D-117). Lo usano le annotazioni, per spostarle e ridimensionarle: come per
// i dispositivi, un clic senza movimento resta un clic, e il trascinamento
// comincia solo dopo qualche pixel.

// Di quanti pixel deve muoversi il puntatore perché un clic diventi un trascinamento.
const THRESHOLD = 4;

/** Che cosa fare durante il trascinamento. */
export interface DragHandlers {
  /** Il trascinamento comincia: il puntatore si è mosso oltre la soglia. */
  start(): void;
  /** Il puntatore si è spostato di tanto, dall'inizio, in unità del disegno. */
  move(dx: number, dy: number): void;
  /** Il pulsante è stato lasciato, o il gesto interrotto: `moved` dice se c'è stato un trascinamento. */
  end(moved: boolean): void;
}

/**
 * Segue il puntatore dal pulsante premuto a quello lasciato, anche se esce
 * dall'elemento (cattura del puntatore). Anche un gesto interrotto
 * (pointercancel) chiude il trascinamento: niente resta a metà.
 *
 * @param event - il pulsante premuto sull'elemento
 * @param handlers - che cosa fare all'inizio, a ogni movimento e alla fine
 */
export function pointerDrag(event: PointerEvent, handlers: DragHandlers): void {
  const target = event.currentTarget as SVGElement;
  // Di quanti pixel dello schermo è fatta un'unità del disegno.
  const scale = target.ownerSVGElement?.getScreenCTM()?.a ?? 1;
  const from = { x: event.clientX, y: event.clientY };
  let moved = false;
  target.setPointerCapture?.(event.pointerId);

  function onMove(e: PointerEvent) {
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (!moved) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      moved = true;
      handlers.start();
    }
    handlers.move(dx / scale, dy / scale);
  }

  function onEnd() {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onEnd);
    target.removeEventListener("pointercancel", onEnd);
    handlers.end(moved);
  }

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onEnd);
  target.addEventListener("pointercancel", onEnd);
}
