// Simulatore a eventi discreti.
//
// Il tempo non scorre in modo continuo: il simulatore tiene una coda di
// fatti futuri ("questo frame arriva a questa porta", "questa attesa
// scade") e a ogni passo salta al prossimo istante in cui succede qualcosa.

import type { Action } from "./actions";
import * as editing from "./editing";
import { stepsToRestore, type RestoreStep, type Snapshot } from "./snapshot";
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
  clearRuntimeState,
  createHost,
  createSwitch,
  findDevice,
  findLink,
  hostsOf,
  linkAt,
  linkCarriesSignal,
  otherEndOf,
  type Device,
  type Host,
  type Link,
  type Network,
  type PortRef,
  type Switch,
} from "./model/network";

// Tempo, in tick, per attraversare un collegamento.
export const LINK_TRANSIT_TICKS = 1;

// Tempesta di broadcast: senza spanning tree, un ciclo tra switch fa girare
// un frame all'infinito. Il simulatore la lascia avvenire per un po', poi
// si sospende. Due segnali, perché le tempeste sono di due tipi.
//
// 1. Un frame che gira in tondo. In una rete senza cicli un frame passa da
//    ogni switch al massimo una volta: se è stato inoltrato più volte di
//    quanti sono gli switch, c'è di sicuro un ciclo. Lo si lascia girare
//    per questo numero di volte il numero degli switch, poi basta.
export const STORM_LAPS = 3;
// 2. I frame che si moltiplicano. Se gli switch del ciclo hanno più strade
//    tra loro, a ogni giro le copie aumentano: oltre questo numero di frame
//    in viaggio ci si ferma comunque.
export const STORM_FRAME_LIMIT = 200;

// Un frame in viaggio su un cavo, con l'istante in cui arriverà.
export interface FrameArrival {
  time: number;
  kind: "frame-arrival";
  frameId: number;
  from: PortRef;
  to: PortRef;
  frame: EthernetFrame;
  conversationId: number;
  // Da quanti switch è già stato inoltrato: serve a riconoscere un frame
  // che gira in tondo.
  hops: number;
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
// Le azioni che modificano la rete, più i passi con cui si torna a una
// configurazione fotografata.
type EditAction =
  | Exclude<Action, { kind: "ping" | "resolve-address" | "set-link-connected" | "set-device-powered" }>
  | Extract<RestoreStep, Action>;

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
  | {
      time: number;
      kind: "table-changed";
      deviceId: string;
      table: "arp" | "mac";
      // La conversazione che l'ha fatta cambiare; null se è cambiata per
      // un guasto, che non appartiene a nessuna conversazione.
      conversationId: number | null;
    }
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
      remaining: number;
      conversationId: number;
    }
  | {
      // Un frame in viaggio è andato perso: il cavo è stato staccato,
      // oppure il dispositivo a cui era diretto è stato spento.
      time: number;
      kind: "frame-lost";
      frameId: number;
      from: PortRef;
      to: PortRef;
      frame: EthernetFrame;
      conversationId: number;
    }
  | { time: number; kind: "link-changed"; linkId: string; connected: boolean }
  | { time: number; kind: "power-changed"; deviceId: string; powered: boolean }
  // La rete è stata modificata. Le tracce di ciò che è stato tolto ne
  // portano il nome, perché dopo non lo si può più andare a leggere.
  | { time: number; kind: "device-added"; deviceId: string }
  | { time: number; kind: "device-removed"; deviceId: string; name: string }
  | { time: number; kind: "link-added"; linkId: string }
  | { time: number; kind: "link-removed"; linkId: string; between: [string, string] }
  | { time: number; kind: "device-renamed"; deviceId: string; from: string }
  | { time: number; kind: "host-configured"; deviceId: string }
  | {
      // Il simulatore si è fermato da solo: c'è una tempesta di broadcast.
      time: number;
      kind: "simulation-suspended";
      cause: "switch-loop";
      framesInFlight: number;
    };

