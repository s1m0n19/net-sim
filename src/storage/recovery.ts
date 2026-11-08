// La copia di recupero (D-120): l'ultima rete con modifiche non salvate,
// tenuta nel browser, per non perdere il lavoro se la scheda si chiude o la
// pagina si ricarica. È una sola, e contiene ciò che andrebbe nel file
// (rete, posizioni, annotazioni), con il nome del file da cui veniva. Non
// sostituisce il file: il lavoro si consegna sempre salvandolo.
//
// Il browser può non avere dove tenerla (una finestra anonima, lo spazio
// finito, un'impostazione della scuola): allora semplicemente non c'è.

/** La copia di recupero, com'è tenuta nel browser. */
export interface RecoveryCopy {
  // Il nome del file da cui veniva la rete, senza estensione; null se era nuova.
  fileName: string | null;
  // Il contenuto del file che ne uscirebbe, senza tabelle.
  text: string;
  // Quando è stata scritta, in millisecondi dal 1970 (Date.now()).
  savedAt: number;
}

/** Dove tenere la copia: localStorage nel browser, qualcosa di simile nei test. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "net-sim:copia-di-recupero";

/**
 * Lo spazio del browser per la copia, se c'è e si può usare.
 *
 * @returns localStorage, oppure null se manca o il browser non lo lascia usare
 */
export function browserStore(): KeyValueStore | null {
  try {
    const store = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

/**
 * Legge la copia di recupero.
 *
 * @param store - dove è tenuta
 * @returns la copia, oppure null se non c'è o non si capisce
 */
export function readRecovery(store: KeyValueStore): RecoveryCopy | null {
  try {
    const raw = store.getItem(KEY);
    if (raw === null) return null;
    const copy = JSON.parse(raw);
    const valid =
      typeof copy === "object" &&
      copy !== null &&
      typeof copy.text === "string" &&
      typeof copy.savedAt === "number" &&
      (copy.fileName === null || typeof copy.fileName === "string");
    return valid ? { fileName: copy.fileName, text: copy.text, savedAt: copy.savedAt } : null;
  } catch {
    return null;
  }
}

/**
 * Scrive la copia di recupero, al posto di quella che c'era. Se il browser
 * non la accetta, non succede nulla: la copia è un aiuto, non un obbligo.
 *
 * @param store - dove tenerla
 * @param copy - la copia
 */
export function writeRecovery(store: KeyValueStore, copy: RecoveryCopy): void {
  try {
    store.setItem(KEY, JSON.stringify(copy));
  } catch {
    // Spazio finito o scrittura vietata: niente copia.
  }
}

/**
 * Cancella la copia di recupero.
 *
 * @param store - dove è tenuta
 */
export function clearRecovery(store: KeyValueStore): void {
  try {
    store.removeItem(KEY);
  } catch {
    // Niente da fare: al prossimo avvio la copia, se c'è, si potrà scartare.
  }
}
