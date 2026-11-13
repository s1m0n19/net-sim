// Comportamento di uno switch di livello 2.
//
// Lo switch non ha indirizzi IP e non guarda dentro il frame: gli bastano
// i due indirizzi MAC. Con quello sorgente impara dove si trovano i
// dispositivi; con quello di destinazione decide dove inoltrare.
//
// Ogni porta sta in una VLAN (model/vlans.ts), e ogni VLAN si comporta
// come uno switch a parte: impara nella sua tabella e inoltra solo sulle
// sue porte. Finché non si configurano VLAN, tutte le porte stanno nella
// VLAN 1 e lo switch è quello di sempre.
//
// Come per l'host, queste funzioni non spediscono nulla: dicono al
// simulatore su quali porte il frame deve uscire.

import { BROADCAST_MAC, type MacAddress } from "../model/addresses";
import type { EthernetFrame } from "../model/frames";
import type { Switch } from "../model/network";
import { activeVlanOf, learnMac, macTableOf } from "../model/vlans";

// Perché lo switch ha scartato un frame. Serve ai test.
// - "destination-on-incoming-port": il destinatario sta dalla parte da cui
//   il frame è arrivato, che quindi è già dove deve essere;
// - "inactive-vlan": la porta di arrivo è in una VLAN che non esiste più.
export type SwitchDropReason = "destination-on-incoming-port" | "inactive-vlan";

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
 * Tutto avviene dentro la VLAN della porta di arrivo, che è la VLAN del
 * frame: il frame non porta nessun segno della VLAN, è la porta a darla.
 * Se la VLAN della porta non esiste più, la porta è inattiva: il frame
 * viene scartato e lo switch non impara nulla.
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
  // 1. La VLAN del frame è quella della porta da cui è entrato.
  const vlan = activeVlanOf(sw, inPort);
  if (vlan === null) {
    return { forwardTo: [], dropped: "inactive-vlan", tableChanged: false };
  }

  // 2. Apprendimento, nella tabella di quella VLAN: chi ha spedito questo
  //    frame si raggiunge dalla porta di arrivo.
  const tableChanged = learnMac(sw, vlan, frame.srcMac, inPort);

  // 3. Decisione, guardando solo la stessa VLAN.
  const forwardTo = chooseOutputPorts(sw, vlan, inPort, frame.dstMac);
  const dropped = macTableOf(sw, vlan).get(frame.dstMac) === inPort ? "destination-on-incoming-port" : null;

  return { forwardTo, dropped, tableChanged };
}

/**
 * Sceglie le porte su cui inoltrare un frame di una VLAN. Non modifica nulla.
 *
 * - Destinazione broadcast o sconosciuta nella VLAN: tutte le porte della
 *   stessa VLAN tranne quella di arrivo (flooding). Le porte delle altre
 *   VLAN non lo ricevono mai.
 * - Destinazione nota su un'altra porta: solo quella, che è nella stessa
 *   VLAN perché è lì che lo switch l'ha imparata.
 * - Destinazione nota sulla porta di arrivo: nessuna, il frame è già dove
 *   deve arrivare.
 *
 * Le porte spente o senza cavo restano nell'elenco: è il simulatore a non
 * mettere nulla su un cavo che non porta segnale.
 *
 * @param sw - lo switch, di cui si leggono porte e tabella MAC
 * @param vlan - la VLAN del frame, cioè quella della porta di arrivo
 * @param inPort - nome della porta da cui il frame è entrato
 * @param dstMac - indirizzo MAC di destinazione del frame
 * @returns i nomi delle porte di uscita, eventualmente nessuno
 */
export function chooseOutputPorts(sw: Switch, vlan: number, inPort: string, dstMac: MacAddress): string[] {
  const knownPort = dstMac === BROADCAST_MAC ? undefined : macTableOf(sw, vlan).get(dstMac);

  if (knownPort === undefined) {
    return sw.ports.filter((port) => port.vlan === vlan && port.name !== inPort).map((port) => port.name);
  }
  if (knownPort === inPort) {
    return [];
  }
  return [knownPort];
}
