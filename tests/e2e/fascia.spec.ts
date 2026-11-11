// La fascia in basso (D-132): il terminale che non riporta in fondo chi è
// risalito a leggere, il comando scritto che si distingue dall'output, le
// schede da tastiera, i nomi lunghi, il bordo per cambiarne l'altezza, e
// il registro degli eventi che non si fa coprire dal suo pulsante.

import { expect, test, type Page } from "@playwright/test";
import { action, device, exampleFile, fillField, openApp, openNetwork, typeCommand } from "./helpers";

const screen = (page: Page) => page.locator(".screen");
const prompt = (page: Page) => page.getByLabel(/Riga di comando/);

async function openTerminalOf(page: Page, name: string): Promise<void> {
  await device(page, name).click();
  await action(page, `Apri il terminale di ${name}`).click();
}

test("il terminale segue l'output solo se lo si guarda in fondo; scrivere riporta alla riga di comando", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan.netsim.json", exampleFile("lan-switch"));
  await openTerminalOf(page, "PC1");
  // Abbastanza righe perché lo schermo scorra.
  for (let i = 0; i < 4; i++) await typeCommand(page, "ipconfig");
  await expect.poll(() => screen(page).evaluate((el) => el.scrollHeight > el.clientHeight + 50)).toBe(true);
  // Il comando scritto è in grassetto, il prompt e l'output no.
  await expect(screen(page).locator(".command .typed").first()).toHaveText("ipconfig");
  expect(await screen(page).locator(".command .typed").first().evaluate((el) => getComputedStyle(el).fontWeight)).toBe("600");

  // Un ping che stamperà altre righe; si risale a leggere.
  await typeCommand(page, "ping -n 4 192.168.1.11");
  await screen(page).evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(page.getByRole("button", { name: "↓ Riga di comando" })).toBeVisible();
  await page.getByRole("button", { name: /Avvia/ }).click();
  // Fino alla fine del ping: l'output cresce riga per riga.
  await expect(screen(page)).toContainText("Ping statistics", { timeout: 45_000 });
  // L'output è cresciuto, ma chi leggeva in alto è rimasto in alto.
  expect(await screen(page).evaluate((el) => el.scrollTop)).toBe(0);

  // Il pulsante riporta in fondo, con il cursore sulla riga di comando.
  await page.getByRole("button", { name: "↓ Riga di comando" }).click();
  await expect(page.getByRole("button", { name: "↓ Riga di comando" })).toHaveCount(0);
  await expect(prompt(page)).toBeInViewport();
  await expect(prompt(page)).toBeFocused();

  // Risaliti di nuovo, basta scrivere: si torna alla riga in cui si scrive.
  await screen(page).evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(page.getByRole("button", { name: "↓ Riga di comando" })).toBeVisible();
  await prompt(page).press("a");
  await expect(prompt(page)).toBeInViewport();
  await expect(prompt(page)).toHaveValue("a");
});

