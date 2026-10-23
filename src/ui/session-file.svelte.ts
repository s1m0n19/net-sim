// Il file da cui viene la rete aperta: aprirne uno, tornare al foglio
// vuoto, sapere se ci sono modifiche non salvate, preparare il salvataggio.
//
// È il secondo strato di `session` (vedi session.svelte.ts). Scrivere sul
// disco tocca alla barra in alto, con storage/browser-files.ts: qui si
// prepara il testo e si prende nota di ciò che è stato salvato.

import { copyTables, type NetworkTables } from "../engine/model/tables";
import { Simulator } from "../engine/simulator";
import { loadNetworkFile } from "../storage/load";
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
    this.dirty = this.serialize() !== this.savedText;
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
    this.dirty = this.serialize() !== this.savedText;
  }

  // La rete aperta; un foglio vuoto se non ce n'è nessuna.
  private network() {
    return this.simulator?.network ?? { devices: [], links: [] };
  }
}
