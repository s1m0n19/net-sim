// I tipi di ciò che la sessione tiene, oltre alla rete: selezione, tabelle
// appuntate, terminali, punti della cronologia.

import type { Snapshot } from "../engine/snapshot";
import type { CliState } from "../shell/ios/modes";
import type { Annotation } from "../storage/annotations-file";
import type { Position } from "../storage/load";
import type { PacketDetails } from "./view";

// Un punto della cronologia: la configurazione della rete, le posizioni
// dei dispositivi sul disegno e le annotazioni.
export interface HistoryEntry {
  config: Snapshot;
  positions: Map<string, Position>;
  annotations: Annotation[];
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

// Ciò che un comando ha lasciato sullo schermo di un terminale. Ogni
// comando ricorda il prompt che aveva quando è stato scritto: nella CLI di
// un router il prompt cambia da una riga all'altra (R1>, R1#, R1(config)#).
export type TerminalEntry =
  // Un comando che ha stampato subito tutto il suo output.
  | { kind: "text"; prompt: string; command: string; lines: string[] }
  // Un ping: il suo output cresce man mano che gli echo si concludono,
  // quindi si ricorda che cosa si aspetta, non le righe.
  | {
      kind: "ping";
      prompt: string;
      command: string;
      target: string;
      count: number;
      startTime: number;
      conversationId: number;
    }
  // Un tracert: come il ping, il suo output cresce un salto alla volta.
  | {
      kind: "tracert";
      prompt: string;
      command: string;
      target: string;
      maxHops: number;
      startTime: number;
      conversationId: number;
    };

// Un terminale aperto: il prompt dei comandi di un host, oppure la CLI di
// un router o di uno switch.
export interface Terminal {
  deviceId: string;
  entries: TerminalEntry[];
  // I comandi scritti finora, per richiamarli con le frecce.
  history: string[];
  // Per la CLI di un router o di uno switch: la modalità in cui si trova
  // e l'interfaccia che si sta configurando. Null per un host.
  cli: CliState | null;
}

// Ciò che l'utente ha selezionato sul disegno. Di un pacchetto si tiene
// una copia: così il pannello può continuare a mostrarlo anche dopo che è
// arrivato a destinazione e non è più in viaggio.
export type Selection =
  | { kind: "device"; id: string }
  | { kind: "link"; id: string }
  | { kind: "packet"; id: number; packet: PacketDetails }
  // Un riquadro o una nota del disegno (ED-9): non tocca il simulatore.
  | { kind: "annotation"; id: string };