// Una conversazione: tutto ciò che un'azione dell'utente provoca.
export interface Conversation {
  id: number;
  action: Action;
}

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
    this.refreshLinkState([]);
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
        this.setLinkConnected(findLink(this.network, action.linkId), action.connected, produced);
        break;
      case "set-device-powered":
        this.setDevicePowered(findDevice(this.network, action.deviceId), action.powered, produced);
        break;
      default:
        this.edit(action, produced);
    }
    this.traces.push(...produced);
    return produced;
  }

  // Esegue una modifica alla rete e tiene in ordine la simulazione: ciò
  // che viaggiava su un cavo tolto va perso, chi cambia configurazione
  // riparte da capo, e ogni dispositivo torna a sapere quali cavi ha.
  private edit(action: EditAction, produced: Trace[]): void {
    const time = this.time;
    switch (action.kind) {
      case "add-device": {
        const device = editing.addDevice(this.network, action.template);
        produced.push({ time, kind: "device-added", deviceId: device.id });
        break;
      }
      case "remove-device": {
        const { name } = findDevice(this.network, action.deviceId);
        // Prima si perdono i frame, finché i cavi ci sono ancora.
        this.loseFrames(
          (arrival) => arrival.to.deviceId === action.deviceId || arrival.from.deviceId === action.deviceId,
          produced,
        );
        this.forgetTimersOf(action.deviceId);
        const links = editing.removeDevice(this.network, action.deviceId);
        for (const link of links) {
          produced.push({ time, kind: "link-removed", linkId: link.id, between: this.namesAt(link, action.deviceId, name) });
        }
        produced.push({ time, kind: "device-removed", deviceId: action.deviceId, name });
        break;
      }
      case "add-link": {
        const link = editing.addLink(this.network, action.a, action.b);
        produced.push({ time, kind: "link-added", linkId: link.id });
        break;
      }
      case "remove-link": {
        const link = findLink(this.network, action.linkId);
        this.loseFramesOn(link, produced);
        editing.removeLink(this.network, action.linkId);
        produced.push({ time, kind: "link-removed", linkId: link.id, between: this.namesAt(link) });
        break;
      }
      case "move-link-end": {
        // Spostare un capo vuol dire staccarlo e riattaccarlo altrove.
        this.loseFramesOn(findLink(this.network, action.linkId), produced);
        editing.moveLinkEnd(this.network, action.linkId, action.end, action.portName);
        break;
      }
      case "rename-device": {
        const from = findDevice(this.network, action.deviceId).name;
        editing.renameDevice(this.network, action.deviceId, action.name);
        produced.push({ time, kind: "device-renamed", deviceId: action.deviceId, from });
        break;
      }
      case "configure-host": {
        const host = editing.configureHost(this.network, action.deviceId, action.config);
        // Con un indirizzo nuovo, ciò che l'host sapeva e aspettava non vale più.
        this.forgetTimersOf(host.id);
        clearRuntimeState(host);
        produced.push({ time, kind: "host-configured", deviceId: host.id });
        break;
      }
      case "restore-configuration":
        this.restore(action.snapshot, produced);
        break;
    }
    this.refreshLinkState(produced);
  }

  // Riporta la rete a una configurazione fotografata prima, eseguendo una
  // alla volta le modifiche che la separano da quella di adesso.
  private restore(snapshot: Snapshot, produced: Trace[]): void {
    const time = this.time;
    for (const step of stepsToRestore(this.network, snapshot)) {
      switch (step.kind) {
        case "put-device": {
          // Torna un dispositivo che era stato tolto: è quello di prima,
          // ma appena acceso, con le tabelle vuote.
          const device = step.device.kind === "host" ? createHost(step.device) : createSwitch(step.device);
          this.network.devices.push(device);
          produced.push({ time, kind: "device-added", deviceId: device.id });
          break;
        }
        case "put-link":
          this.network.links.push(step.link);
          produced.push({ time, kind: "link-added", linkId: step.link.id });
          break;
        default:
          this.edit(step, produced);
      }
    }
    // Dispositivi e cavi tornano anche nell'ordine che avevano.
    const place = (ids: string[]) => (a: { id: string }, b: { id: string }) => ids.indexOf(a.id) - ids.indexOf(b.id);
    this.network.devices.sort(place(snapshot.devices.map((device) => device.id)));
    this.network.links.sort(place(snapshot.links.map((link) => link.id)));
  }

  // I nomi dei dispositivi ai due capi di un cavo. Se uno dei due è appena
  // stato tolto dalla rete, il suo nome va passato a parte.
  private namesAt(link: Link, removedId?: string, removedName?: string): [string, string] {
    const nameOf = (deviceId: string) =>
      deviceId === removedId ? (removedName ?? "") : findDevice(this.network, deviceId).name;
    return [nameOf(link.a.deviceId), nameOf(link.b.deviceId)];
  }

  // Toglie dalla coda tutte le attese di un dispositivo.
  private forgetTimersOf(deviceId: string): void {
    this.queue = this.queue.filter((event) => !(event.kind === "timer" && event.deviceId === deviceId));
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

  // Stacca o riattacca un cavo.
  private setLinkConnected(link: Link, connected: boolean, produced: Trace[]): void {
    if (link.connected === connected) return;
    link.connected = connected;
    produced.push({ time: this.time, kind: "link-changed", linkId: link.id, connected });

    if (!connected) {
      this.loseFramesOn(link, produced);
    }
    this.refreshLinkState(produced);
  }

  // I frame che stavano viaggiando su un cavo staccato non arrivano più.
  private loseFramesOn(link: Link, produced: Trace[]): void {
    this.loseFrames((arrival) => linkAt(this.network, arrival.to)?.id === link.id, produced);
  }

  // Spegne o accende un dispositivo.
  private setDevicePowered(device: Device, powered: boolean, produced: Trace[]): void {
    if (device.powered === powered) return;
    device.powered = powered;
    produced.push({ time: this.time, kind: "power-changed", deviceId: device.id, powered });

    if (!powered) {
      // Un dispositivo spento non riceve più nulla, non aspetta più nulla
      // e dimentica tutto ciò che aveva imparato.
      this.loseFrames((arrival) => arrival.to.deviceId === device.id, produced);
      this.forgetTimersOf(device.id);
      clearRuntimeState(device);
    }
    this.refreshLinkState(produced);
  }

  // Toglie dalla coda i frame in viaggio indicati da `isLost` e lo registra.
  private loseFrames(isLost: (arrival: FrameArrival) => boolean, produced: Trace[]): void {
    const kept: SimEvent[] = [];
    for (const event of this.queue) {
      if (event.kind !== "frame-arrival" || !isLost(event)) {
        kept.push(event);
        continue;
      }
      const { frameId, from, to, frame, conversationId } = event;
      produced.push({ time: this.time, kind: "frame-lost", frameId, from, to, frame, conversationId });
    }
    this.queue = kept;
  }

  // Una porta sente il segnale se le è attaccato un cavo, il cavo non è
  // staccato, e i dispositivi ai due capi sono entrambi accesi.
  private hasCarrier(port: PortRef): boolean {
    const link = linkAt(this.network, port);
    return link !== null && linkCarriesSignal(this.network, link);
  }

  // Dopo un guasto o una riparazione, aggiorna ciò che i dispositivi sanno
  // dei propri cavi.
  private refreshLinkState(produced: Trace[]): void {
    // Ogni host sa se la sua scheda sente il segnale.
    for (const host of hostsOf(this.network)) {
      host.linkUp = this.hasCarrier({ deviceId: host.id, portName: host.ports[0].name });
    }
    // Uno switch dimentica i MAC imparati su una porta rimasta senza segnale:
    // chi stava lì dietro non è più raggiungibile da quella parte.
    for (const device of this.network.devices) {
      if (device.kind !== "switch") continue;
      let changed = false;
      for (const [mac, portName] of device.macTable) {
        if (!this.hasCarrier({ deviceId: device.id, portName })) {
          device.macTable.delete(mac);
          changed = true;
        }
      }
      if (changed) {
        produced.push({
          time: this.time,
          kind: "table-changed",
          deviceId: device.id,
          table: "mac",
          conversationId: null,
        });
      }
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
    this.refreshLinkState([]);
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
    const inFlight = this.queue.filter((event) => event.kind === "frame-arrival");
    const switches = this.network.devices.filter((device) => device.kind === "switch").length;

    const goingInCircles = inFlight.some((event) => event.hops > switches * STORM_LAPS);
    const multiplying = inFlight.length > STORM_FRAME_LIMIT;
    if (!goingInCircles && !multiplying) return;

    this.suspended = true;
    produced.push({
      time: this.time,
      kind: "simulation-suspended",
      cause: "switch-loop",
      framesInFlight: inFlight.length,
    });
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
    if (to === null || !this.hasCarrier(from)) return;

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
