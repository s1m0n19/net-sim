// Le porte trunk di uno switch (requisito DEV-6, seconda parte: L2-2,
// decisioni D-146…D-148).
//
// Una porta access sta in una sola VLAN, e i suoi frame passano sul cavo
// senza nessun segno della VLAN. Una porta trunk, di solito tra due
// switch, porta più VLAN sullo stesso cavo: per distinguerle, lo switch
// scrive nel frame il numero della VLAN, il tag IEEE 802.1Q (il campo
// `vlanTag` del frame), e lo switch dall'altra parte lo legge.
//
// Due eccezioni rendono il trunk interessante:
//
// - la VLAN nativa (`nativeVlan`, 1 se non si dice altro) passa senza tag:
//   un frame senza tag che arriva su un trunk appartiene alla nativa;
// - le VLAN consentite (`allowedVlans`, tutte se non si dice altro)
//   decidono quali VLAN il trunk lascia passare, nei due sensi.
//
// Qui stanno le regole di una porta, in funzioni pure: in quale VLAN entra
// un frame, quali VLAN una porta fa uscire, e gli elenchi delle VLAN
// consentite. Il tag lo mettono e lo tolgono gli switch (devices/switch.ts).
// Nulla corregge una configurazione sbagliata: due capi di un cavo con
// configurazioni diverse si comportano come due switch veri.

import type { EthernetFrame } from "./frames";
import type { Switch, SwitchPort } from "./network";
import { checkVlanId, vlanExists } from "./vlans";

/** Il modo di una porta di switch: in una VLAN sola, o trunk. */
export type PortMode = "access" | "trunk";

/**
 * Le VLAN che un trunk lascia passare: tutte, oppure solo quelle di un
 * elenco in ordine di numero, senza doppioni. Un elenco vuoto non lascia
 * passare nessuna VLAN (il `none` di IOS). Gli elenchi non si modificano
 * mai: un elenco nuovo prende il posto del vecchio.
 */
export type AllowedVlans = "all" | readonly number[];

/** Tutte le VLAN: ciò che un trunk lascia passare se non si dice altro. */
export const ALL_VLANS = "all";

/**
 * Perché una porta rifiuta un frame in arrivo. Serve ai test: l'interfaccia
 * non spiega mai perché un frame è stato scartato.
 * - "inactive-vlan": porta access su una VLAN che non esiste più;
 * - "tagged-on-access": un frame con il tag su una porta access, che
 *   accetta solo frame senza tag, come uno switch Catalyst;
 * - "vlan-not-allowed": porta trunk, VLAN non consentita;
 * - "vlan-not-configured": porta trunk, VLAN consentita ma che lo switch
 *   non ha.
 */
export type IngressDrop = "inactive-vlan" | "tagged-on-access" | "vlan-not-allowed" | "vlan-not-configured";

/**
 * In quale VLAN entra un frame arrivato a una porta di switch, oppure
 * perché la porta lo rifiuta. Non dice nulla di cavi e accensione: un
 * frame non arriva mai a una porta spenta o senza cavo.
 *
 * Porta access: un frame senza tag entra nella VLAN della porta, se esiste;
 * un frame con il tag si rifiuta sempre. Porta trunk: la VLAN è quella del
 * tag, o la nativa se il frame non ha tag (anche un tag uguale alla nativa
 * va bene); poi la VLAN deve essere consentita, e infine deve esistere
 * sullo switch.
 *
 * @param sw - lo switch che riceve
 * @param portName - la porta di arrivo
 * @param frame - il frame arrivato
 * @returns la VLAN di ingresso, oppure il motivo dello scarto (anche
 *   "inactive-vlan" se la porta non esiste)
 */
export function ingressVlanOf(sw: Switch, portName: string, frame: EthernetFrame): { vlan: number } | { dropped: IngressDrop } {
  const port = sw.ports.find((p) => p.name === portName);
  if (port === undefined) return { dropped: "inactive-vlan" };

  if (port.mode === "access") {
    if (frame.vlanTag !== undefined) return { dropped: "tagged-on-access" };
    if (!vlanExists(sw, port.vlan)) return { dropped: "inactive-vlan" };
    return { vlan: port.vlan };
  }

  const vlan = frame.vlanTag ?? port.nativeVlan;
  if (!isAllowed(port.allowedVlans, vlan)) return { dropped: "vlan-not-allowed" };
  if (!vlanExists(sw, vlan)) return { dropped: "vlan-not-configured" };
  return { vlan };
}

