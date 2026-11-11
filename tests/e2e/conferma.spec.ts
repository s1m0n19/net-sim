// La conferma prima di perdere le modifiche non salvate (U-3 del collaudo
// UX 5, D-137): Nuova rete e Apri rete chiedono con il dialogo dell'app,
// non con quello del browser. Annulla conserva tutto; Scarta modifiche fa
// soltanto l'operazione chiesta.
//
// La finestra dei file di Chrome ed Edge (showOpenFilePicker) qui è finta:
// restituisce il file preparato dal test e annota ogni scrittura, così si
// vede su quale file va il salvataggio dopo una conferma annullata.

import { expect, test, type Page } from "@playwright/test";
import { clickDrawing, device, exampleFile, openApp, projectCommand } from "./helpers";

interface FileLog {
  // L'evento in corso quando si è aperta la finestra dei file: dopo
  // un'attesa non ce ne sarebbe nessuno, e il browser la rifiuterebbe.
  opened: (string | null)[];
  // Le scritture, con il nome del file su cui sono andate.
  writes: { name: string; text: string }[];
  // I nomi proposti dalla finestra di Salva con nome.
  savedAs: string[];
}

// Il prossimo file che la finestra finta restituirà, o "cancel" se l'utente la chiude.
async function nextPick(page: Page, pick: { name: string; text: string } | "cancel"): Promise<void> {
  await page.evaluate((value) => Object.assign(window, { nextPick: value }), pick);
}

const fileLog = (page: Page) => page.evaluate(() => (window as unknown as { fileLog: FileLog }).fileLog);
const dialog = (page: Page) => page.getByRole("dialog", { name: "Modifiche non salvate" });
const cancel = (page: Page) => dialog(page).getByRole("button", { name: "Annulla" });
const discard = (page: Page) => dialog(page).getByRole("button", { name: "Scarta modifiche" });
const unsaved = (page: Page) => page.getByText("Da salvare", { exact: true });

// Un PC in più sulla rete aperta: una modifica non salvata.
async function addPc(page: Page): Promise<void> {
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.5, 0.85);
  await page.keyboard.press("Escape");
  await expect(unsaved(page)).toBeVisible();
}

