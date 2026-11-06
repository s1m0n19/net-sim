// La barretta delle azioni accanto a ciò che è selezionato (D-111): quali
// azioni offre per ogni dispositivo e per un cavo, che cosa fanno, la
// tastiera, la presentazione, i bordi del disegno e lo zoom.

import { expect, test, type Page } from "@playwright/test";
import { action, cable, device, drag, drawing, exampleFile, moreAction, openApp, openNetwork, pointOn, sidePanel } from "./helpers";

const toolbar = (page: Page) => page.getByRole("toolbar", { name: /Azioni su/ });

// Le scritte dei pulsanti sempre in vista, e quelle del menu "Altro".
async function actionsOf(page: Page): Promise<{ primary: string[]; more: string[] }> {
  const primary = await toolbar(page).locator(":scope > button .text").allInnerTexts();
  await page.getByRole("button", { name: /^Altre azioni su/ }).click();
  const more = await page.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  return { primary, more: more.map((text) => text.trim()) };
}

test("ogni dispositivo mostra le sue azioni principali, e le altre nel menu Altro", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));

  await device(page, "PC1").click();
  expect(await actionsOf(page)).toEqual({
    primary: ["Terminale", "Ping", "Collega"],
    more: ["Tabella ARP", "Spegni", "Duplica", "Elimina"],
  });

  await device(page, "SW1").click();
  expect(await actionsOf(page)).toEqual({
    primary: ["Terminale", "Collega", "Tabella MAC"],
    more: ["Spegni", "Duplica", "Elimina"],
  });

  await device(page, "R1").click();
  expect(await actionsOf(page)).toEqual({
    primary: ["Terminale", "Collega", "Tabella routing"],
    more: ["Spegni", "Duplica", "Elimina"],
  });

  // Un cavo: staccare (si riattacca) ed eliminare sono distinti, senza menu.
  await cable(page, "PC1", "SW1").click({ force: true });
  await expect(toolbar(page).locator(":scope > button .text")).toHaveText(["Stacca", "Elimina"]);
  await expect(page.getByRole("button", { name: /^Altre azioni su/ })).toHaveCount(0);
});

test("Ping e Collega restano premuti mentre l'app aspetta il secondo clic", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));

  await device(page, "PC1").click();
  const ping = action(page, "Ping da PC1");
  await expect(ping).toHaveAttribute("aria-pressed", "false");
  await ping.click();
  await expect(ping).toHaveAttribute("aria-pressed", "true");
  // La riga in alto, quella di sempre, dice che cosa fare.
  await expect(page.getByRole("status")).toContainText("Ping da PC1.");
  await device(page, "PC2").click();
  await expect(page.locator("g.packet")).toHaveCount(1);

  // Collega: premuto, poi il cavo nasce sul secondo clic.
  const duplicated = await (async () => {
    await device(page, "PC1").click();
    await (await moreAction(page, "Duplica")).click();
    return device(page, "PC4");
  })();
  await expect(duplicated).toBeVisible();
  const link = action(page, "Collega PC4");
  await link.click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText("Cavo da PC4.");
  await device(page, "SW1").click();
  await expect(page.locator("line.wire")).toHaveCount(4);
});

test("Terminale apre la scheda; Spegni toglie il Ping, Accendi lo rimette", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));

  await device(page, "PC2").click();
  await action(page, "Apri il terminale di PC2").click();
  await expect(page.getByRole("tab", { name: /Terminale · PC2/ })).toBeVisible();

  await (await moreAction(page, "Spegni")).click();
  await expect(action(page, "Ping da PC2")).toHaveCount(0);
  await (await moreAction(page, "Accendi")).click();
  await expect(action(page, "Ping da PC2")).toBeVisible();
});

