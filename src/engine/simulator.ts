// Simulatore a eventi discreti.
//
// Il tempo non scorre in modo continuo: il simulatore tiene una coda di
// fatti futuri ("questo frame arriva a questa porta", "questa attesa
// scade") e a ogni passo salta al prossimo istante in cui succede qualcosa.

import type { Action } from "./actions";
import { applyHostOutput, applyRouterOutput, deliverFrame, fireTimer, type Wire } from "./delivery";
import { sameTimer, type HostTimer, type TimerRequest } from "./devices/host";
import type { SimEvent } from "./events";
import { hasCarrier, refreshLinkState, setDevicePowered, setLinkConnected } from "./faults";
import { hasSomethingToDo, startOnHost, startOnRouter, type TrafficAction } from "./launching";
import type { EthernetFrame } from "./model/frames";
import { clearRuntimeState, findDevice, findLink, otherEndOf, type Network, type PortRef } from "./model/network";
import { fillTables, type NetworkTables } from "./model/tables";
import { applyEdit } from "./network-changes";
import { stormSize } from "./storm";
import type { Conversation, Trace } from "./traces";

// Eventi e tracce stanno nei loro file; chi usa il simulatore li trova
// anche qui.
export type { FrameArrival, SimEvent, TimerExpiry } from "./events";
export type { Conversation, Trace } from "./traces";
export { STORM_FRAME_LIMIT, STORM_LAPS } from "./storm";

// Tempo, in tick, per attraversare un collegamento.
export const LINK_TRANSIT_TICKS = 1;

export class Simulator implements Wire {
  readonly network: Network;
  time = 0;
  queue: SimEvent[] = [];
  traces: Trace[] = [];
  // Diventa true quando il simulatore riconosce una tempesta di broadcast.
  // Da quel momento non avanza più e non accetta azioni.
  suspended = false;

  private nextFrameId = 1;
  // Le conversazioni cominciate finora: per ciascuna, l'azione che l'ha
  // fatta nascere. Serve a chi vuole seguirne una sola.
  conversations: Conversation[] = [];

  private nextConversationId = 1;

  // Le tabelle con cui la rete parte: quelle del file aperto, o dell'ultimo
  // salvataggio con le tabelle. Ricomincia torna a queste (D-100).
  private startingTables: NetworkTables;

  /**
   * Crea un simulatore fermo all'istante zero, con la coda vuota.
   *
   * @param network - la rete da simulare; il simulatore ne modifica lo stato
   *   di esecuzione (tabelle ARP e tabelle MAC, segnale sui cavi)
   * @param startingTables - le tabelle con cui la rete parte, e a cui torna
   *   ricominciando; se mancano, parte con le tabelle che ha
   */
  constructor(network: Network, startingTables: NetworkTables = new Map()) {
    this.network = network;
    this.startingTables = startingTables;
    fillTables(network, startingTables);
    // Dopo le tabelle: uno switch dimentica subito ciò che sta su una porta
    // senza segnale.
    refreshLinkState(this, []);
  }

  /**
   * Cambia le tabelle con cui la rete parte, senza toccare quelle di adesso:
   * conteranno da Ricomincia in poi.
   *
   * @param tables - le nuove tabelle di partenza, per identificativo del
   *   dispositivo
   */
  setStartingTables(tables: NetworkTables): void {
    this.startingTables = tables;
  }

  /**
   * Esegue un'azione arrivata dall'esterno, senza far avanzare il tempo.
   *
   * @param action - l'azione da eseguire
   * @returns le tracce prodotte da questa azione
   * @throws Error se la simulazione è sospesa; se l'azione indica un
   *   dispositivo o un collegamento che non esiste; se chiede a uno switch
   *   di fare un ping, o a un dispositivo spento di fare qualcosa
   */
  dispatch(action: Action): Trace[] {
    if (this.suspended) {
      throw new Error("La simulazione è sospesa: non accetta altre azioni.");
    }
    const produced: Trace[] = [];
    switch (action.kind) {
      case "ping":
      case "tracert":
      case "resolve-address":
        this.runTrafficAction(action, produced);
        break;
      case "set-link-connected":
        setLinkConnected(this, findLink(this.network, action.linkId), action.connected, produced);
        break;
      case "set-device-powered":
        setDevicePowered(this, findDevice(this.network, action.deviceId), action.powered, produced);
        break;
      default:
        applyEdit(this, action, produced);
        // Un dispositivo eliminato non riparte con le sue tabelle, anche se
        // un altro ne prenderà l'identificativo.
        if (action.kind === "remove-device") this.startingTables.delete(action.deviceId);
    }
    this.traces.push(...produced);
    return produced;
  }

  // Esegue un'azione che fa nascere traffico: un ping o un tracert, da un
  // host o da un router, oppure una richiesta ARP di un host.
  private runTrafficAction(action: TrafficAction, produced: Trace[]): void {
    const device = findDevice(this.network, action.deviceId);
    const refuse = () => new Error(`${device.name} non è un host: non può eseguire questa azione.`);
    if (device.kind === "switch") throw refuse();
    if (!device.powered) {
      throw new Error(`${device.name} è spento.`);
    }

    // Il dispositivo dice che cosa vuole fare per compiere l'azione; tutto
    // ciò che ne nasce avrà lo stesso numero di conversazione.
    if (device.kind === "router") {
      // Un router fa ping e traccia strade, ma non lancia ARP a mano.
      if (action.kind === "resolve-address") throw refuse();
      const output = startOnRouter(this.network, device, action);
      if (hasSomethingToDo(output)) applyRouterOutput(this, device, output, this.openConversation(action), produced);
    } else {
      const output = startOnHost(device, action);
      if (hasSomethingToDo(output)) applyHostOutput(this, device, output, this.openConversation(action), produced);
    }
  }

