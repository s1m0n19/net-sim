// I tipi di ciò che la sessione tiene, oltre alla rete: selezione, tabelle
// appuntate, terminali, punti della cronologia.

import type { Snapshot } from "../engine/snapshot";
import type { Position } from "../storage/load";
import type { PacketDetails } from "./view";

// Un punto della cronologia: la configurazione della rete e le posizioni
// dei dispositivi sul disegno.
export interface HistoryEntry {
  config: Snapshot;
  positions: Map<string, Position>;
}

// Quale tabella di un dispositivo: ARP (host e router), MAC (switch), di
// routing (router).
export type PinTable = "arp" | "mac" | "routing";

// Una tabella appuntata sul disegno, accanto al suo dispositivo.
export interface Pin {
  deviceId: string;
  table: PinTable;
  // Dove sta l'angolo in alto a sinistra, rispetto al centro del dispositivo.
  dx: number;
  dy: number;
}

// Ciò che un comando ha lasciato sullo schermo di un terminale.
export type TerminalEntry =
  // Un comando che ha stampato subito tutto il suo output.
  | { kind: "text"; command: string; lines: string[] }
  // Un ping: il suo output cresce man mano che gli echo si concludono,
  // quindi si ricorda che cosa si aspetta, non le righe.
  | {
      kind: "ping";
      command: string;
      target: string;
      count: number;
      startTime: number;
      conversationId: number;
    }
  // Un tracert: come il ping, il suo output cresce un salto alla volta.
  | {
      kind: "tracert";
      command: string;
      target: string;
      maxHops: number;
      startTime: number;
      conversationId: number;
    };

// Il prompt dei comandi aperto su un host.
export interface Terminal {
  deviceId: string;
  entries: TerminalEntry[];
  // I comandi scritti finora, per richiamarli con le frecce.
  history: string[];
}

// Ciò che l'utente ha selezionato sul disegno. Di un pacchetto si tiene
// una copia: così il pannello può continuare a mostrarlo anche dopo che è
// arrivato a destinazione e non è più in viaggio.
export type Selection =
  | { kind: "device"; id: string }
  | { kind: "link"; id: string }
  | { kind: "packet"; id: number; packet: PacketDetails };
