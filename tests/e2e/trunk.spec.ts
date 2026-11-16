// I trunk 802.1Q dal pannello dello switch (D-156): il percorso di uno
// studente, dalla rete senza VLAN al trunk provato, guardato nei frame,
// cambiato dalla CLI e annullato, salvato e riaperto; e il pannello in
// finestre di grandezze diverse.

import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { action, device, openApp, openNetwork, sidePanel, terminal, typeCommand } from "./helpers";

// Due switch con le porte Fa0/1…Fa0/`count` e Fa0/24, uniti tra le Fa0/24,
// senza VLAN; PC1 e PC2 su SW1 (Fa0/1, Fa0/2), PC3 e PC4 su SW2, tutti in
// 192.168.1.0/24.
function twoSwitchesFile(count = 3): string {
  const sw = (id: string, name: string, byte: string, x: number) => ({
    id,
    kind: "switch",
    name,
    position: { x, y: 120 },
    ports: [
      ...Array.from({ length: count }, (_, i) => ({ name: `Fa0/${i + 1}`, mac: `02:00:00:00:${byte}:${String(i + 1).padStart(2, "0")}` })),
      { name: "Fa0/24", mac: `02:00:00:00:${byte}:99` },
    ],
  });
  const pc = (n: number, x: number) => ({
    id: `d${n}`,
    kind: "host",
    name: `PC${n}`,
    position: { x, y: 320 },
    ports: [{ name: "Fa0", mac: `02:00:00:00:00:0${n}` }],
    ip: `192.168.1.${9 + n}`,
    mask: "255.255.255.0",
    gateway: null,
  });
  const end = (deviceId: string, portName: string) => ({ deviceId, portName });
  return JSON.stringify({
    format: "net-sim",
    version: 1,
    network: {
      devices: [sw("s1", "SW1", "01", 200), sw("s2", "SW2", "02", 600), pc(1, 100), pc(2, 300), pc(3, 500), pc(4, 700)],
      links: [
        { id: "l1", a: end("d1", "Fa0"), b: end("s1", "Fa0/1") },
        { id: "l2", a: end("d2", "Fa0"), b: end("s1", "Fa0/2") },
        { id: "l3", a: end("d3", "Fa0"), b: end("s2", "Fa0/1") },
        { id: "l4", a: end("d4", "Fa0"), b: end("s2", "Fa0/2") },
        { id: "l5", a: end("s1", "Fa0/24"), b: end("s2", "Fa0/24") },
      ],
    },
  });
}

