// Le VLAN dal pannello dello switch (D-145): il percorso di uno studente,
// la tastiera, e il pannello in finestre di grandezze diverse.

import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { action, device, fillField, openApp, openNetwork, sidePanel, terminal, typeCommand } from "./helpers";

// Uno switch a 8 porte con quattro PC non configurati su Fa0/1…Fa0/4; con
// `big`, anche uno switch a 24 porte, scollegato.
function lanFile(big = false): string {
  const pcs = [1, 2, 3, 4].map((n) => ({
    id: `d${n}`,
    kind: "host",
    name: `PC${n}`,
    position: { x: 120 + (n - 1) * 160, y: n % 2 === 0 ? 300 : 340 },
    ports: [{ name: "Fa0", mac: `02:00:00:00:00:0${n}` }],
    ip: null,
    mask: null,
    gateway: null,
  }));
  const switchOf = (id: string, name: string, count: number, x: number) => ({
    id,
    kind: "switch",
    name,
    position: { x, y: 120 },
    ports: Array.from({ length: count }, (_, i) => ({
      name: `Fa0/${i + 1}`,
      mac: `02:00:00:00:${id === "s1" ? "01" : "02"}:${String(i + 1).padStart(2, "0")}`,
    })),
  });
  const devices = [switchOf("s1", "SW1", 8, 360), ...pcs, ...(big ? [switchOf("s2", "SW2", 24, 700)] : [])];
  const links = pcs.map((pc, i) => ({ id: `l${i + 1}`, a: { deviceId: pc.id, portName: "Fa0" }, b: { deviceId: "s1", portName: `Fa0/${i + 1}` } }));
  return JSON.stringify({ format: "net-sim", version: 1, network: { devices, links } });
}

