// Gesti ripetuti nei test della pagina: aprire un file, trovare un
// dispositivo, fare clic sul disegno.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";

/** Il contenuto di una delle reti di esempio del repository. */
export function exampleFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../examples/${name}.netsim.json`, import.meta.url)), "utf-8");
}

/**
 * Apre l'app su un foglio vuoto.
 *
 * Le finestre di Chrome per scegliere dove aprire e salvare non si possono
 * comandare da un test: vengono spente, e l'app ripiega sul campo di tipo
 * file e sullo scaricamento, come fa negli altri browser.
 */
export async function openApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined });
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
  });
  await page.goto("/");
  await expect(page.getByText("La rete è vuota")).toBeVisible();
}

/** Sceglie un comando del menu Progetto, nella barra in alto. */
export async function projectCommand(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: "Progetto" }).click();
  await page.getByRole("menuitem", { name: label }).click();
}

/** Apre un file di rete con Apri rete, nel menu Progetto. */
export async function openNetwork(page: Page, fileName: string, text: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await projectCommand(page, "Apri rete…");
  await (await chooser).setFiles({ name: fileName, mimeType: "application/json", buffer: Buffer.from(text) });
}

/**
 * Dove sta una scritta del disegno sullo schermo, misurato dal browser.
 *
 * Per le scritte dentro l'SVG Playwright, in WebKit, sbaglia la posizione:
 * dimentica l'ingrandimento del disegno (il suo viewBox) e clicca altrove.
 * Il browser invece la conosce, e la sente al posto giusto.
 */
export async function textBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  return locator.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
}

/**
 * Fa clic al centro di una scritta del disegno (vedi textBox), quando sta
 * ferma: aprendo il pannello laterale il disegno si stringe, e le scritte
 * si spostano subito dopo essere comparse.
 */
export async function clickText(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor();
  let box = await textBox(locator);
  await expect
    .poll(async () => {
      const before = box;
      box = await textBox(locator);
      return before.x === box.x && before.y === box.y;
    })
    .toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Apre la scheda di un'interfaccia di router nel pannello laterale, se è
 * chiusa (D-131): i suoi campi diventano visibili.
 */
export async function openInterface(page: Page, name: string): Promise<void> {
  const toggle = page.getByRole("group", { name: `Interfaccia ${name}`, exact: true }).locator("button.disclosure");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

/** Apre il modulo per aggiungere una rotta statica, se è chiuso (D-131). */
export async function openRouteForm(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Nuova rotta statica" });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

/** Un dispositivo del disegno, dal nome. */
export function device(page: Page, name: string): Locator {
  return page.locator(`g.device[aria-label="${name}"], g.device[aria-label="${name}, selezionato"]`);
}

/**
 * Un pulsante della barretta delle azioni sempre in vista, dall'inizio
 * della sua descrizione (per esempio "Apri il terminale di PC1").
 */
export function action(page: Page, label: string): Locator {
  return page.locator(`.actions button[aria-label^="${label}"]`);
}

/**
 * Un'azione del menu "Altro" della barretta (Spegni, Duplica, Elimina…):
 * apre il menu e restituisce la voce, dalla sua scritta.
 */
export async function moreAction(page: Page, text: string): Promise<Locator> {
  await page.getByRole("button", { name: /^Altre azioni su/ }).click();
  return page.getByRole("menuitem", { name: text, exact: true });
}

/** Un cavo del disegno, dai nomi dei due dispositivi che unisce. */
export function cable(page: Page, from: string, to: string): Locator {
  return page.locator(`line.hit[aria-label^="Cavo tra ${from} e ${to}"]`);
}

/** Il disegno della rete. */
export function drawing(page: Page): Locator {
  return page.getByRole("group", { name: "Topologia della rete" });
}

/** Un punto del disegno, come frazione della sua larghezza e altezza. */
export async function pointOn(page: Page, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const box = (await drawing(page).boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Fa clic sullo sfondo del disegno, in un punto dato come frazione. */
export async function clickDrawing(page: Page, fx: number, fy: number): Promise<void> {
  const point = await pointOn(page, fx, fy);
  await page.mouse.click(point.x, point.y);
}

/** Il centro di un elemento, in pixel dello schermo. */
export async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Trascina con il mouse da un punto a un altro, a piccoli passi. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

/** Il pannello laterale. */
export function sidePanel(page: Page): Locator {
  return page.locator("aside").last();
}

/** Scrive in un campo del pannello laterale e conferma con Invio. */
export async function fillField(page: Page, field: "name" | "ip" | "mask" | "gateway", text: string): Promise<void> {
  const input = page.locator(`[data-field="${field}"]`);
  await input.fill(text);
  await input.press("Enter");
}

/** Scrive un comando nel terminale aperto e lo esegue. */
export async function typeCommand(page: Page, command: string): Promise<void> {
  const prompt = page.getByLabel(/Riga di comando/);
  await prompt.fill(command);
  await prompt.press("Enter");
}

/** Lo schermo del terminale aperto. */
export function terminal(page: Page): Locator {
  return page.locator(".screen");
}
