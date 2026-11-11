// La fascia in basso (D-132): il terminale che non riporta in fondo chi è
// risalito a leggere, il comando scritto che si distingue dall'output, le
// schede da tastiera, i nomi lunghi, il bordo per cambiarne l'altezza, e
// il registro degli eventi che non si fa coprire dal suo pulsante.

import { expect, test, type Page } from "@playwright/test";
import {
  action,
  device,
  exampleFile,
  fillField,
  openApp,
  openNetwork,
  moreAction,
  presentationZoom,
  presentRouterWithTerminal,
  typeCommand,
} from "./helpers";

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

test("B-1: un ping dal terminale mentre un ping della barretta dello stesso PC aspetta l'ARP mostra il suo esito (D-133)", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  await openNetwork(page, "lan.netsim.json", exampleFile("lan-switch"));
  // Ping dalla barretta da PC1 a PC2, Avvia, e Pausa dopo circa tre secondi.
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: /^Pausa/ }).click();
  // La risposta ARP non è ancora tornata: è proprio la situazione del collaudo.
  await expect(page.locator("aside").last().getByRole("region", { name: "Tabella ARP" })).toContainText("Vuota.");

  // Il ping del terminale di PC1, che aspetta la stessa risposta ARP.
  await action(page, "Apri il terminale di PC1").click();
  await typeCommand(page, "ping -n 1 192.168.1.11");
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(screen(page)).toContainText("Ping statistics", { timeout: 60_000 });
  await expect(screen(page)).toContainText(/Reply from 192\.168\.1\.11: bytes=32 time=\d+ms TTL=128/);
  await expect(screen(page)).toContainText("Received = 1, Lost = 0");
  // Finito il ping, la riga di comando torna.
  await expect(prompt(page)).toBeVisible();
});

