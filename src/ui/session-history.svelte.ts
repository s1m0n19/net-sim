// La cronologia delle modifiche, per annullarle e ripristinarle (ED-5).
//
// È il quarto strato di `session` (vedi session.svelte.ts). Gli strati
// sopra di questo, che modificano la rete, fotografano com'era prima di
// ogni modifica (`capture`) e, se la modifica riesce, la registrano
// (`remember`); oppure eseguono l'azione con `attempt`, che fa le due cose.
// Annullare vuol dire tornare a una fotografia (D-54): l'azione
// `restore-configuration` esegue le differenze come normali modifiche.

import { restoreConfiguration, type Action } from "../engine/actions";
import { takeSnapshot } from "../engine/snapshot";
import { messageOf } from "./session-core.svelte";
import { SessionDemo } from "./session-demo.svelte";
import type { HistoryEntry } from "./session-types";

// Quante modifiche si possono annullare.
const HISTORY_LIMIT = 100;

export class SessionHistory extends SessionDemo {
  // La cronologia delle modifiche: com'era la rete prima di ognuna, per
  // annullarla, e com'era prima di ogni annullamento, per ripristinarla.
  private undoStack: HistoryEntry[] = [];

  private redoStack: HistoryEntry[] = [];

  /** C'è una modifica da annullare. */
  canUndo = $state(false);

  /** C'è una modifica annullata da ripristinare. */
  canRedo = $state(false);

  // Esegue un'azione il cui rifiuto va scritto accanto a ciò che l'utente
  // ha digitato, e non in alto sul disegno: restituisce il motivo, o null.
  protected attempt(action: Action): string | null {
    if (this.simulator === null) return null;
    let problem: string | null = null;
    const before = this.capture();
    try {
      this.simulator.dispatch(action);
      this.remember(before);
      this.notice = null;
    } catch (thrown) {
      problem = messageOf(thrown);
    }
    this.refresh();
    return problem;
  }

  /**
   * Annulla l'ultima modifica alla rete: un dispositivo o un cavo aggiunto,
   * tolto o spostato, un nome o un indirizzo cambiato. Guasti e traffico
   * non sono modifiche, e non si annullano.
   */
  undo(): void {
    this.travel(this.undoStack, this.redoStack);
  }

  /** Rifà l'ultima modifica annullata. */
  redo(): void {
    this.travel(this.redoStack, this.undoStack);
  }

  // Torna alla rete in cima a una pila, e mette quella di adesso
  // sull'altra: così il viaggio si può rifare al contrario.
  private travel(from: HistoryEntry[], to: HistoryEntry[]): void {
    const entry = from.at(-1);
    if (entry === undefined || this.simulator === null) return;
    const now = this.capture();
    try {
      this.simulator.dispatch(restoreConfiguration(entry.config));
      this.notice = null;
    } catch (problem) {
      // A simulazione sospesa la rete non si tocca: la cronologia resta com'è.
      this.notice = messageOf(problem);
      return;
    }
    from.pop();
    to.push(now);
    this.positions = new Map(entry.positions);
    this.annotations = entry.annotations;

    // Ciò che riguardava un dispositivo o un cavo sparito se ne va con lui.
    const devices = new Set(this.simulator.network.devices.map((device) => device.id));
    const links = new Set(this.simulator.network.links.map((link) => link.id));
    this.pins = this.pins.filter((pin) => devices.has(pin.deviceId));
    for (const terminal of [...this.terminals]) {
      if (!devices.has(terminal.deviceId)) this.closeTerminal(terminal.deviceId);
    }
    const selection = this.selection;
    const gone =
      (selection?.kind === "device" && !devices.has(selection.id)) ||
      (selection?.kind === "link" && !links.has(selection.id)) ||
      (selection?.kind === "annotation" && !this.annotations.some((a) => a.id === selection.id));
    if (gone) this.selection = null;
    this.pingFrom = null;
    this.linkFrom = null;
    this.portMenu = null;

    this.syncHistory();
    this.refresh();
  }

  // Fotografa la rete com'è adesso: configurazione, posizioni e
  // annotazioni. L'elenco delle annotazioni non viene mai modificato sul
  // posto, quindi basta tenerlo.
  protected capture(): HistoryEntry {
    const network = this.simulator?.network ?? { devices: [], links: [] };
    return { config: takeSnapshot(network), positions: new Map(this.positions), annotations: this.annotations };
  }

  // Registra una modifica appena fatta, dando com'era la rete prima. Una
  // modifica nuova cancella ciò che si poteva ripristinare.
  protected remember(before: HistoryEntry): void {
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.syncHistory();
  }

  private forgetHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.syncHistory();
  }

  private syncHistory(): void {
    this.canUndo = this.undoStack.length > 0;
    this.canRedo = this.redoStack.length > 0;
  }

  protected override networkReplaced(): void {
    this.forgetHistory();
    super.networkReplaced();
  }
}
