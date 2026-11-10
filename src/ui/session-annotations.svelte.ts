// Le annotazioni del disegno: riquadri colorati con un'etichetta, per
// mostrare le sottoreti, e note di testo (requisito ED-9, decisione D-103).
//
// È il sesto strato di `session` (vedi session.svelte.ts). Le annotazioni
// non toccano il simulatore: stanno accanto alle posizioni, nel primo
// strato, e come loro entrano nel file e nella cronologia. Aggiungere,
// cambiare colore o testo ed eliminare sono passi da annullare; spostare
// e ridimensionare no, perché avvengono trascinando: come per i
// dispositivi, è `holdBounds` a farne un solo passo.

import type { Annotation, AnnotationColor, BoxAnnotation } from "../storage/annotations-file";
import type { Position } from "../storage/load";
import { SessionEditing } from "./session-editing.svelte";

/** Il rettangolo di un riquadro: angolo in alto a sinistra e grandezza. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Il colore di un'annotazione appena posata.
const FIRST_COLOR: AnnotationColor = "blue";

// Un riquadro non diventa più piccolo di così, nemmeno ridimensionandolo:
// deve restare qualcosa da afferrare.
export const MIN_BOX_SIZE = 40;

/** Lo strumento di annotazione scelto nella colonna: riquadro o nota. */
export type AnnotationTool = "box" | "note";

export class SessionAnnotations extends SessionEditing {
  /**
   * Lo strumento di annotazione scelto nella colonna (D-117): con Riquadro
   * si disegna trascinando sul disegno, con Nota un clic posa una nota.
   * Resta scelto finché non lo si lascia, come il Cavo. Non è un
   * dispositivo: per questo non sta in `placing`.
   */
  annotating = $state<AnnotationTool | null>(null);

  /**
   * Il riquadro che si sta disegnando trascinando, in coordinate del
   * disegno: si vede come anteprima e diventa un'annotazione solo quando
   * si lascia il pulsante. Non va nel file né nella cronologia.
   */
  sketch = $state.raw<Rect | null>(null);

  /**
   * La nota appena posata il cui testo va scritto subito: il pannello
   * laterale ci porta il cursore, e poi lo azzera.
   */
  focusAnnotationText = $state<string | null>(null);

  /**
   * Sceglie uno strumento di annotazione, o lo lascia se era già scelto.
   * Lascia gli altri strumenti della colonna e i gesti a metà: ne resta
   * attivo uno solo.
   */
  chooseAnnotationTool(tool: AnnotationTool): void {
    const next = this.annotating === tool ? null : tool;
    this.releaseTools();
    this.annotating = next;
  }

  /** Lascia andare anche Riquadro e Nota, e il riquadro a metà (D-128). */
  override releaseTools(): void {
    super.releaseTools();
    this.annotating = null;
    this.sketch = null;
  }

  /** L'annotazione con un dato identificativo, se c'è. */
  annotation(id: string): Annotation | undefined {
    return this.annotations.find((a) => a.id === id);
  }

  /**
   * Elimina ciò che è selezionato. Un'annotazione si toglie dal disegno,
   * come un passo da annullare; un dispositivo o un cavo come sempre.
   */
  override removeSelection(): void {
    const selection = this.selection;
    if (selection?.kind !== "annotation") {
      super.removeSelection();
      return;
    }
    this.removeAnnotation(selection.id);
    this.selection = null;
  }

  // Aprendo un altro file o un foglio nuovo, nessuno strumento resta scelto.
  protected override networkReplaced(): void {
    this.annotating = null;
    this.sketch = null;
    super.networkReplaced();
  }
  /**
   * Aggiunge un riquadro senza etichetta.
   *
   * @param rect - dove e quanto è grande, in coordinate del disegno
   * @returns l'identificativo del riquadro
   */
  addBox(rect: Rect): string {
    const id = this.freeAnnotationId();
    this.record([...this.annotations, { kind: "box", id, ...this.sized(rect), color: FIRST_COLOR, label: "" }]);
    return id;
  }

  /**
   * Aggiunge una nota vuota: il testo si scrive dopo.
   *
   * @param position - l'angolo in alto a sinistra della nota
   * @returns l'identificativo della nota
   */
  addNote(position: Position): string {
    const id = this.freeAnnotationId();
    const { x, y } = this.rounded(position);
    this.record([...this.annotations, { kind: "note", id, x, y, color: FIRST_COLOR, text: "" }]);
    return id;
  }

  /**
   * Sposta un'annotazione, mettendo il suo angolo in alto a sinistra in un
   * altro punto. Non è un passo da annullare: lo è il trascinamento intero
   * (`holdBounds`).
   */
  moveAnnotation(id: string, position: Position): void {
    this.update(id, (a) => ({ ...a, ...this.rounded(position) }));
  }

  /**
   * Cambia posizione e grandezza di un riquadro, mai sotto `MIN_BOX_SIZE`.
   * Come lo spostamento, non è un passo da annullare da solo.
   */
  resizeBox(id: string, rect: Rect): void {
    this.update(id, (a) => (a.kind === "box" ? { ...a, ...this.sized(rect) } : a));
  }

  /** Cambia il colore di un'annotazione. */
  recolorAnnotation(id: string, color: AnnotationColor): void {
    this.record(this.annotations.map((a) => (a.id === id && a.color !== color ? { ...a, color } : a)));
  }

  /** Cambia l'etichetta di un riquadro o il testo di una nota. */
  setAnnotationText(id: string, text: string): void {
    this.record(
      this.annotations.map((a) => {
        if (a.id !== id) return a;
        if (a.kind === "box") return a.label === text ? a : { ...a, label: text };
        return a.text === text ? a : { ...a, text };
      }),
    );
  }

  /** Toglie un'annotazione dal disegno. */
  removeAnnotation(id: string): void {
    this.record(this.annotations.filter((a) => a.id !== id));
  }

  // Sostituisce le annotazioni con quelle date, come un passo da annullare.
  // Se non cambia nulla (stesse annotazioni, una per una), non c'è niente
  // da ricordare.
  private record(next: Annotation[]): void {
    const same = next.length === this.annotations.length && next.every((a, i) => a === this.annotations[i]);
    if (same) return;
    const before = this.capture();
    this.annotations = next;
    this.remember(before);
    this.refresh();
  }

  // Cambia un'annotazione senza registrarlo nella cronologia.
  private update(id: string, change: (a: Annotation) => Annotation): void {
    this.annotations = this.annotations.map((a) => (a.id === id ? change(a) : a));
    this.refresh();
  }

  // Il primo identificativo libero della serie a1, a2…, come per i
  // dispositivi (D-46).
  private freeAnnotationId(): string {
    const used = new Set(this.annotations.map((a) => a.id));
    for (let n = 1; ; n++) {
      if (!used.has(`a${n}`)) return `a${n}`;
    }
  }

  private rounded(position: Position): Position {
    return { x: Math.round(position.x), y: Math.round(position.y) };
  }

  private sized(rect: Rect): Pick<BoxAnnotation, "x" | "y" | "width" | "height"> {
    return {
      ...this.rounded(rect),
      width: Math.max(MIN_BOX_SIZE, Math.round(rect.width)),
      height: Math.max(MIN_BOX_SIZE, Math.round(rect.height)),
    };
  }
}
