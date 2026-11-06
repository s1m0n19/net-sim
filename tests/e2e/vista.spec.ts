// Muoversi sul disegno, aree che si aprono da sole e modalità presentazione.

import { expect, test, type Page } from "@playwright/test";
import { action, centreOf, device, drag, drawing, exampleFile, openApp, openNetwork, pointOn, projectCommand, sidePanel } from "./helpers";

// Il rettangolo del disegno inquadrato in questo momento.
async function viewBox(page: Page): Promise<number[]> {
  const text = await drawing(page).getAttribute("viewBox");
  return (text ?? "").split(" ").map(Number);
}

test("rotella, sfondo e Adatta", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await expect(device(page, "SW1")).toBeVisible();
  const fitted = await viewBox(page);

  // La rotella ingrandisce, e ciò che sta sotto il puntatore resta lì.
  const switchBox = device(page, "SW1").locator("rect.box");
  const before = await centreOf(switchBox);
  await page.mouse.move(before.x, before.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await viewBox(page))[2]).toBeLessThan(fitted[2]);
  const after = await centreOf(switchBox);
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);

  // Trascinando lo sfondo la vista si sposta, senza togliere la selezione
  // né posare nulla.
  await device(page, "PC1").click();
  const zoomed = await viewBox(page);
  await drag(page, await pointOn(page, 0.5, 0.12), await pointOn(page, 0.6, 0.2));
  const panned = await viewBox(page);
  expect(panned[0]).toBeLessThan(zoomed[0]);
  expect(panned[2]).toBeCloseTo(zoomed[2]);
  await expect(device(page, "PC1")).toHaveAttribute("aria-label", "PC1, selezionato");

  // I pulsanti − e + cambiano l'ingrandimento; Adatta rimette tutto in vista.
  await page.getByRole("button", { name: "Rimpicciolisci", exact: true }).click();
  expect((await viewBox(page))[2]).toBeGreaterThan(panned[2]);
  await page.getByRole("button", { name: "Adatta" }).click();
  expect(await viewBox(page)).toEqual(fitted);
});

test("la presentazione nasconde ciò che serve a costruire, e si lascia con Esc", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  const label = device(page, "PC1").locator("text.name");
  const normal = (await label.boundingBox())!.height;

  await page.getByRole("button", { name: "Presenta" }).click();

  // Niente colonna, niente comandi di file; la fascia in basso è chiusa, e
  // senza nulla di selezionato anche il pannello laterale (D-107).
  await expect(page.getByRole("button", { name: "Apri il pannello laterale" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Progetto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Visualizza" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cavo", exact: true })).toHaveCount(0);
  await expect(page.locator(".list")).toHaveCount(0);
  // Le scritte sul disegno sono più grandi di prima.
  expect((await label.boundingBox())!.height).toBeGreaterThan(normal * 1.15);

  // L'ingrandimento si regola.
  await page.getByRole("button", { name: "Ingrandisci testo e disegno" }).click();
  await expect(page.getByText("160%")).toBeVisible();

  // Sulla barretta restano i guasti, non Collega né Elimina. Selezionando,
  // il pannello si apre da solo.
  await device(page, "PC2").click();
  await expect(sidePanel(page)).toContainText("PC2");
  await expect(page.locator('g.action[aria-label^="Spegni PC2"]')).toBeVisible();
  await expect(page.locator('g.action[aria-label^="Elimina"]')).toHaveCount(0);
  await expect(page.locator('g.action[aria-label^="Collega"]')).toHaveCount(0);
  // E Canc non elimina.
  await page.keyboard.press("Delete");
  await expect(page.locator("g.device")).toHaveCount(4);

  // Spazio avvia e mette in pausa; E apre gli eventi.
  // Il clic sullo sfondo toglie la selezione, e il pannello si richiude.
  await page.mouse.click((await pointOn(page, 0.5, 0.12)).x, (await pointOn(page, 0.5, 0.12)).y);
  await expect(page.getByRole("button", { name: "Apri il pannello laterale" })).toBeVisible();
  await page.keyboard.press(" ");
  await expect(page.getByRole("button", { name: /Pausa/ })).toBeVisible();
  await page.keyboard.press(" ");
  await expect(page.getByRole("button", { name: /Avvia/ })).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.locator(".list")).toBeVisible();

  // Esc esce, e tutto torna com'era.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Presenta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Progetto" })).toBeVisible();
  expect(Math.abs((await label.boundingBox())!.height - normal)).toBeLessThan(1);
});

test("la fascia in basso e la barra della simulazione seguono ciò che c'è da mostrare", async ({ page }) => {
  // Sul foglio vuoto: fascia chiusa e nessuna barra della simulazione.
  await openApp(page);
  await expect(page.locator(".list")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ricomincia/ })).toHaveCount(0);

  // Aperta una rete compare la barra, ma la fascia resta chiusa: non ci
  // sono ancora eventi.
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await expect(page.getByRole("button", { name: /Ricomincia/ })).toBeVisible();
  await expect(page.locator(".list")).toHaveCount(0);

  // Il primo ping la apre da sola, con gli eventi.
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await expect(page.locator(".list")).toBeVisible();

  // Il bordo superiore si trascina per farla più alta.
  const body = page.locator("footer .body");
  const before = (await body.boundingBox())!.height;
  const edge = (await page.getByRole("separator", { name: /Altezza della fascia/ }).boundingBox())!;
  await drag(page, { x: edge.x + 200, y: edge.y + 4 }, { x: edge.x + 200, y: edge.y - 76 });
  expect((await body.boundingBox())!.height).toBeGreaterThan(before + 60);

  // Con un foglio nuovo non c'è più nulla da mostrare: si richiude.
  await projectCommand(page, "Nuova rete");
  await expect(page.locator(".list")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ricomincia/ })).toHaveCount(0);
});
