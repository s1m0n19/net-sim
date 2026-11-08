// Il file da cui viene la rete aperta: aprirne uno, tornare al foglio
// vuoto, sapere se ci sono modifiche non salvate, preparare il salvataggio.
//
// È il secondo strato di `session` (vedi session.svelte.ts). Scrivere sul
// disco tocca alla barra in alto, con storage/browser-files.ts: qui si
// prepara il testo e si prende nota di ciò che è stato salvato.

import { copyTables, type NetworkTables } from "../engine/model/tables";
import { Simulator } from "../engine/simulator";
import { loadNetworkFile } from "../storage/load";
import { browserStore, clearRecovery, readRecovery, writeRecovery, type RecoveryCopy } from "../storage/recovery";
import { serializeNetwork } from "../storage/save";
import { messageOf, SessionCore } from "./session-core.svelte";

// L'estensione dei file di rete, e il nome di un file senza di lei.
export const FILE_EXTENSION = ".netsim.json";

function baseName(fileName: string): string {
  return fileName.replace(/(\.netsim)?\.json$/i, "");
}

/**
 * Ciò che serve per salvare: il testo da scrivere nel file, e ciò che dopo
 * la scrittura dice alla sessione com'era la rete salvata.
 */
export interface SaveDraft {
  // Il contenuto del file, tabelle comprese se richieste.
  text: string;
  // La sola configurazione, per riconoscere le modifiche non salvate.
  config: string;
  // Le tabelle scritte nel file, o null se non sono state scritte.
  tables: NetworkTables | null;
}

export class SessionFile extends SessionCore {
  // Il nome del file aperto, senza estensione; null se la rete è nuova.
  fileName = $state<string | null>(null);

  /** La rete è diversa da quella aperta o salvata l'ultima volta. */
  dirty = $state(false);

  // Il testo del file com'era all'ultima apertura o all'ultimo salvataggio,
  // senza tabelle: le tabelle cambiate dal traffico non sono una modifica.
  protected savedText = "";

  /**
   * Salvare scrive anche le tabelle ARP e MAC (FILE-5). Si accende da solo
   * aprendo un file che le contiene, e si spegne con Nuova.
   */
  saveTables = $state(false);

  // Un messaggio per l'utente quando un file non si può aprire.
  error = $state<string | null>(null);

  /**
   * La copia di recupero trovata all'apertura della pagina, finché l'utente
   * non sceglie se ripristinarla o scartarla (D-120). Intanto la copia nel
   * browser non si tocca: un clic per sbaglio non la cancella.
   */
  recoveryOffer = $state.raw<RecoveryCopy | null>(null);

  // Dove tenere la copia di recupero; null se il browser non lo permette.
  private recoveryStore = browserStore();
  // La copia si tiene solo dopo aver guardato se ce n'era una (checkRecovery).
  private recoveryChecked = false;
  // Il testo dell'ultima copia scritta: si riscrive solo se cambia.
  private lastRecoveryText: string | null = null;

  /**
   * Apre una rete a partire dal contenuto di un file.
   * Se il file non è valido la rete aperta resta quella di prima, e
   * `error` dice che cosa non va.
   *
   * @param name - il nome del file, mostrato nella barra in alto
   * @param text - il contenuto del file
   */
  open(name: string, text: string): void {
    try {
      const loaded = loadNetworkFile(text);
      this.simulator = new Simulator(loaded.network, loaded.tables ?? new Map());
      this.positions = loaded.positions;
      this.annotations = loaded.annotations;
      this.saveTables = loaded.tables !== null;
      this.savedText = this.serialize();
      this.fileName = baseName(name);
      this.error = null;
      this.selection = null;
      this.networkReplaced();
      this.rewind();
      // Una rete appena aperta si vede tutta, grande quanto ci sta.
      this.fitView();
    } catch (problem) {
      this.error = messageOf(problem);
    }
  }

  /** Torna al foglio vuoto: una rete nuova, senza dispositivi. */
  clear(): void {
    this.simulator = new Simulator({ devices: [], links: [] });
    this.positions = new Map();
    this.annotations = [];
    this.savedText = this.serialize();
    this.saveTables = false;
    this.fileName = null;
    this.error = null;
    this.selection = null;
    this.networkReplaced();
    this.rewind();
    this.camera = null;
  }

