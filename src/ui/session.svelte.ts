// La rete aperta in questo momento, e ciò che di lei va disegnato.
//
// È il punto di contatto tra l'interfaccia e il motore: i componenti
// leggono `session.view` e chiamano i metodi di `session`; nessuno di loro
// tocca il simulatore direttamente.

import {
  addHost,
  addLink,
  addSwitch,
  configureHost,
  connectLink,
  disconnectLink,
  moveLinkEnd,
  ping,
  powerOff,
  powerOn,
  removeDevice,
  removeLink,
  renameDevice,
  restoreConfiguration,
  type Action,
} from "../engine/actions";
import { freePortsOf, type DeviceTemplate } from "../engine/editing";
import { checkIpConfig, defaultMaskFor, type IpConfig } from "../engine/model/ip-config";
import { Simulator, type Trace } from "../engine/simulator";
import { takeSnapshot, type Snapshot } from "../engine/snapshot";
import {
  formatArpTable,
  formatHelp,
  formatIpconfig,
  formatPing,
  parseCommand,
} from "../shell/windows";
import { loadNetworkFile, type Position } from "../storage/load";
import { serializeNetwork } from "../storage/save";
import { fitted } from "./topology/camera";
import {
  buildView,
  EMPTY_VIEW,
  type Bounds,
  type NetworkView,
  type PacketDetails,
  type Protocol,
} from "./view";

// L'estensione dei file di rete, e il nome di un file senza di lei.
export const FILE_EXTENSION = ".netsim.json";

function baseName(fileName: string): string {
  return fileName.replace(/(\.netsim)?\.json$/i, "");
}

// Un punto della cronologia: la configurazione della rete e le posizioni
// dei dispositivi sul disegno.
interface HistoryEntry {
  config: Snapshot;
  positions: Map<string, Position>;
}

// Quante modifiche si possono annullare.
const HISTORY_LIMIT = 100;

// Ciò che l'utente ha selezionato sul disegno. Di un pacchetto si tiene
// una copia: così il pannello può continuare a mostrarlo anche dopo che è
// arrivato a destinazione e non è più in viaggio.
// Una tabella appuntata sul disegno, accanto al suo dispositivo.
export interface Pin {
  deviceId: string;
  // Dove sta l'angolo in alto a sinistra, rispetto al centro del dispositivo.
  dx: number;
  dy: number;
}

// Ciò che un comando ha lasciato sullo schermo di un terminale.
export type TerminalEntry =
  // Un comando che ha stampato subito tutto il suo output.
  | { kind: "text"; command: string; lines: string[] }
  // Un ping: il suo output cresce man mano che gli echo si concludono,
  // quindi si ricorda che cosa si aspetta, non le righe.
  | {
      kind: "ping";
      command: string;
      target: string;
      count: number;
      startTime: number;
      conversationId: number;
    };

// Il prompt dei comandi aperto su un host.
export interface Terminal {
  deviceId: string;
  entries: TerminalEntry[];
  // I comandi scritti finora, per richiamarli con le frecce.
  history: string[];
}

export type Selection =
  | { kind: "device"; id: string }
  | { kind: "link"; id: string }
  | { kind: "packet"; id: number; packet: PacketDetails };

class Session {
  // Il nome del file aperto, senza estensione; null se la rete è nuova.
  fileName = $state<string | null>(null);
  /** La rete è diversa da quella aperta o salvata l'ultima volta. */
  dirty = $state(false);
  // Il testo del file com'era all'ultima apertura o all'ultimo salvataggio.
  private savedText = "";
  // Un messaggio per l'utente quando un file non si può aprire.
  error = $state<string | null>(null);
  // Ciò che il disegno mostra. Si aggiorna dopo ogni comando.
  view = $state.raw<NetworkView>(EMPTY_VIEW);
  // Cresce a ogni rete aperta o ricominciata: distingue i pacchetti di una
  // simulazione da quelli della precedente.
  generation = $state(0);

