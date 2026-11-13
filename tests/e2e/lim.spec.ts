// Alla LIM, in presentazione, aprendo la fascia in basso la rete resta
// visibile (C-1 del collaudo UX 5.6, D-140): se i comandi la coprono, il
// pannello laterale si chiude e, solo se non basta, l'inquadratura si
// adatta. Una volta, all'apertura; mai per la simulazione o la selezione.

import { expect, test, type Page } from "@playwright/test";
import { action, device, openApp, openNetwork, presentationZoom, textBox, treeNetwork } from "./helpers";

const sim = (page: Page) => page.getByRole("toolbar", { name: "Comandi della simulazione" });
const panelOpen = (page: Page) => page.getByRole("button", { name: "Chiudi il pannello laterale" });
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Quanti dispositivi sono sotto la barra della simulazione o lo zoom, o fuori dal disegno.
async function hidden(page: Page): Promise<number> {
  const canvas = (await page.locator(".canvas").boundingBox())!;
  const controls = [(await sim(page).boundingBox())!, (await page.getByRole("group", { name: "Inquadratura" }).boundingBox())!];
  let count = 0;
  for (const box of await page.locator("g.device rect.box").all()) {
    const b = (await box.boundingBox())!;
    const inside = b.x >= canvas.x && b.y >= canvas.y && b.x + b.width <= canvas.x + canvas.width && b.y + b.height <= canvas.y + canvas.height;
    if (!inside || controls.some((c) => overlap(b, c))) count++;
  }
  return count;
}

// L'inquadratura: il rettangolo del disegno che si vede (viewBox). Cambia con
// Adatta e con lo zoom, non quando il disegno cambia grandezza sullo schermo
// (allora la stessa inquadratura si vede più grande o più piccola).
const view = (page: Page) => page.locator("svg[aria-label='Topologia della rete']").getAttribute("viewBox");

// La lezione: rete ad albero, presentazione, ping da PC1 verso PC5 (l'altra LAN).
async function lesson(page: Page, width: number, height: number, percent: number) {
  await page.setViewportSize({ width, height });
  await openApp(page);
  await openNetwork(page, "lezione.netsim.json", treeNetwork());
  await page.getByRole("button", { name: "Presenta" }).click();
  await presentationZoom(page, percent);
  await device(page, "PC1").click();
  await expect(panelOpen(page)).toBeVisible();
  await action(page, "Ping da PC1").click();
  await device(page, "PC5").click();
}

test("a 1366×768 al 180%: aprendo gli eventi il pannello si chiude, la rete si vede tutta, alla stessa scala", async ({ page }) => {
  await lesson(page, 1366, 768, 180);
  const before = await view(page);
  await page.keyboard.press("e");
  await expect(page.locator("#strip-panel")).toBeVisible();
  await expect(panelOpen(page)).toHaveCount(0);
  await expect.poll(() => hidden(page)).toBe(0);
  // Bastava chiudere il pannello: l'inquadratura è quella di prima, e i nomi restano leggibili.
  expect(await view(page)).toBe(before);
  expect((await textBox(device(page, "R1").locator("text.name"))).height).toBeGreaterThanOrEqual(13);
  // La selezione resta, e la barretta pure.
  await expect(device(page, "PC1")).toHaveAttribute("aria-label", "PC1, selezionato");
  // Il percorso dei pacchetti si segue: un passo, e la busta è nel disegno, fuori dai comandi.
  await sim(page).getByRole("button", { name: "Passo" }).click();
  const envelope = (await page.locator("g.packet").first().boundingBox())!;
  const canvas = (await page.locator(".canvas").boundingBox())!;
  expect(envelope.y).toBeGreaterThan(canvas.y);
  expect(overlap(envelope, (await sim(page).boundingBox())!)).toBe(false);
  // Gli eventi si leggono.
  await expect(page.locator("#strip-panel tbody tr").first()).toBeVisible();
});

test("dopo l'apertura l'inquadratura non cambia più: passi, eventi, selezione, zoom, chiusura della fascia", async ({ page }) => {
  await lesson(page, 1366, 768, 180);
  await page.keyboard.press("e");
  await expect.poll(() => hidden(page)).toBe(0);
  const settled = await view(page);
  for (let i = 0; i < 4; i++) await sim(page).getByRole("button", { name: "Passo" }).click();
  await page.waitForTimeout(1500);
  expect(await view(page), "passi ed eventi").toBe(settled);
  // Un altro dispositivo selezionato: il pannello resta chiuso, l'inquadratura ferma.
  await device(page, "PC2").click();
  await page.waitForTimeout(300);
  await expect(device(page, "PC2")).toHaveAttribute("aria-label", "PC2, selezionato");
  await expect(panelOpen(page)).toHaveCount(0);
  expect(await view(page), "selezione").toBe(settled);
  // Togliendo e rimettendo la selezione il pannello non si riapre da solo finché la fascia è aperta.
  const canvas = (await page.locator(".canvas").boundingBox())!;
  await page.mouse.click(canvas.x + 10, canvas.y + 10);
  await device(page, "PC3").click();
  await page.waitForTimeout(300);
  await expect(panelOpen(page)).toHaveCount(0);
  // Uno zoom a mano resta com'è.
  await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
  const zoomed = await view(page);
  expect(zoomed).not.toBe(settled);
  await page.waitForTimeout(300);
  expect(await view(page), "zoom a mano").toBe(zoomed);
  // Chiudendo la fascia nessun salto: l'inquadratura resta quella di prima.
  await page.getByRole("button", { name: "Chiudi la fascia in basso" }).click();
  await page.waitForTimeout(300);
  expect(await view(page), "chiusura della fascia").toBe(zoomed);
  // A fascia chiusa la selezione riapre il pannello, come sempre in presentazione.
  await page.mouse.click(canvas.x + 10, canvas.y + 10);
  await device(page, "PC4").click();
  await expect(panelOpen(page)).toBeVisible();
});

test("a 1024×768 al 200% non basta chiudere il pannello: l'inquadratura si adatta, una volta", async ({ page }) => {
  await lesson(page, 1024, 768, 200);
  const before = await view(page);
  await page.getByRole("tab", { name: /^Eventi/ }).click();
  await expect(panelOpen(page)).toHaveCount(0);
  await expect.poll(() => hidden(page)).toBe(0);
  expect(await view(page)).not.toBe(before);
  const settled = await view(page);
  await sim(page).getByRole("button", { name: "Passo" }).click();
  await page.waitForTimeout(1200);
  expect(await view(page)).toBe(settled);
});

test("a 1920×1080 c'è posto: aprendo gli eventi il pannello resta aperto e l'inquadratura non cambia", async ({ page }) => {
  await lesson(page, 1920, 1080, 180);
  const before = await view(page);
  await page.keyboard.press("e");
  await expect(page.locator("#strip-panel")).toBeVisible();
  await page.waitForTimeout(400);
  await expect(panelOpen(page)).toBeVisible();
  expect(await view(page)).toBe(before);
  expect(await hidden(page)).toBe(0);
});

test("nell'editor aprire la fascia non chiude il pannello e non cambia l'inquadratura", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  await openNetwork(page, "lezione.netsim.json", treeNetwork());
  await device(page, "PC1").click();
  const before = await view(page);
  await page.getByRole("button", { name: "Apri la fascia in basso" }).click();
  await page.waitForTimeout(400);
  await expect(panelOpen(page)).toBeVisible();
  expect(await view(page)).toBe(before);
});