function section(page: Page, title: string): Locator {
  return sidePanel(page).locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function portVlan(page: Page, port: string): Locator {
  return page.getByRole("combobox", { name: `VLAN della porta ${port}` });
}

// Crea una VLAN dal modulo del pannello dello switch selezionato.
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

test("lo studente divide una LAN in due VLAN dal pannello, la prova, la salva e la riapre", async ({ page }) => {
  test.setTimeout(150_000);

  // 1. Uno switch e quattro PC.
  await openApp(page);
  await openNetwork(page, "vlan.netsim.json", lanFile());

  // 5. (prima delle VLAN, come capita in aula) Gli indirizzi dei PC, tutti nella stessa sottorete.
  for (const n of [1, 2, 3, 4]) {
    await device(page, `PC${n}`).click();
    await fillField(page, "ip", `192.168.1.${10 + n}`);
  }

  // 2. VLAN 10 e VLAN 20, dal pannello dello switch.
  await device(page, "SW1").click();
  await createVlan(page, "10", "STUDENTI");
  await createVlan(page, "20", "DOCENTI");
  const vlans = section(page, "VLAN");
  await expect(vlans.locator("li")).toHaveCount(3);
  await expect(vlans.locator("li").first()).toContainText("default");
  await expect(vlans.locator("li").first()).toContainText("predefinita");
  await expect(vlans.getByRole("textbox", { name: "Nome della VLAN 10" })).toHaveValue("STUDENTI");

  // Un numero sbagliato si rifiuta, con il motivo accanto ai campi.
  await createVlan(page, "1002", "");
  await expect(vlans.getByRole("alert")).toContainText("Numero di VLAN non valido: 1002");

  // 3. e 4. Due porte nella VLAN 10, due nella 20.
  await portVlan(page, "Fa0/1").selectOption("10");
  await portVlan(page, "Fa0/2").selectOption("10");
  await portVlan(page, "Fa0/3").selectOption("20");
  await portVlan(page, "Fa0/4").selectOption("20");
  await expect(vlans.locator("li").nth(1)).toContainText("2 porte: Fa0/1, Fa0/2");
  await expect(vlans.locator("li").nth(2)).toContainText("2 porte: Fa0/3, Fa0/4");

  // 6. e 7. PC1 raggiunge PC2, nella sua VLAN, ma non PC3.
  await device(page, "PC1").click();
  await action(page, "Apri il terminale di PC1").click();
  await typeCommand(page, "ping -n 1 192.168.1.12");
  await runFast(page);
  await expect(terminal(page)).toContainText("Reply from 192.168.1.12", { timeout: 40_000 });
  await typeCommand(page, "ping -n 1 192.168.1.13");
  await expect(terminal(page)).toContainText("Destination host unreachable", { timeout: 40_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();

  // 8. La tabella MAC dice la VLAN di ogni riga.
  await device(page, "SW1").click();
  const mac = section(page, "Tabella MAC");
  await expect(mac.locator("thead th")).toHaveText(["VLAN", "Indirizzo MAC", "Porta"]);
  await expect(mac.locator("tbody tr").first()).toHaveText(/^10\s*02:00:00:00:00:01\s*Fa0\/1$/);
  // PC3 non ha mai sentito l'ARP di PC1: lo switch non ha imparato il suo MAC.
  await expect(mac.locator("tbody tr").filter({ hasText: "02:00:00:00:00:03" })).toHaveCount(0);

  // 9. Si salva: il file è di versione 3.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  const saved = readFileSync(await (await download).path(), "utf-8");
  expect(JSON.parse(saved).version).toBe(3);

  // 10. e 11. Riaperto, ha le stesse VLAN e le stesse porte.
  await openNetwork(page, "vlan.netsim.json", lanFile());
  await device(page, "SW1").click();
  await expect(section(page, "VLAN").locator("li")).toHaveCount(1);
  await openNetwork(page, "vlan.netsim.json", saved);
  await device(page, "SW1").click();
  await expect(section(page, "VLAN").getByRole("textbox", { name: "Nome della VLAN 20" })).toHaveValue("DOCENTI");
  await expect(portVlan(page, "Fa0/1")).toHaveValue("10");
  await expect(portVlan(page, "Fa0/4")).toHaveValue("20");
});

test("eliminare una VLAN lascia le porte inattive, e Annulla la rimette; tutto da tastiera", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "vlan.netsim.json", lanFile());
  await device(page, "SW1").click();
  const vlans = section(page, "VLAN");

  // Il modulo si apre con Invio, i campi si passano con Tab, Invio crea.
  await vlans.getByRole("button", { name: "Nuova VLAN" }).focus();
  await page.keyboard.press("Enter");
  await vlans.locator('[data-field="vlan-id"]').focus();
  await page.keyboard.type("30");
  await page.keyboard.press("Tab");
  await page.keyboard.type("LAB");
  await page.keyboard.press("Enter");
  await expect(vlans.getByRole("textbox", { name: "Nome della VLAN 30" })).toHaveValue("LAB");

  // Il nome si cambia dal suo campo, con Invio.
  const nameField = vlans.getByRole("textbox", { name: "Nome della VLAN 30" });
  await nameField.fill("LABORATORIO");
  await nameField.press("Enter");
  await expect(nameField).toHaveValue("LABORATORIO");

  await portVlan(page, "Fa0/2").selectOption("30");

  // La crocetta si raggiunge e si preme da tastiera.
  await vlans.getByRole("button", { name: "Elimina la VLAN 30" }).focus();
  await page.keyboard.press("Enter");
  const ports = section(page, "Porte");
  await expect(ports.locator("li").nth(1)).toContainText("VLAN 30 · inattiva");
  await expect(portVlan(page, "Fa0/2")).toHaveValue("30");
  await expect(portVlan(page, "Fa0/2").locator("option:checked")).toHaveText("30 · inattiva");

  // Annulla rimette la VLAN, con il suo nome: la porta torna attiva.
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(vlans.getByRole("textbox", { name: "Nome della VLAN 30" })).toHaveValue("LABORATORIO");
  await expect(ports.locator("li").nth(1)).not.toContainText("inattiva");
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 900, height: 700 },
]) {
  test(`a ${size.width}×${size.height} il pannello di uno switch da 24 porte resta nella sua larghezza, anche in presentazione`, async ({ page }) => {
    await page.setViewportSize(size);
    await openApp(page);
    await openNetwork(page, "vlan.netsim.json", lanFile(true));
    await device(page, "SW2").click();
    await createVlan(page, "10", "UN-NOME-LUNGO-DA-TRENTADUE-CARAT");

    // Senza cavi nessuna porta conta di più: si vedono tutte e 24.
    await expect(section(page, "Porte").locator("li")).toHaveCount(24);
    await expectFits(page);

    // Con una porta configurata, si vedono le porte che contano, e un pulsante mostra le altre.
    await portVlan(page, "Fa0/5").selectOption("10");
    await expect(section(page, "Porte").locator("li")).toHaveCount(1);
    await section(page, "Porte").getByRole("button", { name: "Mostra tutte le porte (24)" }).click();
    await expect(section(page, "Porte").locator("li")).toHaveCount(24);
    await expectFits(page);

    await page.getByRole("button", { name: "Presenta" }).click();
    await device(page, "SW2").click();
    await expectFits(page);
  });
}

// Il pannello non scorre di lato, e i controlli delle VLAN ci stanno
// dentro. L'elenco della VLAN di una porta, che si tocca di continuo, è
// alto almeno 28 pixel; il pulsante Nuova VLAN ha la misura degli altri
// pulsanti del pannello, come Nuova rotta statica.
async function expectFits(page: Page): Promise<void> {
  const panel = sidePanel(page);
  expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  const box = (await panel.boundingBox())!;
  const select = portVlan(page, "Fa0/5");
  for (const control of [select, section(page, "VLAN").getByRole("button", { name: "Nuova VLAN" })]) {
    await control.scrollIntoViewIfNeeded();
    const own = (await control.boundingBox())!;
    expect(own.x).toBeGreaterThanOrEqual(box.x);
    expect(own.x + own.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(28);
}
