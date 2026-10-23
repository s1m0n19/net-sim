// Le annotazioni del disegno (requisito ED-9, decisione D-103): riquadri
// colorati con un'etichetta, per mostrare le sottoreti, e note di testo,
// per scrivere una consegna. Non fanno parte della rete: come le posizioni
// dei dispositivi, stanno fuori dal motore. Nel file sono un elenco
// accanto alla rete, scritto solo se c'è almeno un'annotazione.
// Il formato è descritto in docs/formato-file.md.

import { checkUnique, readText } from "./fields";

/**
 * I colori di un'annotazione: cinque tinte tenui fisse, leggibili nei due
 * temi (D-103). Qui c'è solo il nome; i valori stanno nel tema.
 */
export const ANNOTATION_COLORS = ["blue", "green", "yellow", "red", "purple"] as const;

export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];

/** Un riquadro: un rettangolo dietro ai dispositivi, con un'etichetta nell'angolo. */
export interface BoxAnnotation {
  kind: "box";
  id: string;
  // L'angolo in alto a sinistra e la grandezza, in coordinate del disegno.
  x: number;
  y: number;
  width: number;
  height: number;
  color: AnnotationColor;
  // Anche vuota: un riquadro può bastare da solo.
  label: string;
}

/** Una nota: un testo libero sul disegno. */
export interface NoteAnnotation {
  kind: "note";
  id: string;
  // L'angolo in alto a sinistra del testo.
  x: number;
  y: number;
  color: AnnotationColor;
  text: string;
}

export type Annotation = BoxAnnotation | NoteAnnotation;

/**
 * Legge le annotazioni di un file, dopo averle controllate.
 *
 * @param source - il campo "annotations" del file; se manca, nessuna
 * @returns le annotazioni, nell'ordine del file
 * @throws Error se il campo non è un elenco, se un'annotazione è di un tipo
 *   sconosciuto, ha un campo mancante o del tipo sbagliato, un colore che
 *   non esiste, una grandezza non positiva, o un identificativo ripetuto
 */
export function readAnnotations(source: unknown): Annotation[] {
  if (source === undefined) return [];
  if (!Array.isArray(source)) {
    throw new Error('Il campo "annotations" deve essere un elenco.');
  }
  const annotations = source.map((a: any, index: number) => readAnnotation(a, `Annotazione n. ${index + 1}`));
  checkUnique(
    annotations.map((a) => a.id),
    "Identificativo di annotazione duplicato",
  );
  return annotations;
}

function readAnnotation(a: any, where: string): Annotation {
  const id = readText(a, "id", where);
  const x = readCoordinate(a, "x", id);
  const y = readCoordinate(a, "y", id);
  const color = readColor(a, id);
  switch (a?.kind) {
    case "box": {
      const width = readSize(a, "width", id);
      const height = readSize(a, "height", id);
      return { kind: "box", id, x, y, width, height, color, label: readString(a, "label", id) };
    }
    case "note":
      return { kind: "note", id, x, y, color, text: readString(a, "text", id) };
    default:
      throw new Error(`Annotazione ${id}: tipo sconosciuto: ${a?.kind}.`);
  }
}

function readCoordinate(source: any, field: string, id: string): number {
  const value = source[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Annotazione ${id}: il campo "${field}" manca o non è un numero.`);
  }
  return value;
}

// La larghezza o l'altezza di un riquadro: un numero maggiore di zero.
function readSize(source: any, field: string, id: string): number {
  const value = readCoordinate(source, field, id);
  if (value <= 0) {
    throw new Error(`Annotazione ${id}: il campo "${field}" deve essere maggiore di zero.`);
  }
  return value;
}

function readColor(source: any, id: string): AnnotationColor {
  const value = source.color;
  if (!ANNOTATION_COLORS.includes(value)) {
    throw new Error(`Annotazione ${id}: colore sconosciuto: ${value}.`);
  }
  return value;
}

// Un testo che può anche essere vuoto, a differenza di `readText`.
function readString(source: any, field: string, id: string): string {
  const value = source[field];
  if (typeof value !== "string") {
    throw new Error(`Annotazione ${id}: il campo "${field}" manca o non è un testo.`);
  }
  return value;
}

/**
 * Le annotazioni come si scrivono nel file, con i campi sempre nello stesso
 * ordine: così due file della stessa rete si confrontano riga per riga.
 *
 * @param annotations - le annotazioni del disegno
 * @returns gli oggetti da mettere nel campo "annotations"
 */
export function annotationsToWrite(annotations: Annotation[]): object[] {
  return annotations.map((a) =>
    a.kind === "box"
      ? { kind: a.kind, id: a.id, x: a.x, y: a.y, width: a.width, height: a.height, color: a.color, label: a.label }
      : { kind: a.kind, id: a.id, x: a.x, y: a.y, color: a.color, text: a.text },
  );
}