test("le schede si usano con le frecce, sono una sola fermata di Tab, e il contenuto è il loro pannello", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan.netsim.json", exampleFile("lan-switch"));
  for (const name of ["PC1", "PC2", "SW1"]) await openTerminalOf(page, name);
  const tab = (name: string | RegExp) => page.getByRole("tab", { name });
  await expect(tab(/Terminale · SW1/)).toHaveAttribute("aria-selected", "true");
  // Solo la scheda aperta si raggiunge con Tab; le altre con le frecce.
  await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  const panel = page.getByRole("tabpanel");
  await expect(panel).toHaveAttribute("aria-labelledby", (await tab(/Terminale · SW1/).getAttribute("id"))!);

  await tab(/Terminale · SW1/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Eventi")).toBeFocused();
  await expect(tab("Eventi")).toHaveAttribute("aria-selected", "true");
  await expect(panel).toContainText("Conversazione");
  await page.keyboard.press("ArrowRight");
  await expect(tab(/Terminale · PC1/)).toBeFocused();
  await expect(panel.getByLabel(/Riga di comando di PC1/)).toBeVisible();
  await page.keyboard.press("End");
  await expect(tab("Eventi")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tab(/Terminale · PC1/)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Eventi")).toHaveAttribute("aria-selected", "true");
});

test("un nome molto lungo si accorcia nella scheda, e intero si legge nel suggerimento e nel nome", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  const long = "Laboratorio-terzo-piano-postazione-12";
  await fillField(page, "name", long);
  await openTerminalOf(page, long);
  const tab = page.getByRole("tab", { name: new RegExp(`Terminale · ${long}`) });
  await expect(tab).toHaveAttribute("title", `Terminale di ${long}`);
  // Accorciato: il nome non sta tutto nel suo spazio, e la scheda non si allarga oltre.
  expect(await tab.locator(".device").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect((await tab.boundingBox())!.width).toBeLessThan(320);
});

test("il bordo della fascia si vede, dice minimo e massimo, e si regola anche con Inizio e Fine", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  await openNetwork(page, "lan.netsim.json", exampleFile("lan-switch"));
  await page.getByRole("button", { name: "Apri la fascia in basso" }).click();
  const edge = page.getByRole("separator", { name: /Altezza della fascia/ });
  // La tacca si vede anche senza passarci sopra.
  await expect(edge.locator(".grip")).toBeVisible();
  await expect(edge).toHaveAttribute("aria-valuemin", "100");
  await expect(edge).toHaveAttribute("aria-valuemax", String(Math.round(768 * 0.6)));
  await edge.focus();
  await page.keyboard.press("End");
  await expect(edge).toHaveAttribute("aria-valuenow", String(Math.round(768 * 0.6)));
  await expect(edge).toHaveAttribute("aria-valuetext", `${Math.round(768 * 0.6)} pixel`);
  await page.keyboard.press("Home");
  await expect(edge).toHaveAttribute("aria-valuenow", "100");
  await page.keyboard.press("ArrowUp");
  await expect(edge).toHaveAttribute("aria-valuenow", "120");
});

test("il pulsante «Ultimi eventi» non copre l'ultima riga", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan.netsim.json", exampleFile("lan-switch"));
  await openTerminalOf(page, "PC1");
  await typeCommand(page, "ping -n 1 192.168.1.11");
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(page.locator(".screen")).toContainText("Reply from", { timeout: 45_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();
  await page.getByRole("tab", { name: "Eventi" }).click();
  const list = page.locator("footer .list");
  await expect.poll(() => list.evaluate((el) => el.scrollHeight > el.clientHeight + 80)).toBe(true);

  // Si risale, poi si scende fin quasi in fondo, restando a leggere.
  await list.evaluate((el) => el.scrollTo({ top: 0 }));
  const latest = page.getByRole("button", { name: "↓ Ultimi eventi" });
  await expect(latest).toBeVisible();
  await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight - el.clientHeight - 40 }));
  await expect(latest).toBeVisible();
  const button = (await latest.boundingBox())!;
  const last = (await list.locator("tbody tr").last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(button.y + 1);
});

test("nessun evento e eventi nascosti dal filtro si dicono in modo diverso, e il secondo dice come rivederli", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan.netsim.json", exampleFile("lan-switch"));
  await openTerminalOf(page, "PC1");
  await page.getByRole("tab", { name: "Eventi" }).click();
  const list = page.locator("footer .list");
  await expect(list).toContainText("Nessun evento: la simulazione non è ancora partita.");
  // Appena lanciato il ping c'è un evento solo, la richiesta ARP.
  await page.getByRole("tab", { name: /Terminale · PC1/ }).click();
  await typeCommand(page, "ping -n 1 192.168.1.11");
  await page.getByRole("tab", { name: "Eventi" }).click();
  await expect(list.locator("tbody tr")).toHaveCount(1);
  await page.locator("footer .filter").getByRole("button", { name: "ARP" }).click();
  await expect(list).toContainText("Il filtro nasconde tutti gli eventi");
  await expect(list).toContainText("accendi ARP e ICMP");
  await expect(page.locator("footer .count")).toHaveText("0 di 1 eventi");
});
