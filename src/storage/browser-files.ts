// Scelta, lettura e scrittura di un file sul computer dell'utente, nel browser.

// Il file su disco, quando il browser permette di tenerlo in mano: serve a
// salvare di nuovo nello stesso punto senza richiedere dove. Esiste in
// Chrome ed Edge; negli altri browser vale sempre null.
export type FileHandle = { name: string; createWritable(): Promise<any> } | null;

export interface PickedFile {
  name: string;
  text: string;
  handle: FileHandle;
}

export interface SavedFile {
  name: string;
  handle: FileHandle;
}

const FILE_TYPES = [{ description: "Rete di net-sim", accept: { "application/json": [".json"] } }];

/**
 * Fa scegliere un file di rete all'utente e ne legge il contenuto.
 *
 * @returns nome e contenuto del file, oppure null se l'utente ha annullato
 */
export async function pickNetworkFile(): Promise<PickedFile | null> {
  // Chrome ed Edge hanno una finestra di scelta più completa. Dove manca
  // si ripiega su un campo di tipo file, che esiste in ogni browser.
  const picker = (window as any).showOpenFilePicker;
  if (typeof picker === "function") {
    try {
      const [handle] = await picker({ types: FILE_TYPES });
      const file: File = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (problem) {
      if (wasCancelled(problem)) return null;
      throw problem;
    }
  }
  return pickWithInput();
}

function pickWithInput(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      resolve(file === undefined ? null : { name: file.name, text: await file.text(), handle: null });
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Scrive una rete in un file sul computer dell'utente.
 *
 * Dove il browser lo permette (Chrome, Edge) il file viene scritto nel
 * punto scelto dall'utente, e le volte successive nello stesso file senza
 * richiederlo. Negli altri browser il file viene scaricato ogni volta
 * nella cartella dei download.
 *
 * @param text - il contenuto del file
 * @param suggestedName - il nome proposto, con l'estensione
 * @param handle - il file aperto o salvato in precedenza, se c'è: si
 *   scrive lì senza chiedere
 * @returns nome e file scritto, oppure null se l'utente ha annullato o non
 *   ha dato il permesso di scrivere
 * @throws l'errore del browser, se la scrittura fallisce per altri motivi
 */
export async function writeNetworkFile(
  text: string,
  suggestedName: string,
  handle: FileHandle,
): Promise<SavedFile | null> {
  const picker = (window as any).showSaveFilePicker;
  if (handle === null && typeof picker !== "function") {
    download(text, suggestedName);
    return { name: suggestedName, handle: null };
  }
  try {
    const target: NonNullable<FileHandle> = handle ?? (await picker({ suggestedName, types: FILE_TYPES }));
    const writable = await target.createWritable();
    await writable.write(text);
    await writable.close();
    return { name: target.name, handle: target };
  } catch (problem) {
    if (wasCancelled(problem)) return null;
    throw problem;
  }
}

/**
 * Dice se il browser lascia scegliere all'utente dove scrivere un file.
 *
 * @returns true in Chrome ed Edge; false dove un file si può solo scaricare
 */
export function canChooseWhereToSave(): boolean {
  return typeof (window as any).showSaveFilePicker === "function";
}

// L'utente ha chiuso la finestra senza scegliere, o ha negato il permesso.
function wasCancelled(problem: unknown): boolean {
  return problem instanceof DOMException && (problem.name === "AbortError" || problem.name === "NotAllowedError");
}

// Fa scaricare un testo come file, con un collegamento creato sul momento.
function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
