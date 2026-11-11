// La consegna: che cosa succede quando un frame arriva a un dispositivo, o
// quando scade una sua attesa.
//
// Ogni tipo di dispositivo reagisce a modo suo (devices/host.ts,
// devices/switch.ts, devices/router.ts) e dice che cosa vuole fare. Qui lo
// si esegue: si registrano le tracce, si mettono sul cavo i frame da
// spedire, si avviano e si annullano le attese.

import type { HostOutput, HostTimer, TimerRequest } from "./devices/host";
import { receiveFrame, timerExpired } from "./devices/host";
import { receiveFrameOnRouter, routerTimerExpired, type RouterOutput } from "./devices/router";
import { receiveFrameOnSwitch } from "./devices/switch";
import type { FrameArrival, TimerExpiry } from "./events";
import type { EthernetFrame } from "./model/frames";
import { findDevice, type Host, type Network, type PortRef, type Router, type Switch } from "./model/network";
import { routingTableOf } from "./protocols/routing";
import type { Trace } from "./traces";

// Ciò che la consegna chiede al simulatore: mettere un frame sul cavo, e
// avviare o annullare un'attesa. Il `Simulator` è fatto così.
export interface Wire {
  readonly network: Network;
  readonly time: number;
  transmit(from: PortRef, frame: EthernetFrame, conversationId: number, hops: number, produced: Trace[]): void;
  startTimer(deviceId: string, request: TimerRequest, conversationId: number): void;
  cancelTimer(deviceId: string, timer: HostTimer): void;
}

/**
 * Consegna un frame al dispositivo a cui è arrivato. Ogni tipo di
 * dispositivo reagisce a modo suo.
 *
 * @param sim - il simulatore, per spedire e per le attese
 * @param event - l'arrivo del frame
 * @param produced - l'elenco a cui aggiungere le tracce di ciò che succede
 */
export function deliverFrame(sim: Wire, event: FrameArrival, produced: Trace[]): void {
  const device = findDevice(sim.network, event.to.deviceId);
  if (device.kind === "host") {
    deliverToHost(sim, device, event, produced);
  } else if (device.kind === "switch") {
    deliverToSwitch(sim, device, event, produced);
  } else {
    deliverToRouter(sim, device, event, produced);
  }
}

/**
 * Un'attesa è scaduta: il dispositivo che aspettava decide che cosa fare.
 *
 * @param sim - il simulatore, per spedire e per le attese
 * @param event - la scadenza
 * @param produced - l'elenco a cui aggiungere le tracce di ciò che succede
 */
export function fireTimer(sim: Wire, event: TimerExpiry, produced: Trace[]): void {
  const host = findDevice(sim.network, event.deviceId);
  if (host.kind === "router") {
    const reaction = routerTimerExpired(host, event.timer, routingTableOf(sim.network, host));
    for (const pending of reaction.droppedPackets) {
      produced.push({
        time: sim.time,
        kind: "packet-dropped",
        deviceId: host.id,
        packet: pending.packet,
        reason: "arp-timeout",
        // Lo scarto è della conversazione del pacchetto (D-133).
        conversationId: pending.conversationId ?? event.conversationId,
      });
    }
    applyRouterOutput(sim, host, reaction, event.conversationId, produced);
    return;
  }
  if (host.kind !== "host") return;

  const reaction = timerExpired(host, event.timer);
  for (const pending of reaction.droppedPackets) {
    produced.push({
      time: sim.time,
      kind: "packet-dropped",
      deviceId: host.id,
      packet: pending.packet,
      reason: "arp-timeout",
      // Lo scarto è della conversazione del pacchetto (D-133).
      conversationId: pending.conversationId ?? event.conversationId,
    });
  }
  applyHostOutput(sim, host, reaction, event.conversationId, produced);
}

/**
 * Esegue ciò che un host ha chiesto: registrare gli esiti di ping e
 * tracert, spedire frame, annullare e avviare attese.
 *
 * @param sim - il simulatore, per spedire e per le attese
 * @param host - l'host che lo ha chiesto
 * @param output - le cose da fare
 * @param conversationId - la conversazione a cui appartengono
 * @param produced - l'elenco a cui aggiungere le tracce di ciò che succede
 */
export function applyHostOutput(sim: Wire, host: Host, output: HostOutput, conversationId: number, produced: Trace[]): void {
  recordConclusions(sim, host.id, output, conversationId, produced);
  const port = { deviceId: host.id, portName: host.ports[0].name };
  for (const frame of output.send) {
    // Un frame che nasce da un host non è ancora passato da nessuno switch.
    sim.transmit(port, frame, conversationId, 0, produced);
  }
  // Prima si annullano le attese vecchie, poi si avviano le nuove.
  for (const timer of output.cancelTimers) {
    sim.cancelTimer(host.id, timer);
  }
  for (const request of output.startTimers) {
    sim.startTimer(host.id, request, conversationId);
  }
  // I pacchetti messi in coda adesso sono di questa conversazione; poi ciò
  // che riguarda pacchetti di altre conversazioni si fa per conto loro.
  claimPendingPackets(host.pendingPackets, conversationId);
  for (const other of output.onBehalfOf ?? []) {
    applyHostOutput(sim, host, other.output, other.conversationId, produced);
  }
}

