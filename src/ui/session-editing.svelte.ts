// Costruire la rete: posare, spostare, collegare, rinominare, configurare,
// eliminare, e la cronologia per annullare e ripristinare.
//
// È il terzo strato di `session`. Ogni metodo che modifica la rete
// fotografa prima com'era (`capture`) e, se la modifica riesce, lo
// registra (`remember`): è ciò che Annulla rimette.

import {
  addHost,
  addLink,
  addSwitch,
  configureHost,
  moveLinkEnd,
  removeDevice,
  removeLink,
  renameDevice,
  restoreConfiguration,
  type Action,
} from "../engine/actions";
import { freePortsOf, type DeviceTemplate } from "../engine/editing";
import { checkIpConfig, defaultMaskFor, type IpConfig } from "../engine/model/ip-config";
import { takeSnapshot } from "../engine/snapshot";
import type { Position } from "../storage/load";
import { messageOf } from "./session-core.svelte";
import { SessionDemo } from "./session-demo.svelte";
import type { HistoryEntry } from "./session-types";

// Quante modifiche si possono annullare.
const HISTORY_LIMIT = 100;

export class SessionEditing extends SessionDemo {
  // La cronologia delle modifiche: com'era la rete prima di ognuna, per
  // annullarla, e com'era prima di ogni annullamento, per ripristinarla.
  private undoStack: HistoryEntry[] = [];

  private redoStack: HistoryEntry[] = [];

  // Com'era la rete quando è cominciato il trascinamento in corso.
  private beforeDrag: HistoryEntry | null = null;

  /** C'è una modifica da annullare. */
  canUndo = $state(false);

  /** C'è una modifica annullata da ripristinare. */
  canRedo = $state(false);

  /**
   * Posa un dispositivo nuovo sul disegno e lo seleziona.
   *
   * @param template - che cosa posare: un PC, o uno switch con le sue porte
   * @param position - dove, in coordinate del disegno
   */
  addDevice(template: DeviceTemplate, position: Position): void {
    if (this.simulator === null) return;
    const action = template.kind === "host" ? addHost() : addSwitch(template.portCount);
    const before = this.capture();
    try {
      const traces = this.simulator.dispatch(action);
      const added = traces.find((trace) => trace.kind === "device-added");
      if (added !== undefined) {
        this.remember(before);
        this.positions.set(added.deviceId, { x: Math.round(position.x), y: Math.round(position.y) });
        this.selection = { kind: "device", id: added.deviceId };
      }
      this.notice = null;
    } catch (problem) {
      this.notice = messageOf(problem);
    }
    this.refresh();
  }

  /** Sposta un dispositivo in un altro punto del disegno. */
  moveDevice(deviceId: string, position: Position): void {
    if (!this.positions.has(deviceId)) return;
    this.positions.set(deviceId, { x: Math.round(position.x), y: Math.round(position.y) });
    this.refresh();
  }

  /**
   * Da chiamare quando comincia e quando finisce il trascinamento di un
   * dispositivo. Tiene ferma l'inquadratura per la durata, e alla fine
   * registra lo spostamento come una sola modifica da annullare.
   */
  holdBounds(hold: boolean): void {
    this.frozenBounds = hold ? this.view.bounds : null;
    if (hold) {
      this.beforeDrag = this.capture();
    } else if (this.beforeDrag !== null) {
      this.remember(this.beforeDrag);
      this.beforeDrag = null;
    }
  }

  /**
   * Elimina ciò che è selezionato: un dispositivo, con i suoi cavi, oppure
   * un cavo. Un pacchetto non si può eliminare.
   */
  removeSelection(): void {
    const selection = this.selection;
    if (selection === null || selection.kind === "packet") return;

    const before = this.capture();
    this.run(selection.kind === "device" ? removeDevice(selection.id) : removeLink(selection.id));
    // Se l'eliminazione è stata rifiutata, tutto resta com'era.
    if (this.notice !== null) return;
    this.remember(before);

    if (selection.kind === "device") {
      // Con il dispositivo spariscono la sua posizione, la sua tabella
      // appuntata e il suo terminale.
      this.positions.delete(selection.id);
      this.pins = this.pins.filter((pin) => pin.deviceId !== selection.id);
      this.closeTerminal(selection.id);
    }
    this.selection = null;
  }

  /** Apre l'elenco delle porte di un capo di un cavo, e seleziona il cavo. */
  openPortMenu(linkId: string, end: "a" | "b"): void {
    const same = this.portMenu?.linkId === linkId && this.portMenu.end === end;
    this.select({ kind: "link", id: linkId });
    // Un secondo clic sullo stesso nome richiude l'elenco.
    this.portMenu = same ? null : { linkId, end };
  }

  /**
   * Sceglie il dispositivo da cui parte un cavo: il prossimo dispositivo
   * cliccato sarà l'altro capo.
   */
  armLink(deviceId: string): void {
    this.linkFrom = deviceId;
    this.pingFrom = null;
    this.notice = null;
  }

