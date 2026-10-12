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

test("la lezione sul routing statico: tre reti, due router", async ({ page }) => {
  const { exampleFile, openNetwork } = await import("./helpers");
  await openApp(page);
  await openNetwork(page, "tre-reti-due-router.netsim.json", exampleFile("tre-reti-due-router"));
  await expect(device(page, "R2")).toBeVisible();

  // Aggiunge una rotta statica al router selezionato.
  const addRoute = async (network: string, mask: string, nextHop: string) => {
    await page.locator('[data-field="route-network"]').fill(network);
    await page.locator('[data-field="route-mask"]').fill(mask);
    await page.locator('[data-field="route-next-hop"]').fill(nextHop);
    await page.getByRole("button", { name: "Aggiungi rotta" }).click();
  };
  const pingFromPc1 = async () => {
    await page.getByRole("tab", { name: "Terminale · PC1" }).click();
    await typeCommand(page, "ping -n 1 192.168.2.10");
  };

  // 6. Senza rotte statiche, il primo router avvisa che la rete non si raggiunge.
  await device(page, "PC1").click();
  await action(page, "Apri il terminale").click();
  await typeCommand(page, "ping -n 1 192.168.2.10");
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(terminal(page)).toContainText("Reply from 192.168.1.1: Destination net unreachable.", { timeout: 40_000 });

  // La tabella di routing di R1, appuntata, resta in vista sul disegno.
  await device(page, "R1").click();
  await action(page, "Appunta la tabella di routing di R1").click();
  await expect(page.locator("g.table")).toContainText("Tabella di routing · R1");

  // 7a. Con la sola rotta di andata la richiesta arriva, ma la risposta
  //     si ferma al secondo router: chi ha fatto il ping aspetta invano.
  await addRoute("192.168.2.0", "/24", "10.0.0.2");
  await expect(sidePanel(page)).toContainText("192.168.2.0/24");
  await expect(page.locator("g.table")).toContainText("via 10.0.0.2 Gi0/1");
  await pingFromPc1();
  await expect(terminal(page)).toContainText("Request timed out.", { timeout: 60_000 });

  // Una rotta scritta male viene rifiutata, con il motivo.
  await device(page, "R2").click();
  await addRoute("192.168.1.7", "/24", "10.0.0.1");
  await expect(sidePanel(page)).toContainText("non è un indirizzo di rete");

  // 7b. Con anche la rotta di ritorno il ping riesce, con due salti in meno.
  await addRoute("192.168.1.0", "255.255.255.0", "10.0.0.1");
  await pingFromPc1();
  await expect(terminal(page)).toContainText("TTL=126", { timeout: 40_000 });

  // 8. tracert mostra i due router e la destinazione.
  await typeCommand(page, "tracert 192.168.2.10");
  await expect(terminal(page)).toContainText("Trace complete.", { timeout: 60_000 });
  await expect(terminal(page)).toContainText(/1 +\d+ ms {2}192\.168\.1\.1/);
  await expect(terminal(page)).toContainText(/2 +\d+ ms {2}10\.0\.0\.2/);
  await expect(terminal(page)).toContainText(/3 +\d+ ms {2}192\.168\.2\.10/);

  // Tolta la rotta di andata, la riga sparisce dal pannello.
  await page.getByRole("button", { name: /Pausa/ }).click();
  await device(page, "R1").click();
  await page.getByRole("button", { name: "Togli la rotta verso 192.168.2.0/24 via 10.0.0.2" }).click();
  await expect(sidePanel(page).getByText("192.168.2.0/24")).toHaveCount(0);
});