test.describe("con la finestra dei file di Chrome ed Edge", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const log: FileLog = { opened: [], writes: [], savedAs: [] };
      const handleFor = (name: string) => ({
        name,
        createWritable: async () => ({
          write: async (text: string) => log.writes.push({ name, text }),
          close: async () => undefined,
        }),
      });
      Object.assign(window, { fileLog: log });
      Object.defineProperty(window, "showOpenFilePicker", {
        value: () => {
          log.opened.push(window.event?.type ?? null);
          const next = (window as unknown as { nextPick: { name: string; text: string } | "cancel" }).nextPick;
          if (next === "cancel") return Promise.reject(new DOMException("L'utente ha annullato.", "AbortError"));
          return Promise.resolve([{ ...handleFor(next.name), getFile: async () => new File([next.text], next.name) }]);
        },
      });
      Object.defineProperty(window, "showSaveFilePicker", {
        value: (options: { suggestedName: string }) => {
          log.savedAs.push(options.suggestedName);
          return Promise.resolve(handleFor(options.suggestedName));
        },
      });
    });
    // Non openApp, che toglie le finestre dei file per usare il campo di tipo file.
    await page.goto("/");
    await expect(page.getByText("La rete è vuota")).toBeVisible();
    await nextPick(page, { name: "lan.netsim.json", text: exampleFile("lan-switch") });
    await projectCommand(page, "Apri rete…");
    await expect(device(page, "PC1")).toBeVisible();
  });

  test("Nuova rete senza modifiche: nessuna domanda, il foglio vuoto", async ({ page }) => {
    await projectCommand(page, "Nuova rete");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText("La rete è vuota")).toBeVisible();
  });

  test("Nuova rete con modifiche: Annulla conserva rete, selezione e stato; Scarta crea la rete nuova", async ({ page }) => {
    await addPc(page);
    await device(page, "PC2").click();
    await projectCommand(page, "Nuova rete");
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("Creando una nuova rete, queste modifiche andranno perse.");
    await expect(cancel(page)).toBeFocused();
    await cancel(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("g.device")).toHaveCount(5);
    await expect(device(page, "PC2")).toHaveAttribute("aria-label", "PC2, selezionato");
    await expect(unsaved(page)).toBeVisible();

    await projectCommand(page, "Nuova rete");
    await discard(page).click();
    await expect(page.getByText("La rete è vuota")).toBeVisible();
    await expect(unsaved(page)).toHaveCount(0);
  });

  test("Apri rete senza modifiche: la finestra dei file si apre nel clic, e la rete si apre senza domande", async ({ page }) => {
    await nextPick(page, { name: "router.netsim.json", text: exampleFile("due-lan-router") });
    await projectCommand(page, "Apri rete…");
    await expect(device(page, "R1")).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    expect((await fileLog(page)).opened).toEqual(["click", "click"]);
  });

  test("Apri rete con modifiche, Annulla: la rete resta, e Salva scrive ancora nel file di prima", async ({ page }) => {
    await addPc(page);
    await nextPick(page, { name: "router.netsim.json", text: exampleFile("due-lan-router") });
    await projectCommand(page, "Apri rete…");
    // Prima la finestra dei file, nel clic; poi la domanda.
    expect((await fileLog(page)).opened.at(-1)).toBe("click");
    await expect(dialog(page)).toContainText("Aprendo un'altra rete, queste modifiche andranno perse.");
    await cancel(page).click();
    await expect(device(page, "R1")).toHaveCount(0);
    await expect(page.locator("g.device")).toHaveCount(5);
    await expect(unsaved(page)).toBeVisible();
    await expect(page.locator(".project .file")).toHaveText("lan");

    await page.keyboard.press("Control+s");
    await expect(unsaved(page)).toHaveCount(0);
    const log = await fileLog(page);
    expect(log.savedAs).toEqual([]);
    expect(log.writes.map((w) => w.name)).toEqual(["lan.netsim.json"]);
    expect(log.writes[0].text).toContain('"PC4"');
  });

  test("Apri rete con modifiche, Scarta: si apre la rete scelta, e Salva scrive nel suo file", async ({ page }) => {
    await addPc(page);
    await nextPick(page, { name: "router.netsim.json", text: exampleFile("due-lan-router") });
    await projectCommand(page, "Apri rete…");
    await discard(page).click();
    await expect(device(page, "R1")).toBeVisible();
    await expect(unsaved(page)).toHaveCount(0);
    await expect(page.locator(".project .file")).toHaveText("router");

    await addPc(page);
    await page.keyboard.press("Control+s");
    await expect(unsaved(page)).toHaveCount(0);
    const log = await fileLog(page);
    expect(log.savedAs).toEqual([]);
    expect(log.writes.map((w) => w.name)).toEqual(["router.netsim.json"]);
  });

  test("chiudere la finestra dei file non chiede nulla e non cambia nulla", async ({ page }) => {
    await addPc(page);
    await nextPick(page, "cancel");
    await projectCommand(page, "Apri rete…");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("g.device")).toHaveCount(5);
    await expect(unsaved(page)).toBeVisible();
  });

  test("un file non valido viene rifiutato senza chiedere di scartare: le modifiche restano", async ({ page }) => {
    await addPc(page);
    await nextPick(page, { name: "rotto.json", text: '{ "format": "altro" }' });
    await projectCommand(page, "Apri rete…");
    await expect(page.getByRole("alert")).toContainText("Il file non si può aprire");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("g.device")).toHaveCount(5);
    await expect(unsaved(page)).toBeVisible();
  });

  test("da tastiera: Tab e Maiusc+Tab tra i due pulsanti, Invio su Annulla annulla, Invio su Scarta scarta", async ({ page, browserName }) => {
    // Safari, come WebKit su Mac, con Tab passa solo tra i campi di testo:
    // ai pulsanti si arriva con Opzione+Tab.
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await addPc(page);
    await projectCommand(page, "Nuova rete");
    await expect(cancel(page)).toBeFocused();
    await page.keyboard.press(tab);
    await expect(discard(page)).toBeFocused();
    await page.keyboard.press(`Shift+${tab}`);
    await expect(cancel(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("g.device")).toHaveCount(5);
    // Il fuoco torna sul menu Progetto: la voce che aveva aperto il dialogo non c'è più.
    await expect(page.getByRole("button", { name: "Progetto" })).toBeFocused();

    await projectCommand(page, "Nuova rete");
    await page.keyboard.press(tab);
    await page.keyboard.press("Enter");
    await expect(page.getByText("La rete è vuota")).toBeVisible();
  });

  test("Esc vale Annulla, e il fuoco torna al menu Progetto", async ({ page }) => {
    await addPc(page);
    await projectCommand(page, "Nuova rete");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("g.device")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Progetto" })).toBeFocused();
  });

  test("mentre il dialogo è aperto, disegno e scorciatoie non reagiscono", async ({ page }) => {
    await addPc(page);
    await device(page, "PC2").click();
    const box = (await device(page, "PC3").boundingBox())!;
    await projectCommand(page, "Nuova rete");
    // Un clic sul disegno non seleziona altro; Canc e Ctrl+Z non toccano la rete.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press("Delete");
    await page.keyboard.press("Control+z");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("g.device")).toHaveCount(5);
    await expect(device(page, "PC2")).toHaveAttribute("aria-label", "PC2, selezionato");
  });

  test("nessuna conferma doppia: Invio ripetuto, doppio clic su Scarta, e i comandi di file mentre si chiede", async ({ page }) => {
    await addPc(page);
    await projectCommand(page, "Nuova rete");
    // Il dialogo è modale: un clic sul menu Progetto non arriva, e non nasce un secondo dialogo.
    await page.getByRole("button", { name: "Progetto" }).click({ force: true });
    await expect(page.getByRole("menuitem", { name: "Nuova rete" })).toHaveCount(0);
    await expect(dialog(page)).toHaveCount(1);
    // Invio due volte: la prima annulla, la seconda apre il menu Progetto, che non scarta nulla.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(page.locator("g.device")).toHaveCount(5);
    await page.keyboard.press("Escape");

    // Doppio clic su Scarta: una sola rete nuova, e poi nessun dialogo rimasto.
    await projectCommand(page, "Nuova rete");
    await discard(page).dblclick();
    await expect(page.getByText("La rete è vuota")).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    // Ripetere Nuova rete su un foglio vuoto non chiede nulla.
    await projectCommand(page, "Nuova rete");
    await projectCommand(page, "Nuova rete");
    await expect(dialog(page)).toHaveCount(0);
  });

  test("dopo Annulla restano la protezione alla chiusura della pagina e la copia di recupero", async ({ page }) => {
    await addPc(page);
    await projectCommand(page, "Nuova rete");
    await cancel(page).click();
    // Ricaricando, il browser chiede conferma (beforeunload) e poi l'app offre la copia.
    const asked: string[] = [];
    page.on("dialog", (native) => {
      asked.push(native.type());
      void native.accept();
    });
    await page.reload();
    expect(asked).toContain("beforeunload");
    await expect(page.getByRole("status").filter({ hasText: "C'è una rete non salvata" })).toBeVisible();
    await page.getByRole("button", { name: "Riprendi la rete non salvata" }).click();
    await expect(page.locator("g.device")).toHaveCount(5);
  });
});

