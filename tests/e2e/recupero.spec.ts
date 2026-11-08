// La copia di recupero (D-120): il lavoro non salvato non si perde se la
// pagina si ricarica o la scheda si chiude. Alla riapertura l'app propone
// di riprenderlo; salvando la copia sparisce.

import { expect, test, type Page } from "@playwright/test";
import { clickDrawing, device, exampleFile, fillField, openApp, openNetwork } from "./helpers";

const offer = (page: Page) => page.getByRole("status").filter({ hasText: "C'è una rete non salvata" });
const resume = (page: Page) => page.getByRole("button", { name: "Riprendi la rete non salvata" });
const discard = (page: Page) => page.getByRole("button", { name: "Scarta la rete non salvata" });

// Ricarica la pagina, come se la scheda si fosse chiusa e riaperta.
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(page.locator("svg[aria-label='Topologia della rete']")).toBeVisible();
}

test("una rete costruita e non salvata si riprende dopo aver ricaricato la pagina, annotazioni comprese", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.3, 0.4);
  await clickDrawing(page, 0.6, 0.4);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await clickDrawing(page, 0.4, 0.8);
  await page.keyboard.type("Da non perdere");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await reopen(page);
  await expect(page.locator("g.device")).toHaveCount(0);
  await expect(offer(page)).toContainText("(senza nome)");

  await resume(page).click();
  await expect(offer(page)).toHaveCount(0);
  await expect(page.locator("g.device")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Nota: Da non perdere" })).toBeVisible();
  // Ripresa, la rete resta da salvare: il file non c'è ancora.
  await expect(page.getByText("Da salvare")).toBeVisible();
});

test("una rete aperta da un file e modificata si riprende con il nome del file; salvando, la copia sparisce", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lezione.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await fillField(page, "name", "Aula");

  await reopen(page);
  await expect(offer(page)).toContainText("«lezione»");
  await resume(page).click();
  await expect(page.locator(".top .file")).toHaveText("lezione");
  await expect(device(page, "Aula")).toBeVisible();

  // Salvata, alla riapertura non c'è nulla da riprendere.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await download;
  await expect(page.getByText("Da salvare")).toHaveCount(0);
  await reopen(page);
  await expect(offer(page)).toHaveCount(0);
});

test("scartata non torna; senza modifiche, o annullandole tutte, non c'è nulla da riprendere", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lezione.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await fillField(page, "name", "Aula");
  await reopen(page);
  await discard(page).click();
  await expect(offer(page)).toHaveCount(0);
  await reopen(page);
  await expect(offer(page)).toHaveCount(0);

  // Un file aperto e non toccato: niente copia.
  await openNetwork(page, "lezione.netsim.json", exampleFile("lan-switch"));
  await expect(page.locator(".top .file")).toHaveText("lezione");
  await reopen(page);
  await expect(offer(page)).toHaveCount(0);

  // Una modifica annullata riporta la rete salvata: niente copia.
  await openNetwork(page, "lezione.netsim.json", exampleFile("lan-switch"));
  await expect(page.locator(".top .file")).toHaveText("lezione");
  await device(page, "PC2").click();
  await fillField(page, "name", "Prova");
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(page.getByText("Da salvare")).toHaveCount(0);
  await reopen(page);
  await expect(offer(page)).toHaveCount(0);
});

test("mentre l'app propone di riprendere, una modifica per sbaglio non cancella la copia", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.3, 0.4);
  await page.keyboard.press("Escape");
  await reopen(page);
  // Prima di scegliere, si posa uno switch.
  await page.getByRole("button", { name: /^Switch/ }).click();
  await page.getByRole("menuitem").first().click();
  await clickDrawing(page, 0.7, 0.4);
  await page.keyboard.press("Escape");
  await reopen(page);
  // La copia è ancora quella del PC.
  await resume(page).click();
  await expect(device(page, "PC1")).toBeVisible();
  await expect(page.locator("g.device")).toHaveCount(1);
});
