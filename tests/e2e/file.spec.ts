// Aprire, salvare e riaprire; le modifiche non salvate; le tabelle nel file.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  action,
  clickDrawing,
  device,
  exampleFile,
  fillField,
  openApp,
  openNetwork,
  projectCommand,
  sidePanel,
  terminal,
  typeCommand,
} from "./helpers";

// La pastiglia delle modifiche non salvate, accanto al nome del file.
const unsaved = "Da salvare";

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
  await projectCommand(page, "Nuova rete");
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

  // Con Annulla, la rete resta (D-137).
  const dialog = page.getByRole("dialog", { name: "Modifiche non salvate" });
  await projectCommand(page, "Nuova rete");
  await dialog.getByRole("button", { name: "Annulla" }).click();
  await expect(device(page, "PC1")).toBeVisible();

  // Scartando le modifiche, si torna al foglio vuoto.
  await projectCommand(page, "Nuova rete");
  await dialog.getByRole("button", { name: "Scarta modifiche" }).click();
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

test("una rete salvata con le tabelle riparte già calda, anche dopo Ricomincia", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  // L'opzione delle tabelle sta nel menu Progetto: si legge e si cambia da lì.
  const tablesChecked = async () => {
    await page.getByRole("button", { name: "Progetto" }).click();
    const value = await page.getByRole("menuitemcheckbox", { name: /tabelle ARP e MAC/ }).getAttribute("aria-checked");
    await page.keyboard.press("Escape");
    return value;
  };
  expect(await tablesChecked()).toBe("false");

  // Un ping da PC1 a PC2, in tempo reale, riempie le tabelle.
  await device(page, "PC1").click();
  await action(page, "Apri il terminale di PC1").click();
  await typeCommand(page, "ping -n 1 192.168.1.11");
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(terminal(page)).toContainText("Reply from 192.168.1.11", { timeout: 40_000 });

  // Salva con le tabelle: il file le contiene, e la rete non risulta modificata.
  await page.getByRole("button", { name: "Progetto" }).click();
  await page.getByRole("menuitemcheckbox", { name: /tabelle ARP e MAC/ }).click();
  await page.keyboard.press("Escape");
  expect(await tablesChecked()).toBe("true");
  // A menu chiuso, accanto a Salva, un'etichetta dice che le tabelle si salvano.
  await expect(page.getByText("con tabelle")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  const text = readFileSync(await (await download).path(), "utf-8");
  expect(JSON.parse(text).network.devices.find((d: any) => d.name === "PC1").arpTable).toEqual([
    { ip: "192.168.1.11", mac: "02:00:00:00:00:02" },
  ]);
  await expect(page.getByText(unsaved)).toHaveCount(0);

  // Ricomincia torna alle tabelle appena salvate, non a tabelle vuote.
  await page.getByRole("button", { name: /Ricomincia/ }).click();
  await device(page, "PC1").click();
  await expect(sidePanel(page)).toContainText("02:00:00:00:00:02");

  // Riaperto dopo Nuova, il file accende l'interruttore e parte già caldo.
  await projectCommand(page, "Nuova rete");
  expect(await tablesChecked()).toBe("false");
  await openNetwork(page, "calda.netsim.json", text);
  expect(await tablesChecked()).toBe("true");
  await device(page, "PC1").click();
  await expect(sidePanel(page)).toContainText("02:00:00:00:00:02");
});
