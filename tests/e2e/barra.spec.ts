// La barra in alto: i menu Progetto e Visualizza, con il mouse e con la
// tastiera, i pulsanti sempre a portata di mano, il tema, la presentazione,
// gli schermi stretti.

import { expect, test } from "@playwright/test";
import { device, drawing, exampleFile, moreAction, openApp, openNetwork } from "./helpers";

test("il menu Progetto si usa con la tastiera, e si chiude con Esc o con un clic fuori", async ({ page }) => {
  await openApp(page);
  const project = page.getByRole("button", { name: "Progetto" });

  // Invio apre il menu e porta il fuoco sulla prima voce.
  await project.focus();
  await page.keyboard.press("Enter");
  await expect(project).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem", { name: "Nuova rete" })).toBeFocused();

  // Le frecce scorrono le voci; Salva con nome è disabilitato sul foglio
  // vuoto, e viene saltato. Fine va all'ultima voce, Home alla prima.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Apri rete…" })).toBeFocused();
  await expect(page.getByRole("menuitem", { name: "Salva con nome…" })).toBeDisabled();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemcheckbox", { name: /tabelle ARP e MAC/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem", { name: "Nuova rete" })).toBeFocused();

  // Esc chiude e riporta il fuoco sul pulsante.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(project).toBeFocused();

  // Un clic fuori dal menu lo chiude.
  await project.click();
  await expect(page.getByRole("menu")).toBeVisible();
  // Un punto del disegno lontano dal menu, che con Esporta immagine è più alto.
  await drawing(page).click({ position: { x: 700, y: 450 } });
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("Visualizza cambia subito ciò che è scritto sul disegno, e resta aperto", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  const mac = drawing(page).getByText("02:00:00:00:00:01");
  await expect(mac).toHaveCount(0);

  await page.getByRole("button", { name: "Visualizza" }).click();
  const macOption = page.getByRole("menuitemcheckbox", { name: "Indirizzi MAC" });
  await expect(macOption).toHaveAttribute("aria-checked", "false");
  await macOption.click();
  await expect(macOption).toHaveAttribute("aria-checked", "true");
  await expect(mac).not.toHaveCount(0);

  // Il menu resta aperto: si possono cambiare più opzioni di seguito.
  const ip = page.getByRole("menuitemcheckbox", { name: "Indirizzi IP" });
  await expect(ip).toHaveAttribute("aria-checked", "true");
  await ip.click();
  await expect(drawing(page).getByText("192.168.1.10/24")).toHaveCount(0);
  const grid = page.getByRole("menuitemcheckbox", { name: /Griglia magnetica/ });
  await grid.click();
  await expect(grid).toHaveAttribute("aria-checked", "true");
});

test("Salva, Annulla e Ripristina sono attivi solo quando servono, e le scorciatoie restano", async ({ page }) => {
  await openApp(page);
  const save = page.getByRole("button", { name: "Salva", exact: true });
  const undo = page.getByRole("button", { name: "Annulla" });
  const redo = page.getByRole("button", { name: "Ripristina" });
  await expect(save).toBeDisabled();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await expect(save).toBeEnabled();
  await device(page, "PC1").click();
  await (await moreAction(page, "Duplica")).click();
  await expect(page.locator("g.device")).toHaveCount(5);
  await expect(page.getByText("Da salvare")).toBeVisible();
  await expect(undo).toBeEnabled();

  // Ctrl+Z annulla, Ctrl+Maiusc+Z ripristina, come prima.
  await drawing(page).click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Control+z");
  await expect(page.locator("g.device")).toHaveCount(4);
  await expect(redo).toBeEnabled();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("g.device")).toHaveCount(5);

  // Ctrl+S salva: senza la finestra di Chrome, il file viene scaricato.
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  await download;
  await expect(page.getByText("Da salvare")).toHaveCount(0);
});

test("il tema si cambia dal menu Visualizza, e la casella dice qual è", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  await page.getByRole("button", { name: "Visualizza" }).click();
  const dark = page.getByRole("menuitemcheckbox", { name: /Tema scuro/ });
  await expect(dark).toHaveAttribute("aria-checked", "false");
  await dark.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(dark).toHaveAttribute("aria-checked", "true");
  await dark.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("un nome di file lungo si accorcia nella barra, e si legge per intero nel menu Progetto", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  const name = "esercitazione-routing-statico-classe-quarta";
  await openNetwork(page, `${name}.netsim.json`, exampleFile("lan-switch"));
  const file = page.locator("header .file");
  await expect(file).toHaveText(name);
  // Accorciato: il testo non sta nella sua larghezza.
  expect(await file.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(file).toHaveAttribute("title", name);

  await page.getByRole("button", { name: "Progetto" }).click();
  await expect(page.getByRole("menu")).toContainText(`${name}.netsim.json`);
  await expect(page.getByRole("menu")).toContainText("Tutto salvato");
  // L'intestazione non si sceglie: il fuoco parte dalla prima voce.
  await expect(page.getByRole("menuitem", { name: "Nuova rete" })).toBeFocused();
});

test("in presentazione restano solo ingrandimento, tema ed Esci", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await page.getByRole("button", { name: "Presenta" }).click();

  for (const name of ["Progetto", "Visualizza", "Annulla", "Ripristina"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "Salva", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ingrandisci testo e disegno" })).toBeVisible();
  // Senza il menu Visualizza, il tema resta un pulsante a sé.
  await page.getByRole("button", { name: /Passa al tema/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page.getByRole("button", { name: "Progetto" })).toBeVisible();
});

test("a 1024×768 tutti i comandi della barra stanno nello schermo, senza scorrimento orizzontale", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  await openNetwork(page, "una-rete-dal-nome-molto-lungo.netsim.json", exampleFile("tre-reti-due-router"));
  await device(page, "PC1").click();
  await (await moreAction(page, "Duplica")).click();

  for (const control of [
    page.getByRole("button", { name: "Progetto" }),
    page.getByRole("button", { name: "Salva", exact: true }),
    page.getByRole("button", { name: "Annulla" }),
    page.getByRole("button", { name: "Ripristina" }),
    page.getByRole("button", { name: "Visualizza" }),
    page.getByRole("button", { name: "Presenta" }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1024);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
});