// I pacchetti appena messi in attesa di un MAC appartengono alla
// conversazione di ciò che li ha fatti nascere: lo si scrive adesso, perché
// il dispositivo non conosce le conversazioni. Quando una risposta ARP li
// farà partire, magari chiesta da un'altra operazione, resteranno della
// loro (D-133).
function claimPendingPackets(pending: { conversationId: number | null }[], conversationId: number): void {
  for (const waiting of pending) waiting.conversationId ??= conversationId;
}

function deliverToHost(sim: Wire, host: Host, event: FrameArrival, produced: Trace[]): void {
  const { frameId, frame, conversationId, to } = event;
  const reaction = receiveFrame(host, frame);

  if (reaction.dropped !== null) {
    produced.push({
      time: sim.time,
      kind: "frame-dropped",
      frameId,
      at: to,
      frame,
      reason: reaction.dropped,
      conversationId,
    });
    return;
  }

  produced.push({ time: sim.time, kind: "frame-received", frameId, at: to, frame, conversationId });
  if (reaction.tableChanged) {
    produced.push({
      time: sim.time,
      kind: "table-changed",
      deviceId: host.id,
      table: "arp",
      conversationId,
    });
  }
  // Ciò che nasce da un frame appartiene alla stessa conversazione.
  applyHostOutput(sim, host, reaction, conversationId, produced);
}

function deliverToSwitch(sim: Wire, sw: Switch, event: FrameArrival, produced: Trace[]): void {
  const { frameId, frame, conversationId, to, hops } = event;
  const reaction = receiveFrameOnSwitch(sw, to.portName, frame);

  // Lo switch impara dal frame anche quando poi lo scarta.
  produced.push({ time: sim.time, kind: "frame-received", frameId, at: to, frame, conversationId });
  if (reaction.tableChanged) {
    produced.push({
      time: sim.time,
      kind: "table-changed",
      deviceId: sw.id,
      table: "mac",
      conversationId,
    });
  }

  if (reaction.dropped !== null) {
    produced.push({
      time: sim.time,
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
    sim.transmit({ deviceId: sw.id, portName }, frame, conversationId, hops + 1, produced);
  }
}

function deliverToRouter(sim: Wire, router: Router, event: FrameArrival, produced: Trace[]): void {
  const { frameId, frame, conversationId, to } = event;
  const reaction = receiveFrameOnRouter(router, to.portName, frame, routingTableOf(sim.network, router));

  if (reaction.dropped !== null) {
    const reason = reaction.dropped;
    produced.push({ time: sim.time, kind: "frame-dropped", frameId, at: to, frame, reason, conversationId });
    // Anche scartando, il router può avere qualcosa da spedire: l'avviso
    // al mittente che il suo pacchetto non è arrivato.
    applyRouterOutput(sim, router, reaction, conversationId, produced);
    return;
  }

  produced.push({ time: sim.time, kind: "frame-received", frameId, at: to, frame, conversationId });
  if (reaction.tableChanged) {
    produced.push({ time: sim.time, kind: "table-changed", deviceId: router.id, table: "arp", conversationId });
  }
  applyRouterOutput(sim, router, reaction, conversationId, produced);
}

/**
 * Esegue ciò che un router ha chiesto: registrare gli esiti dei suoi ping,
 * spedire frame dalle interfacce indicate, annullare e avviare attese.
 *
 * @param sim - il simulatore, per spedire e per le attese
 * @param router - il router che lo ha chiesto
 * @param output - le cose da fare
 * @param conversationId - la conversazione a cui appartengono
 * @param produced - l'elenco a cui aggiungere le tracce di ciò che succede
 */
export function applyRouterOutput(sim: Wire, router: Router, output: RouterOutput, conversationId: number, produced: Trace[]): void {
  recordConclusions(sim, router.id, output, conversationId, produced);
  for (const { portName, frame } of output.send) {
    // Il router scrive un frame nuovo: non è ancora passato da nessuno switch.
    sim.transmit({ deviceId: router.id, portName }, frame, conversationId, 0, produced);
  }
  for (const timer of output.cancelTimers) {
    sim.cancelTimer(router.id, timer);
  }
  for (const request of output.startTimers) {
    sim.startTimer(router.id, request, conversationId);
  }
  claimPendingPackets(router.pendingPackets, conversationId);
  for (const other of output.onBehalfOf ?? []) {
    applyRouterOutput(sim, router, other.output, other.conversationId, produced);
  }
}

// Registra gli echo request e le sonde arrivati a una conclusione: sono le
// righe che ping e tracert stampano a chi li ha lanciati.
function recordConclusions(
  sim: Wire,
  deviceId: string,
  output: Pick<HostOutput, "pingResults" | "traceHops">,
  conversationId: number,
  produced: Trace[],
): void {
  for (const result of output.pingResults) {
    produced.push({ time: sim.time, kind: "ping-result", deviceId, ...result, conversationId });
  }
  for (const hop of output.traceHops) {
    produced.push({ time: sim.time, kind: "trace-hop", deviceId, ...hop, conversationId });
  }
}
