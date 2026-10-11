// Ciò che il simulatore tiene in coda: i fatti futuri, ciascuno con il suo
// istante. Sono di due tipi: un frame che arriva a una porta, e un'attesa
// di un host che scade.

import type { HostTimer } from "./devices/host";
import type { EthernetFrame } from "./model/frames";
import type { Network, PortRef } from "./model/network";

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

// Ciò che serve sapere della simulazione per sistemarla dopo un guasto o
// una modifica alla rete: la rete, la coda dei fatti futuri, l'istante.
// Il `Simulator` è fatto così; le funzioni di faults.ts e
// network-changes.ts chiedono solo questo, e non il simulatore intero.
export interface SimulationState {
  readonly network: Network;
  queue: SimEvent[];
  readonly time: number;
}
