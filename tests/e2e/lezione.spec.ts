// La lezione del criterio di accettazione del rilascio 1 (SPEC, sezione 5),
// eseguita dall'inizio alla fine come la condurrebbe il docente.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  action,
  cable,
  clickDrawing,
  device,
  exampleFile,
  fillField,
  openApp,
  openNetwork,
  sidePanel,
  terminal,
  typeCommand,
} from "./helpers";

test("la lezione su ARP e ping si svolge senza uscire dall'app", async ({ page }) => {
  // 1. Il docente apre un file con uno switch e tre PC.
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await expect(device(page, "PC3")).toBeVisible();

  // 2. In presentazione, a passi, lancia il ping dal terminale di PC1.
  await page.getByRole("button", { name: "Presenta" }).click();
  await expect(page.getByRole("button", { name: "Esci" })).toBeVisible();
  await device(page, "PC1").click();
  await page.keyboard.press("t");
  await typeCommand(page, "ping -n 1 192.168.1.11");
  await expect(terminal(page)).toContainText("Pinging 192.168.1.11");

  // 6. Selezionando un pacchetto se ne vedono gli strati: qui la richiesta
  //    ARP appena partita, in broadcast.
  await page.locator("g.packet").first().click();
  await expect(sidePanel(page)).toContainText("ARP request");
  await expect(sidePanel(page)).toContainText("Ethernet");
  await expect(sidePanel(page)).toContainText("ff:ff:ff:ff:ff:ff");

  // 3. Un passo: la richiesta arriva allo switch, che registra il MAC di
  //    PC1 e la inoltra su tutte le altre porte.
  await clickDrawing(page, 0.5, 0.1); // via dal terminale: i tasti tornano scorciatoie
  await page.keyboard.press("ArrowRight");
  await device(page, "SW1").click();
  await expect(sidePanel(page)).toContainText("02:00:00:00:00:01");
  await expect(sidePanel(page)).toContainText("Fa0/1");
  await expect(page.locator("g.packet")).toHaveCount(2);

  // 4 e 5. Si prosegue a passi finché il ping si conclude: PC2 risponde,
  //    PC3 scarta, parte l'echo request e torna l'echo reply.
  await clickDrawing(page, 0.5, 0.1);
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
  }
  await expect(terminal(page)).toContainText("Reply from 192.168.1.11: bytes=32 time=8ms TTL=128");

  await page.keyboard.press("e");
  const events = page.locator(".list");
  await expect(events).toContainText("ff:ff:ff:ff:ff:ff"); // la richiesta in broadcast
  await expect(events).toContainText("scarta ARP request"); // PC3
  await device(page, "PC1").click();
  await expect(sidePanel(page)).toContainText("192.168.1.11"); // tabella ARP di PC1
  await expect(sidePanel(page)).toContainText("02:00:00:00:00:02");

  // 7a. Stacca il cavo di PC2 e ripete il ping, che fallisce.
  await cable(page, "PC2", "SW1").click({ force: true });
  await action(page, "Stacca il cavo").click();
  await expect(sidePanel(page)).toContainText("Staccato");
  await page.getByRole("tab", { name: "Terminale · PC1" }).click();
  await typeCommand(page, "ping -n 1 192.168.1.11");
  await clickDrawing(page, 0.5, 0.1);
  await page.keyboard.press(" "); // avvia il tempo reale
  await expect(terminal(page)).toContainText("Request timed out.", { timeout: 40_000 });
  await page.keyboard.press(" "); // pausa

  // 7b. Cambia l'indirizzo di PC3 in uno di un'altra rete: il ping verso
  //     PC3 fallisce subito, senza che parta alcuna richiesta ARP.
  await device(page, "PC3").click();
  await fillField(page, "ip", "10.0.0.3");
  await expect(device(page, "PC3")).toContainText("10.0.0.3/24");
  await page.getByRole("tab", { name: "Eventi" }).click();
  await expect(events).toContainText("cambia configurazione IP");
  const before = await events.getByText("ARP request").count();
  expect(before).toBeGreaterThan(0);
  await page.getByRole("tab", { name: "Terminale · PC1" }).click();
  await typeCommand(page, "ping -n 1 10.0.0.3");
  await expect(terminal(page)).toContainText("PING: transmit failed. General failure.");
  await page.getByRole("tab", { name: "Eventi" }).click();
  expect(await events.getByText("ARP request").count()).toBe(before);

  // 8. Salva la rete modificata in un nuovo file.
  await clickDrawing(page, 0.5, 0.1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Presenta" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("lezione-modificata"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva con nome" }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("lezione-modificata.netsim.json");

  const file = JSON.parse(readFileSync(await saved.path(), "utf-8"));
  expect(file.network.devices.find((d: { name: string }) => d.name === "PC3").ip).toBe("10.0.0.3");
  expect(file.network.links.find((l: { id: string }) => l.id === "l2").connected).toBe(false);
  await expect(page.getByText("lezione-modificata")).toBeVisible();
  await expect(page.getByText("modificata", { exact: false }).filter({ hasText: "●" })).toHaveCount(0);
});
