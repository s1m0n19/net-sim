// Aprire, salvare e riaprire; le modifiche non salvate.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { clickDrawing, device, exampleFile, fillField, openApp, openNetwork } from "./helpers";

const unsaved = "● modificata";

test("una rete salvata si riapre uguale", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await expect(page.getByText("lan-switch")).toBeVisible();
  await expect(page.getByText(unsaved)).toHaveCount(0);

  // Una modifica la segna come non salvata.
  await device(page, "PC1").click();
  await fillField(page, "name", "Segreteria");
  await expect(page.getByText(unsaved)).toBeVisible();

  // Salva: senza la finestra di Chrome il file viene scaricato.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("lan-switch.netsim.json");
  await expect(page.getByText(unsaved)).toHaveCount(0);
  const text = readFileSync(await saved.path(), "utf-8");

  // Nuova torna al foglio vuoto senza chiedere: non c'è nulla da perdere.
  await page.getByRole("button", { name: "Nuova" }).click();
  await expect(page.getByText("La rete è vuota")).toBeVisible();

  // Il file salvato si riapre con il nome nuovo e le tabelle vuote.
  await openNetwork(page, "copia.netsim.json", text);
  await expect(device(page, "Segreteria")).toBeVisible();
  await expect(page.locator("g.device")).toHaveCount(4);
  await expect(page.locator("line.wire")).toHaveCount(3);
});

test("con modifiche non salvate, Nuova chiede conferma", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.4, 0.4);
  await page.keyboard.press("Escape");
  await expect(page.getByText(unsaved)).toBeVisible();

  // Rispondendo di no, la rete resta.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Nuova" }).click();
  await expect(device(page, "PC1")).toBeVisible();

  // Rispondendo di sì, si torna al foglio vuoto.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Nuova" }).click();
  await expect(page.getByText("La rete è vuota")).toBeVisible();
});

test("un file non valido viene rifiutato, e la rete aperta resta", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-pc.netsim.json", exampleFile("due-pc"));
  await expect(page.locator("g.device")).toHaveCount(2);

  await openNetwork(page, "rotto.json", '{ "format": "altro" }');

  await expect(page.getByRole("alert")).toContainText("Il file non si può aprire");
  await expect(page.locator("g.device")).toHaveCount(2);
});
