// I gesti su un'annotazione del disegno (D-117): un clic la seleziona,
// trascinarla la sposta, trascinare un angolo di un riquadro lo
// ridimensiona. Ogni trascinamento è un solo passo da annullare, come per i
// dispositivi (`holdBounds`). In presentazione si selezionano, ma non si
// spostano né si ridimensionano.

import type { Annotation, BoxAnnotation } from "../../storage/annotations-file";
import { preferences } from "../preferences.svelte";
import { MIN_BOX_SIZE } from "../session-annotations.svelte";
import { session } from "../session.svelte";
import { resizedFromCorner, type Corner } from "./annotation-geometry";
import { pointerDrag } from "./pointer-drag";

/**
 * Il nome di un'annotazione per il lettore di schermo: «Riquadro: LAN 1»,
 * «Nota: Configura le rotte…».
 *
 * @param annotation - il riquadro o la nota
 */
export function annotationName(annotation: Annotation): string {
  const text = (annotation.kind === "box" ? annotation.label : annotation.text).replace(/\s+/g, " ").trim();
  const what = annotation.kind === "box" ? "Riquadro" : "Nota";
  if (text === "") return annotation.kind === "box" ? "Riquadro senza etichetta" : "Nota vuota";
  return `${what}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`;
}

/**
 * Seleziona un'annotazione. Se si sta scegliendo la destinazione di un
 * ping o l'altro capo di un cavo, un'annotazione non è una risposta: il
 * clic non fa nulla.
 */
export function chooseAnnotation(id: string): void {
  if (session.pingFrom !== null || session.linkFrom !== null || session.cabling) return;
  session.select({ kind: "annotation", id });
}

/**
 * Il pulsante premuto su un'annotazione: se poi il puntatore si muove, la
 * si sposta.
 *
 * @param event - il pulsante premuto
 * @param annotation - l'annotazione sotto il puntatore
 * @param dragged - chiamata quando un trascinamento finisce: il clic che
 *   il browser manda subito dopo va ignorato
 */
export function pressAnnotation(event: PointerEvent, annotation: Annotation, dragged: () => void): void {
  if (event.button !== 0 || preferences.presenting) return;
  if (session.pingFrom !== null || session.linkFrom !== null || session.cabling) return;
  const start = { x: annotation.x, y: annotation.y };
  pointerDrag(event, {
    start() {
      session.select({ kind: "annotation", id: annotation.id });
      session.holdBounds(true);
    },
    move(dx, dy) {
      session.moveAnnotation(annotation.id, { x: start.x + dx, y: start.y + dy });
    },
    end(moved) {
      if (!moved) return;
      session.holdBounds(false);
      dragged();
    },
  });
}

/**
 * Il pulsante premuto su un angolo di un riquadro: trascinando, il
 * riquadro si allarga o si stringe da quella parte, mai sotto i 40×40.
 *
 * @param event - il pulsante premuto sulla maniglia
 * @param box - il riquadro
 * @param corner - quale angolo
 */
export function pressCorner(event: PointerEvent, box: BoxAnnotation, corner: Corner): void {
  if (event.button !== 0 || preferences.presenting) return;
  // La maniglia sta dentro l'annotazione: il gesto non è uno spostamento.
  event.stopPropagation();
  const start = { x: box.x, y: box.y, width: box.width, height: box.height };
  pointerDrag(event, {
    start() {
      session.holdBounds(true);
    },
    move(dx, dy) {
      session.resizeBox(box.id, resizedFromCorner(start, corner, dx, dy, MIN_BOX_SIZE));
    },
    end(moved) {
      if (moved) session.holdBounds(false);
    },
  });
}
