// Le tracce: la registrazione di ciò che è successo nella simulazione.
//
// Ogni azione e ogni passo restituiscono le tracce che hanno prodotto;
// l'interfaccia le legge per disegnare e per compilare l'elenco degli
// eventi. Una traccia dice che cosa è successo, a chi e quando.

import type { Action } from "./actions";
import type { DropReason, PingResult, TraceHop } from "./devices/host";
import type { RouterDropReason } from "./devices/router";
import type { SwitchDropReason } from "./devices/switch";
import type { EthernetFrame, Ipv4Packet } from "./model/frames";
import type { PortRef, StaticRoute } from "./model/network";

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
      reason: DropReason | SwitchDropReason | RouterDropReason;
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
      // Chi ha risposto, e con quale TTL: vedi `PingResult`.
      from: PingResult["from"];
      ttl: PingResult["ttl"];
      conversationId: number;
    }
  | {
      // Una sonda di tracert è arrivata a una conclusione: è la riga che
      // il comando tracert stampa per quel salto.
      time: number;
      kind: "trace-hop";
      deviceId: string;
      targetIp: TraceHop["targetIp"];
      hop: number;
      outcome: TraceHop["outcome"];
      from: TraceHop["from"];
      done: boolean;
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
  // Modifiche a un router.
  | { time: number; kind: "interface-configured"; deviceId: string; portName: string }
  | { time: number; kind: "interface-changed"; deviceId: string; portName: string; enabled: boolean }
  | { time: number; kind: "route-added"; deviceId: string; route: StaticRoute }
  | { time: number; kind: "route-removed"; deviceId: string; route: StaticRoute }
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
