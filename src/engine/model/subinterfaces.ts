// Le sottointerfacce di un router e le sue interfacce logiche (router-on-a-
// stick, L3-1, decisioni D-158…D-174).
//
// Una porta fisica ha un cavo; una sottointerfaccia no: si appoggia a una
// porta (il "padre") e a una VLAN 802.1Q, e usa il MAC del padre. Per il
// livello 3, cioè per indirizzi, ARP e routing, porte e sottointerfacce
// sono tutte "interfacce logiche": `layer3InterfacesOf` le presenta in un
// elenco solo, mentre `Router.ports` resta l'elenco delle porte con un cavo.
//
// Qui stanno anche i vincoli strutturali (V1–V10): gli stati che un router
// non può avere, rifiutati da ogni modifica. Altri stati sono ammessi anche
// se non fanno passare traffico: una sottointerfaccia senza VLAN, senza
// indirizzo, spenta, o con il padre spento.
//
// In questa fase (L3-1A) le sottointerfacce esistono nel modello e nelle
// modifiche, ma ARP, routing e ricezione dei frame usano ancora le sole
// porte (L3-1B).

import { sameNetwork, type Ipv4Address, type MacAddress } from "./addresses";
import type { Router, Subinterface } from "./network";
import { checkInterfaceAddress, checkInterfacesApart } from "./router-config";
import { checkVlanId } from "./vlans";

/** Il numero più alto di una sottointerfaccia (D-168): Gi0/0.1 … Gi0/0.4094. */
export const MAX_SUBINTERFACE_NUMBER = 4094;

/** Un'interfaccia logica di un router: una porta fisica o una sottointerfaccia. */
export interface Layer3Interface {
  name: string;
  // La porta fisica: per una porta, sé stessa.
  parent: string;
  // La VLAN 802.1Q e il flag native; per una porta, null e false.
  vlan: number | null;
  native: boolean;
  ip: Ipv4Address | null;
  mask: Ipv4Address | null;
  // Per una sottointerfaccia, il MAC del padre (D-160b).
  mac: MacAddress;
  enabled: boolean;
  physical: boolean;
}

/**
 * Divide il nome di una sottointerfaccia nel nome del padre e nel numero.
 *
 * @param name - per esempio "Gi0/0.10"
 * @returns padre e numero, oppure null se il nome non ha la forma
 *   `porta.numero` (il numero fatto di sole cifre)
 */
export function parseSubinterfaceName(name: string): { parent: string; number: number } | null {
  const match = /^(.+)\.(\d+)$/.exec(name);
  return match === null ? null : { parent: match[1], number: Number(match[2]) };
}

/**
 * Una sottointerfaccia appena creata: senza VLAN, senza indirizzo, accesa.
 *
 * @param name - il nome, per esempio "Gi0/0.10"; il padre se ne ricava
 * @returns la sottointerfaccia, ancora da controllare con checkSubinterfaces
 */
export function newSubinterface(name: string): Subinterface {
  const parsed = parseSubinterfaceName(name);
  return { name, parent: parsed?.parent ?? "", vlan: null, native: false, ip: null, mask: null, enabled: true };
}

/**
 * Le interfacce logiche di un router: ogni porta fisica, nell'ordine del
 * router, seguita dalle sue sottointerfacce in ordine di numero. Non
 * modifica il router.
 *
 * @param router - il router
 * @returns un elenco nuovo
 */
export function layer3InterfacesOf(router: Router): Layer3Interface[] {
  const result: Layer3Interface[] = [];
  for (const port of router.ports) {
    const { name, ip, mask, mac, enabled } = port;
    result.push({ name, parent: name, vlan: null, native: false, ip, mask, mac, enabled, physical: true });
    const children = router.subinterfaces
      .filter((sub) => sub.parent === port.name)
      .sort((a, b) => numberOf(a) - numberOf(b));
    for (const sub of children) {
      result.push({ ...sub, mac: port.mac, physical: false });
    }
  }
  return result;
}

