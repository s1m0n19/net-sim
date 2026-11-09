// Coerenza visiva e accessibilità (D-115): la scala dei caratteri, i colori
// dei due temi applicati davvero, le icone dei comandi della simulazione
// con la loro scritta, i pulsanti accesi che non si riconoscono dal solo
// colore, il fuoco da tastiera e gli stati spenti.

import { expect, test, type Page } from "@playwright/test";
import { action, device, exampleFile, openApp, openNetwork } from "./helpers";

const simulationBar = (page: Page) => page.getByRole("toolbar", { name: "Comandi della simulazione" });

// Il rapporto di contrasto WCAG tra due colori "rgb(r, g, b)" calcolati.
function contrast(a: string, b: string): number {
  const lum = (color: string) => {
    const [r, g, bl] = (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme === "light" ? "chiaro" : "scuro"}`, () => {
    test.use({ colorScheme: scheme });

    test("nessun testo dell'interfaccia sotto i 12 px, e i colori ai contrasti richiesti", async ({ page }) => {
      await openApp(page);
      await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
      await device(page, "PC1").click();
      await action(page, "Ping da PC1").click();
      await device(page, "PC2").click();
      await page.getByRole("button", { name: /Passo/ }).click();
      await page.getByRole("tab", { name: "Eventi" }).click();
      await expect(page.locator("footer tbody tr")).not.toHaveCount(0);
      await device(page, "SW1").click();

      // Ogni testo visibile fuori dal disegno: almeno 12 px.
      const small = await page.evaluate(() => {
        const found: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const element = node.parentElement!;
          if (node.textContent!.trim() === "" || element.closest("svg") !== null) continue;
          if (element.getClientRects().length === 0 || element.closest(".sr-only") !== null) continue;
          const size = parseFloat(getComputedStyle(element).fontSize);
          if (size < 12) found.push(`${node.textContent!.trim().slice(0, 20)} (${size}px)`);
        }
        return found;
      });
      expect(small).toEqual([]);

      // I titoli delle sezioni del pannello a 12 px, il titolo a 16, il testo a 13.
      const sizes = await page.evaluate(() => ({
        body: getComputedStyle(document.body).fontSize,
        section: getComputedStyle(document.querySelector("aside section h3")!).fontSize,
        title: getComputedStyle(document.querySelector("aside header h2")!).fontSize,
      }));
      expect(sizes).toEqual({ body: "13px", section: "12px", title: "16px" });

      // La sigla ARP degli eventi e il bordo dei campi, come li disegna il browser.
      const colors = await page.evaluate(() => {
        const tag = document.querySelector("footer .tag .arp")!;
        const input = document.querySelector('aside [data-field="name"]')!;
        const panel = document.querySelector("aside:not(.closed)")!;
        return {
          tagText: getComputedStyle(tag).color,
          tagBack: getComputedStyle(tag).backgroundColor,
          border: getComputedStyle(input).borderTopColor,
          panel: getComputedStyle(panel).backgroundColor,
        };
      });
      expect(contrast(colors.tagText, colors.tagBack)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.border, colors.panel)).toBeGreaterThanOrEqual(3);
    });
  });
}

test("i comandi della simulazione hanno l'icona e la scritta, e il nome è la scritta", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  const bar = simulationBar(page);
  for (const name of ["Ricomincia", "Avvia", "Passo"]) {
    const button = bar.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(button).toHaveText(name);
  }
  await bar.getByRole("button", { name: "Avvia", exact: true }).click();
  const pauseButton = bar.getByRole("button", { name: "Pausa", exact: true });
  await expect(pauseButton.locator("svg")).toBeVisible();
  await pauseButton.click();
});

test("un filtro acceso si riconosce anche dalla spunta, e il suo nome resta la sigla", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await page.getByRole("tab", { name: "Eventi" }).click();

  const arp = page.getByRole("button", { name: "ARP", exact: true });
  await expect(arp).toHaveAttribute("aria-pressed", "true");
  await expect(arp).toHaveText("✓ARP");
  await arp.click();
  await expect(arp).toHaveAttribute("aria-pressed", "false");
  await expect(arp).toHaveText("ARP");
});

test("il fuoco da tastiera si vede su ogni famiglia di pulsanti, e gli spenti sono attenuati allo stesso modo", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();

  const controls = [
    page.getByRole("button", { name: "Salva", exact: true }), // barra in alto
    page.getByRole("button", { name: "Progetto" }), // pulsante di un menu
    simulationBar(page).getByRole("button", { name: "Avvia", exact: true }), // simulazione
    page.getByRole("button", { name: "Rimpicciolisci" }), // zoom
    page.getByRole("button", { name: "PC", exact: true }), // colonna dei dispositivi
    action(page, "Apri il terminale di PC1"), // barretta
    page.locator("aside section").getByRole("button", { name: "appunta" }), // pannello
    page.getByRole("button", { name: "Chiudi il pannello laterale" }), // apri e chiudi
  ];
  // Un Tab: da qui il fuoco arriva "da tastiera", anche per WebKit, che
  // non lo deduce da un tasto qualsiasi.
  await page.keyboard.press("Tab");
  for (const control of controls) {
    await control.focus();
    const outline = await control.evaluate((el) => {
      const style = getComputedStyle(el);
      return { visible: el.matches(":focus-visible"), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.visible).toBe(true);
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  }

  // Spenti allo stesso modo: Passo senza nulla in programma, Annulla senza modifiche.
  const passo = simulationBar(page).getByRole("button", { name: "Passo", exact: true });
  const annulla = page.getByRole("button", { name: "Annulla", exact: true });
  await expect(passo).toBeDisabled();
  await expect(annulla).toBeDisabled();
  const opacities = await Promise.all([passo, annulla].map((b) => b.evaluate((el) => getComputedStyle(el).opacity)));
  expect(opacities).toEqual(["0.45", "0.45"]);
});
