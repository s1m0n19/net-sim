// In che stato è la simulazione, a parole, per la barra della simulazione
// (D-113). Si guarda solo ciò che si sa davvero: se il tempo reale è stato
// avviato e se il motore si è sospeso.
//
// Che non ci sia nulla in programma non vuol dire nulla: avviato, il tempo
// reale resta in ascolto e un ping lanciato dopo parte da solo. Per questo
// non esistono stati come "Completata" o "In attesa", e nemmeno
// "Passo-passo": un passo dura un istante, e poi la simulazione è ferma.

export type SimulationState = "stopped" | "running" | "suspended";

/**
 * Lo stato della simulazione.
 *
 * @param running - se il tempo reale è stato avviato (`session.running`)
 * @param suspended - se il motore ha sospeso la simulazione, per esempio
 *   per una tempesta di broadcast
 */
export function simulationState(running: boolean, suspended: boolean): SimulationState {
  if (suspended) return "suspended";
  return running ? "running" : "stopped";
}

/** La scritta dello stato, e la spiegazione che compare passandoci sopra. */
export const STATE_TEXT: Record<SimulationState, { label: string; description: string }> = {
  stopped: {
    label: "Ferma",
    description: "Il tempo non scorre: Avvia lo fa scorrere, Passo avanza di un istante",
  },
  running: {
    label: "In esecuzione",
    description: "Il tempo scorre da solo; quando non c'è nulla in programma resta in ascolto",
  },
  suspended: {
    label: "Sospesa",
    description: "Il simulatore si è fermato e non accetta altre azioni: si riparte con Ricomincia",
  },
};
