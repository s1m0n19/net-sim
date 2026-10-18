// I controlli sui singoli campi di un file di rete, comuni a tutto ciò che
// lo legge (load.ts, tables-file.ts). Ognuno, se il campo non va, si ferma
// con un messaggio che dice dove e che cosa.

import { BROADCAST_MAC } from "../engine/model/addresses";

/**
 * Legge un campo di testo obbligatorio.
 *
 * @param source - l'oggetto del file che dovrebbe contenerlo
 * @param field - il nome del campo
 * @param where - di chi si parla, per il messaggio di errore
 * @returns il testo
 * @throws Error se il campo manca, è vuoto o non è un testo
 */
export function readText(source: any, field: string, where: string): string {
  const value = source?.[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${where}: il campo "${field}" manca o non è un testo.`);
  }
  return value;
}

/**
 * Legge un campo di testo che può valere null.
 *
 * @param source - l'oggetto del file che dovrebbe contenerlo
 * @param field - il nome del campo
 * @param where - di chi si parla, per il messaggio di errore
 * @returns il testo, oppure null
 * @throws Error se il campo manca o non è né un testo né null
 */
export function readTextOrNull(source: any, field: string, where: string): string | null {
  const value = source?.[field];
  if (value === null) return null;
  return readText(source, field, where);
}

/**
 * Legge un campo sì/no facoltativo. Se manca vale "sì": un dispositivo è
 * acceso e un cavo è collegato, a meno che il file dica il contrario.
 *
 * @param source - l'oggetto del file che potrebbe contenerlo
 * @param field - il nome del campo
 * @param where - di chi si parla, per il messaggio di errore
 * @returns il valore del campo, o true se manca
 * @throws Error se il campo c'è ma non è true o false
 */
export function readFlag(source: any, field: string, where: string): boolean {
  const value = source?.[field];
  if (value === undefined) return true;
  if (typeof value !== "boolean") {
    throw new Error(`${where}: il campo "${field}" deve valere true o false.`);
  }
  return value;
}

/**
 * Legge una coordinata della posizione sul disegno.
 *
 * @param source - la posizione nel file
 * @param field - "x" oppure "y"
 * @param where - di chi si parla, per il messaggio di errore
 * @returns il numero
 * @throws Error se manca o non è un numero finito
 */
export function readNumber(source: any, field: string, where: string): number {
  const value = source?.[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${where}: la posizione "${field}" manca o non è un numero.`);
  }
  return value;
}

/**
 * Controlla che in un elenco nessun valore sia ripetuto.
 *
 * @param values - i valori da controllare
 * @param problem - l'inizio del messaggio di errore
 * @throws Error con il primo valore ripetuto
 */
export function checkUnique(values: string[], problem: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${problem}: ${value}.`);
    }
    seen.add(value);
  }
}

/**
 * Dice se un testo è un MAC che una scheda di rete può avere: sei coppie
 * di cifre esadecimali separate da due punti, e non il broadcast.
 *
 * @param mac - il testo da controllare
 * @returns true se va bene come indirizzo di una porta
 */
export function isUsableMac(mac: string): boolean {
  return /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(mac) && mac.toLowerCase() !== BROADCAST_MAC;
}