  /**
   * Conclude il cavo cominciato con `armLink`, verso il dispositivo indicato.
   * Indicare di nuovo il dispositivo di partenza annulla.
   */
  connectTo(targetId: string): void {
    const from = this.linkFrom;
    this.linkFrom = null;
    if (from !== null && from !== targetId) this.connect(from, targetId);
  }

  /**
   * Collega due dispositivi con un cavo nuovo, usando su ciascuno la prima
   * porta libera, e seleziona il cavo: da lì si può cambiare porta.
   */
  connect(fromId: string, toId: string): void {
    if (this.simulator === null) return;
    if (fromId === toId) {
      this.notice = "Un cavo unisce due dispositivi diversi.";
      return;
    }
    const ends = [fromId, toId].map((deviceId) => ({
      deviceId,
      portName: freePortsOf(this.simulator!.network, deviceId)[0],
    }));
    const full = ends.find((end) => end.portName === undefined);
    if (full !== undefined) {
      const name = this.view.devices.find((d) => d.id === full.deviceId)?.name ?? "Il dispositivo";
      this.notice = `${name} non ha porte libere.`;
      return;
    }
    const before = this.capture();
    const traces = this.run(addLink(ends[0], ends[1]));
    const added = traces.find((trace) => trace.kind === "link-added");
    if (added !== undefined) {
      this.remember(before);
      this.selection = { kind: "link", id: added.linkId };
    }
  }

  /** Sposta un capo di un cavo su un'altra porta dello stesso dispositivo. */
  changePort(linkId: string, end: "a" | "b", portName: string): void {
    const before = this.capture();
    this.run(moveLinkEnd(linkId, end, portName));
    if (this.notice === null) this.remember(before);
  }

  /**
   * Cambia il nome di un dispositivo, come scritto nel pannello laterale.
   *
   * @returns null se il nome è stato accettato, altrimenti il motivo del
   *   rifiuto, da scrivere sotto il campo
   */
  rename(deviceId: string, name: string): string | null {
    return this.attempt(renameDevice(deviceId, name));
  }

  /**
   * Cambia un campo della configurazione IP di un host, come scritto nel
   * pannello laterale. Un testo vuoto toglie il valore.
   *
   * Due aiuti, perché indirizzo e maschera vanno impostati insieme:
   * scritto l'indirizzo su un host senza maschera, la maschera diventa
   * quella della classe dell'indirizzo; svuotato l'indirizzo, si svuotano
   * anche maschera e gateway.
   *
   * @returns null se il valore è stato accettato, altrimenti il motivo del
   *   rifiuto, da scrivere sotto il campo; in quel caso la rete non cambia
   */
  configure(deviceId: string, field: keyof IpConfig, text: string): string | null {
    const host = this.view.devices.find((device) => device.id === deviceId);
    if (host === undefined || host.kind !== "host") return "Questo dispositivo non ha una configurazione IP.";

    const value = text.trim() === "" ? null : text.trim();
    let config: IpConfig = { ip: host.ip, mask: host.mask, gateway: host.gateway, [field]: value };
    if (field === "ip" && value === null) {
      config = { ip: null, mask: null, gateway: null };
    } else if (field === "ip" && value !== null && host.mask === null) {
      config.mask = defaultMaskFor(value);
    }

    let problem = checkIpConfig(config);
    if (problem !== null && config.ip !== null && config.mask === null) {
      // Non c'è una maschera da proporre perché l'indirizzo è scritto male
      // o non si può assegnare: il motivo da dire è quello, e lo si
      // ottiene controllando l'indirizzo con una maschera qualsiasi.
      problem = checkIpConfig({ ...config, mask: "255.255.255.0" }) ?? problem;
    }
    if (problem !== null) return `${problem[0].toUpperCase()}${problem.slice(1)}.`;
    return this.attempt(configureHost(deviceId, config));
  }

  // Esegue un'azione il cui rifiuto va scritto accanto a ciò che l'utente
  // ha digitato, e non in alto sul disegno: restituisce il motivo, o null.
  private attempt(action: Action): string | null {
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
      (selection?.kind === "link" && !links.has(selection.id));
    if (gone) this.selection = null;
    this.pingFrom = null;
    this.linkFrom = null;
    this.portMenu = null;

    this.syncHistory();
    this.refresh();
  }

  // Fotografa la rete com'è adesso: configurazione e posizioni.
  private capture(): HistoryEntry {
    const network = this.simulator?.network ?? { devices: [], links: [] };
    return { config: takeSnapshot(network), positions: new Map(this.positions) };
  }

  // Registra una modifica appena fatta, dando com'era la rete prima. Una
  // modifica nuova cancella ciò che si poteva ripristinare.
  private remember(before: HistoryEntry): void {
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.syncHistory();
  }

  private forgetHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.beforeDrag = null;
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
