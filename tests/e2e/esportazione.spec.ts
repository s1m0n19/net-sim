// L'esportazione come immagine (D-119), nei suoi casi difficili: la finestra
// di Chrome per scegliere dove salvare, che va aperta subito, nel gesto
// dell'utente, e i confini dell'immagine, che seguono solo ciò che finisce
// nel PNG.
//
// La finestra vera non si può comandare da un test: al suo posto c'è una
// finta, che si comporta come l'utente le chiede (salva, annulla, il disco
// rifiuta) e prende nota di quando e come è stata chiamata.

import { expect, test, type Page } from "@playwright/test";
import { action, cable, device, exampleFile, fillField, openApp, openNetwork, sidePanel } from "./helpers";

type PickerMode = "save" | "cancel" | "fail";

// Il registro della finestra finta, letto dalla pagina.
interface PickerLog {
  steps: string[]; // "picker" e "serialize", nell'ordine in cui sono avvenuti
  duringEvent: string | null; // l'evento del browser in corso quando la finestra si è aperta
  options: { suggestedName?: string; types?: { accept: Record<string, string[]> }[] } | null;
  written: string | null; // l'immagine scritta, in base64
  writtenType: string | null;
  closed: boolean;
  aborted: boolean;
}

// Apre l'app con la finestra di salvataggio finta al posto di quella di Chrome.
async function openAppWithPicker(page: Page, mode: PickerMode): Promise<void> {
  await page.addInitScript((mode) => {
    const log = { steps: [], duringEvent: null, options: null, written: null, writtenType: null, closed: false, aborted: false } as PickerLog;
    Object.assign(window, { pickerLog: log });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined });
    // La preparazione dell'immagine passa da qui: si segna quando comincia.
    const serialize = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (node: Node) {
      log.steps.push("serialize");
      return serialize.call(this, node);
    };
    Object.defineProperty(window, "showSaveFilePicker", {
      value: (options: PickerLog["options"]) => {
        log.steps.push("picker");
        // Se la chiamata arriva mentre il browser sta ancora consegnando il
        // clic, c'è un evento in corso: dopo un'attesa non ci sarebbe più.
        log.duringEvent = window.event?.type ?? null;
        log.options = options;
        if (mode === "cancel") return Promise.reject(new DOMException("L'utente ha annullato.", "AbortError"));
        const name = options?.suggestedName ?? "senza-nome.png";
        return Promise.resolve({
          name,
          createWritable: async () => ({
            write: async (data: Blob) => {
              if (mode === "fail") throw new DOMException("Il disco è pieno.", "QuotaExceededError");
              log.writtenType = data.type;
              const bytes = new Uint8Array(await data.arrayBuffer());
              let text = "";
              for (const byte of bytes) text += String.fromCharCode(byte);
              log.written = btoa(text);
            },
            close: async () => {
              log.closed = true;
            },
            abort: async () => {
              log.aborted = true;
            },
          }),
        });
      },
    });
  }, mode);
  await page.goto("/");
  await expect(page.getByText("La rete è vuota")).toBeVisible();
}

const pickerLog = (page: Page) => page.evaluate(() => (window as unknown as { pickerLog: PickerLog }).pickerLog);

async function exportFromMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Progetto" }).click();
  await page.getByRole("menuitem", { name: "Esporta immagine…" }).click();
}

// Esporta con il ripiego dello scaricamento e restituisce il PNG.
async function exportByDownload(page: Page): Promise<Buffer> {
  const picture = page.waitForEvent("download");
  await exportFromMenu(page);
  const stream = await (await picture).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

// Le misure di un PNG: grandezza, e il rettangolo dei pixel che non sono
// sfondo, cioè dove sta il disegno; più quanti pixel somigliano a un colore.
interface Picture {
  width: number;
  height: number;
  content: { left: number; top: number; right: number; bottom: number };
  matching: number;
}

async function measurePng(page: Page, png: Buffer, color: [number, number, number] = [0, 0, 0]): Promise<Picture> {
  return page.evaluate(
    async ({ data, color }) => {
      const picture = new Image();
      picture.src = `data:image/png;base64,${data}`;
      await picture.decode();
      const canvas = document.createElement("canvas");
      canvas.width = picture.width;
      canvas.height = picture.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(picture, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const [r0, g0, b0] = [pixels[0], pixels[1], pixels[2]];
      let left = canvas.width, top = canvas.height, right = -1, bottom = -1, matching = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
          if (Math.abs(r - color[0]) + Math.abs(g - color[1]) + Math.abs(b - color[2]) < 30) matching++;
          if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) < 12) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      return { width: canvas.width, height: canvas.height, content: { left, top, right, bottom }, matching };
    },
    { data: png.toString("base64"), color },
  );
}