test.describe("in presentazione la fascia lascia spazio al disegno (R-1, D-134)", () => {
  type Box = { x: number; y: number; width: number; height: number };
  const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  async function space(page: Page) {
    const canvas = (await page.locator(".canvas").boundingBox())!;
    const simulation = (await page.getByRole("toolbar", { name: "Comandi della simulazione" }).boundingBox())!;
    const zoom = (await page.getByRole("group", { name: "Inquadratura" }).boundingBox())!;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth + (document.documentElement.scrollHeight - innerHeight));
    return { canvas, simulation, zoom, overflow };
  }

  const zoomTo = presentationZoom;

  test("lo scenario R-1: a 1366×768 al 200% il disegno conserva rete, barra della simulazione e zoom", async ({ page }) => {
    await presentRouterWithTerminal(page, 1366, 768);
    await zoomTo(page, 200);
    const { canvas, simulation, zoom, overflow } = await space(page);
    // Prima erano circa 210 pixel: ora almeno il 45% della finestra, e lo
    // spazio per i comandi del disegno più 120 pixel di rete.
    expect(canvas.height).toBeGreaterThanOrEqual((72 + 54) * 2 + 120 - 4);
    expect(canvas.height).toBeGreaterThanOrEqual(768 * 0.45);
    // La barra della simulazione è tutta nel disegno, e non copre lo zoom.
    expect(simulation.y + simulation.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
    expect(overlap(simulation, zoom)).toBe(false);
    expect(overflow).toBe(0);
    // I dispositivi si vedono, dentro il disegno.
    const r1 = (await device(page, "R1").boundingBox())!;
    expect(r1.y).toBeGreaterThanOrEqual(canvas.y);
    expect(r1.y + r1.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    // Il terminale resta utilizzabile.
    await page.getByLabel(/Riga di comando/).fill("show ip route");
    await page.getByLabel(/Riga di comando/).press("Enter");
    await expect(page.locator(".screen")).toContainText("192.168.1.0");
  });

  test("il limite segue l'ingrandimento, la tastiera lo rispetta, e il valore accessibile è l'altezza vera", async ({ page }) => {
    await presentRouterWithTerminal(page, 1366, 768);
    await zoomTo(page, 200);
    const edge = page.getByRole("separator", { name: /Altezza della fascia/ });
    const max = Number(await edge.getAttribute("aria-valuemax"));
    await edge.focus();
    await page.keyboard.press("End");
    await expect(edge).toHaveAttribute("aria-valuenow", String(max));
    // Il valore accessibile è l'altezza applicata, per l'ingrandimento.
    const body = (await page.locator("footer .body").boundingBox())!;
    expect(Math.abs(body.height - max * 2)).toBeLessThan(2);
    await page.keyboard.press("ArrowUp");
    await expect(edge).toHaveAttribute("aria-valuenow", String(max));
    // Scendendo di ingrandimento il limite si allarga.
    await zoomTo(page, 140);
    expect(Number(await edge.getAttribute("aria-valuemax"))).toBeGreaterThan(max);
  });

  test("uscendo dalla presentazione torna l'altezza scelta prima", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page);
    await openNetwork(page, "r.netsim.json", exampleFile("tre-reti-due-router"));
    await device(page, "R1").click();
    await action(page, "Apri il terminale di R1").click();
    const edge = page.getByRole("separator", { name: /Altezza della fascia/ });
    await edge.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowUp");
    await expect(edge).toHaveAttribute("aria-valuenow", "270");

    await page.getByRole("button", { name: "Presenta" }).click();
    await page.keyboard.press("t");
    await zoomTo(page, 200);
    const limited = Number(await page.getByRole("separator", { name: /Altezza della fascia/ }).getAttribute("aria-valuenow"));
    expect(limited).toBeLessThan(270);
    // Un ridimensionamento in presentazione non sostituisce la scelta di prima.
    await page.getByRole("separator", { name: /Altezza della fascia/ }).focus();
    await page.keyboard.press("Home");
    await page.getByRole("button", { name: "Esci" }).click();
    await expect(page.getByRole("separator", { name: /Altezza della fascia/ })).toHaveAttribute("aria-valuenow", "270");
  });

  for (const [width, height] of [[1920, 1080], [1600, 900], [1366, 768], [1280, 800], [1024, 768], [900, 700]] as const) {
    test(`a ${width}×${height}, da 100% a 200%: barra della simulazione e zoom nel disegno, nessuno scorrimento`, async ({ page }) => {
      await presentRouterWithTerminal(page, width, height);
      for (const percent of [100, 140, 180, 200]) {
        await zoomTo(page, percent);
        const { canvas, simulation, zoom, overflow } = await space(page);
        expect(overflow, `${percent}%`).toBe(0);
        expect(simulation.y + simulation.height, `${percent}%`).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
        expect(overlap(simulation, zoom), `${percent}%`).toBe(false);
        expect(canvas.height, `${percent}%`).toBeGreaterThanOrEqual(Math.min(height * 0.45, (72 + 54) * (percent / 100) + 120) - 4);
      }
    });
  }
});

