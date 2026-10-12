// Costruire con il mouse una rete con un router, e attraversarlo.

import { expect, test, type Page } from "@playwright/test";
import { action, clickDrawing, device, fillField, openApp, sidePanel, terminal, typeCommand } from "./helpers";

// Scrive in un campo di un'interfaccia del router selezionato e conferma.
async function fillInterface(page: Page, field: string, text: string): Promise<void> {
  const input = page.locator(`[data-field="${field}"]`);
  await input.fill(text);
  await input.press("Enter");
}

test("due LAN unite da un router costruito da zero", async ({ page }) => {
  await openApp(page);

  // Un PC, un router a due interfacce scelto dall'elenco, un altro PC.
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.15, 0.4);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Router/ }).hover();
  await page.getByRole("menuitem", { name: "Router a 2 interfacce" }).click();
  await clickDrawing(page, 0.5, 0.4);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.85, 0.4);
  await page.keyboard.press("Escape");
  await expect(device(page, "R1")).toBeVisible();

  // I cavi: le interfacce del router nascono spente, e si vede.
  await page.getByRole("button", { name: "Cavo", exact: true }).click();
  await device(page, "PC1").click();
  await device(page, "R1").click();
  await device(page, "PC2").click();
  await device(page, "R1").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("line.wire")).toHaveCount(2);
  await expect(page.locator("rect.shut")).toHaveCount(2);
  await expect(page.locator("circle.signal")).toHaveCount(0);

  // Accese le interfacce, i cavi portano segnale.
  await device(page, "R1").click();
  await expect(sidePanel(page)).toContainText("Router · acceso");
  await page.getByRole("button", { name: /Interfaccia Gi0\/0: spenta/ }).click();
  await page.getByRole("button", { name: /Interfaccia Gi0\/1: spenta/ }).click();
  await expect(page.locator("rect.shut")).toHaveCount(0);
  await expect(page.locator("circle.signal")).toHaveCount(4);

  // Gli indirizzi: la maschera viene proposta, e una rete sovrapposta rifiutata.
  await fillInterface(page, "ip-Gi0/0", "192.168.1.1");
  await expect(page.locator('[data-field="mask-Gi0/0"]')).toHaveValue("255.255.255.0");
  await fillInterface(page, "ip-Gi0/1", "192.168.1.200");
  await expect(sidePanel(page)).toContainText("si sovrappone a quella di Gi0/0");
  await fillInterface(page, "ip-Gi0/1", "192.168.2.1");
  await expect(sidePanel(page)).toContainText("192.168.2.0/24"); // nella tabella di routing

  // I due PC, ciascuno con il suo gateway.
  await device(page, "PC1").click();
  await fillField(page, "ip", "192.168.1.10");
  await fillField(page, "gateway", "192.168.1.1");
  await device(page, "PC2").click();
  await fillField(page, "ip", "192.168.2.10");
  await fillField(page, "gateway", "192.168.2.1");

  // Il ping attraversa il router: la risposta torna con un salto in meno.
  await device(page, "PC1").click();
  await action(page, "Apri il terminale").click();
  await typeCommand(page, "ping -n 1 192.168.2.10");
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(terminal(page)).toContainText("TTL=127", { timeout: 40_000 });

  // tracert mostra il router e poi la destinazione.
  await typeCommand(page, "tracert 192.168.2.10");
  await expect(terminal(page)).toContainText("Trace complete.", { timeout: 40_000 });
  await expect(terminal(page)).toContainText(/1 +\d+ ms {2}192\.168\.1\.1/);
  await expect(terminal(page)).toContainText(/2 +\d+ ms {2}192\.168\.2\.10/);

  // Spenta un'interfaccia, il router avvisa che la rete non si raggiunge.
  await page.getByRole("button", { name: /Pausa/ }).click();
  await device(page, "R1").click();
  await page.getByRole("button", { name: /Interfaccia Gi0\/1: accesa/ }).click();
  await expect(page.locator("rect.shut")).toHaveCount(1);
  await page.getByRole("tab", { name: "Terminale · PC1" }).click();
  await typeCommand(page, "ping -n 1 192.168.2.10");
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(terminal(page)).toContainText("Reply from 192.168.1.1: Destination net unreachable.", { timeout: 40_000 });
});
