// I tasti che agiscono sul disegno.

import { preferences } from "../preferences.svelte";
import { presentationKey } from "../presentation";
import { session } from "../session.svelte";

// Chi sta scrivendo in una casella di testo, o nel terminale, non vuole
// che i tasti agiscano sul disegno.
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return target !== null && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * I tasti che agiscono sul disegno: le scorciatoie della presentazione,
 * Ctrl+Z e Ctrl+Maiusc+Z, Esc, Canc.
 *
 * @param event - il tasto premuto, in qualsiasi punto della pagina
 */
export function drawingKey(event: KeyboardEvent): void {
  // In presentazione alcuni tasti comandano la simulazione.
  if (presentationKey(event)) return;
  // Ctrl+Z annulla, Ctrl+Maiusc+Z o Ctrl+Y ripristina (Cmd su Mac). In
  // una casella di testo restano quelli del testo che si sta scrivendo.
  const letter = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !isTyping(event) && (letter === "z" || letter === "y")) {
    event.preventDefault();
    if (letter === "y" || event.shiftKey) session.redo();
    else session.undo();
    return;
  }
  if (event.key === "Escape") {
    // Esc lascia andare, nell'ordine: l'elenco delle porte, la voce
    // scelta nella colonna, il cavo cominciato, lo strumento Cavo, il
    // ping in attesa della destinazione, la selezione.
    if (session.portMenu !== null) {
      session.portMenu = null;
    } else if (session.placing !== null) {
      session.placing = null;
    } else if (session.linkFrom !== null) {
      session.linkFrom = null;
    } else if (session.cabling) {
      session.cabling = false;
    } else if (session.pingFrom !== null) {
      session.pingFrom = null;
    } else {
      session.select(null);
    }
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && !isTyping(event) && !preferences.presenting) {
    session.removeSelection();
  }
}
