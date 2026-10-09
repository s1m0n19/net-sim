// Comportamento di uno switch di livello 2.
//
// Lo switch non ha indirizzi IP e non guarda dentro il frame: gli bastano
// i due indirizzi MAC. Con quello sorgente impara dove si trovano i
// dispositivi; con quello di destinazione decide dove inoltrare.
//
// Come per l'host, queste funzioni non spediscono nulla: dicono al
// simulatore su quali porte il frame deve uscire.

import { BROADCAST_MAC, type MacAddress } from "../model/addresses";
import type { EthernetFrame } from "../model/frames";
import type { Switch } from "../model/network";

// Perché lo switch ha scartato un frame. Serve ai test.
export type SwitchDropReason = "destination-on-incoming-port";

// Che cosa ha fatto lo switch dopo aver ricevuto un frame.
export interface SwitchReaction {
  forwardTo: string[]; // nomi delle porte di uscita
  dropped: SwitchDropReason | null;
  tableChanged: boolean;
}

/**
 * Decide che cosa fa uno switch quando gli arriva un frame: prima impara,
 * poi sceglie le porte di uscita. Può aggiornare la tabella MAC dello switch.
 *
 * @param sw - lo switch che riceve; la sua tabella MAC può essere modificata
 * @param inPort - nome della porta da cui il frame è entrato
 * @param frame - il frame ricevuto
 * @returns la reazione: porte su cui inoltrare, motivo dell'eventuale scarto,
 *   e se la tabella MAC è cambiata
 */
export function receiveFrameOnSwitch(
  sw: Switch,
  inPort: string,
  frame: EthernetFrame,
): SwitchReaction {
  // 1. Apprendimento: chi ha spedito questo frame si raggiunge dalla porta di arrivo.
  const tableChanged = learnSource(sw, inPort, frame.srcMac);

  // 2. Decisione.
  const forwardTo = chooseOutputPorts(sw, inPort, frame.dstMac);
  const dropped = sw.macTable.get(frame.dstMac) === inPort ? "destination-on-incoming-port" : null;

  return { forwardTo, dropped, tableChanged };
}

/**
 * Sceglie le porte su cui inoltrare un frame. Non modifica nulla.
 *
 * - Destinazione broadcast o sconosciuta: tutte le porte tranne quella di
 *   arrivo (flooding).
 * - Destinazione nota su un'altra porta: solo quella.
 * - Destinazione nota sulla porta di arrivo: nessuna, il frame è già dove
 *   deve arrivare.
 *
 * @param sw - lo switch, di cui si leggono porte e tabella MAC
 * @param inPort - nome della porta da cui il frame è entrato
 * @param dstMac - indirizzo MAC di destinazione del frame
 * @returns i nomi delle porte di uscita, eventualmente nessuno
 */
export function chooseOutputPorts(sw: Switch, inPort: string, dstMac: MacAddress): string[] {
  const knownPort = dstMac === BROADCAST_MAC ? undefined : sw.macTable.get(dstMac);

  if (knownPort === undefined) {
    return sw.ports.map((port) => port.name).filter((name) => name !== inPort);
  }
  if (knownPort === inPort) {
    return [];
  }
  return [knownPort];
}

// Scrive una riga nella tabella MAC. Restituisce true se la tabella è cambiata.
// Se il MAC era già noto su un'altra porta, vale l'informazione più recente:
// il dispositivo è stato spostato.
function learnSource(sw: Switch, inPort: string, srcMac: MacAddress): boolean {
  if (sw.macTable.get(srcMac) === inPort) return false;
  sw.macTable.set(srcMac, inPort);
  return true;
}