function section(page: Page, title: string): Locator {
  return sidePanel(page).locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function portChoice(page: Page, port: string): Locator {
  return page.getByRole("combobox", { name: `VLAN della porta ${port}, o trunk` });
}

// Il riepilogo del trunk sotto la porta, che apre i dettagli.
function trunkSummary(page: Page): Locator {
  return section(page, "Porte").getByRole("button", { name: /trunk/ });
}

async function createVlan(page: Page, id: string, name: string): Promise<void> {
  const vlans = section(page, "VLAN");
  const open = vlans.getByRole("button", { name: "Nuova VLAN" });
  if ((await open.getAttribute("aria-expanded")) === "false") await open.click();
  await vlans.locator('[data-field="vlan-id"]').fill(id);
  await vlans.locator('[data-field="vlan-name"]').fill(name);
  await vlans.getByRole("button", { name: "Crea VLAN" }).click();
}

async function runFast(page: Page): Promise<void> {
  const speed = page.getByRole("button", { name: /Velocità/ });
  while (!(await speed.getAttribute("aria-label"))!.startsWith("Velocità: 2×")) await speed.click();
  await page.getByRole("button", { name: /Avvia/ }).click();
}

test("lo studente configura un trunk tra due switch dal pannello, lo prova, guarda i tag, lo cambia dalla CLI, salva e riapre", async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await openNetwork(page, "trunk.netsim.json", twoSwitchesFile());

  // Su ogni switch: VLAN 10 e 20, PC nelle loro VLAN, Fa0/24 trunk con nativa 99.
  for (const [name, key] of [["SW1", "s1"], ["SW2", "s2"]]) {
    await device(page, name).click();
    await createVlan(page, "10", "STUDENTI");
    await createVlan(page, "20", "DOCENTI");
    await portChoice(page, "Fa0/1").selectOption("10");
    await portChoice(page, "Fa0/2").selectOption("20");
    await portChoice(page, "Fa0/24").selectOption("trunk");
    await expect(trunkSummary(page)).toHaveText("trunk · nativa 1 · VLAN tutte");
    await expect(trunkSummary(page)).toHaveAttribute("aria-expanded", "false");
    await trunkSummary(page).click();
    const native = sidePanel(page).locator(`[data-field="native-${key}-Fa0-24"]`);
    await native.fill("99");
    await native.press("Enter");
    await expect(sidePanel(page).getByText("VLAN 99 · non configurata")).toBeVisible();
  }

  // Su SW2, solo le VLAN 10 e 20: «Solo queste» parte da tutte, e si toglie la 1.
  const ports = section(page, "Porte");
  await ports.getByRole("radio", { name: "Solo queste" }).check();
  await expect(ports.getByText("Non è ancora cambiato nulla: passano tutte le VLAN. Togli la spunta a quelle da non far passare.")).toBeVisible();
  await expect(trunkSummary(page)).toHaveText("trunk · nativa 99 · VLAN tutte"); // nulla è cambiato ancora
  await ports.getByRole("checkbox", { name: "1 · default" }).uncheck();
  await expect(trunkSummary(page)).toHaveText("trunk · nativa 99 · VLAN 10,20");
  await expect(ports.getByText("VLAN configurate e consentite: 10, 20")).toBeVisible();
  await expect(ports.getByText("Collegamento: con segnale")).toBeVisible();
  // La sezione VLAN: le porte access, e il trunk a parte.
  await expect(section(page, "VLAN").locator("li").nth(1)).toContainText("1 porta: Fa0/1 · trunk: Fa0/24");
  await expect(section(page, "VLAN").locator("li").first()).not.toContainText("trunk");

  // PC1 raggiunge PC3 attraverso il trunk, ma non PC4.
  await device(page, "PC1").click();
  await action(page, "Apri il terminale di PC1").click();
  await typeCommand(page, "ping -n 1 192.168.1.12");
  await runFast(page);
  await expect(terminal(page)).toContainText("Reply from 192.168.1.12", { timeout: 40_000 });
  await typeCommand(page, "ping -n 1 192.168.1.13");
  await expect(terminal(page)).toContainText("Destination host unreachable", { timeout: 40_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();

  // Negli eventi il frame sul trunk ha il tag, quello del PC no; i dettagli lo confermano.
  await page.getByRole("tab", { name: /Eventi/ }).click();
  const events = page.locator("tbody tr");
  const tagged = events.filter({ hasText: "SW1" }).filter({ hasText: "invia ARP request dalla porta Fa0/24 con tag VLAN 10" }).first();
  await tagged.click();
  await expect(sidePanel(page)).toContainText("Tag 802.1Q");
  await expect(sidePanel(page).locator(".layer.ethernet")).toContainText("VLAN 10");
  const untagged = events.filter({ hasText: "PC1" }).filter({ hasText: "invia ARP request dalla porta Fa0," }).first();
  await untagged.click();
  await expect(sidePanel(page).locator(".layer.ethernet")).toBeVisible();
  await expect(sidePanel(page)).not.toContainText("Tag 802.1Q");
  const toPc3 = events.filter({ hasText: "SW2" }).filter({ hasText: "invia ARP request dalla porta Fa0/1," }).first();
  await expect(toPc3).not.toContainText("con tag");

  // Dalla CLI di SW2 si toglie la 10: il pannello lo mostra; Annulla lo rimette, anche nella CLI.
  await device(page, "SW2").click();
  await action(page, "Apri il terminale di SW2").click();
  for (const line of ["en", "conf t", "int fa0/24", "sw tr al vl remove 10", "end"]) await typeCommand(page, line);
  await device(page, "SW2").click();
  await expect(trunkSummary(page)).toHaveText("trunk · nativa 99 · VLAN 20");
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(trunkSummary(page)).toHaveText("trunk · nativa 99 · VLAN 10,20");
  await page.getByRole("tab", { name: "Terminale · SW2" }).click();
  await typeCommand(page, "show interfaces trunk");
  await expect(terminal(page)).toContainText(/Vlans allowed on trunk\s*Fa0\/24 +10,20/);

  // Si salva: versione 4. Riaperto, il trunk di SW2 è com'era.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  const saved = readFileSync(await (await download).path(), "utf-8");
  expect(JSON.parse(saved).version).toBe(4);
  await openNetwork(page, "trunk.netsim.json", saved);
  await device(page, "SW2").click();
  await expect(trunkSummary(page)).toHaveText("trunk · nativa 99 · VLAN 10,20");
  await expect(portChoice(page, "Fa0/24")).toHaveValue("trunk");
});

test("una porta tornata access tiene nativa e consentite, e le mostra come memorizzate; tutto da tastiera", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "trunk.netsim.json", twoSwitchesFile());
  await device(page, "SW1").click();
  await createVlan(page, "10", "STUDENTI");

  await portChoice(page, "Fa0/24").selectOption("trunk");
  await trunkSummary(page).focus();
  await page.keyboard.press("Enter");
  await expect(trunkSummary(page)).toHaveAttribute("aria-expanded", "true");
  const ports = section(page, "Porte");
  await ports.getByRole("radio", { name: "Nessuna" }).check();
  await expect(trunkSummary(page)).toHaveText("trunk · nativa 1 · VLAN nessuna");
  await ports.getByRole("radio", { name: "Solo queste" }).check();
  await ports.getByRole("checkbox", { name: "10 · STUDENTI" }).check();
  const add = sidePanel(page).locator('[data-field="allowed-add-s1-Fa0-24"]');
  await add.fill("300-302");
  await add.press("Enter");
  await expect(ports.getByRole("checkbox", { name: "301 · non configurata" })).toBeChecked();
  await add.fill("10,,20");
  await add.press("Enter");
  await expect(ports.getByRole("alert")).toContainText("Elenco di VLAN non valido");

  // Access nella VLAN 10: un passo solo, e la configurazione di trunk resta, memorizzata.
  await portChoice(page, "Fa0/24").selectOption("10");
  const kept = section(page, "Porte").getByRole("button", { name: /memorizzati per il trunk/ });
  await expect(kept).toHaveText("memorizzati per il trunk: nativa 1 · VLAN 10,300-302");
  // I dettagli erano aperti, e restano aperti.
  await expect(kept).toHaveAttribute("aria-expanded", "true");
  await expect(ports.getByText("Memorizzati per il trunk: valgono quando la porta torna trunk.")).toBeVisible();
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(portChoice(page, "Fa0/24")).toHaveValue("trunk");
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 900, height: 700 },
]) {
  test(`a ${size.width}×${size.height} uno switch da 24 porte con un trunk aperto resta nel pannello, anche in presentazione`, async ({ page }) => {
    await page.setViewportSize(size);
    await openApp(page);
    await openNetwork(page, "trunk.netsim.json", twoSwitchesFile(23));
    await device(page, "SW1").click();
    await createVlan(page, "10", "UN-NOME-LUNGO-DA-TRENTADUE-CARAT");
    await portChoice(page, "Fa0/24").selectOption("trunk");
    await trunkSummary(page).click();
    await section(page, "Porte").getByRole("radio", { name: "Solo queste" }).check();
    // Un elenco lungo: il riepilogo va a capo tra un numero e l'altro, mai
    // dentro un numero o un intervallo (L2-2E).
    await section(page, "Porte").getByRole("checkbox", { name: "1 · default" }).uncheck();
    const add = sidePanel(page).locator('[data-field="allowed-add-s1-Fa0-24"]');
    await add.fill("100-110,200,300,400,500,600,700,800,900");
    await add.press("Enter");
    await expectWholeItems(page);
    await expectFits(page);

    await page.getByRole("button", { name: "Presenta" }).click();
    await device(page, "SW1").click();
    await expectWholeItems(page);
    await expectFits(page);
  });
}

// Ogni numero o intervallo del riepilogo sta su una riga sola.
async function expectWholeItems(page: Page): Promise<void> {
  const items = trunkSummary(page).locator(".whole");
  await expect(items).toHaveCount(10); // 10, 100-110, 200, 300 … 900
  const heights = await items.evaluateAll((spans) => spans.map((span) => span.getClientRects().length));
  expect(heights.every((rects) => rects === 1)).toBe(true);
}

// Il pannello non scorre di lato, e l'elenco del modo, il riepilogo, il
// campo della nativa e le caselle ci stanno dentro.
async function expectFits(page: Page): Promise<void> {
  const panel = sidePanel(page);
  expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  const box = (await panel.boundingBox())!;
  const controls = [portChoice(page, "Fa0/24"), trunkSummary(page), panel.locator('[data-field="native-s1-Fa0-24"]')];
  const firstBox = section(page, "Porte").getByRole("checkbox").first();
  if ((await firstBox.count()) > 0) controls.push(firstBox);
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    const own = (await control.boundingBox())!;
    expect(own.x).toBeGreaterThanOrEqual(box.x);
    expect(own.x + own.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  expect((await portChoice(page, "Fa0/24").boundingBox())!.height).toBeGreaterThanOrEqual(28);
}
