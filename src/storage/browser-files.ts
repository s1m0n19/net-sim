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
 * Dove scrivere un'immagine: un file scelto dall'utente (Chrome, Edge),
 * oppure un download, negli altri browser.
 */
export type ImageTarget = { kind: "file"; name: string; handle: { createWritable(): Promise<any> } } | { kind: "download"; name: string };

const IMAGE_TYPES = [{ description: "Immagine PNG", accept: { "image/png": [".png"] } }];

/**
 * Fa scegliere all'utente dove salvare un'immagine, prima di prepararla
 * (ED-8, D-119). La finestra del browser si apre subito, nella chiamata:
 * va chiamata direttamente dal gesto dell'utente, prima di qualsiasi
 * attesa, perché il browser apre quella finestra solo in risposta a un
 * gesto, e dopo un'attesa lunga potrebbe rifiutarla.
 *
 * @param suggestedName - il nome proposto, con l'estensione .png
 * @returns dove scrivere, oppure null se l'utente ha annullato
 * @throws l'errore del browser, se la finestra non si apre per altri motivi
 */
export function chooseImageTarget(suggestedName: string): Promise<ImageTarget | null> {
  const picker = (window as any).showSaveFilePicker;
  if (typeof picker !== "function") return Promise.resolve({ kind: "download", name: suggestedName });
  // La finestra si apre qui, adesso: nulla prima di questa riga attende.
  const opening: Promise<{ name: string; createWritable(): Promise<any> }> = picker({ suggestedName, types: IMAGE_TYPES });
  return opening.then(
    (handle) => ({ kind: "file", name: handle.name, handle }),
    (problem) => {
      if (wasCancelled(problem)) return null;
      throw problem;
    },
  );
}

/**
 * Scrive un'immagine dove l'utente ha scelto, oppure la fa scaricare. Se la
 * scrittura non riesce, il file non viene lasciato a metà: la scrittura
 * passa da un file di appoggio, che si butta.
 *
 * @param target - dove scrivere, da `chooseImageTarget`
 * @param image - l'immagine PNG
 * @returns il nome del file scritto
 * @throws l'errore del browser, se la scrittura non riesce
 */
export async function writeImage(target: ImageTarget, image: Blob): Promise<string> {
  if (target.kind === "download") {
    downloadBlob(image, target.name);
    return target.name;
  }
  const writable = await target.handle.createWritable();
  try {
    await writable.write(image);
    await writable.close();
  } catch (problem) {
    await writable.abort?.().catch(() => undefined);
    throw problem;
  }
  return target.name;
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
  downloadBlob(new Blob([text], { type: "application/json" }), name);
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