test("la lezione sul gateway: due LAN e un router", async ({ page }) => {
  // A passi, e poi in tempo reale per tre ping: più del minuto solito.
  test.setTimeout(180_000);
  const { exampleFile, openNetwork } = await import("./helpers");

  // Avanza a passi finché sul disegno compare la busta cercata, e la apre.
  const stepUntilPacket = async (label: string) => {
    const packet = page.locator(`g.packet[aria-label^="${label}"]`);
    for (let step = 0; step < 25 && (await packet.count()) === 0; step++) {
      await page.getByRole("button", { name: /Passo/ }).click();
      await page.waitForTimeout(800);
    }
    await packet.first().click();
  };
  const finish = async () => {
    await page.getByRole("button", { name: /Avvia/ }).click();
  };

  // 1. Il docente apre un file con due LAN unite da un router.
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await expect(device(page, "R1")).toBeVisible();
  // Gli indirizzi del router sono scritti accanto ai suoi cavi.
  await expect(page.locator("text.address", { hasText: "192.168.1.1/24" })).toBeVisible();
  await expect(page.locator("text.address", { hasText: "192.168.2.1/24" })).toBeVisible();

  // 2. PC1 non ha gateway: il ping verso l'altra LAN fallisce subito, e
  //    sul cavo non parte nulla.
  await device(page, "PC1").click();
  await action(page, "Apri il terminale").click();
  await typeCommand(page, "ping -n 1 192.168.2.10");
  await expect(terminal(page)).toContainText("PING: transmit failed. General failure.");
  await expect(page.locator("g.packet")).toHaveCount(0);

  // 3. Con il gateway, PC1 chiede con ARP il MAC del router, non di PC2.
  await device(page, "PC1").click();
  await fillField(page, "gateway", "192.168.1.1");
  await page.getByRole("tab", { name: "Terminale · PC1" }).click();
  await typeCommand(page, "ping -n 1 192.168.2.10");
  await page.locator("g.packet").first().click();
  await expect(sidePanel(page)).toContainText("ARP request");
  await expect(sidePanel(page)).toContainText("192.168.1.1"); // l'indirizzo cercato è il gateway
  await expect(sidePanel(page)).not.toContainText("192.168.2.10");

  // 4. Prima del router: da PC1 al router, TTL 128.
  await stepUntilPacket("ICMP echo request, da PC1");
  await expect(sidePanel(page)).toContainText("192.168.1.10"); // IP sorgente
  await expect(sidePanel(page)).toContainText("192.168.2.10"); // IP destinazione
  await expect(sidePanel(page)).toContainText("02:00:00:00:00:01"); // MAC di PC1
  await expect(sidePanel(page)).toContainText("02:00:00:00:03:01"); // MAC del router, lato PC1
  await expect(sidePanel(page).locator("dd", { hasText: /^128$/ })).toBeVisible();

  //    Dopo il router: stessi IP, altri MAC, TTL 127.
  await stepUntilPacket("ICMP echo request, da R1");
  await expect(sidePanel(page)).toContainText("192.168.1.10");
  await expect(sidePanel(page)).toContainText("192.168.2.10");
  await expect(sidePanel(page)).toContainText("02:00:00:00:03:02"); // MAC del router, lato PC2
  await expect(sidePanel(page)).toContainText("02:00:00:00:00:02"); // MAC di PC2
  await expect(sidePanel(page)).not.toContainText("02:00:00:00:00:01");
  await expect(sidePanel(page).locator("dd", { hasText: /^127$/ })).toBeVisible();

  //    Il ping si conclude: la risposta torna con un salto in meno.
  await finish();
  await page.getByRole("tab", { name: "Terminale · PC1" }).click();
  await expect(terminal(page)).toContainText("TTL=127", { timeout: 40_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();

  //    Il router ha imparato i due PC, ciascuno dal suo lato.
  await device(page, "R1").click();
  await expect(sidePanel(page)).toContainText("02:00:00:00:00:01");
  await expect(sidePanel(page)).toContainText("02:00:00:00:00:02");

  // 5. Spenta un'interfaccia del router il ping fallisce; riaccesa, riesce.
  await page.getByRole("button", { name: /Interfaccia Gi0\/1: accesa/ }).click();
  await expect(page.locator("rect.shut")).toHaveCount(1);
  await page.getByRole("tab", { name: "Terminale · PC1" }).click();
  await typeCommand(page, "ping -n 1 192.168.2.10");
  await finish();
  await expect(terminal(page)).toContainText("Reply from 192.168.1.1: Destination net unreachable.", { timeout: 40_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();

  await device(page, "R1").click();
  await page.getByRole("button", { name: /Interfaccia Gi0\/1: spenta/ }).click();
  await expect(page.locator("rect.shut")).toHaveCount(0);
  await page.getByRole("tab", { name: "Terminale · PC1" }).click();
  await page.getByLabel(/Riga di comando/).fill("cls");
  await page.getByLabel(/Riga di comando/).press("Enter");
  await typeCommand(page, "ping -n 1 192.168.2.10");
  await finish();
  await expect(terminal(page)).toContainText("TTL=127", { timeout: 40_000 });
});
