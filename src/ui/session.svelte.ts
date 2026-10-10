// La rete aperta in questo momento, e ciò che di lei va disegnato.
//
// È il punto di contatto tra l'interfaccia e il motore: i componenti
// leggono `session.view` e chiamano i metodi di `session`; nessuno di loro
// tocca il simulatore direttamente.

import { connectLink, disconnectLink, ping, powerOff, powerOn, type Action } from "../engine/actions";
import { Simulator, type Trace } from "../engine/simulator";
import { loadNetworkFile, type Position } from "../storage/load";
import { buildView, EMPTY_VIEW, type NetworkView, type PacketView } from "./view";

// Ciò che l'utente ha selezionato sul disegno. Di un pacchetto si tiene
// una copia: così il pannello può continuare a mostrarlo anche dopo che è
// arrivato a destinazione e non è più in viaggio.
export type Selection =
  | { kind: "device"; id: string }
  | { kind: "link"; id: string }
  | { kind: "packet"; id: number; packet: PacketView };

class Session {
  // Il nome del file aperto, senza estensione; null se la rete è nuova.
  fileName = $state<string | null>(null);
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
      this.selection = null;
      this.rewind();
    } catch (problem) {
      this.error = messageOf(problem);
    }
  }

  /** Torna al foglio vuoto. */
  clear(): void {
    this.simulator = null;
    this.positions = new Map();
    this.fileName = null;
    this.error = null;
    this.selection = null;
    this.rewind();
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
    this.notice = null;
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

  // Esegue un'azione sul simulatore; se viene rifiutata lo dice in `notice`.
  private run(action: Action): void {
    if (this.simulator === null) return;
    try {
      this.simulator.dispatch(action);
      this.notice = null;
    } catch (problem) {
      this.notice = messageOf(problem);
    }
    this.refresh();
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
    this.refresh();
  }

  // Rilegge lo stato del simulatore e aggiorna ciò che il disegno mostra.
  private refresh(): void {
    this.view = this.simulator === null ? EMPTY_VIEW : buildView(this.simulator, this.positions);
  }
}

function messageOf(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}

export const session = new Session();