/**
 * Dice se da una porta possono uscire i frame di una VLAN: una porta access
 * se è la sua VLAN, una porta trunk se la VLAN è consentita. Non guarda
 * cavi e accensione, di cui si occupa il simulatore.
 *
 * @param port - la porta
 * @param vlan - la VLAN del frame
 * @returns true se la porta porta quella VLAN
 */
export function carriesVlan(port: SwitchPort, vlan: number): boolean {
  return port.mode === "access" ? port.vlan === vlan : isAllowed(port.allowedVlans, vlan);
}

/**
 * Dice se una VLAN è tra quelle consentite.
 *
 * @param allowed - le VLAN consentite
 * @param vlan - il numero della VLAN
 * @returns true se la VLAN è consentita
 */
export function isAllowed(allowed: AllowedVlans, vlan: number): boolean {
  return allowed === ALL_VLANS || allowed.includes(vlan);
}

/**
 * Mette in ordine un elenco di VLAN: in ordine di numero, senza doppioni.
 * L'elenco dato non cambia.
 *
 * @param vlans - i numeri delle VLAN, in qualsiasi ordine
 * @returns un elenco nuovo, che non si può modificare
 * @throws Error se un numero non è una VLAN valida (da 1 a 1001)
 */
export function normalizeVlanList(vlans: readonly number[]): readonly number[] {
  for (const vlan of vlans) {
    const problem = checkVlanId(vlan);
    if (problem !== null) throw new Error(problem);
  }
  return Object.freeze([...new Set(vlans)].sort((a, b) => a - b));
}

/**
 * Una copia delle VLAN consentite, da dare a un'altra porta o a una
 * fotografia senza che condividano lo stesso elenco.
 *
 * @param allowed - le VLAN consentite
 * @returns "all", oppure un elenco nuovo con gli stessi numeri
 */
export function copyAllowedVlans(allowed: AllowedVlans): AllowedVlans {
  return allowed === ALL_VLANS ? ALL_VLANS : Object.freeze([...allowed]);
}

/**
 * Dice se due insiemi di VLAN consentite sono uguali.
 *
 * @param a - le prime VLAN consentite
 * @param b - le seconde
 * @returns true se consentono le stesse VLAN
 */
export function sameAllowedVlans(a: AllowedVlans, b: AllowedVlans): boolean {
  if (a === ALL_VLANS || b === ALL_VLANS) return a === b;
  return a.length === b.length && a.every((vlan, index) => vlan === b[index]);
}

/**
 * Scrive un elenco di VLAN in forma compatta, come IOS: i numeri
 * consecutivi diventano un intervallo. Per esempio [1, 10, 20, 30, 31, 32]
 * diventa "1,10,20,30-32".
 *
 * @param vlans - un elenco in ordine, senza doppioni (vedi normalizeVlanList)
 * @returns il testo; vuoto se l'elenco è vuoto
 */
export function formatVlanList(vlans: readonly number[]): string {
  const parts: string[] = [];
  let index = 0;
  while (index < vlans.length) {
    const first = vlans[index];
    let last = first;
    while (index + 1 < vlans.length && vlans[index + 1] === last + 1) last = vlans[++index];
    // Due numeri di fila si scrivono come intervallo solo da tre in su:
    // "10,11" resta così, "10-12" no.
    parts.push(last === first ? `${first}` : last === first + 1 ? `${first},${last}` : `${first}-${last}`);
    index++;
  }
  return parts.join(",");
}

/**
 * Legge un elenco di VLAN scritto come in IOS: numeri e intervalli separati
 * da virgole, senza spazi, per esempio "10,20,30-35".
 *
 * @param text - il testo da leggere
 * @returns i numeri, in ordine e senza doppioni
 * @throws Error se il testo non è un elenco valido, o se un numero non è
 *   una VLAN valida (da 1 a 1001)
 */
export function parseVlanList(text: string): readonly number[] {
  const vlans: number[] = [];
  for (const part of text.split(",")) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (range === null) throw new Error(`Elenco di VLAN non valido: ${text}.`);
    const first = Number(range[1]);
    const last = range[2] === undefined ? first : Number(range[2]);
    for (const vlan of [first, last]) {
      const problem = checkVlanId(vlan);
      if (problem !== null) throw new Error(problem);
    }
    if (last < first) throw new Error(`Intervallo di VLAN al contrario: ${part}.`);
    for (let vlan = first; vlan <= last; vlan++) vlans.push(vlan);
  }
  return normalizeVlanList(vlans);
}
