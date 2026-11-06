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

/** Un dispositivo del disegno, dal nome. */
export function device(page: Page, name: string): Locator {
  return page.locator(`g.device[aria-label="${name}"], g.device[aria-label="${name}, selezionato"]`);
}

/** Un pulsante della barretta delle azioni, dall'inizio della sua etichetta. */
export function action(page: Page, label: string): Locator {
  return page.locator(`g.action[aria-label^="${label}"]`);
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
