// Simulatore a eventi discreti.
//
// Il tempo non scorre in modo continuo: il simulatore tiene una coda di
// fatti futuri ("questo frame arriva a questa porta", "questa attesa
// scade") e a ogni passo salta al prossimo istante in cui succede qualcosa.

import type { Action } from "./actions";
import {
  receiveFrame,
  sameTimer,
  startArpResolution,
  startPing,
  timerExpired,
  type HostOutput,
  type HostTimer,
} from "./devices/host";
import { receiveFrameOnSwitch } from "./devices/switch";
import type { FrameArrival, SimEvent, TimerExpiry } from "./events";
import { hasCarrier, refreshLinkState, setDevicePowered, setLinkConnected } from "./faults";
import type { EthernetFrame } from "./model/frames";
import {
  clearRuntimeState,
  findDevice,
  findLink,
  otherEndOf,
  type Host,
  type Network,
  type PortRef,
  type Switch,
} from "./model/network";
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

export class Simulator {
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
    action: Extract<Action, { kind: "ping" | "resolve-address" }>,
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
        output = startPing(host, action.targetIp, action.count);
        break;
      case "resolve-address": {
        const request = startArpResolution(host, action.targetIp);
        output = {
          send: request === null ? [] : [request],
          startTimers: [],
          cancelTimers: [],
          pingResults: [],
        };
        break;
      }
    }

    const somethingToDo =
      output.send.length > 0 || output.startTimers.length > 0 || output.pingResults.length > 0;
    if (somethingToDo) {
      // Tutto ciò che questa azione provoca avrà lo stesso numero.
      const conversationId = this.nextConversationId++;
      this.conversations.push({ id: conversationId, action });
      this.apply(host, output, conversationId, produced);
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
        this.deliver(event, produced);
      } else {
        this.fireTimer(event, produced);
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

  // Esegue ciò che un host ha chiesto: registrare gli esiti dei ping,
  // spedire frame, avviare attese, annullare attese.
  private apply(host: Host, output: HostOutput, conversationId: number, produced: Trace[]): void {
    for (const result of output.pingResults) {
      produced.push({
        time: this.time,
        kind: "ping-result",
        deviceId: host.id,
        ...result,
        conversationId,
      });
    }
    const port = { deviceId: host.id, portName: host.ports[0].name };
    for (const frame of output.send) {
      // Un frame che nasce da un host non è ancora passato da nessuno switch.
      this.transmit(port, frame, conversationId, 0, produced);
    }
    // Prima si annullano le attese vecchie, poi si avviano le nuove.
    for (const timer of output.cancelTimers) {
      this.cancelTimer(host.id, timer);
    }
    for (const request of output.startTimers) {
      this.schedule({
        time: this.time + request.delay,
        kind: "timer",
        deviceId: host.id,
        timer: request.timer,
        conversationId,
      });
    }
  }

  // Aggiunge un evento alla coda, tenendola ordinata per istante.
  // A parità di istante vale l'ordine di inserimento.
  private schedule(event: SimEvent): void {
    this.queue.push(event);
    this.queue.sort((a, b) => a.time - b.time);
  }

  // Toglie dalla coda le attese di un host uguali a quella indicata.
  private cancelTimer(deviceId: string, timer: HostTimer): void {
    const matches = (event: SimEvent) =>
      event.kind === "timer" && event.deviceId === deviceId && sameTimer(event.timer, timer);
    this.queue = this.queue.filter((event) => !matches(event));
  }

  // Un'attesa è scaduta: l'host decide che cosa fare.
  private fireTimer(event: TimerExpiry, produced: Trace[]): void {
    const host = findDevice(this.network, event.deviceId);
    if (host.kind !== "host") return;

    const reaction = timerExpired(host, event.timer);
    for (const packet of reaction.droppedPackets) {
      produced.push({
        time: this.time,
        kind: "packet-dropped",
        deviceId: host.id,
        packet,
        reason: "arp-timeout",
        conversationId: event.conversationId,
      });
    }
    this.apply(host, reaction, event.conversationId, produced);
  }

  // Mette un frame sul cavo collegato a `from`. Arriverà dopo un tick.
  private transmit(
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

  // Consegna un frame al dispositivo a cui è arrivato. Ogni tipo di
  // dispositivo reagisce a modo suo.
  private deliver(event: FrameArrival, produced: Trace[]): void {
    const device = findDevice(this.network, event.to.deviceId);
    if (device.kind === "host") {
      this.deliverToHost(device, event, produced);
    } else {
      this.deliverToSwitch(device, event, produced);
    }
  }

  private deliverToHost(host: Host, event: FrameArrival, produced: Trace[]): void {
    const { frameId, frame, conversationId, to } = event;
    const reaction = receiveFrame(host, frame);

    if (reaction.dropped !== null) {
      produced.push({
        time: this.time,
        kind: "frame-dropped",
        frameId,
        at: to,
        frame,
        reason: reaction.dropped,
        conversationId,
      });
      return;
    }

    produced.push({ time: this.time, kind: "frame-received", frameId, at: to, frame, conversationId });
    if (reaction.tableChanged) {
      produced.push({
        time: this.time,
        kind: "table-changed",
        deviceId: host.id,
        table: "arp",
        conversationId,
      });
    }
    // Ciò che nasce da un frame appartiene alla stessa conversazione.
    this.apply(host, reaction, conversationId, produced);
  }

  private deliverToSwitch(sw: Switch, event: FrameArrival, produced: Trace[]): void {
    const { frameId, frame, conversationId, to, hops } = event;
    const reaction = receiveFrameOnSwitch(sw, to.portName, frame);

    // Lo switch impara dal frame anche quando poi lo scarta.
    produced.push({ time: this.time, kind: "frame-received", frameId, at: to, frame, conversationId });
    if (reaction.tableChanged) {
      produced.push({
        time: this.time,
        kind: "table-changed",
        deviceId: sw.id,
        table: "mac",
        conversationId,
      });
    }

    if (reaction.dropped !== null) {
      produced.push({
        time: this.time,
        kind: "frame-dropped",
        frameId,
        at: to,
        frame,
        reason: reaction.dropped,
        conversationId,
      });
      return;
    }

    // Lo switch inoltra il frame così com'è, senza modificarlo. Le copie
    // partono nello stesso istante e arriveranno insieme.
    for (const portName of reaction.forwardTo) {
      this.transmit({ deviceId: sw.id, portName }, frame, conversationId, hops + 1, produced);
    }
  }
}