  // Apre una conversazione nuova per un'azione, e ne restituisce il numero.
  private openConversation(action: TrafficAction): number {
    const conversationId = this.nextConversationId++;
    this.conversations.push({ id: conversationId, action });
    return conversationId;
  }

  /**
   * Avanza al prossimo istante in cui succede qualcosa ed elabora tutti
   * gli eventi di quell'istante, non uno solo.
   *
   * Se dopo il passo riconosce una tempesta di broadcast, si sospende.
   *
   * @returns le tracce prodotte in questo passo; un elenco vuoto se non
   *   c'era nulla da fare o se la simulazione è sospesa
   */
  step(): Trace[] {
    if (!this.canStep()) return [];

    this.time = this.queue[0].time;

    // Gli eventi di questo istante si elaborano uno alla volta, prendendoli
    // dalla testa della coda: così un evento può annullarne uno successivo
    // dello stesso istante (una risposta ARP che arriva proprio quando
    // l'attesa sta per scadere).
    const produced: Trace[] = [];
    while (this.queue.length > 0 && this.queue[0].time === this.time) {
      const event = this.queue.shift()!;
      if (event.kind === "frame-arrival") {
        deliverFrame(this, event, produced);
      } else {
        fireTimer(this, event, produced);
      }
    }
    this.suspendIfStorm(produced);
    this.traces.push(...produced);
    return produced;
  }

  /**
   * Riporta la rete allo stato di una appena accesa: tempo a zero, nessun
   * frame in viaggio, nessuna attesa, tracce e conversazioni cancellate,
   * tabelle di partenza (vuote, se la rete non ne ha).
   * La configurazione resta, guasti compresi: un cavo staccato resta
   * staccato e un dispositivo spento resta spento. Toglie anche la
   * sospensione dovuta a una tempesta di broadcast.
   */
  reset(): void {
    this.time = 0;
    this.queue = [];
    this.traces = [];
    this.conversations = [];
    this.suspended = false;
    for (const device of this.network.devices) {
      clearRuntimeState(device);
    }
    fillTables(this.network, this.startingTables);
    refreshLinkState(this, []);
  }

  /**
   * Dice se c'è ancora qualcosa da far avanzare.
   *
   * @returns true se la coda contiene eventi e la simulazione non è sospesa
   */
  canStep(): boolean {
    return this.queue.length > 0 && !this.suspended;
  }

  // Controlla se i frame in viaggio mostrano una tempesta di broadcast e,
  // in quel caso, ferma la simulazione.
  private suspendIfStorm(produced: Trace[]): void {
    const framesInFlight = stormSize(this.network, this.queue);
    if (framesInFlight === null) return;

    this.suspended = true;
    produced.push({ time: this.time, kind: "simulation-suspended", cause: "switch-loop", framesInFlight });
  }

  // Aggiunge un evento alla coda, tenendola ordinata per istante.
  // A parità di istante vale l'ordine di inserimento.
  private schedule(event: SimEvent): void {
    this.queue.push(event);
    this.queue.sort((a, b) => a.time - b.time);
  }

  /**
   * Avvia un'attesa di un dispositivo: scadrà dopo i tick richiesti. La
   * usa la consegna (delivery.ts) per conto di host e router.
   *
   * @param deviceId - il dispositivo che aspetta
   * @param request - che cosa aspetta, e per quanto
   * @param conversationId - la conversazione a cui l'attesa appartiene
   */
  startTimer(deviceId: string, request: TimerRequest, conversationId: number): void {
    this.schedule({ time: this.time + request.delay, kind: "timer", deviceId, timer: request.timer, conversationId });
  }

  /**
   * Toglie dalla coda le attese di un dispositivo uguali a quella indicata.
   * La usa la consegna (delivery.ts).
   *
   * @param deviceId - il dispositivo che aspettava
   * @param timer - l'attesa da annullare
   */
  cancelTimer(deviceId: string, timer: HostTimer): void {
    const matches = (event: SimEvent) =>
      event.kind === "timer" && event.deviceId === deviceId && sameTimer(event.timer, timer);
    this.queue = this.queue.filter((event) => !matches(event));
  }

  /**
   * Mette un frame sul cavo collegato a una porta: arriverà all'altro capo
   * dopo un tick. Senza cavo, o senza segnale, il frame non parte. La usa
   * la consegna (delivery.ts).
   *
   * @param from - la porta da cui il frame esce
   * @param frame - il frame
   * @param conversationId - la conversazione a cui appartiene
   * @param hops - da quanti switch è già stato inoltrato
   * @param produced - l'elenco a cui aggiungere la traccia dell'invio
   */
  transmit(
    from: PortRef,
    frame: EthernetFrame,
    conversationId: number,
    hops: number,
    produced: Trace[],
  ): void {
    // Senza cavo, o con il cavo staccato, il frame non parte.
    const to = otherEndOf(this.network, from);
    if (to === null || !hasCarrier(this, from)) return;

    const frameId = this.nextFrameId++;
    produced.push({ time: this.time, kind: "frame-sent", frameId, from, to, frame, conversationId });
    this.schedule({
      time: this.time + LINK_TRANSIT_TICKS,
      kind: "frame-arrival",
      frameId,
      from,
      to,
      frame,
      conversationId,
      hops,
    });
  }

}
