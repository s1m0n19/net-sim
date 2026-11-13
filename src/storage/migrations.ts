// Le versioni del formato dei file e il passaggio da una all'altra
// (requisito FILE-2, decisione D-108).
//
// Il numero di versione sale quando un file contiene qualcosa che una
// versione precedente dell'app perderebbe riaprendolo e salvandolo: le
// versioni precedenti rifiutano un numero che non conoscono, quindi non
// possono leggere il file a metà. L'app scrive la versione più bassa che
// basta a descrivere il file, così i file più semplici restano leggibili
// anche dalle versioni precedenti.
//
//   1  la rete, le posizioni, i guasti e, se chieste, le tabelle
//   2  in più, le annotazioni del disegno (riquadri e note)
//   3  in più, le VLAN degli switch (decisione D-143)
//
// Un file di una versione precedente viene portato all'ultima un passo
// alla volta, prima dei controlli, con le funzioni qui sotto.

/** La versione più recente del formato: quella che l'app sa leggere e scrivere. */
export const LATEST_VERSION = 3;

// Per ogni versione, il passo che porta un file alla versione successiva.
// Lavora sul JSON appena letto, prima di qualsiasi controllo.
const STEPS: Record<number, (data: any) => any> = {
  // Da 1 a 2: la versione 2 aggiunge soltanto le annotazioni, che un file
  // di versione 1 non ha. Il contenuto resta com'è.
  1: (data) => ({ ...data, version: 2 }),
  // Da 2 a 3: la versione 3 aggiunge soltanto le VLAN, che un file di
  // versione 2 non ha: tutte le sue porte stanno nella VLAN 1.
  2: (data) => ({ ...data, version: 3 }),
};

/**
 * Porta il contenuto di un file all'ultima versione del formato.
 *
 * @param data - il JSON del file, con un numero di versione già controllato
 *   (intero, da 1 a `LATEST_VERSION`)
 * @returns lo stesso contenuto, scritto come nell'ultima versione
 */
export function migrateToLatest(data: any): any {
  let current = data;
  while (current.version < LATEST_VERSION) {
    current = STEPS[current.version](current);
  }
  return current;
}

/**
 * La versione con cui scrivere un file: la più bassa che basta a
 * descriverlo, perché anche le versioni precedenti dell'app lo possano aprire.
 *
 * @param hasAnnotations - se il disegno ha almeno un'annotazione
 * @param hasVlans - se almeno uno switch ha una VLAN oltre la 1, o una
 *   porta fuori dalla VLAN 1 (vedi `usesVlans` in vlans-file.ts)
 * @returns 3 se ci sono VLAN, altrimenti 2 se ci sono annotazioni,
 *   altrimenti 1
 */
export function versionToWrite(hasAnnotations: boolean, hasVlans: boolean): number {
  if (hasVlans) return 3;
  return hasAnnotations ? 2 : 1;
}
