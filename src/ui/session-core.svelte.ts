// La rete aperta in questo momento: il simulatore, ciò che di lui va
// disegnato, il tempo a schermo, e ciò che l'utente sta facendo sul
// disegno (selezione, gesti a metà, inquadratura).
//
// È il primo degli strati che insieme formano `session` (vedi
// session.svelte.ts). Gli altri lo comandano attraverso `run`; da dove
// viene la rete, cioè il file, se ne occupa lo strato sopra di questo,
// session-file.svelte.ts.

import { ping, tracert, type Action } from "../engine/actions";
import type { DeviceTemplate } from "../engine/editing";
import { Simulator, type Trace } from "../engine/simulator";
import type { Annotation } from "../storage/annotations-file";
import type { Position } from "../storage/load";
import type { Selection } from "./session-types";
import { fitted } from "./topology/camera";
import { buildView, EMPTY_VIEW, type Bounds, type NetworkView } from "./view";

/** Il testo di un errore, da mostrare all'utente. */
export function messageOf(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}

export class SessionCore {
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

  // Le annotazioni del disegno (ED-9). Come le posizioni, non fanno parte
  // della rete. L'elenco non si modifica mai sul posto: ogni cambiamento ne
  // crea uno nuovo, così una fotografia della cronologia resta com'era.
  protected annotations: Annotation[] = [];

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
   * Riporta la rete allo stato di una appena accesa, con le tabelle di
   * partenza (quelle del file, o dell'ultimo salvataggio con le tabelle).
   * Configurazione e guasti restano.
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
    this.view = this.simulator === null ? EMPTY_VIEW : buildView(this.simulator, this.positions, this.annotations);
  }

  // Da ridefinire negli strati superiori: la rete è stata sostituita da
  // un'altra (un file aperto, o un foglio nuovo: lo fa lo strato del
  // file), e ciò che riguardava quella di prima va buttato.
  protected networkReplaced(): void {}
}
