// Simulatore a eventi discreti.
//
// Il tempo non scorre in modo continuo: il simulatore tiene una coda di
// fatti futuri (per ora solo "questo frame arriva a questa porta") e a
// ogni passo salta al prossimo istante in cui succede qualcosa.

import type { Action } from "./actions";
import { receiveFrame, startArpResolution, startPing, type DropReason } from "./devices/host";
import { receiveFrameOnSwitch, type SwitchDropReason } from "./devices/switch";
import type { EthernetFrame } from "./model/frames";
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

export type SimEvent = FrameArrival;

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
  | { time: number; kind: "table-changed"; deviceId: string; table: "arp" | "mac" };

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

    // L'host dice quali frame vuole spedire per compiere l'azione.
    let frames: EthernetFrame[];
    switch (action.kind) {
      case "ping":
        frames = startPing(host, action.targetIp);
        break;
      case "resolve-address": {
        const request = startArpResolution(host, action.targetIp);
        frames = request === null ? [] : [request];
        break;
      }
    }

    if (frames.length > 0) {
      // Tutto il traffico provocato da questa azione avrà lo stesso numero.
      const conversationId = this.nextConversationId++;
      const port = { deviceId: host.id, portName: host.ports[0].name };
      for (const frame of frames) {
        this.transmit(port, frame, conversationId, produced);
      }
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
    const now = this.queue.filter((event) => event.time === this.time);
    this.queue = this.queue.filter((event) => event.time !== this.time);

    const produced: Trace[] = [];
    for (const event of now) {
      this.deliver(event, produced);
    }
    this.traces.push(...produced);
    return produced;
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
    // I nuovi eventi hanno sempre un istante successivo a quelli già in
    // coda o uguale all'ultimo, quindi la coda resta ordinata per tempo.
    this.queue.push({
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
    for (const outgoing of reaction.send) {
      // Ciò che nasce da un frame appartiene alla stessa conversazione.
      this.transmit(to, outgoing, conversationId, produced);
    }
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