// Il disegno non è tagliato e non ha spazio in più: attorno ai pixel
// disegnati resta il margine di 32 unità, cioè 64 pixel a doppia
// risoluzione. Le scritte occupano un po' più del loro inchiostro (lo
// spazio delle lettere che scendono e salgono): qualche pixel di tolleranza.
function expectMargins(picture: Picture, scale = 2): void {
  const margin = 32 * scale;
  const { left, top, right, bottom } = picture.content;
  const sides = { left, top, right: picture.width - 1 - right, bottom: picture.height - 1 - bottom };
  for (const [side, space] of Object.entries(sides)) {
    expect(space, `margine ${side}`).toBeGreaterThanOrEqual(margin - 2);
    expect(space, `margine ${side}`).toBeLessThanOrEqual(margin + 24 * scale);
  }
}

// Una rete d'esempio con delle annotazioni aggiunte, come file di versione 2.
function withAnnotations(example: string, annotations: object[]): string {
  const file = JSON.parse(exampleFile(example));
  return JSON.stringify({ ...file, version: 2, annotations });
}

test.describe("la finestra per scegliere dove salvare", () => {
  test("si apre subito, nel clic, prima di preparare l'immagine; l'immagine scritta è un PNG", async ({ page }) => {
    await openAppWithPicker(page, "save");
    await openNetwork(page, "lezione.netsim.json", exampleFile("lan-switch"));
    await expect(page.locator(".top .file")).toHaveText("lezione");
    await exportFromMenu(page);
    await expect.poll(async () => (await pickerLog(page)).closed).toBe(true);
    const log = await pickerLog(page);
    // Prima la finestra, poi l'immagine: nessuna attesa che faccia perdere il gesto.
    expect(log.steps[0]).toBe("picker");
    expect(log.steps).toContain("serialize");
    expect(log.duringEvent).toBe("click");
    expect(log.options?.suggestedName).toBe("lezione.png");
    expect(log.options?.types?.[0].accept["image/png"]).toEqual([".png"]);
    expect(log.writtenType).toBe("image/png");
    const png = Buffer.from(log.written!, "base64");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(log.aborted).toBe(false);
    await expect(page.getByText("Non è stato possibile esportare l'immagine.")).toHaveCount(0);
  });

  test("se l'utente annulla, l'immagine non si prepara, non compare nessun errore e nulla cambia", async ({ page }) => {
    await openAppWithPicker(page, "cancel");
    await openNetwork(page, "lezione.netsim.json", exampleFile("lan-switch"));
    await device(page, "PC1").click();
    await exportFromMenu(page);
    await expect.poll(async () => (await pickerLog(page)).steps).toEqual(["picker"]);
    // Un attimo dopo, ancora nulla: niente immagine, niente errore.
    await page.waitForTimeout(300);
    expect((await pickerLog(page)).steps).toEqual(["picker"]);
    await expect(page.getByText("Non è stato possibile esportare l'immagine.")).toHaveCount(0);
    await expect(sidePanel(page).locator("header h2")).toHaveText("PC1");
    await expect(page.getByText("Da salvare")).toHaveCount(0);
  });

  test("se il disco rifiuta la scrittura, compare l'errore, il file a metà si scarta e la selezione torna", async ({ page }) => {
    await openAppWithPicker(page, "fail");
    await openNetwork(page, "lezione.netsim.json", exampleFile("lan-switch"));
    await device(page, "PC1").click();
    await exportFromMenu(page);
    await expect(page.getByText("Non è stato possibile esportare l'immagine.")).toBeVisible();
    const log = await pickerLog(page);
    expect(log.aborted).toBe(true);
    expect(log.closed).toBe(false);
    expect(log.written).toBeNull();
    await expect(sidePanel(page).locator("header h2")).toHaveText("PC1");
    await expect(page.getByRole("button", { name: "PC1, selezionato" })).toBeVisible();
  });
});

