// Scelta e lettura di un file dal computer dell'utente, nel browser.

export interface PickedFile {
  name: string;
  text: string;
}

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
      const [handle] = await picker({
        types: [{ description: "Rete di net-sim", accept: { "application/json": [".json"] } }],
      });
      const file: File = await handle.getFile();
      return { name: file.name, text: await file.text() };
    } catch (problem) {
      // L'utente ha chiuso la finestra senza scegliere.
      if (problem instanceof DOMException && problem.name === "AbortError") return null;
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
      resolve(file === undefined ? null : { name: file.name, text: await file.text() });
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
