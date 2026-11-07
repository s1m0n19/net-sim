// La schermata nelle finestre di grandezze diverse (D-112): dal monitor
// grande al portatile stretto, e in presentazione a ogni ingrandimento.
// Qui non si guarda l'aspetto, ma che ogni comando resti nella finestra, si
// veda per intero e si possa usare.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { action, centreOf, clickDrawing, device, drag, exampleFile, fillField, openApp, openNetwork, sidePanel } from "./helpers";

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 900, height: 700 },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("L'elemento non si vede");
  return box;
}

// Un rettangolo sta tutto dentro un altro (con mezzo pixel di tolleranza).
function inside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// La pagina non scorre di lato: nulla è più largo della finestra.
async function expectNoSideScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
}

// L'elemento si vede tutto, dentro la finestra.
async function expectInWindow(page: Page, locator: Locator): Promise<void> {
  const size = page.viewportSize()!;
  expect(inside(await boxOf(locator), { x: 0, y: 0, ...size })).toBe(true);
}

const drawingArea = (page: Page) => page.locator(".canvas");
const simulationBar = (page: Page) => page.getByRole("toolbar", { name: "Comandi della simulazione" });
const zoomButtons = (page: Page) => page.getByRole("group", { name: "Inquadratura" });
const actionBar = (page: Page) => page.getByRole("toolbar", { name: /Azioni su/ });

// Barra della simulazione e zoom stanno nel disegno e non si coprono.
async function expectDrawingControls(page: Page): Promise<void> {
  const area = await boxOf(drawingArea(page));
  const bar = await boxOf(simulationBar(page));
  const zoom = await boxOf(zoomButtons(page));
  expect(inside(bar, area)).toBe(true);
  expect(inside(zoom, area)).toBe(true);
  expect(overlap(bar, zoom)).toBe(false);
}

