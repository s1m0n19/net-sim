// La rete aperta in questo momento, e ciò che di lei va disegnato.
//
// È il punto di contatto tra l'interfaccia e il motore: i componenti
// leggono `session.view` e chiamano i metodi di `session`; nessuno di loro
// tocca il simulatore direttamente.

import { Simulator } from "../engine/simulator";
import { loadNetworkFile, type Position } from "../storage/load";
import { buildView, EMPTY_VIEW, type NetworkView } from "./view";

class Session {
  // Il nome del file aperto, senza estensione; null se la rete è nuova.
  fileName = $state<string | null>(null);
  // Un messaggio per l'utente quando un file non si può aprire.
  error = $state<string | null>(null);
  // Ciò che il disegno mostra. Si aggiorna con `refresh()`.
  view = $state.raw<NetworkView>(EMPTY_VIEW);

  private simulator: Simulator | null = null;
  private positions = new Map<string, Position>();

  /**
   * Apre una rete a partire dal contenuto di un file.
   * Se il file non è valido la rete aperta resta quella di prima, e
   * `error` dice che cosa non va.
   *
   * @param name - il nome del file, mostrato nella barra in alto
   * @param text - il contenuto del file
   */
  open(name: string, text: string): void {
    try {
      const loaded = loadNetworkFile(text);
      this.simulator = new Simulator(loaded.network);
      this.positions = loaded.positions;
      this.fileName = name.replace(/(\.netsim)?\.json$/i, "");
      this.error = null;
      this.refresh();
    } catch (problem) {
      this.error = problem instanceof Error ? problem.message : String(problem);
    }
  }

  /** Torna al foglio vuoto. */
  clear(): void {
    this.simulator = null;
    this.positions = new Map();
    this.fileName = null;
    this.error = null;
    this.refresh();
  }

  /** Dice se c'è almeno un dispositivo da disegnare. */
  isEmpty(): boolean {
    return this.view.devices.length === 0;
  }

  // Rilegge lo stato del simulatore e aggiorna ciò che il disegno mostra.
  private refresh(): void {
    this.view =
      this.simulator === null ? EMPTY_VIEW : buildView(this.simulator.network, this.positions);
  }
}

export const session = new Session();