  // La rete è "modificata" se il file che ne uscirebbe adesso è diverso
  // dall'ultimo aperto o salvato: tornare indietro con Annulla la
  // riporta a "salvata".
  protected override refresh(): void {
    super.refresh();
    const text = this.serialize();
    this.dirty = text !== this.savedText;
    this.keepRecovery(text);
  }

  /**
   * Da chiamare all'apertura della pagina: guarda se nel browser c'è una
   * copia di recupero, e da lì in poi la tiene aggiornata (D-120).
   */
  checkRecovery(): void {
    if (this.recoveryChecked) return;
    this.recoveryChecked = true;
    this.recoveryOffer = this.recoveryStore === null ? null : readRecovery(this.recoveryStore);
    if (this.recoveryOffer === null) this.keepRecovery(this.serialize());
  }

  /**
   * Riapre la rete della copia di recupero, con il nome del file da cui
   * veniva. Resta da salvare: il file su disco è ancora quello di prima.
   */
  restoreRecovery(): void {
    const copy = this.recoveryOffer;
    if (copy === null) return;
    this.recoveryOffer = null;
    this.open(`${copy.fileName ?? "rete"}${FILE_EXTENSION}`, copy.text);
    if (this.error !== null) return;
    this.fileName = copy.fileName;
    this.savedText = "";
    this.refresh();
  }

  /** Lascia andare la copia di recupero: da qui si tiene quella del lavoro nuovo. */
  discardRecovery(): void {
    this.recoveryOffer = null;
    if (this.recoveryStore !== null) clearRecovery(this.recoveryStore);
    this.lastRecoveryText = null;
    this.keepRecovery(this.serialize());
  }

  // Tiene la copia di recupero al passo con la rete: c'è finché ci sono
  // modifiche non salvate, sparisce quando la rete torna salvata. Si scrive
  // solo quando il testo cambia, non a ogni passo della simulazione.
  private keepRecovery(text: string): void {
    const store = this.recoveryStore;
    if (store === null || !this.recoveryChecked || this.recoveryOffer !== null) return;
    if (this.dirty) {
      if (text === this.lastRecoveryText) return;
      writeRecovery(store, { fileName: this.fileName, text, savedAt: Date.now() });
      this.lastRecoveryText = text;
    } else if (this.lastRecoveryText !== null) {
      clearRecovery(store);
      this.lastRecoveryText = null;
    }
  }

  /**
   * Il contenuto del file che descrive la configurazione della rete com'è
   * adesso: configurazione, posizioni, guasti e annotazioni, senza tabelle
   * né pacchetti. È ciò che si confronta per sapere se ci sono modifiche
   * non salvate.
   */
  serialize(): string {
    return serializeNetwork(this.network(), this.positions, { annotations: this.annotations });
  }

  /**
   * Prepara un salvataggio: il testo del file, con le tabelle se
   * `saveTables` è acceso, preso nello stesso istante di ciò che servirà a
   * `markSaved`.
   */
  draftSave(): SaveDraft {
    const network = this.network();
    return {
      text: serializeNetwork(network, this.positions, { tables: this.saveTables, annotations: this.annotations }),
      config: this.serialize(),
      tables: this.saveTables ? copyTables(network) : null,
    };
  }

  /**
   * Da chiamare dopo che il file è stato scritto: la rete prende il nome
   * del file e torna a risultare salvata. Se il file contiene le tabelle,
   * da qui Ricomincia torna a quelle.
   *
   * @param name - il nome del file scritto, con o senza estensione
   * @param draft - ciò che `draftSave` aveva preparato per quel file
   */
  markSaved(name: string, draft: SaveDraft): void {
    this.fileName = baseName(name);
    this.savedText = draft.config;
    if (draft.tables !== null) this.simulator?.setStartingTables(draft.tables);
    const text = this.serialize();
    this.dirty = text !== this.savedText;
    // Salvata, la copia di recupero non serve più (D-120).
    this.keepRecovery(text);
  }

  // La rete aperta; un foglio vuoto se non ce n'è nessuna.
  private network() {
    return this.simulator?.network ?? { devices: [], links: [] };
  }
}