  // --- Tempo a schermo -------------------------------------------------
  // Il tempo simulato avanza a scatti, da un istante al successivo. Sullo
  // schermo invece i pacchetti scivolano lungo i cavi: `displayTime` è il
  // tempo che si sta mostrando, e sta tra un istante e il successivo.
  displayTime = $state(0);
  // Il tempo scorre da solo?
  running = $state(false);
  // Il moltiplicatore della velocità in tempo reale: 0,5×, 1×, 2×.
  speed = $state(1);
  // Quando non viaggia nulla e c'è solo un'attesa: quanta ne è passata,
  // da 0 a 1. null se non si sta aspettando.
  waitProgress = $state<number | null>(null);

  // --- Selezione ---------------------------------------------------------
  selection = $state.raw<Selection | null>(null);
  // L'host da cui partirà il ping: è stato premuto Ping sulla sua barretta,
  // e il prossimo clic su un dispositivo ne sceglie la destinazione.
  pingFrom = $state<string | null>(null);
  // Un messaggio breve quando un comando non si può eseguire.
  notice = $state<string | null>(null);

  // --- Tabelle appuntate -----------------------------------------------------
  // Le tabelle tenute in vista sul disegno: di quale dispositivo, e a che
  // distanza da lui. Riguardano solo lo schermo e non si salvano nel file.
  pins = $state<Pin[]>([]);

  // --- Terminali --------------------------------------------------------------
  // I terminali aperti, uno per host, nell'ordine in cui sono stati aperti.
  terminals = $state<Terminal[]>([]);
  // La scheda in primo piano nella fascia in basso: "events", oppure
  // l'identificativo dell'host di cui si vede il terminale.
  activeTab = $state("events");

  // --- Filtro del traffico --------------------------------------------------
  // Quale conversazione si sta seguendo; null = tutte.
  followed = $state<number | null>(null);
  // Quali protocolli sono visibili.
  protocols = $state<Record<Protocol, boolean>>({ ARP: true, ICMP: true });
  // Ciò su cui sta il mouse nell'elenco degli eventi: va evidenziato sul disegno.
  highlight = $state.raw<{ deviceId: string | null; packetId: number | null } | null>(null);

  // --- Costruzione della rete ---------------------------------------------------
  // Il tipo di dispositivo scelto nella colonna: finché non è null, ogni
  // clic sul disegno ne posa uno.
  placing = $state.raw<DeviceTemplate | null>(null);
  // Lo strumento Cavo è attivo: trascinare da un dispositivo a un altro, o
  // fare clic sul primo e poi sul secondo, tira un cavo.
  cabling = $state(false);
  // Il dispositivo da cui partirà il cavo: è stato scelto, e il prossimo
  // clic su un dispositivo ne sceglie l'altro capo.
  linkFrom = $state<string | null>(null);
  // Il cavo che si sta tirando trascinando: da quale dispositivo, e fin
  // dove è arrivato il mouse.
  rubber = $state.raw<{ fromId: string; to: Position } | null>(null);
  // L'elenco delle porte aperto sul disegno: di quale cavo e di quale capo.
  portMenu = $state.raw<{ linkId: string; end: "a" | "b" } | null>(null);
  // Mentre si trascina un dispositivo l'inquadratura resta ferma, altrimenti
  // il disegno si muoverebbe sotto il mouse.
  frozenBounds = $state.raw<Bounds | null>(null);
  // L'inquadratura scelta dall'utente ingrandendo, spostando o premendo
  // Adatta. Finché vale null l'inquadratura è quella automatica del foglio.
  camera = $state.raw<Bounds | null>(null);

