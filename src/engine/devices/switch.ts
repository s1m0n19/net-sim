// Comportamento di uno switch di livello 2.
//
// Lo switch non ha indirizzi IP e non guarda dentro il frame: gli bastano
// i due indirizzi MAC. Con quello sorgente impara dove si trovano i
// dispositivi; con quello di destinazione decide dove inoltrare.
//
// Ogni VLAN (model/vlans.ts) si comporta come uno switch a parte: impara
// nella sua tabella e inoltra solo sulle porte che la portano. Una porta
// access porta la sua VLAN; una porta trunk porta le VLAN consentite, e
// sul cavo le distingue con il tag 802.1Q (model/trunks.ts). Finché non si
// configurano VLAN, tutte le porte sono access nella VLAN 1 e lo switch è
// quello di sempre.
//
// Come per l'host, queste funzioni non spediscono nulla: dicono al
// simulatore su quali porte il frame deve uscire.

import { BROADCAST_MAC, type MacAddress } from "../model/addresses";
import type { EthernetFrame } from "../model/frames";
import type { Switch } from "../model/network";
import { carriesVlan, ingressVlanOf, type IngressDrop } from "../model/trunks";
import { learnMac, macTableOf } from "../model/vlans";

// Perché lo switch ha scartato un frame. Serve ai test.
// - "destination-on-incoming-port": il destinatario sta dalla parte da cui
//   il frame è arrivato, che quindi è già dove deve essere;
// - gli altri: la porta di arrivo ha rifiutato il frame (vedi IngressDrop
//   in model/trunks.ts), per esempio "inactive-vlan" se è in una VLAN che
//   non esiste più.
export type SwitchDropReason = "destination-on-incoming-port" | IngressDrop;

// Che cosa ha fatto lo switch dopo aver ricevuto un frame.
export interface SwitchReaction {
  forwardTo: string[]; // nomi delle porte di uscita
  // La VLAN in cui lo switch ha trattato il frame; null se la porta di
  // arrivo lo ha rifiutato. Serve a preparare il frame per ogni uscita
  // (frameLeaving).
  vlan: number | null;
  dropped: SwitchDropReason | null;
  tableChanged: boolean;
}

/**
 * Decide che cosa fa uno switch quando gli arriva un frame: prima impara,
 * poi sceglie le porte di uscita. Può aggiornare la tabella MAC dello switch.
 *
 * Tutto avviene dentro la VLAN di ingresso del frame: su una porta access
 * è la VLAN della porta, su una porta trunk quella del tag, o la nativa per
 * un frame senza tag (ingressVlanOf). Se la porta rifiuta il frame, per
 * esempio perché la sua VLAN non esiste più, lo switch lo scarta e non
 * impara nulla.
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
  // 1. La VLAN del frame la decide la porta da cui è entrato.
  const ingress = ingressVlanOf(sw, inPort, frame);
  if ("dropped" in ingress) {
    return { forwardTo: [], vlan: null, dropped: ingress.dropped, tableChanged: false };
  }
  const vlan = ingress.vlan;

  // 2. Apprendimento, nella tabella di quella VLAN: chi ha spedito questo
  //    frame si raggiunge dalla porta di arrivo. Una porta trunk impara
  //    così in più tabelle, una per VLAN.
  const tableChanged = learnMac(sw, vlan, frame.srcMac, inPort);

  // 3. Decisione, guardando solo la stessa VLAN.
  const forwardTo = chooseOutputPorts(sw, vlan, inPort, frame.dstMac);
  const dropped = macTableOf(sw, vlan).get(frame.dstMac) === inPort ? "destination-on-incoming-port" : null;

  return { forwardTo, vlan, dropped, tableChanged };
}

/**
 * Sceglie le porte su cui inoltrare un frame di una VLAN. Non modifica nulla.
 *
 * - Destinazione broadcast o sconosciuta nella VLAN: tutte le porte che
 *   portano la VLAN tranne quella di arrivo (flooding): le porte access
 *   della VLAN e i trunk che la consentono. Le altre porte non lo
 *   ricevono mai.
 * - Destinazione nota su un'altra porta: solo quella, che porta la VLAN
 *   perché è lì che lo switch l'ha imparata. Se nel frattempo la porta non
 *   la porta più, la riga non vale: il frame va in flooding, come per una
 *   destinazione sconosciuta.
 * - Destinazione nota sulla porta di arrivo: nessuna, il frame è già dove
 *   deve arrivare.
 *
 * Le porte spente o senza cavo restano nell'elenco: è il simulatore a non
 * mettere nulla su un cavo che non porta segnale.
 *
 * @param sw - lo switch, di cui si leggono porte e tabella MAC
 * @param vlan - la VLAN di ingresso del frame
 * @param inPort - nome della porta da cui il frame è entrato
 * @param dstMac - indirizzo MAC di destinazione del frame
 * @returns i nomi delle porte di uscita, eventualmente nessuno
 */
export function chooseOutputPorts(sw: Switch, vlan: number, inPort: string, dstMac: MacAddress): string[] {
  const learned = dstMac === BROADCAST_MAC ? undefined : macTableOf(sw, vlan).get(dstMac);
  const knownPort = learned === undefined || carries(sw, learned, vlan) ? learned : undefined;

  if (knownPort === undefined) {
    return sw.ports.filter((port) => carriesVlan(port, vlan) && port.name !== inPort).map((port) => port.name);
  }
  if (knownPort === inPort) {
    return [];
  }
  return [knownPort];
}

/**
 * Prepara il frame che esce da una porta: la stessa cosa arrivata, con il
 * tag 802.1Q se la porta è un trunk e la VLAN non è la sua nativa, e senza
 * tag in tutti gli altri casi. Il frame arrivato non cambia: ogni porta di
 * uscita ha un frame suo, così un tag messo per una porta non finisce mai
 * su un'altra.
 *
 * @param sw - lo switch
 * @param portName - la porta di uscita
 * @param vlan - la VLAN in cui lo switch ha trattato il frame
 * @param frame - il frame arrivato, con o senza tag
 * @returns un frame nuovo, da trasmettere su quella porta
 */
export function frameLeaving(sw: Switch, portName: string, vlan: number, frame: EthernetFrame): EthernetFrame {
  // Si parte sempre dal frame senza tag: quello di arrivo apparteneva al
  // cavo da cui è entrato.
  const { vlanTag: _arrived, ...untagged } = frame;
  const port = sw.ports.find((p) => p.name === portName);
  if (port === undefined || port.mode === "access" || vlan === port.nativeVlan) return untagged;
  return { ...untagged, vlanTag: vlan };
}

// Dice se una porta dello switch porta ancora una VLAN.
function carries(sw: Switch, portName: string, vlan: number): boolean {
  const port = sw.ports.find((p) => p.name === portName);
  return port !== undefined && carriesVlan(port, vlan);
}
