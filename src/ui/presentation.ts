// La modalità presentazione: l'app proiettata in aula, per condurre una
// dimostrazione. Spariscono i comandi per costruire la rete, tutto si
// ingrandisce, e la simulazione si comanda anche da tastiera.

import { preferences } from "./preferences.svelte";
import { session } from "./session.svelte";
import { pause, start, stepOnce } from "./simulation/playback";
import type { Bounds } from "./view";

// Com'era la schermata prima di entrare, per rimetterla uguale all'uscita.
let before: { stripOpen: boolean; camera: Bounds | null } | null = null;

/**
 * Entra in modalità presentazione: la fascia in basso si chiude, gli
 * strumenti per costruire si posano, e il disegno si ingrandisce e viene
 * inquadrato per intero (ci pensa il disegno, quando cambia l'ingrandimento).
 */
export function enterPresentation(): void {
  if (preferences.presenting) return;
  before = { stripOpen: preferences.stripOpen, camera: session.camera };
  preferences.stripOpen = false;
  session.placing = null;
  session.cabling = false;
  session.linkFrom = null;
  preferences.presenting = true;
}

/** Esce dalla modalità presentazione e rimette fascia e inquadratura com'erano. */
export function exitPresentation(): void {
  if (!preferences.presenting) return;
  preferences.presenting = false;
  if (before !== null) {
    preferences.stripOpen = before.stripOpen;
    session.camera = before.camera;
  }
  before = null;
}

/**
 * Le scorciatoie della modalità presentazione.
 *
 *   Spazio          avvia o mette in pausa
 *   Freccia destra  un passo
 *   E               apre o chiude la scheda Eventi
 *   T               apre o chiude i terminali
 *   Esc             esce dalla presentazione
 *
 * Chi sta scrivendo in una casella o nel terminale non le fa scattare.
 *
 * @param event - il tasto premuto
 * @returns true se il tasto era una scorciatoia ed è stato usato
 */
export function presentationKey(event: KeyboardEvent): boolean {
  if (!preferences.presenting || event.ctrlKey || event.metaKey || event.altKey) return false;

  if (event.key === "Escape") {
    // Prima Esc lascia andare ciò che era a metà: un ping da puntare, un
    // cavo cominciato, l'elenco delle porte. Poi esce.
    if (session.pingFrom !== null || session.linkFrom !== null || session.portMenu !== null) return false;
    exitPresentation();
    return true;
  }

  const target = event.target as HTMLElement | null;
  const tag = target?.tagName ?? "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return false;

  switch (event.key.toLowerCase()) {
    case " ": {
      // Su un pulsante, o su un dispositivo del disegno, lo spazio fa già
      // ciò che farebbe un clic.
      if (tag === "BUTTON" || target?.getAttribute("role") === "button") return false;
      if (session.running) pause();
      else if (!session.view.suspended) start();
      break;
    }
    case "arrowright":
      if (!session.running) stepOnce();
      break;
    case "e":
      toggleStrip("events");
      break;
    case "t": {
      // Il terminale da mostrare: quello già in primo piano, altrimenti
      // l'ultimo aperto, altrimenti quello del PC selezionato.
      const front = session.terminals.find((terminal) => terminal.deviceId === session.activeTab);
      const last = session.terminals.at(-1);
      const selected = session.selection?.kind === "device" ? session.selection.id : null;
      const host = session.view.devices.find((device) => device.id === selected && device.kind === "host");
      if (front !== undefined || last !== undefined) {
        toggleStrip((front ?? last)!.deviceId);
      } else if (host !== undefined) {
        session.openTerminal(host.id);
        preferences.stripOpen = true;
      }
      break;
    }
    default:
      return false;
  }
  event.preventDefault();
  return true;
}

// Apre la fascia in basso su una scheda; se è già aperta su quella, la chiude.
function toggleStrip(tab: string): void {
  if (preferences.stripOpen && session.activeTab === tab) {
    preferences.stripOpen = false;
  } else {
    session.activeTab = tab;
    preferences.stripOpen = true;
  }
}