test.describe("i confini dell'immagine", () => {
  test("seguono solo ciò che si esporta: le buste in viaggio e l'elenco delle porte non li allargano", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "lezione.netsim.json", exampleFile("lan-switch"));
    await expect(page.locator(".top .file")).toHaveText("lezione");
    const still = await measurePng(page, await exportByDownload(page));
    expectMargins(still);

    // Un ping in viaggio: le buste vanno oltre i dispositivi, ma non nell'immagine.
    await device(page, "PC1").click();
    await action(page, "Ping da PC1").click();
    await device(page, "PC3").click();
    await page.getByRole("button", { name: /Passo/ }).click();
    await expect(page.locator("g.packet")).not.toHaveCount(0);
    const moving = await measurePng(page, await exportByDownload(page));
    expect([moving.width, moving.height]).toEqual([still.width, still.height]);
    await expect(page.locator("g.packet")).not.toHaveCount(0);

    // L'elenco delle porte aperto sporge sotto il disegno: nell'immagine non c'è.
    // Da tastiera: le buste che scorrono sul cavo coprirebbero il nome della porta.
    await cable(page, "PC3", "SW1").focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /^Porta Fa0\/\d+ di SW1: cambia porta/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("g.menu")).toBeVisible();
    const withMenu = await measurePng(page, await exportByDownload(page));
    expect([withMenu.width, withMenu.height]).toEqual([still.width, still.height]);
    expectMargins(withMenu);
  });

  test("una nota lontana e un riquadro grande ci stanno interi, con il margine e senza tagli", async ({ page }) => {
    await openApp(page);
    const file = withAnnotations("due-pc", [
      { kind: "box", id: "a1", x: -400, y: -300, width: 1600, height: 900, color: "green", label: "Tutta la rete" },
      { kind: "note", id: "a2", x: 2600, y: 1400, color: "blue", text: "Lontanissima" },
    ]);
    await openNetwork(page, "lontana.netsim.json", file);
    await expect(page.locator(".top .file")).toHaveText("lontana");
    const picture = await measurePng(page, await exportByDownload(page), [0x3a, 0x6f, 0xc4]);
    expectMargins(picture);
    // Il riquadro comincia a -400, -300 e la nota finisce oltre 2600, 1400:
    // l'immagine va da un capo all'altro, a doppia risoluzione.
    expect(picture.width).toBeGreaterThan((2600 + 400) * 2);
    expect(picture.height).toBeGreaterThan((1400 + 300) * 2);
    expect(picture.matching).toBeGreaterThan(20); // il segno blu della nota
  });

  test("un disegno lunghissimo si rimpicciolisce entro il limite, con le stesse proporzioni", async ({ page }) => {
    await openApp(page);
    const file = withAnnotations("due-pc", [{ kind: "box", id: "a1", x: 0, y: 150, width: 12_000, height: 200, color: "green", label: "Lunghissimo" }]);
    await openNetwork(page, "lunga.netsim.json", file);
    await expect(page.locator(".top .file")).toHaveText("lunga");
    // Il rettangolo atteso, misurato sul disegno (qui non c'è nulla da escludere).
    const frame = await page.evaluate(() => {
      const box = document.querySelector<SVGSVGElement>('svg[aria-label="Topologia della rete"]')!.getBBox();
      const x = Math.floor(box.x - 32);
      const y = Math.floor(box.y - 32);
      return { width: Math.ceil(box.x + box.width + 32) - x, height: Math.ceil(box.y + box.height + 32) - y };
    });
    expect(frame.width * 2).toBeGreaterThan(16384);
    const scale = 16384 / frame.width;
    const picture = await measurePng(page, await exportByDownload(page));
    expect(picture.width).toBe(16384);
    expect(picture.height).toBe(Math.floor(frame.height * scale));
    expectMargins(picture, scale);
  });
});

test("il collaudo: router, riquadro, nota, tabella appuntata, ping, selezione, elenco delle porte, tema scuro", async ({ page }) => {
  test.setTimeout(90_000);
  await openAppWithPicker(page, "save");
  const file = withAnnotations("due-lan-router", [
    { kind: "box", id: "a1", x: 40, y: 120, width: 300, height: 160, color: "green", label: "LAN 1" },
    { kind: "note", id: "a2", x: 120, y: 330, color: "blue", text: "Consegna: ping da PC1 a PC2" },
  ]);
  await openNetwork(page, "collaudo.netsim.json", file);
  await expect(page.locator(".top .file")).toHaveText("collaudo");
  await device(page, "R1").click();
  await action(page, "Appunta la tabella di routing di R1").click();
  await expect(page.locator("g.table")).toHaveCount(1);
  await page.getByRole("button", { name: "Visualizza" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Tema scuro/ }).click();
  await page.keyboard.press("Escape");
  // Nell'esempio PC1 non ha un gateway: glielo si dà, così il ping parte.
  await device(page, "PC1").click();
  await fillField(page, "gateway", "192.168.1.1");
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await page.getByRole("button", { name: /Passo/ }).click();
  await expect(page.locator("g.packet")).not.toHaveCount(0);
  // Sul disegno affollato cavo e porta si scelgono da tastiera: la busta e
  // la tabella appuntata coprono i cavi.
  await cable(page, "SW2", "PC2").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^Porta Fa0\/\d+ di SW2: cambia porta/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("g.menu")).toBeVisible();
  const packets = await page.locator("g.packet").count();
  const dirty = await page.getByText("Da salvare").count();

  await exportFromMenu(page);
  await expect.poll(async () => (await pickerLog(page)).closed).toBe(true);
  const log = await pickerLog(page);
  expect(log.steps[0]).toBe("picker");
  expect(log.options?.suggestedName).toBe("collaudo.png");
  const png = Buffer.from(log.written!, "base64");
  const picture = await measurePng(page, png, [0x2f, 0x85, 0x5a]);
  expectMargins(picture);
  expect(picture.matching).toBeGreaterThan(100); // il riquadro verde del tema chiaro
  const pixels = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return Array.from(canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, log.written!);
  expect(pixels).toEqual([251, 252, 253]); // lo sfondo chiaro, anche con il tema scuro acceso

  // Sullo schermo tutto com'era.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("g.packet")).toHaveCount(packets);
  await expect(page.getByText("Da salvare")).toHaveCount(dirty);
  await expect(page.locator("g.menu")).toBeVisible();
  await expect(page.locator("line.selection")).toHaveCount(1);
  await expect(page.locator("g.table")).toHaveCount(1);
});
