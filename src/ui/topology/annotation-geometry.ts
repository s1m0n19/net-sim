// I calcoli delle annotazioni sul disegno (ED-9, D-117): il rettangolo che
// si disegna trascinando, il riquadro ridimensionato da un angolo, le righe
// di una nota e lo spazio che occupa. Funzioni pure, in coordinate del
// disegno: le usano il disegno, l'inquadratura e, più avanti, l'immagine
// esportata, che non può misurare il testo sullo schermo.

import type { Annotation } from "../../storage/annotations-file";
import type { Position } from "../../storage/load";

/** Un rettangolo: angolo in alto a sinistra e grandezza. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Un angolo del riquadro, come i punti cardinali: nord-ovest, nord-est… */
export type Corner = "nw" | "ne" | "sw" | "se";

/** La misura del testo delle note, a ingrandimento 1. */
export const NOTE_FONT_SIZE = 14;
const LINE_HEIGHT = 1.35;
const PADDING_X = 8;
const PADDING_Y = 6;
// Una riga va a capo dopo tanti caratteri: la nota non si allarga oltre.
export const NOTE_LINE_CHARS = 40;
// La larghezza media di un carattere di IBM Plex Sans, abbondante: lo
// sfondo della nota resta sempre un po' più largo del testo.
const CHAR_WIDTH = 0.6;

/** Che cosa mostra una nota senza testo: si vede, ma non è nel file. */
export const EMPTY_NOTE = "Nota vuota";

/**
 * Il rettangolo che ha per angoli opposti due punti, in qualsiasi ordine:
 * si può trascinare verso destra o verso sinistra, in su o in giù.
 */
export function rectBetween(a: Position, b: Position): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * Un riquadro ridimensionato trascinando uno dei suoi angoli: l'angolo
 * opposto resta fermo, e il riquadro non scende sotto la grandezza minima
 * (non si ribalta se si trascina oltre l'angolo opposto).
 *
 * @param start - il riquadro com'era quando è cominciato il trascinamento
 * @param corner - l'angolo afferrato
 * @param dx - di quanto si è mosso il puntatore, in unità del disegno
 * @param dy - idem, in verticale
 * @param min - la grandezza minima di un lato
 */
export function resizedFromCorner(start: Rect, corner: Corner, dx: number, dy: number, min: number): Rect {
  const west = corner === "nw" || corner === "sw";
  const north = corner === "nw" || corner === "ne";
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const width = Math.max(min, start.width + (west ? -dx : dx));
  const height = Math.max(min, start.height + (north ? -dy : dy));
  return {
    x: west ? right - width : start.x,
    y: north ? bottom - height : start.y,
    width,
    height,
  };
}

/**
 * Le righe di una nota: quelle scritte, con i ritorni a capo, e quelle
 * troppo lunghe spezzate tra le parole (una parola più lunga di una riga si
 * spezza dove capita).
 *
 * @param text - il testo della nota
 * @param maxChars - quanti caratteri al massimo per riga
 */
export function noteLines(text: string, maxChars = NOTE_LINE_CHARS): string[] {
  if (text.trim() === "") return [];
  const lines: string[] = [];
  for (const written of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of written.split(/ +/)) {
      let rest = word;
      while (rest.length > maxChars) {
        if (line !== "") {
          lines.push(line);
          line = "";
        }
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      if (line === "") line = rest;
      else if (line.length + 1 + rest.length <= maxChars) line += ` ${rest}`;
      else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Come si dispone una nota: le righe da scrivere e lo spazio che occupa. */
export interface NoteLayout {
  lines: string[];
  // La nota non ha testo: si mostra EMPTY_NOTE, attenuato.
  empty: boolean;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
}

/**
 * Dispone il testo di una nota.
 *
 * @param text - il testo della nota
 * @param scale - l'ingrandimento della presentazione
 */
export function noteLayout(text: string, scale = 1): NoteLayout {
  const written = noteLines(text);
  const empty = written.length === 0;
  const lines = empty ? [EMPTY_NOTE] : written;
  const fontSize = NOTE_FONT_SIZE * scale;
  const lineHeight = fontSize * LINE_HEIGHT;
  const paddingX = PADDING_X * scale;
  const paddingY = PADDING_Y * scale;
  const longest = Math.max(...lines.map((line) => line.length));
  return {
    lines,
    empty,
    width: Math.ceil(longest * CHAR_WIDTH * fontSize + 2 * paddingX),
    height: Math.ceil(lines.length * lineHeight + 2 * paddingY),
    fontSize,
    lineHeight,
    paddingX,
    paddingY,
  };
}

/**
 * Lo spazio che un'annotazione occupa sul disegno: per inquadrarla.
 *
 * @param annotation - il riquadro o la nota
 * @param scale - l'ingrandimento della presentazione, che fa crescere il testo delle note
 */
export function annotationRect(annotation: Annotation, scale = 1): Rect {
  if (annotation.kind === "box") {
    return { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height };
  }
  const { width, height } = noteLayout(annotation.text, scale);
  return { x: annotation.x, y: annotation.y, width, height };
}
