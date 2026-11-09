// Costruire una rete da zero con il mouse: posare, collegare, configurare,
// spostare, annullare, eliminare.

import { expect, test } from "@playwright/test";
import { action, centreOf, clickDrawing, clickText, device, drag, fillField, openApp, pointOn, sidePanel } from "./helpers";

test("una rete costruita da zero risponde al ping", async ({ page }) => {
  await openApp(page);

  // Due PC con un clic sulla voce e un clic sul disegno per ciascuno.
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.2, 0.3);
  await clickDrawing(page, 0.2, 0.7);
  await page.keyboard.press("Escape");
  await expect(page.locator("g.device")).toHaveCount(2);

  // Uno switch a 8 porte, scelto dall'elenco delle varianti.
  await page.getByRole("button", { name: /Switch/ }).hover();
  await page.getByRole("menuitem").first().click();
  await clickDrawing(page, 0.6, 0.5);
  await page.keyboard.press("Escape");
  await expect(device(page, "SW1")).toBeVisible();

  // Un cavo trascinando da PC1 allo switch, con lo strumento Cavo.
  await page.getByRole("button", { name: "Cavo", exact: true }).click();
  await drag(page, await centreOf(device(page, "PC1").locator("rect.box")), await centreOf(device(page, "SW1").locator("rect.box")));
  await expect(page.locator("line.wire")).toHaveCount(1);
  // L'altro con due clic: prima PC2, poi lo switch.
  await device(page, "PC2").click();
  await device(page, "SW1").click();
  await expect(page.locator("line.wire")).toHaveCount(2);
  await page.keyboard.press("Escape"); // spegne lo strumento; il cavo nuovo resta selezionato

  // Il cavo nuovo ha preso la seconda porta dello switch; la si cambia
  // dal suo nome.
  await expect(sidePanel(page)).toContainText("SW1 · Fa0/2");
  await clickText(page, page.getByRole("button", { name: /Porta Fa0\/2 di SW1/ }));
  await page.getByRole("option", { name: "Fa0/5" }).click();
  await expect(sidePanel(page)).toContainText("SW1 · Fa0/5");

  // Gli indirizzi, dal pannello: la maschera viene proposta da sola.
  await device(page, "PC1").click();
  await fillField(page, "ip", "192.168.1.10");
  await expect(page.locator('[data-field="mask"]')).toHaveValue("255.255.255.0");
  await device(page, "PC2").click();
  await fillField(page, "ip", "192.168.1.300");
  await expect(sidePanel(page)).toContainText("Indirizzo IP non valido");
  await fillField(page, "ip", "192.168.1.11");
  await expect(device(page, "PC2")).toContainText("192.168.1.11/24");

  // Un ping col mouse, da PC1 a PC2, in tempo reale.
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await page.getByRole("button", { name: /Avvia/ }).click();
  await device(page, "PC1").click();
  await expect(sidePanel(page)).toContainText("192.168.1.11", { timeout: 30_000 }); // tabella ARP
  await page.getByRole("tab", { name: "Eventi" }).click();
  await expect(page.locator(".list")).toContainText("echo reply", { timeout: 30_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();
});

test("spostare, annullare ed eliminare", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.3, 0.4);
  await clickDrawing(page, 0.6, 0.4);
  await page.keyboard.press("Escape");

  // Trascinare sposta il dispositivo dove lo si lascia.
  const start = await centreOf(device(page, "PC1").locator("rect.box"));
  const target = await pointOn(page, 0.3, 0.75);
  await drag(page, start, target);
  const moved = await centreOf(device(page, "PC1").locator("rect.box"));
  expect(Math.abs(moved.x - target.x)).toBeLessThan(4);
  expect(Math.abs(moved.y - target.y)).toBeLessThan(4);

  // Ctrl+Z lo rimette dov'era; Ctrl+Maiusc+Z lo sposta di nuovo.
  await clickDrawing(page, 0.8, 0.15);
  await page.keyboard.press("Control+z");
  const back = await centreOf(device(page, "PC1").locator("rect.box"));
  expect(Math.abs(back.y - start.y)).toBeLessThan(4);
  await page.keyboard.press("Control+Shift+Z");
  const again = await centreOf(device(page, "PC1").locator("rect.box"));
  expect(Math.abs(again.y - target.y)).toBeLessThan(4);

  // Canc elimina ciò che è selezionato; le frecce in alto lo fanno tornare.
  await device(page, "PC2").click();
  await page.keyboard.press("Delete");
  await expect(page.locator("g.device")).toHaveCount(1);
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.locator("g.device")).toHaveCount(2);

  // Dentro un campo di testo, Canc cancella solo il testo.
  await device(page, "PC2").click();
  await page.locator('[data-field="name"]').click();
  await page.keyboard.press("Backspace");
  await expect(page.locator("g.device")).toHaveCount(2);
});
