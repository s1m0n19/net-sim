// La colonna dei dispositivi e degli strumenti (D-129): le varianti di
// switch e router con il mouse, con la tastiera e con il dito, e la riga
// che separa i dispositivi dagli strumenti anche nella colonna stretta.

import { expect, test, type Page } from "@playwright/test";
import { clickDrawing, openApp } from "./helpers";

const palette = (page: Page) => page.locator("aside").first();
const routerTile = (page: Page) => palette(page).getByRole("button", { name: /^Router/ });
const variants = (page: Page) => palette(page).getByRole("menuitem");
const instructions = (page: Page) => page.getByRole("status").filter({ has: page.locator(".message") });

test("con il mouse l'elenco delle varianti si apre passando, e la variante scelta si posa", async ({ page }) => {
  await openApp(page);
  await routerTile(page).hover();
  await expect(variants(page)).toHaveText(["Router a 2 interfacce", "Router a 4 interfacce", "Router a 8 interfacce"]);
  // Il clic sulla voce non lo richiude: ci si è appena passati sopra.
  await routerTile(page).click();
  await expect(variants(page)).toHaveCount(3);
  await page.getByRole("menuitem", { name: "Router a 4 interfacce" }).click();
  await expect(variants(page)).toHaveCount(0);
  // È chiaro che cosa si posa: la voce premuta e l'istruzione con la variante.
  await expect(routerTile(page)).toHaveAttribute("aria-pressed", "true");
  await expect(instructions(page)).toContainText("Router a 4 interfacce.");
  await clickDrawing(page, 0.5, 0.5);
  await expect(page.locator("g.device")).toHaveCount(1);
});

test("con la tastiera l'elenco si apre, si percorre con le frecce e si chiude con Esc", async ({ page }) => {
  await openApp(page);
  await routerTile(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(variants(page)).toHaveCount(3);
  // Il fuoco è sulla prima variante; le frecce girano, Fine va all'ultima.
  await expect(variants(page).nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(variants(page).nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(variants(page).nth(2)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(variants(page).nth(0)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(variants(page)).toHaveCount(0);
  await expect(routerTile(page)).toBeFocused();

  // Invio apre e porta il fuoco sulla prima; Invio sceglie.
  await page.keyboard.press("Enter");
  await expect(variants(page).nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(instructions(page)).toContainText("Router a 4 interfacce.");
});

test.describe("con il dito, alla LIM", () => {
  test.use({ hasTouch: true });

  test("un tocco apre l'elenco e un altro lo richiude; toccando una variante la si sceglie", async ({ page }) => {
    await openApp(page);
    await routerTile(page).tap();
    await expect(variants(page)).toHaveCount(3);
    await routerTile(page).tap();
    await expect(variants(page)).toHaveCount(0);
    await routerTile(page).tap();
    await page.getByRole("menuitem", { name: "Router a 8 interfacce" }).tap();
    await expect(variants(page)).toHaveCount(0);
    await expect(instructions(page)).toContainText("Router a 8 interfacce.");
  });
});

for (const height of [860, 520, 280]) {
  test(`alta ${height} pixel, una riga separa i dispositivi dagli strumenti`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height });
    await openApp(page);
    const line = palette(page).locator(".caption.tools");
    await expect(line).toBeAttached();
    const box = (await line.boundingBox())!;
    const server = (await palette(page).getByRole("button", { name: "Server" }).boundingBox())!;
    const cable = (await palette(page).getByRole("button", { name: "Cavo" }).boundingBox())!;
    // La riga si vede: ha un bordo, e sta tra l'ultimo dispositivo e il primo strumento.
    expect(await line.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
    expect(box.width).toBeGreaterThan(20);
    expect(box.y).toBeGreaterThanOrEqual(server.y + server.height - 1);
    expect(box.y).toBeLessThanOrEqual(cable.y);
  });
}
