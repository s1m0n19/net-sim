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
  type DropReason,
  type HostOutput,
  type HostTimer,
  type PingResult,
} from "./devices/host";
import { receiveFrameOnSwitch, type SwitchDropReason } from "./devices/switch";
import type { EthernetFrame, Ipv4Packet } from "./model/frames";
import {
  findDevice,
  otherEndOf,
  type Host,
  type Network,
  type PortRef,
  type Switch,
} from "./model/network";

// Tempo, in tick, per attraversare un collegamento.
export const LINK_TRANSIT_TICKS = 1;

// Un frame in viaggio su un cavo, con l'istante in cui arriverà.
export interface FrameArrival {
  time: number;
  kind: "frame-arrival";
  frameId: number;
  from: PortRef;
  to: PortRef;
  frame: EthernetFrame;
  conversationId: number;
}

// Un'attesa di un host, con l'istante in cui scadrà.
export interface TimerExpiry {
  time: number;
  kind: "timer";
  deviceId: string;
  timer: HostTimer;
  conversationId: number;
}

export type SimEvent = FrameArrival | TimerExpiry;

// Le tracce registrano ciò che è successo. L'interfaccia le legge per disegnare.
export type Trace =
  | {
      time: number;
      kind: "frame-sent";
      frameId: number;
      from: PortRef;
      to: PortRef;
      frame: EthernetFrame;
      conversationId: number;
    }
  | {
      time: number;
      kind: "frame-received";
      frameId: number;
      at: PortRef;
      frame: EthernetFrame;
      conversationId: number;
    }
  | {
      time: number;
      kind: "frame-dropped";
      frameId: number;
      at: PortRef;
      frame: EthernetFrame;
      reason: DropReason | SwitchDropReason;
      conversationId: number;
    }
  | { time: number; kind: "table-changed"; deviceId: string; table: "arp" | "mac" }
  | {
      // Un host ha rinunciato a spedire un pacchetto che teneva in attesa.
      time: number;
      kind: "packet-dropped";
      deviceId: string;
      packet: Ipv4Packet;
      reason: "arp-timeout";
      conversationId: number;
    }
  | {
      // Un echo request è arrivato a una conclusione: è ciò che il
      // comando ping stampa a chi lo ha lanciato.
      time: number;
      kind: "ping-result";
      deviceId: string;
      targetIp: PingResult["targetIp"];
      sequence: number;
      outcome: PingResult["outcome"];
      conversationId: number;
    };

export class Simulator {
  readonly network: Network;
  time = 0;
  queue: SimEvent[] = [];
  traces: Trace[] = [];

  private nextFrameId = 1;
  private nextConversationId = 1;

  /**
   * Crea un simulatore fermo all'istante zero, con la coda vuota.
   *
   * @param network - la rete da simulare; il simulatore ne modifica lo stato
   *   di esecuzione (tabelle ARP e tabelle MAC)
   */
  constructor(network: Network) {
    this.network = network;
  }

  /**
   * Esegue un'azione arrivata dall'esterno, senza far avanzare il tempo.
   *
   * @param action - l'azione da eseguire
   * @returns le tracce prodotte da questa azione
   * @throws Error se l'azione indica un dispositivo che non esiste
   *   o che non è un host
   */
  dispatch(action: Action): Trace[] {
    const produced: Trace[] = [];
    const host = findDevice(this.network, action.deviceId);
    if (host.kind !== "host") {
      throw new Error(`${host.name} non è un host: non può eseguire questa azione.`);
    }

    // L'host dice che cosa vuole fare per compiere l'azione.
    let output: HostOutput;
    switch (action.kind) {
      case "ping":
        output = startPing(host, action.targetIp);
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
      this.apply(host, output, conversationId, produced);
    }
    this.traces.push(...produced);
    return produced;
  }

  /**
   * Avanza al prossimo istante in cui succede qualcosa ed elabora tutti
   * gli eventi di quell'istante, non uno solo.
   *
   * @returns le tracce prodotte in questo passo; un elenco vuoto se la coda
   *   era vuota e quindi non è successo nulla
   */
  step(): Trace[] {
    if (this.queue.length === 0) return [];

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
    this.traces.push(...produced);
    return produced;
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
      this.transmit(port, frame, conversationId, produced);
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
    for (const timer of output.cancelTimers) {
      this.cancelTimer(host.id, timer);
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
    produced: Trace[],
  ): void {
    const to = otherEndOf(this.network, from);
    if (to === null) return; // nessun cavo: il frame non parte

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
      produced.push({ time: this.time, kind: "table-changed", deviceId: host.id, table: "arp" });
    }
    // Ciò che nasce da un frame appartiene alla stessa conversazione.
    this.apply(host, reaction, conversationId, produced);
  }

  private deliverToSwitch(sw: Switch, event: FrameArrival, produced: Trace[]): void {
    const { frameId, frame, conversationId, to } = event;
    const reaction = receiveFrameOnSwitch(sw, to.portName, frame);

    // Lo switch impara dal frame anche quando poi lo scarta.
    produced.push({ time: this.time, kind: "frame-received", frameId, at: to, frame, conversationId });
    if (reaction.tableChanged) {
      produced.push({ time: this.time, kind: "table-changed", deviceId: sw.id, table: "mac" });
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
      this.transmit({ deviceId: sw.id, portName }, frame, conversationId, produced);
    }
  }
}
