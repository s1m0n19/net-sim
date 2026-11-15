// Le porte trunk degli switch nel file di rete (decisione D-150, versione 4
// del formato). Il formato è descritto in docs/formato-file.md.
//
// Come per le VLAN, nel file va solo ciò che non è il valore di partenza:
//
// - "mode": solo "trunk" (una porta senza il campo è access);
// - "nativeVlan": solo se diversa da 1;
// - "allowedVlans": solo se non sono tutte; un elenco, anche vuoto.
//
// Nativa e consentite si scrivono anche su una porta access, dove restano
// memorizzate senza effetto (D-146): chi la rimette trunk le ritrova. Per
// questo la versione 4 serve appena una porta ha uno dei tre campi diverso
// dal valore di partenza, non solo quando c'è un trunk acceso.
//
// Nativa e consentite possono indicare VLAN che lo switch non ha: è una
// configurazione legittima, utile per gli esercizi di ricerca guasti.

import type { Network, SwitchPort } from "../engine/model/network";
import { ALL_VLANS, type AllowedVlans, type PortMode } from "../engine/model/trunks";
import { DEFAULT_VLAN, checkVlanId } from "../engine/model/vlans";

// I campi delle porte che esistono solo dalla versione 4.
const TRUNK_FIELDS = ["mode", "nativeVlan", "allowedVlans"] as const;

/**
 * Dice se una porta ha una configurazione di trunk diversa da quella di
 * partenza: trunk, oppure con una nativa diversa da 1, oppure con VLAN
 * consentite che non sono tutte.
 *
 * @param port - la porta di uno switch
 * @returns true se la porta va scritta con i campi della versione 4
 */
export function hasTrunkConfig(port: SwitchPort): boolean {
  return port.mode !== "access" || port.nativeVlan !== DEFAULT_VLAN || port.allowedVlans !== ALL_VLANS;
}

/**
 * Dice se in una rete c'è almeno una porta con una configurazione di trunk:
 * allora il file deve essere di versione 4.
 *
 * @param network - la rete da salvare
 * @returns true se serve la versione 4
 */
export function usesTrunks(network: Network): boolean {
  return network.devices.some((device) => device.kind === "switch" && device.ports.some(hasTrunkConfig));
}

/**
 * Dice se il contenuto di un file usa qualcosa che esiste solo dalla
 * versione 4: un campo di trunk su una porta (anche con il valore di
 * partenza), o il campo "vlan" in una riga di una tabella MAC. Si guarda il
 * file così com'è, prima di leggerlo, per rifiutare un file di versione 1,
 * 2 o 3 che non può venire dall'app.
 *
 * @param data - il JSON del file
 * @returns true se il file contiene campi della versione 4
 */
export function fileUsesTrunks(data: any): boolean {
  const devices = data?.network?.devices;
  if (!Array.isArray(devices)) return false;
  return devices.some((d: any) => {
    const ports: any[] = Array.isArray(d?.ports) ? d.ports : [];
    const rows: any[] = Array.isArray(d?.macTable) ? d.macTable : [];
    return (
      ports.some((p) => TRUNK_FIELDS.some((field) => p?.[field] !== undefined)) ||
      rows.some((row) => row?.vlan !== undefined)
    );
  });
}

/**
 * I campi di trunk di una porta come si scrivono nel file: solo quelli
 * diversi dal valore di partenza.
 *
 * @param port - la porta di uno switch
 * @returns un oggetto con i campi da aggiungere alla porta, anche vuoto
 */
export function trunkFieldsToWrite(port: SwitchPort): object {
  return {
    ...(port.mode === "trunk" ? { mode: "trunk" } : {}),
    ...(port.nativeVlan !== DEFAULT_VLAN ? { nativeVlan: port.nativeVlan } : {}),
    ...(port.allowedVlans !== ALL_VLANS ? { allowedVlans: [...port.allowedVlans] } : {}),
  };
}

/**
 * Legge il modo di una porta di switch. Se il campo manca, la porta è access.
 *
 * @param p - la porta come sta nel file
 * @param where - dove si trova, per i messaggi
 * @returns "access" oppure "trunk"
 * @throws Error se il campo c'è ma non è "access" o "trunk"
 */
export function readPortMode(p: any, where: string): PortMode {
  if (p.mode === undefined) return "access";
  if (p.mode !== "access" && p.mode !== "trunk") {
    throw new Error(`${where}: il campo "mode" deve essere "access" o "trunk".`);
  }
  return p.mode;
}

/**
 * Legge la VLAN nativa di una porta di switch. Se il campo manca, è la 1.
 * Non si chiede che la VLAN esista sullo switch.
 *
 * @param p - la porta come sta nel file
 * @param where - dove si trova, per i messaggi
 * @returns il numero della VLAN nativa
 * @throws Error se il campo c'è ma non è un numero di VLAN da 1 a 1001
 */
export function readNativeVlan(p: any, where: string): number {
  if (p.nativeVlan === undefined) return DEFAULT_VLAN;
  return readVlanNumber(p.nativeVlan, `${where}, campo "nativeVlan"`);
}

/**
 * Legge le VLAN consentite di una porta di switch. Se il campo manca, sono
 * tutte. L'elenco deve essere già in ordine e senza doppioni: un file
 * scritto male si rifiuta, non si raddrizza.
 *
 * @param p - la porta come sta nel file
 * @param where - dove si trova, per i messaggi
 * @returns "all", oppure l'elenco (anche vuoto)
 * @throws Error se il campo non è "all" né un elenco, se un elemento non è
 *   un numero di VLAN da 1 a 1001, o se l'elenco non è in ordine o ha doppioni
 */
export function readAllowedVlans(p: any, where: string): AllowedVlans {
  if (p.allowedVlans === undefined || p.allowedVlans === ALL_VLANS) return ALL_VLANS;
  const field = `${where}, campo "allowedVlans"`;
  if (!Array.isArray(p.allowedVlans)) {
    throw new Error(`${field}: deve essere "all" oppure un elenco di numeri di VLAN.`);
  }
  const vlans = p.allowedVlans.map((value: unknown) => readVlanNumber(value, field));
  for (let index = 1; index < vlans.length; index++) {
    if (vlans[index] <= vlans[index - 1]) {
      throw new Error(`${field}: l'elenco deve essere in ordine crescente, senza doppioni.`);
    }
  }
  return Object.freeze(vlans);
}

// Un numero di VLAN: un numero intero da 1 a 1001.
function readVlanNumber(value: unknown, where: string): number {
  if (typeof value !== "number") throw new Error(`${where}: ${JSON.stringify(value)} non è un numero di VLAN.`);
  const problem = checkVlanId(value);
  if (problem !== null) throw new Error(`${where}: ${problem}`);
  return value;
}