test.describe("la scheda Eventi dice quanti esiti nuovi ci sono dei ping dalla barretta (U-1, D-136)", () => {
  const eventsTab = (page: Page) => page.getByRole("tab", { name: /^Eventi/ });
  const stripBody = (page: Page) => page.locator("#strip-panel");
  const simulation = (page: Page) => page.getByRole("toolbar", { name: "Comandi della simulazione" });

  async function pingFromBar(page: Page, from: string, to: string) {
    await device(page, from).click();
    await action(page, `Ping da ${from}`).click();
    await device(page, to).click();
  }

  // Avvia la simulazione a 2×: da lì in poi il tempo scorre, e ogni ping
  // lanciato arriva al suo esito da sé (il tempo reale resta in ascolto).
  async function startClock(page: Page) {
    await simulation(page).getByRole("button", { name: "Avvia" }).click();
    const speed = simulation(page).getByRole("button", { name: /^Velocità/ });
    while (!(await speed.getAttribute("aria-label"))!.startsWith("Velocità: 2×")) await speed.click();
  }
  const LONG = { timeout: 60_000 };

  async function openLan(page: Page) {
    await openApp(page);
    await openNetwork(page, "lan.netsim.json", exampleFile("lan-switch"));
    await expect(stripBody(page)).toHaveCount(0);
  }

  test("con la fascia chiusa: nulla finché il ping è in attesa, poi «1 nuovo»; la fascia non si apre da sola", async ({ page }) => {
    await openLan(page);
    await pingFromBar(page, "PC1", "PC2");
    // Partito ma fermo: nessun esito ancora, nessuna segnalazione.
    await expect(eventsTab(page)).toHaveText("Eventi");
    // Un passo: la richiesta ARP è in viaggio, ancora nessun esito.
    await simulation(page).getByRole("button", { name: "Passo" }).click();
    await expect(page.getByText("tick 1", { exact: true })).toBeVisible();
    await expect(eventsTab(page)).toHaveText("Eventi");
    // Ripresa la simulazione, l'esito arriva.
    await startClock(page);
    await expect(eventsTab(page)).toHaveText("Eventi · 1 nuovo", LONG);
    await expect(stripBody(page)).toHaveCount(0);
    // La rete si usa come prima: un altro dispositivo si seleziona.
    await device(page, "PC3").click();
    await expect(action(page, "Ping da PC3")).toBeVisible();
  });

  test("aprire la scheda Eventi azzera l'indicatore; chiudere e riaprire la fascia non lo fa tornare", async ({ page }) => {
    await openLan(page);
    await startClock(page);
    await pingFromBar(page, "PC1", "PC2");
    await expect(eventsTab(page)).toHaveText("Eventi · 1 nuovo", LONG);
    await eventsTab(page).click();
    await expect(stripBody(page)).toBeVisible();
    await expect(eventsTab(page)).toHaveText("Eventi");
    // L'esito c'è, nel registro.
    await expect(stripBody(page)).toContainText("ping: risposta da 192.168.1.11");
    await page.getByRole("button", { name: "Chiudi la fascia in basso" }).click();
    await expect(eventsTab(page)).toHaveText("Eventi");
    await page.getByRole("button", { name: "Apri la fascia in basso" }).click();
    await expect(eventsTab(page)).toHaveText("Eventi");
  });

  test("due ping distinti con la fascia chiusa: «2 nuovi»; un timeout conta come esito", async ({ page }) => {
    await openLan(page);
    await startClock(page);
    await pingFromBar(page, "PC1", "PC2");
    await pingFromBar(page, "PC1", "PC3");
    await expect(eventsTab(page)).toHaveText("Eventi · 2 nuovi", LONG);
    // Un terzo, verso PC2 spento: la richiesta scade, ed è un esito nuovo come gli altri.
    await device(page, "PC2").click();
    await (await moreAction(page, "Spegni")).click();
    await pingFromBar(page, "PC1", "PC2");
    await expect(eventsTab(page)).toHaveText("Eventi · 3 nuovi", LONG);
    await eventsTab(page).click();
    await expect(stripBody(page)).toContainText("ping: richiesta scaduta");
  });

  test("con la scheda Eventi già in vista l'indicatore non compare; il ping dal terminale non lo accende", async ({ page }) => {
    await openLan(page);
    await eventsTab(page).click();
    await startClock(page);
    await pingFromBar(page, "PC1", "PC2");
    await expect(stripBody(page)).toContainText("ping: risposta da 192.168.1.11", LONG);
    await expect(eventsTab(page)).toHaveText("Eventi");
    // Dal terminale: l'esito si legge lì, e la scheda Eventi resta muta.
    await device(page, "PC1").click();
    await action(page, "Apri il terminale di PC1").click();
    await typeCommand(page, "ping -n 1 192.168.1.12");
    await expect(page.locator(".screen")).toContainText("Packets: Sent = 1", LONG);
    await expect(eventsTab(page)).toHaveText("Eventi");
  });

  test("cambiare i filtri non fa tornare gli esiti visti; i due ping uguali hanno nomi distinti e ciascuno i suoi eventi", async ({ page }) => {
    await openLan(page);
    await startClock(page);
    await pingFromBar(page, "PC1", "PC2");
    await expect(eventsTab(page)).toHaveText("Eventi · 1 nuovo", LONG);
    await pingFromBar(page, "PC1", "PC2");
    await expect(eventsTab(page)).toHaveText("Eventi · 2 nuovi", LONG);
    await eventsTab(page).click();
    const conversation = page.locator("#events-conversation");
    await expect(conversation.locator("option")).toHaveText(["tutte", "#1 · ping PC1 → 192.168.1.11", "#2 · ping PC1 → 192.168.1.11"]);
    // Il primo ha l'ARP, il secondo no: il MAC era già noto.
    const rows = stripBody(page).locator("tbody tr");
    await conversation.selectOption({ label: "#1 · ping PC1 → 192.168.1.11" });
    await expect(rows.filter({ hasText: "ARP" }).first()).toBeVisible();
    await conversation.selectOption({ label: "#2 · ping PC1 → 192.168.1.11" });
    await expect(rows.filter({ hasText: "ARP" })).toHaveCount(0);
    await expect(rows.filter({ hasText: "ICMP" }).first()).toBeVisible();
    // I filtri dei protocolli e il ritorno a tutte: nessun indicatore.
    await page.getByRole("button", { name: "ARP", exact: true }).click();
    await page.getByRole("button", { name: "ICMP", exact: true }).click();
    await conversation.selectOption({ label: "tutte" });
    await page.getByRole("button", { name: "ARP", exact: true }).click();
    await page.getByRole("button", { name: "ICMP", exact: true }).click();
    await page.getByRole("button", { name: "Chiudi la fascia in basso" }).click();
    await expect(eventsTab(page)).toHaveText("Eventi");
  });

  test("Ricomincia e l'apertura di un'altra rete dimenticano gli esiti non visti", async ({ page }) => {
    await openLan(page);
    await startClock(page);
    await pingFromBar(page, "PC1", "PC2");
    await expect(eventsTab(page)).toHaveText("Eventi · 1 nuovo", LONG);
    await simulation(page).getByRole("button", { name: "Ricomincia" }).click();
    await expect(eventsTab(page)).toHaveText("Eventi");

    await startClock(page);
    await pingFromBar(page, "PC1", "PC2");
    await expect(eventsTab(page)).toHaveText("Eventi · 1 nuovo", LONG);
    // Un ping non modifica la rete: si apre l'altra senza conferma.
    await openNetwork(page, "router.netsim.json", exampleFile("due-lan-router"));
    await expect(eventsTab(page)).toHaveText("Eventi");
  });

  test("da tastiera: le frecce tra le schede funzionano come prima, e arrivare su Eventi nella fascia aperta azzera", async ({ page }) => {
    await openLan(page);
    await device(page, "PC1").click();
    await action(page, "Apri il terminale di PC1").click();
    await startClock(page);
    await pingFromBar(page, "PC1", "PC2");
    // La fascia è aperta sul terminale: Eventi non è in vista, e segnala.
    await expect(eventsTab(page)).toHaveText("Eventi · 1 nuovo", LONG);
    await page.getByRole("tab", { name: /Terminale · PC1/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(eventsTab(page)).toBeFocused();
    await expect(eventsTab(page)).toHaveAttribute("aria-selected", "true");
    await expect(eventsTab(page)).toHaveText("Eventi");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: /Terminale · PC1/ })).toBeFocused();
  });

  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 800], [1024, 768], [900, 700]] as const) {
    test(`a ${width}×${height}, nell'editor e in presentazione al 140, 180 e 200%: l'indicatore sta nella riga, con Eventi e la freccia`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLan(page);
      // Tre terminali aperti, per riempire la riga delle schede.
      for (const name of ["PC1", "PC2", "PC3"]) {
        await device(page, name).click();
        await action(page, `Apri il terminale di ${name}`).click();
      }
      await page.getByRole("button", { name: "Chiudi la fascia in basso" }).click();
      await startClock(page);
      await pingFromBar(page, "PC1", "PC2");
      const check = async (note: string) => {
        await expect(eventsTab(page), note).toHaveText("Eventi · 1 nuovo", LONG);
        const tab = (await eventsTab(page).boundingBox())!;
        const fold = (await page.getByRole("button", { name: "Apri la fascia in basso" }).boundingBox())!;
        expect(tab.x + tab.width, note).toBeLessThanOrEqual(fold.x + 1);
        expect(fold.x + fold.width, note).toBeLessThanOrEqual(width + 1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(overflow, note).toBe(0);
      };
      await check("editor");
      await page.getByRole("button", { name: "Presenta" }).click();
      for (const percent of [140, 180, 200]) {
        await presentationZoom(page, percent);
        await check(`${percent}%`);
      }
    });
  }
});