// openApp toglie la finestra dei file: resta il campo di tipo file.
test.describe("senza la finestra dei file di Chrome ed Edge (Firefox, Safari)", () => {
  async function pickWithInput(page: Page, name: string, text: string) {
    const chooser = page.waitForEvent("filechooser");
    await projectCommand(page, "Apri rete…");
    await (await chooser).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
  }

  test("Apri rete con modifiche: si sceglie il file, poi si conferma; Annulla conserva, Scarta apre", async ({ page }) => {
    await openApp(page);
    await pickWithInput(page, "lan.netsim.json", exampleFile("lan-switch"));
    await expect(device(page, "PC1")).toBeVisible();
    await addPc(page);

    await pickWithInput(page, "router.netsim.json", exampleFile("due-lan-router"));
    await expect(dialog(page)).toBeVisible();
    await cancel(page).click();
    await expect(page.locator("g.device")).toHaveCount(5);
    await expect(unsaved(page)).toBeVisible();

    await pickWithInput(page, "router.netsim.json", exampleFile("due-lan-router"));
    await discard(page).click();
    await expect(device(page, "R1")).toBeVisible();
    await expect(unsaved(page)).toHaveCount(0);
  });

  test("un file non valido non fa chiedere nulla, e le modifiche restano", async ({ page }) => {
    await openApp(page);
    await pickWithInput(page, "lan.netsim.json", exampleFile("lan-switch"));
    await addPc(page);
    await pickWithInput(page, "rotto.json", "non è json");
    await expect(page.getByRole("alert")).toContainText("Il file non si può aprire");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("g.device")).toHaveCount(5);
  });
});