for (const size of SIZES) {
  test.describe(`a ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test("ogni comando sta nella finestra e si usa", async ({ page }) => {
      await openApp(page);
      await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
      await expectNoSideScroll(page);

      // La barra in alto: tutti i comandi in vista.
      for (const name of ["Progetto", "Salva", "Annulla", "Ripristina", "Visualizza", "Presenta"]) {
        await expectInWindow(page, page.getByRole("button", { name, exact: true }));
      }
      await expectDrawingControls(page);

      // La barretta di un router: dentro il disegno, senza coprire i
      // comandi; il menu Altro si apre tutto nella finestra.
      await device(page, "R1").click();
      const area = await boxOf(drawingArea(page));
      const bar = await boxOf(actionBar(page));
      expect(inside(bar, area)).toBe(true);
      expect(overlap(bar, await boxOf(simulationBar(page)))).toBe(false);
      expect(overlap(bar, await boxOf(zoomButtons(page)))).toBe(false);
      await page.getByRole("button", { name: /^Altre azioni su R1/ }).click();
      await expectInWindow(page, page.getByRole("menu"));
      await page.keyboard.press("Escape");

      // Il pannello: il campo si vede per intero e si scrive.
      await device(page, "PC1").click();
      const name = page.locator('[data-field="name"]');
      await expectInWindow(page, name);
      await fillField(page, "name", "Aula");
      await expect(device(page, "Aula")).toBeVisible();
      // Si chiude e si riapre.
      await page.getByRole("button", { name: "Chiudi il pannello laterale" }).click();
      await page.getByRole("button", { name: "Apri il pannello laterale" }).click();
      await expect(sidePanel(page)).toContainText("Aula");

      // Le varianti del router, nella colonna: tutte nella finestra; Esc le chiude.
      await page.getByRole("button", { name: /^Router/ }).click();
      await expectInWindow(page, page.getByRole("menu"));
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);

      // Un terminale per ogni dispositivo: la pagina non si allarga, Eventi
      // e la freccia restano in vista, la scheda aperta anche.
      for (const each of ["Aula", "SW1", "R1", "SW2", "PC2"]) {
        await device(page, each).click();
        await action(page, `Apri il terminale di ${each}`).click();
      }
      await expectNoSideScroll(page);
      await expectInWindow(page, page.getByRole("tab", { name: "Eventi" }));
      await expectInWindow(page, page.getByRole("button", { name: "Chiudi la fascia in basso" }));
      await expectInWindow(page, page.getByRole("tab", { name: /Terminale · PC2/ }));
      // Il primo si raggiunge e si chiude.
      await page.getByRole("tab", { name: /Terminale · Aula/ }).click();
      await page.getByRole("button", { name: "Chiudi il terminale di Aula" }).click();
      await expect(page.getByRole("tab", { name: /Terminale · Aula/ })).toHaveCount(0);

      // La fascia si alza fino al massimo: la colonna resta usabile.
      const separator = page.getByRole("separator", { name: /Altezza della fascia/ });
      const before = Number(await separator.getAttribute("aria-valuenow"));
      await separator.focus();
      for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowUp");
      expect(Number(await separator.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
      await expectInWindow(page, page.getByRole("button", { name: "Cavo", exact: true }));
      await expectInWindow(page, page.getByRole("button", { name: "Chiudi la colonna dei dispositivi" }));
      await expectDrawingControls(page);

      // Salvare non dipende da nessun pannello: Salva è sempre lì.
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Salva", exact: true }).click();
      expect((await download).suggestedFilename()).toBe("due-lan-router.netsim.json");
    });

    test("in presentazione, a ogni ingrandimento, tutto resta nella finestra", async ({ page }) => {
      await openApp(page);
      await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
      await page.getByRole("button", { name: "Presenta" }).click();
      await device(page, "R1").click();

      const smaller = page.getByRole("button", { name: "Rimpicciolisci testo e disegno" });
      const larger = page.getByRole("button", { name: "Ingrandisci testo e disegno" });
      while (await smaller.isEnabled()) await smaller.click();

      for (;;) {
        await expectNoSideScroll(page);
        await expectInWindow(page, page.getByRole("button", { name: "Esci" }));
        await expectInWindow(page, larger);
        await expectDrawingControls(page);
        // La barretta: dentro il disegno, senza coprire la barra della
        // simulazione né lo zoom. Unica eccezione decisa (D-112): al 200%
        // in una finestra larga fino a 1024 non c'è un posto libero accanto
        // al router, e la barretta copre in parte lo zoom finché resta la
        // selezione.
        //
        // Dopo un cambio di ingrandimento la barretta rimisura zoom e barra
        // della simulazione e si risistema: si aspetta che lo abbia fatto,
        // come lo vede chi guarda, e non l'istante del clic.
        const crowded = size.width <= 1024 && !(await larger.isEnabled());
        await expect
          .poll(async () => {
            const bar = await boxOf(actionBar(page));
            return (
              inside(bar, await boxOf(drawingArea(page))) &&
              !overlap(bar, await boxOf(simulationBar(page))) &&
              (crowded || !overlap(bar, await boxOf(zoomButtons(page))))
            );
          })
          .toBe(true);
        // Il pannello non prende più di due quinti della finestra.
        expect((await boxOf(sidePanel(page))).width).toBeLessThanOrEqual(Math.max(290, size.width * 0.4) + 1);
        // Gli indirizzi nel pannello si leggono per intero.
        const field = page.locator('[data-field="ip-Gi0/0"]');
        expect(await field.evaluate((input: HTMLInputElement) => input.scrollWidth <= input.clientWidth)).toBe(true);
        if (!(await larger.isEnabled())) break;
        await larger.click();
      }
    });
  });
}

// Il percorso di uno studente sui due portatili più comuni in aula: una
// LAN costruita da zero, configurata e provata con un ping.
for (const size of [SIZES[1], SIZES[3]]) {
  test.describe(`lo studente a ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test("costruisce una LAN, la configura e fa un ping", async ({ page }) => {
      await openApp(page);
      await page.getByRole("button", { name: "PC", exact: true }).click();
      await clickDrawing(page, 0.2, 0.3);
      await clickDrawing(page, 0.2, 0.7);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /^Switch/ }).click();
      await page.getByRole("menuitem").first().click();
      await clickDrawing(page, 0.6, 0.5);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Cavo", exact: true }).click();
      for (const pc of ["PC1", "PC2"]) {
        await drag(page, await centreOf(device(page, pc).locator("rect.box")), await centreOf(device(page, "SW1").locator("rect.box")));
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("line.wire")).toHaveCount(2);

      await device(page, "PC1").click();
      await fillField(page, "ip", "192.168.1.10");
      await device(page, "PC2").click();
      await fillField(page, "ip", "192.168.1.11");

      await device(page, "PC1").click();
      await action(page, "Ping da PC1").click();
      await device(page, "PC2").click();
      await page.getByRole("button", { name: /Avvia/ }).click();
      await expect(page.locator(".list")).toContainText("echo reply", { timeout: 30_000 });
      await page.getByRole("button", { name: /Pausa/ }).click();
      await expectNoSideScroll(page);
      await expectDrawingControls(page);
    });
  });
}