test("la tabella si appunta e si toglie, e il pulsante dice se è appuntata", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await device(page, "R1").click();

  const table = action(page, "Appunta la tabella di routing di R1");
  await expect(table).toHaveAttribute("aria-pressed", "false");
  await table.click();
  await expect(page.locator("g.table")).toContainText("Tabella di routing · R1");
  const unpin = action(page, "Togli la tabella di routing di R1");
  await expect(unpin).toHaveAttribute("aria-pressed", "true");
  await unpin.click();
  await expect(page.locator("g.table")).toHaveCount(0);
});

test("un cavo si stacca e si riattacca; eliminare un dispositivo si annulla", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));

  await cable(page, "PC2", "SW1").click({ force: true });
  await action(page, "Stacca il cavo").click();
  await expect(sidePanel(page)).toContainText("Staccato");
  await action(page, "Riattacca il cavo").click();
  await expect(sidePanel(page)).not.toContainText("Staccato");

  await device(page, "PC3").click();
  await (await moreAction(page, "Elimina")).click();
  await expect(page.locator("g.device")).toHaveCount(3);
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.locator("g.device")).toHaveCount(4);
});

test("la barretta si usa con la tastiera: frecce, Invio, e il menu Altro con Esc", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();

  await action(page, "Apri il terminale di PC1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(action(page, "Ping da PC1")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /Terminale · PC1/ })).toBeVisible();

  // Fino al pulsante Altro: si apre con Invio, Esc lo chiude e ridà il fuoco.
  await action(page, "Collega PC1").focus();
  await page.keyboard.press("ArrowRight");
  const more = page.getByRole("button", { name: /^Altre azioni su PC1/ });
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Tabella ARP" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more).toBeFocused();
  // Esc ha chiuso il menu, non tolto la selezione.
  await expect(toolbar(page)).toBeVisible();
});

test("in presentazione la barretta cresce con l'ingrandimento e non offre gli strumenti per costruire", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  const normal = (await toolbar(page).boundingBox())!.height;

  await page.getByRole("button", { name: "Presenta" }).click();
  await device(page, "PC1").click();
  await expect(toolbar(page).locator(":scope > button .text")).toHaveText(["Terminale", "Ping"]);
  expect((await toolbar(page).boundingBox())!.height).toBeGreaterThan(normal * 1.3);
});

// La barretta sta tutta dentro il disegno.
async function insideDrawing(page: Page): Promise<boolean> {
  const bar = (await toolbar(page).boundingBox())!;
  const area = (await page.locator(".canvas").boundingBox())!;
  return bar.x >= area.x && bar.y >= area.y && bar.x + bar.width <= area.x + area.width && bar.y + bar.height <= area.y + area.height;
}

test("vicino al bordo alto la barretta va sotto il dispositivo, e resta nel disegno", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  // Si sposta la vista finché PC1 non è contro il bordo alto.
  const box = await device(page, "PC1").locator("rect.box").boundingBox();
  const area = (await page.locator(".canvas").boundingBox())!;
  const from = await pointOn(page, 0.5, 0.85);
  await drag(page, from, { x: from.x, y: from.y - (box!.y - area.y) + 12 });
  await device(page, "PC1").click();

  const bar = (await toolbar(page).boundingBox())!;
  const pc = (await device(page, "PC1").locator("rect.box").boundingBox())!;
  expect(bar.y).toBeGreaterThan(pc.y + pc.height);
  expect(await insideDrawing(page)).toBe(true);
});

test("con lo zoom la barretta resta grande uguale e dentro il disegno", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  await device(page, "PC2").click();
  const before = (await toolbar(page).boundingBox())!;

  const centre = await pointOn(page, 0.5, 0.5);
  await page.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await toolbar(page).boundingBox())!.height).toBeCloseTo(before.height, 0);
  expect(await insideDrawing(page)).toBe(true);

  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await toolbar(page).boundingBox())!.width).toBeCloseTo(before.width, 0);
  expect(await insideDrawing(page)).toBe(true);
  // Il disegno sotto è sempre lì: la barretta non ha mosso la vista.
  await expect(drawing(page)).toBeVisible();
});
