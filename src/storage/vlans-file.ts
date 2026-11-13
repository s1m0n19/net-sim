// Le VLAN degli switch nel file di rete (decisione D-143, versione 3 del
// formato). Il formato è descritto in docs/formato-file.md.
//
// Nel file va solo ciò che non si ricava da sé:
//
// - sullo switch, il campo "vlans" con le VLAN oltre la 1, ciascuna con
//   numero e nome. La VLAN 1 non si scrive: c'è sempre e si chiama sempre
//   "default";
// - su una porta, il campo "vlan" quando non è la 1.
//
// Una porta può indicare una VLAN che lo switch non ha più: è una porta
// inattiva, ed è una configurazione legittima, che si salva e si riapre.
// Le righe della tabella MAC non portano la VLAN: è quella della loro
// porta (vedi tables-file.ts).

import type { Network, Switch, SwitchPort } from "../engine/model/network";
import { DEFAULT_VLAN, checkVlanId, checkVlanName, type Vlan } from "../engine/model/vlans";
import { checkFields, readText } from "./fields";

/**
 * Dice se una rete ha una configurazione di VLAN da scrivere: almeno uno
 * switch con una VLAN oltre la 1, o con una porta fuori dalla VLAN 1
 * (anche su una VLAN eliminata). Serve a scegliere la versione del file.
 *
 * @param network - la rete da salvare
 * @returns true se il file dovrà contenere le VLAN
 */
export function usesVlans(network: Network): boolean {
  return network.devices.some(
    (device) =>
      device.kind === "switch" &&
      (device.vlans.some((vlan) => vlan.id !== DEFAULT_VLAN) || device.ports.some((port) => port.vlan !== DEFAULT_VLAN)),
  );
}

/**
 * Dice se il contenuto di un file, appena letto e non ancora controllato,
 * usa i campi delle VLAN: "vlans" su uno switch o "vlan" su una sua porta.
 * Serve a rifiutare un file di versione 1 o 2 che li contiene.
 *
 * @param data - il JSON del file
 * @returns true se almeno uno switch ha uno dei due campi
 */
export function fileUsesVlans(data: any): boolean {
  const devices = data?.network?.devices;
  if (!Array.isArray(devices)) return false;
  return devices.some(
    (d: any) =>
      d?.kind === "switch" &&
      (d.vlans !== undefined || (Array.isArray(d.ports) && d.ports.some((p: any) => p?.vlan !== undefined))),
  );
}

/**
 * Le VLAN di uno switch come si scrivono nel file.
 *
 * @param sw - lo switch
 * @returns un oggetto con il campo "vlans", in ordine di numero; vuoto se
 *   lo switch ha solo la VLAN 1
 */
export function vlansToWrite(sw: Switch): object {
  const vlans = sw.vlans.filter((vlan) => vlan.id !== DEFAULT_VLAN).map((vlan) => ({ id: vlan.id, name: vlan.name }));
  return vlans.length === 0 ? {} : { vlans };
}

/**
 * La VLAN di una porta di switch come si scrive nel file.
 *
 * @param port - la porta
 * @returns un oggetto con il campo "vlan"; vuoto se la porta sta nella VLAN 1
 */
export function portVlanToWrite(port: SwitchPort): object {
  return port.vlan === DEFAULT_VLAN ? {} : { vlan: port.vlan };
}

/**
 * Legge le VLAN di uno switch dal file, dopo averle controllate.
 *
 * @param d - lo switch come sta nel file
 * @param switchName - il nome dello switch, per i messaggi
 * @returns le VLAN oltre la 1; nessuna se il campo manca
 * @throws Error se il campo non è un elenco, se una VLAN ha un campo
 *   mancante, sconosciuto o del tipo sbagliato, se il numero non è un
 *   intero da 2 a 1001 o è ripetuto, o se il nome non va bene
 */
export function readVlans(d: any, switchName: string): Vlan[] {
  if (d.vlans === undefined) return [];
  if (!Array.isArray(d.vlans)) {
    throw new Error(`${switchName}: il campo "vlans" deve essere un elenco.`);
  }
  const vlans: Vlan[] = [];
  d.vlans.forEach((v: any, index: number) => {
    const where = `${switchName}, VLAN n. ${index + 1}`;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      throw new Error(`${where}: deve avere un numero e un nome.`);
    }
    checkFields(v, ["id", "name"], where);
    const id = readVlanNumber(v, "id", where);
    // La VLAN 1 c'è sempre, con il suo nome: nel file non si ridefinisce.
    if (id === DEFAULT_VLAN) {
      throw new Error(`${where}: la VLAN 1 c'è sempre e non si scrive nel file.`);
    }
    const name = readText(v, "name", where);
    const problem = checkVlanName(name);
    if (problem !== null) throw new Error(`${where}: ${problem}`);
    if (vlans.some((other) => other.id === id)) {
      throw new Error(`${switchName}: VLAN ripetuta: ${id}.`);
    }
    vlans.push({ id, name });
  });
  return vlans;
}

/**
 * Legge la VLAN di una porta di switch dal file. Può essere una VLAN che lo
 * switch non ha: la porta allora è inattiva.
 *
 * @param p - la porta come sta nel file
 * @param where - lo switch e la porta, per i messaggi
 * @returns il numero della VLAN; 1 se il campo manca
 * @throws Error se il campo non è un intero da 1 a 1001
 */
export function readPortVlan(p: any, where: string): number {
  if (p.vlan === undefined) return DEFAULT_VLAN;
  return readVlanNumber(p, "vlan", where);
}

// Un numero di VLAN: deve essere un numero, intero, da 1 a 1001.
function readVlanNumber(source: any, field: string, where: string): number {
  const value = source[field];
  if (typeof value !== "number") {
    throw new Error(`${where}: il campo "${field}" manca o non è un numero.`);
  }
  const problem = checkVlanId(value);
  if (problem !== null) throw new Error(`${where}: ${problem}`);
  return value;
}
