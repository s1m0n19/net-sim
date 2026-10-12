// Simulatore a eventi discreti.
//
// Il tempo non scorre in modo continuo: il simulatore tiene una coda di
// fatti futuri ("questo frame arriva a questa porta", "questa attesa
// scade") e a ogni passo salta al prossimo istante in cui succede qualcosa.

import type { Action } from "./actions";
import { applyHostOutput, deliverFrame, fireTimer, type Wire } from "./delivery";
import {
  sameTimer,
  startArpResolution,
  startPing,
  startTracert,
  type HostOutput,
  type HostTimer,
  type TimerRequest,
} from "./devices/host";
import type { SimEvent } from "./events";
import { hasCarrier, refreshLinkState, setDevicePowered, setLinkConnected } from "./faults";
import type { EthernetFrame } from "./model/frames";
import { clearRuntimeState, findDevice, findLink, otherEndOf, type Network, type PortRef } from "./model/network";
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

  /**
   * Crea un simulatore fermo all'istante zero, con la coda vuota.
   *
   * @param network - la rete da simulare; il simulatore ne modifica lo stato
   *   di esecuzione (tabelle ARP e tabelle MAC, segnale sui cavi)
   */
  constructor(network: Network) {
    this.network = network;
    refreshLinkState(this, []);
  }

  /**
   * Esegue un'azione arrivata dall'esterno, senza far avanzare il tempo.
   *
   * @param action - l'azione da eseguire
   * @returns le tracce prodotte da questa azione
   * @throws Error se la simulazione è sospesa; se l'azione indica un
   *   dispositivo o un collegamento che non esiste; se chiede a uno switch
   *   qualcosa che solo un host può fare, o a un host spento di fare
   *   qualcosa
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
        this.runHostAction(action, produced);
        break;
      case "set-link-connected":
        setLinkConnected(this, findLink(this.network, action.linkId), action.connected, produced);
        break;
      case "set-device-powered":
        setDevicePowered(this, findDevice(this.network, action.deviceId), action.powered, produced);
        break;
      default:
        applyEdit(this, action, produced);
    }
    this.traces.push(...produced);
    return produced;
  }

  // Esegue un'azione che riguarda un host: ping o richiesta ARP.
  private runHostAction(
    action: Extract<Action, { kind: "ping" | "tracert" | "resolve-address" }>,
    produced: Trace[],
  ): void {
    const host = findDevice(this.network, action.deviceId);
    if (host.kind !== "host") {
      throw new Error(`${host.name} non è un host: non può eseguire questa azione.`);
    }
    if (!host.powered) {
      throw new Error(`${host.name} è spento.`);
    }

    // L'host dice che cosa vuole fare per compiere l'azione.
    let output: HostOutput;
    switch (action.kind) {
      case "ping":
        output = startPing(host, action.targetIp, action.count, action.ttl);
        break;
      case "tracert":
        output = startTracert(host, action.targetIp, action.maxHops);
        break;
      case "resolve-address": {
        const request = startArpResolution(host, action.targetIp);
        output = {
          send: request === null ? [] : [request],
          startTimers: [],
          cancelTimers: [],
          pingResults: [],
          traceHops: [],
        };
        break;
      }
    }

    const somethingToDo =
      output.send.length > 0 ||
      output.startTimers.length > 0 ||
      output.pingResults.length > 0 ||
      output.traceHops.length > 0;
    if (somethingToDo) {
      // Tutto ciò che questa azione provoca avrà lo stesso numero.
      const conversationId = this.nextConversationId++;
      this.conversations.push({ id: conversationId, action });
      applyHostOutput(this, host, output, conversationId, produced);
    }
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
   * frame in viaggio, nessuna attesa, tabelle vuote, tracce e conversazioni
   * cancellate.
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
