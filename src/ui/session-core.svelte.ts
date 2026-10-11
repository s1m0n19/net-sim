// La rete aperta in questo momento: il simulatore, ciò che di lui va
// disegnato, il tempo a schermo, il file da cui viene, e ciò che l'utente
// sta facendo sul disegno (selezione, gesti a metà, inquadratura).
//
// È il primo di tre strati che insieme formano `session` (vedi
// session.svelte.ts). Questo è l'unico che crea il simulatore; gli altri
// due lo comandano attraverso `run`.

import { ping, tracert, type Action } from "../engine/actions";
import type { DeviceTemplate } from "../engine/editing";
import { Simulator, type Trace } from "../engine/simulator";
import { loadNetworkFile, type Position } from "../storage/load";
import { serializeNetwork } from "../storage/save";
import type { Selection } from "./session-types";
import { fitted } from "./topology/camera";
import { buildView, EMPTY_VIEW, type Bounds, type NetworkView } from "./view";

// L'estensione dei file di rete, e il nome di un file senza di lei.
export const FILE_EXTENSION = ".netsim.json";

function baseName(fileName: string): string {
  return fileName.replace(/(\.netsim)?\.json$/i, "");
}

/** Il testo di un errore, da mostrare all'utente. */
export function messageOf(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}

export class SessionCore {
  // Il nome del file aperto, senza estensione; null se la rete è nuova.
  fileName = $state<string | null>(null);

  /** La rete è diversa da quella aperta o salvata l'ultima volta. */
  dirty = $state(false);

  // Il testo del file com'era all'ultima apertura o all'ultimo salvataggio.
  protected savedText = "";

  // Un messaggio per l'utente quando un file non si può aprire.
  error = $state<string | null>(null);

  // Ciò che il disegno mostra. Si aggiorna dopo ogni comando.
  view = $state.raw<NetworkView>(EMPTY_VIEW);

  // Cresce a ogni rete aperta o ricominciata: distingue i pacchetti di una
  // simulazione da quelli della precedente.
  generation = $state(0);

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

  selection = $state.raw<Selection | null>(null);

  // L'host da cui partirà il ping: è stato premuto Ping sulla sua barretta,
  // e il prossimo clic su un dispositivo ne sceglie la destinazione.
  pingFrom = $state<string | null>(null);

  // Un messaggio breve quando un comando non si può eseguire.
  notice = $state<string | null>(null);

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
  protected simulator: Simulator | null = new Simulator({ devices: [], links: [] });

  protected positions = new Map<string, Position>();

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
      this.fileName = baseName(name);
      this.error = null;
      this.selection = null;
      this.networkReplaced();
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
    this.fileName = null;
    this.error = null;
    this.selection = null;
    this.networkReplaced();
    this.rewind();
    this.camera = null;
  }

  /**
   * Inquadra tutta la rete. Su un foglio vuoto torna all'inquadratura di base.
   *
   * @param extras - altri rettangoli del disegno da tenere dentro, come le
   *   tabelle appuntate
   * @param scale - di quanto è ingrandito il disegno (in presentazione più di 1)
   */
  fitView(extras: Bounds[] = [], scale = 1): void {
    this.camera = fitted(this.view.devices, extras, scale);
  }

  /**
   * Riporta la rete allo stato di una appena accesa. Configurazione e
   * guasti restano.
   */
  restart(): void {
    this.simulator?.reset();
    // I pacchetti di prima non esistono più; dispositivi e cavi sì.
    if (this.selection?.kind === "packet") this.selection = null;
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
   * @param ttl - il TTL con cui farli partire; se manca, quello solito
   * @returns null se il ping è partito, altrimenti il motivo per cui non
   *   è stato possibile lanciarlo (per esempio un indirizzo scritto male)
   */
  ping(deviceId: string, targetIp: string, count: number, ttl?: number): string | null {
    return this.launch(ping(deviceId, targetIp, count, ttl));
  }

  /**
   * Lancia un tracert da un host.
   *
   * @param deviceId - l'host che traccia la strada
   * @param targetIp - l'indirizzo da raggiungere
   * @param maxHops - a quale salto fermarsi comunque
   * @returns null se è partito, altrimenti il motivo per cui non è stato
   *   possibile lanciarlo
   */
  tracert(deviceId: string, targetIp: string, maxHops: number): string | null {
    return this.launch(tracert(deviceId, targetIp, maxHops));
  }

  // Manda al simulatore un'azione che genera traffico. Restituisce il
  // motivo del rifiuto, oppure null.
  private launch(action: Action): string | null {
    if (this.simulator === null) return "Nessuna rete aperta.";
    try {
      this.simulator.dispatch(action);
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

  // Esegue un'azione sul simulatore e ne restituisce le tracce. Se viene
  // rifiutata lo dice in `notice`, e le tracce sono vuote.
  protected run(action: Action): Trace[] {
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

  // Dopo aver aperto, chiuso o ricominciato: tempo a zero e orologio fermo.
  protected rewind(): void {
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
    this.refresh();
  }

  // Rilegge lo stato del simulatore e aggiorna ciò che il disegno mostra.
  protected refresh(): void {
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

  // Da ridefinire negli strati superiori: la rete è stata sostituita da
  // un'altra (file aperto, o foglio nuovo), e ciò che riguardava quella
  // di prima va buttato.
  protected networkReplaced(): void {}
}