  // Una rete c'è sempre: all'avvio è vuota.
  private simulator: Simulator | null = new Simulator({ devices: [], links: [] });
  private positions = new Map<string, Position>();

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
      this.savedText = this.serialize();
      this.forgetHistory();
      this.fileName = baseName(name);
      this.error = null;
      this.selection = null;
      this.pins = [];
      this.terminals = [];
      this.activeTab = "events";
      this.rewind();
      // Una rete appena aperta si vede tutta, grande quanto ci sta.
      this.fitView();
    } catch (problem) {
      this.error = messageOf(problem);
    }
  }

  /** Torna al foglio vuoto: una rete nuova, senza dispositivi. */
  clear(): void {
    this.simulator = new Simulator({ devices: [], links: [] });
    this.positions = new Map();
    this.savedText = this.serialize();
    this.forgetHistory();
    this.fileName = null;
    this.error = null;
    this.selection = null;
    this.pins = [];
    this.terminals = [];
    this.activeTab = "events";
    this.rewind();
    this.camera = null;
  }

  /**
   * Inquadra tutta la rete. Su un foglio vuoto torna all'inquadratura di base.
   *
   * @param extras - altri rettangoli del disegno da tenere dentro, come le
   *   tabelle appuntate
   */
  fitView(extras: Bounds[] = []): void {
    this.camera = fitted(this.view.devices, extras);
  }

  /**
   * Riporta la rete allo stato di una appena accesa. Configurazione e
   * guasti restano.
   */
  restart(): void {
    this.simulator?.reset();
    // I pacchetti di prima non esistono più; dispositivi e cavi sì.
    if (this.selection?.kind === "packet") this.selection = null;
    // I PC sono come appena accesi: i terminali restano aperti, ma vuoti.
    for (const terminal of this.terminals) terminal.entries = [];
    this.rewind();
  }

  /** Seleziona un dispositivo, un cavo o un pacchetto; null toglie la selezione. */
  select(selection: Selection | null): void {
    this.selection = selection;
    this.pingFrom = null;
    this.linkFrom = null;
    this.portMenu = null;
    this.notice = null;
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

  /**
   * Dice se il filtro lascia vedere qualcosa. Vale per le righe dell'elenco
   * degli eventi e per le buste sul disegno.
   *
   * @param conversationId - la conversazione a cui appartiene; null se a nessuna
   * @param protocol - il suo protocollo; null se non ne ha uno
   * @returns true se va mostrato
   */
  shows(conversationId: number | null, protocol: Protocol | null): boolean {
    // Ciò che non appartiene a una conversazione, come un guasto, si vede sempre.
    if (this.followed !== null && conversationId !== null && conversationId !== this.followed) {
      return false;
    }
    return protocol === null || this.protocols[protocol];
  }

  /**
   * Apre il terminale di un host e lo porta in primo piano. Se era già
   * aperto, lo porta soltanto in primo piano.
   */
  openTerminal(deviceId: string): void {
    if (!this.terminals.some((terminal) => terminal.deviceId === deviceId)) {
      this.terminals.push({ deviceId, entries: [], history: [] });
    }
    this.activeTab = deviceId;
  }

  /** Chiude il terminale di un host. Il suo contenuto va perso. */
  closeTerminal(deviceId: string): void {
    this.terminals = this.terminals.filter((terminal) => terminal.deviceId !== deviceId);
    if (this.activeTab === deviceId) this.activeTab = "events";
  }

  /**
   * Esegue una riga scritta al prompt di un host.
   *
   * @param deviceId - l'host su cui gira il terminale
   * @param line - ciò che l'utente ha scritto
   */
  execute(deviceId: string, line: string): void {
    const terminal = this.terminals.find((t) => t.deviceId === deviceId);
    const host = this.view.devices.find((d) => d.id === deviceId);
    if (terminal === undefined || host === undefined || this.simulator === null) return;

    const command = parseCommand(line);
    if (line.trim() !== "") terminal.history.push(line.trim());
    const print = (lines: string[]) => terminal.entries.push({ kind: "text", command: line, lines });

    switch (command.kind) {
      case "empty":
        print([]);
        break;
      case "cls":
        terminal.entries = [];
        break;
      case "help":
        print(formatHelp());
        break;
      case "error":
        print(command.lines);
        break;
      case "ipconfig":
        print(formatIpconfig(host));
        break;
      case "arp":
        print(formatArpTable(host));
        break;
      case "ping": {
        // Il ping apre una conversazione: il terminale ne ricorda il numero
        // e ne leggerà gli esiti man mano che arrivano.
        const before = this.simulator.conversations.length;
        const problem = this.ping(deviceId, command.target, command.count);
        const conversation = this.simulator.conversations.at(-1);
        if (problem !== null || conversation === undefined || this.simulator.conversations.length === before) {
          print([problem ?? "PING: transmit failed. General failure."]);
          break;
        }
        terminal.entries.push({
          kind: "ping",
          command: line,
          target: command.target,
          count: command.count,
          startTime: this.view.time,
          conversationId: conversation.id,
        });
        break;
      }
    }
  }

  /**
   * Le righe che un comando ha stampato finora. Per un ping crescono man
   * mano che gli echo request si concludono.
   */
  outputOf(deviceId: string, entry: TerminalEntry): string[] {
    if (entry.kind === "text") return entry.lines;
    const results = this.view.pingResults.filter((r) => r.conversationId === entry.conversationId);
    const ownIp = this.view.devices.find((d) => d.id === deviceId)?.ip ?? null;
    return formatPing(entry.target, entry.count, entry.startTime, results, ownIp);
  }

  /** Dice se un terminale sta ancora eseguendo un ping, e non accetta comandi. */
  isBusy(terminal: Terminal): boolean {
    const last = terminal.entries.at(-1);
    if (last === undefined || last.kind !== "ping") return false;
    const done = this.view.pingResults.filter((r) => r.conversationId === last.conversationId).length;
    return done < last.count;
  }

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

  /** Dice se la tabella di un dispositivo è appuntata sul disegno. */
  isPinned(deviceId: string): boolean {
    return this.pins.some((pin) => pin.deviceId === deviceId);
  }

  /**
   * Appunta sul disegno la tabella di un dispositivo (MAC per uno switch,
   * ARP per un host), oppure la toglie se è già appuntata. Nasce sotto il
   * dispositivo, e da lì si può trascinare.
   */
  togglePin(deviceId: string): void {
    if (this.isPinned(deviceId)) {
      this.pins = this.pins.filter((pin) => pin.deviceId !== deviceId);
      return;
    }
    const device = this.view.devices.find((d) => d.id === deviceId);
    if (device === undefined) return;
    // Sotto un host ci sono più righe di etichetta che sotto uno switch.
    this.pins.push({ deviceId, dx: -100, dy: device.kind === "host" ? 92 : 62 });
  }

  /** Sposta una tabella appuntata a una nuova distanza dal suo dispositivo. */
  movePin(deviceId: string, dx: number, dy: number): void {
    const pin = this.pins.find((p) => p.deviceId === deviceId);
    if (pin !== undefined) {
      pin.dx = dx;
      pin.dy = dy;
    }
  }

  /** Spegne un dispositivo acceso, o accende uno spento. */
  togglePower(deviceId: string): void {
    const device = this.view.devices.find((d) => d.id === deviceId);
    if (device === undefined) return;
    this.run(device.powered ? powerOff(deviceId) : powerOn(deviceId));
  }

  /** Stacca un cavo collegato, o riattacca uno staccato. */
  toggleLink(linkId: string): void {
    const link = this.view.links.find((l) => l.id === linkId);
    if (link === undefined) return;
    this.run(link.connected ? disconnectLink(linkId) : connectLink(linkId));
  }

  /**
   * Prepara un ping dalla barretta: il prossimo dispositivo cliccato sarà
   * la destinazione.
   */
  armPing(deviceId: string): void {
    this.pingFrom = deviceId;
    this.linkFrom = null;
    this.notice = null;
  }

  /**
   * Conclude il ping preparato con `armPing`, verso il dispositivo indicato.
   * Manda un solo echo request.
   */
  pingTo(targetId: string): void {
    const from = this.pingFrom;
    const target = this.view.devices.find((d) => d.id === targetId);
    this.pingFrom = null;
    if (from === null || target === undefined) return;
    if (target.ip === null) {
      this.notice = `${target.name} non ha un indirizzo IP a cui fare ping.`;
      return;
    }
    this.notice = this.ping(from, target.ip, 1);
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

  // Esegue un'azione sul simulatore e ne restituisce le tracce. Se viene
  // rifiutata lo dice in `notice`, e le tracce sono vuote.
  private run(action: Action): Trace[] {
    if (this.simulator === null) return [];
    let traces: Trace[] = [];
    try {
      traces = this.simulator.dispatch(action);
      this.notice = null;
    } catch (problem) {
      this.notice = messageOf(problem);
    }
    this.refresh();
    return traces;
  }

  /** Dice se c'è almeno un dispositivo da disegnare. */
  isEmpty(): boolean {
    return this.view.devices.length === 0;
  }

  /**
   * Lancia un ping da un host.
   *
   * @param deviceId - l'host che fa il ping
   * @param targetIp - l'indirizzo da raggiungere
   * @param count - quanti echo request mandare
   * @returns null se il ping è partito, altrimenti il motivo per cui non
   *   è stato possibile lanciarlo (per esempio un indirizzo scritto male)
   */
  ping(deviceId: string, targetIp: string, count: number): string | null {
    if (this.simulator === null) return "Nessuna rete aperta.";
    try {
      this.simulator.dispatch(ping(deviceId, targetIp, count));
    } catch (problem) {
      return messageOf(problem);
    }
    this.refresh();
    return null;
  }

  /**
   * Fa avanzare la simulazione al prossimo istante in cui succede qualcosa.
   *
   * @returns le tracce di ciò che è successo; nessuna se non c'era nulla
   *   da far avanzare
   */
  step(): Trace[] {
    if (this.simulator === null) return [];
    const traces = this.simulator.step();
    this.displayTime = this.simulator.time;
    this.waitProgress = null;
    this.refresh();
    return traces;
  }

  // Dopo aver aperto, chiuso o ricominciato: tempo a zero e orologio fermo.
  private rewind(): void {
    this.generation += 1;
    this.displayTime = 0;
    this.running = false;
    this.waitProgress = null;
    this.pingFrom = null;
    this.notice = null;
    this.placing = null;
    this.cabling = false;
    this.linkFrom = null;
    this.rubber = null;
    this.portMenu = null;
    this.frozenBounds = null;
    this.highlight = null;
    // Le conversazioni di prima non esistono più.
    this.followed = null;
    this.refresh();
  }

  // Rilegge lo stato del simulatore e aggiorna ciò che il disegno mostra.
  private refresh(): void {
    this.view = this.simulator === null ? EMPTY_VIEW : buildView(this.simulator, this.positions);
    // La rete è "modificata" se il file che ne uscirebbe adesso è diverso
    // dall'ultimo aperto o salvato: tornare indietro con Annulla la
    // riporta a "salvata".
    this.dirty = this.serialize() !== this.savedText;
  }

  /**
   * Il contenuto del file che descrive la rete com'è adesso: configurazione,
   * posizioni e guasti, senza tabelle né pacchetti.
   */
  serialize(): string {
    const network = this.simulator?.network ?? { devices: [], links: [] };
    return serializeNetwork(network, this.positions);
  }

  /**
   * Da chiamare dopo che il file è stato scritto: la rete prende il nome
   * del file e torna a risultare salvata.
   *
   * @param name - il nome del file scritto, con o senza estensione
   * @param text - il contenuto che è stato scritto
   */
  markSaved(name: string, text: string): void {
    this.fileName = baseName(name);
    this.savedText = text;
    this.dirty = this.serialize() !== this.savedText;
  }
}

function messageOf(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}

export const session = new Session();