/**
 * L'interfaccia logica nella cui rete sta un indirizzo. Le reti delle
 * interfacce logiche non si sovrappongono (V9), quindi ce n'è al più una.
 *
 * @param router - il router
 * @param ip - l'indirizzo
 * @returns l'interfaccia, oppure null se l'indirizzo non sta in nessuna rete
 *   del router
 */
export function interfaceOfAddress(router: Router, ip: Ipv4Address): Layer3Interface | null {
  return (
    layer3InterfacesOf(router).find(
      (iface) => iface.ip !== null && iface.mask !== null && sameNetwork(iface.ip, ip, iface.mask),
    ) ?? null
  );
}

/**
 * Controlla i vincoli strutturali delle sottointerfacce di un router
 * (V1–V10), e quelli che legano porte e sottointerfacce (V9, V10).
 *
 * V1 nome `porta.numero`; V2 il padre è una porta fisica; V3 numero da 1 a
 * 4094; V4 nomi unici, e diversi da quelli delle porte; V5 VLAN null o da 1
 * a 1001; V6 nessuna VLAN ripetuta sullo stesso padre; V7 native solo con
 * una VLAN, e al più una per padre; V8 indirizzo e maschera insieme, validi,
 * e solo con una VLAN; V9 le reti di tutte le interfacce logiche non si
 * sovrappongono; V10 una porta con una sottointerfaccia native non ha
 * indirizzo.
 *
 * @param router - il router, così com'è o come sarebbe dopo una modifica
 * @returns il motivo del primo vincolo violato, oppure null se va tutto bene
 */
export function checkSubinterfaces(router: Router): string | null {
  const portNames = router.ports.map((port) => port.name);
  const seen = new Set<string>();
  for (const sub of router.subinterfaces) {
    const parsed = parseSubinterfaceName(sub.name);
    if (parsed === null || parsed.parent !== sub.parent) {
      return `nome di sottointerfaccia non valido: ${sub.name}`; // V1
    }
    if (!portNames.includes(sub.parent)) {
      return `${sub.name}: non c'è un'interfaccia ${sub.parent}`; // V2
    }
    if (!Number.isInteger(parsed.number) || parsed.number < 1 || parsed.number > MAX_SUBINTERFACE_NUMBER) {
      return `${sub.name}: il numero di una sottointerfaccia va da 1 a ${MAX_SUBINTERFACE_NUMBER}`; // V3
    }
    if (seen.has(sub.name) || portNames.includes(sub.name)) {
      return `sottointerfaccia ripetuta: ${sub.name}`; // V4
    }
    seen.add(sub.name);
    if (sub.vlan !== null) {
      const problem = checkVlanId(sub.vlan);
      if (problem !== null) return `${sub.name}: ${problem}`; // V5
    }
    if (sub.native && sub.vlan === null) {
      return `${sub.name}: native richiede una VLAN`; // V7
    }
    if (sub.ip !== null || sub.mask !== null) {
      if (sub.vlan === null) {
        return `${sub.name}: un indirizzo richiede prima la VLAN (encapsulation dot1Q)`; // V8
      }
      const problem = checkInterfaceAddress(sub.ip, sub.mask);
      if (problem !== null) return `${sub.name}: ${problem}`; // V8
    }
  }
  for (const port of router.ports) {
    const children = router.subinterfaces.filter((sub) => sub.parent === port.name);
    const vlans = children.flatMap((sub) => (sub.vlan === null ? [] : [sub.vlan]));
    const repeated = vlans.find((vlan, index) => vlans.indexOf(vlan) !== index);
    if (repeated !== undefined) {
      return `${port.name}: la VLAN ${repeated} è già di un'altra sottointerfaccia`; // V6
    }
    const natives = children.filter((sub) => sub.native);
    if (natives.length > 1) {
      return `${port.name}: una sola sottointerfaccia può essere native`; // V7
    }
    if (natives.length === 1 && port.ip !== null) {
      return `${port.name}: ha un indirizzo, e la sua sottointerfaccia ${natives[0].name} è native`; // V10
    }
  }
  return checkInterfacesApart(layer3InterfacesOf(router)); // V9
}

// Il numero di una sottointerfaccia, per metterle in ordine.
function numberOf(sub: Subinterface): number {
  return parseSubinterfaceName(sub.name)?.number ?? 0;
}
