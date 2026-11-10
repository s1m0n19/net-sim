// I segnali dell'interfaccia (D-113): lo stato della simulazione, le
// istruzioni dell'operazione in corso, le operazioni rifiutate, l'avviso
// della tempesta, e la scheda Eventi. Si guarda che cosa dicono e come
// convivono; mai l'esito del traffico, che l'app non commenta (SIM-8).

import { expect, test, type Locator, type Page } from "@playwright/test";
import { action, clickDrawing, device, exampleFile, openApp, openNetwork, typeCommand } from "./helpers";

const simulationBar = (page: Page) => page.getByRole("toolbar", { name: "Comandi della simulazione" });
// La scritta dello stato, dentro la barra.
const stateOf = (page: Page) => simulationBar(page).locator(".state");
const instructions = (page: Page) => page.getByRole("status").filter({ has: page.locator(".message") });
const eventsList = (page: Page) => page.locator("footer .list");

test("lo stato dice se la simulazione è ferma, in esecuzione o sospesa", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await expect(stateOf(page)).toHaveText("Ferma");

  // Avviata senza nulla in programma: in esecuzione, in ascolto.
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(stateOf(page)).toHaveText("In esecuzione");
  await page.waitForTimeout(500);
  await expect(stateOf(page)).toHaveText("In esecuzione");
  await page.getByRole("button", { name: /Pausa/ }).click();
  await expect(stateOf(page)).toHaveText("Ferma");

  // Un ping e un Passo: il tempo avanza, la simulazione resta ferma.
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await page.getByRole("button", { name: /Passo/ }).click();
  await expect(simulationBar(page)).toContainText("tick 1");
  await expect(stateOf(page)).toHaveText("Ferma");

  // In esecuzione, poi Ricomincia: tempo a zero e di nuovo ferma.
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(stateOf(page)).toHaveText("In esecuzione");
  await page.getByRole("button", { name: /Ricomincia/ }).click();
  await expect(simulationBar(page)).toContainText("tick 0");
  await expect(stateOf(page)).toHaveText("Ferma");

  // Lo stato non è un annuncio: non cambia a ogni tick per il lettore di schermo.
  await expect(stateOf(page)).not.toHaveAttribute("aria-live");
  await expect(stateOf(page)).not.toHaveAttribute("role");
});

test("la tempesta sospende la simulazione: lo stato e l'avviso, con la sua causa", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "anello-switch.netsim.json", exampleFile("anello-switch"));
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await simulationBar(page).getByRole("button", { name: /Velocità/ }).click(); // 2×
  await page.getByRole("button", { name: /Avvia/ }).click();

  await expect(stateOf(page)).toHaveText("Sospesa", { timeout: 40_000 });
  const storm = page.getByRole("alert").filter({ hasText: "tempesta di broadcast" });
  await expect(storm).toContainText("La causa è un ciclo tra switch");
  await expect(page.getByRole("button", { name: /Avvia/ })).toBeDisabled();

  await page.getByRole("button", { name: /Ricomincia/ }).click();
  await expect(stateOf(page)).toHaveText("Ferma");
  await expect(storm).toHaveCount(0);
});

test("Ping e Collega dicono che cosa fare, ed Esc annulla", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));

  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await expect(instructions(page)).toContainText("Ping da PC1.");
  await expect(instructions(page)).toContainText("Fai clic sul dispositivo di destinazione.");
  await page.keyboard.press("Escape");
  await expect(instructions(page)).toHaveCount(0);
  await expect(action(page, "Ping da PC1")).toHaveAttribute("aria-pressed", "false");

  await action(page, "Collega PC1").click();
  await expect(instructions(page)).toContainText("Cavo da PC1.");
  await page.keyboard.press("Escape");
  await expect(instructions(page)).toHaveCount(0);
  await expect(page.locator("line.wire")).toHaveCount(3);
});

// Le voci della colonna: un nome, come si sceglie, e che cosa dice l'istruzione.
const TOOLS: { name: RegExp; variant?: string; says: string }[] = [
  { name: /^PC$/, says: "PC." },
  { name: /^Server$/, says: "Server." },
  { name: /^Switch/, variant: "Switch a 8 porte", says: "Switch a 8 porte." },
  { name: /^Router/, variant: "Router a 2 interfacce", says: "Router a 2 interfacce." },
  { name: /^Cavo$/, says: "Cavo." },
  { name: /^Riquadro$/, says: "Riquadro." },
  { name: /^Nota$/, says: "Nota." },
];
const palette = (page: Page) => page.locator("aside").first();
const pressedTools = (page: Page) => palette(page).locator('button.tile[aria-pressed="true"]');

test("ogni strumento della colonna si vede attivo, dice che cosa fare e come finire; Esc lo lascia", async ({ page }) => {
  await openApp(page);
  for (const tool of TOOLS) {
    const tile = palette(page).getByRole("button", { name: tool.name });
    await tile.click();
    if (tool.variant !== undefined) await page.getByRole("menuitem", { name: tool.variant }).click();
    // Attivo: premuto per chi usa un lettore di schermo, e a vista con il
    // fondo tinto e la spunta, oltre al colore (D-128).
    await expect(pressedTools(page)).toHaveCount(1);
    const look = await pressedTools(page).evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      tick: getComputedStyle(el, "::after").borderRightWidth,
    }));
    const idle = await palette(page).locator('button.tile[aria-pressed="false"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(look.background).not.toBe(idle);
    expect(look.tick).toBe("2px");
    // Una sola istruzione: il nome dello strumento, il passo e Esc.
    await expect(instructions(page).locator(".message")).toHaveCount(1);
    await expect(instructions(page)).toContainText(tool.says);
    await expect(instructions(page).locator("kbd")).toHaveText("Esc");
    await page.keyboard.press("Escape");
    await expect(pressedTools(page)).toHaveCount(0);
    await expect(instructions(page)).toHaveCount(0);
  }
});

test("tre PC di fila: l'istruzione resta finché lo strumento è attivo", async ({ page }) => {
  await openApp(page);
  await palette(page).getByRole("button", { name: /^PC$/ }).click();
  for (const x of [0.25, 0.5, 0.75]) {
    await clickDrawing(page, x, 0.5);
    await expect(instructions(page)).toContainText("PC.");
  }
  await expect(page.locator("g.device")).toHaveCount(3);
  // Un secondo clic sulla voce la lascia, come Esc.
  await palette(page).getByRole("button", { name: /^PC$/ }).click();
  await expect(pressedTools(page)).toHaveCount(0);
  await expect(instructions(page)).toHaveCount(0);
});

test("lo strumento Cavo dice il passo successivo, e dopo un cavo resta attivo; un cavo impossibile è un rifiuto", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await palette(page).getByRole("button", { name: /^Cavo$/ }).click();
  await expect(instructions(page)).toContainText("Cavo.");
  await expect(instructions(page)).toContainText("Trascina da un dispositivo a un altro");

  // PC1 ha già il suo cavo: verso PC2 non ci sono porte libere.
  await device(page, "PC1").click();
  await expect(instructions(page)).toContainText("Cavo da PC1.");
  await expect(instructions(page)).toContainText("Fai clic sul secondo dispositivo.");
  await device(page, "PC2").click();
  await expect(page.getByRole("alert")).toContainText("PC1 non ha porte libere.");
  await expect(page.locator("line.wire")).toHaveCount(3);
  // Lo strumento resta: l'istruzione torna al primo passo.
  await expect(instructions(page)).toContainText("Cavo.");
  await expect(instructions(page)).not.toContainText("Cavo da");

  // Un cavo che si può fare: un PC nuovo, collegato allo switch.
  await page.keyboard.press("Escape");
  await palette(page).getByRole("button", { name: /^PC$/ }).click();
  await clickDrawing(page, 0.5, 0.85);
  await palette(page).getByRole("button", { name: /^Cavo$/ }).click();
  await device(page, "PC4").click();
  await device(page, "SW1").click();
  await expect(page.locator("line.wire")).toHaveCount(4);
  await expect(instructions(page)).toContainText("Cavo.");
  // Esc a metà annulla il cavo cominciato; un altro Esc lascia lo strumento.
  await device(page, "PC4").click();
  await expect(instructions(page)).toContainText("Cavo da PC4.");
  await page.keyboard.press("Escape");
  await expect(instructions(page)).not.toContainText("Cavo da");
  await expect(instructions(page)).toContainText("Cavo.");
  await page.keyboard.press("Escape");
  await expect(instructions(page)).toHaveCount(0);
  await expect(pressedTools(page)).toHaveCount(0);
});

test("Riquadro e Nota dicono che cosa fare, e restano attivi dopo il primo", async ({ page }) => {
  await openApp(page);
  await palette(page).getByRole("button", { name: /^Riquadro$/ }).click();
  await expect(instructions(page)).toContainText("Trascina sul disegno per disegnarne uno");
  const area = (await page.locator(".canvas").boundingBox())!;
  const start = { x: area.x + area.width * 0.3, y: area.y + area.height * 0.3 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 80, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("g.annotation.box")).toHaveCount(1);
  await expect(instructions(page)).toContainText("Riquadro.");

  await palette(page).getByRole("button", { name: /^Nota$/ }).click();
  await expect(pressedTools(page)).toHaveCount(1);
  await expect(instructions(page).locator(".message")).toHaveCount(1);
  await expect(instructions(page)).toContainText("Fai clic sul disegno per posarne una");
  await clickDrawing(page, 0.6, 0.7);
  await expect(page.locator("g.annotation.note")).toHaveCount(1);
});

test("uno strumento alla volta: un ping in attesa e la voce della colonna si escludono", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await expect(instructions(page)).toContainText("Ping da PC1.");

  // Si sceglie PC nella colonna: il ping in attesa si lascia.
  await palette(page).getByRole("button", { name: /^PC$/ }).click();
  await expect(instructions(page).locator(".message")).toHaveCount(1);
  await expect(instructions(page)).toContainText("PC.");

  // E viceversa: Ping dalla barretta lascia la voce, e un clic sullo
  // sfondo non posa un PC.
  await device(page, "PC2").click();
  await action(page, "Ping da PC2").click();
  await expect(pressedTools(page)).toHaveCount(0);
  await expect(instructions(page).locator(".message")).toHaveCount(1);
  await expect(instructions(page)).toContainText("Ping da PC2.");
  await device(page, "PC3").click();
  await expect(page.locator("g.packet").first()).toBeVisible();
  await expect(instructions(page)).toHaveCount(0);
  await expect(page.locator("g.device")).toHaveCount(4);
});

test("con un terminale aperto gli strumenti funzionano, e Esc li lascia anche dal terminale", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await action(page, "Apri il terminale di PC1").click();
  await typeCommand(page, "ipconfig");
  await palette(page).getByRole("button", { name: /^PC$/ }).click();
  await clickDrawing(page, 0.5, 0.2);
  await expect(page.locator("g.device")).toHaveCount(5);
  await page.getByLabel(/Riga di comando/).click();
  await page.keyboard.press("Escape");
  await expect(pressedTools(page)).toHaveCount(0);
  await expect(instructions(page)).toHaveCount(0);
});

test("entrando in presentazione nessuno strumento resta scelto, nemmeno all'uscita", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await palette(page).getByRole("button", { name: /^Riquadro$/ }).click();
  await page.getByRole("button", { name: "Presenta" }).click();
  await expect(instructions(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(pressedTools(page)).toHaveCount(0);
  await expect(instructions(page)).toHaveCount(0);
});

test("un'operazione rifiutata si distingue dalle istruzioni e non commenta la rete", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));

  // Un ping verso lo switch, che non ha indirizzo: l'interfaccia non lo manda.
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "SW1").click();
  const refused = page.getByRole("alert").filter({ hasText: "SW1 non ha un indirizzo IP a cui fare ping." });
  await expect(refused).toBeVisible();
  // Oltre al colore, la crocetta.
  await expect(refused.locator(".sign")).toHaveText("✕");
  await expect(page.locator("g.packet")).toHaveCount(0);
  // Resta finché non si fa altro: niente avvisi che spariscono da soli.
  await page.waitForTimeout(1500);
  await expect(refused).toBeVisible();
  await device(page, "PC2").click();
  await expect(refused).toHaveCount(0);
});

test("tempesta, rifiuto e istruzione insieme: in quest'ordine, senza coprire i comandi", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "anello-switch.netsim.json", exampleFile("anello-switch"));
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(stateOf(page)).toHaveText("Sospesa", { timeout: 40_000 });

  // A simulazione sospesa si prova a posare un PC: il motore lo rifiuta,
  // e l'istruzione della posa resta.
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.1, 0.9);
  const messages = page.locator(".messages .message");
  await expect(messages).toHaveCount(3);
  await expect(messages.nth(0)).toContainText("tempesta di broadcast");
  await expect(messages.nth(1)).toContainText("La simulazione è sospesa");
  await expect(messages.nth(2)).toContainText("Fai clic sul disegno per posarne uno");

  const bar = (await simulationBar(page).boundingBox())!;
  const zoom = (await page.getByRole("group", { name: "Inquadratura" }).boundingBox())!;
  for (const box of await boxes(messages)) {
    expect(overlap(box, bar)).toBe(false);
    expect(overlap(box, zoom)).toBe(false);
  }
});

test("i filtri della scheda Eventi e il conteggio degli eventi mostrati", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  for (let i = 0; i < 6; i++) await stepAndWait(page);
  await page.getByRole("tab", { name: "Eventi" }).click();

  const count = page.locator("footer .count");
  const total = Number((await count.innerText()).match(/di (\d+)/)![1]);
  expect(total).toBeGreaterThan(0);
  await expect(count).toHaveText(`${total} di ${total} eventi`);
  // Le colonne hanno un nome.
  await expect(eventsList(page).locator("thead th")).toHaveText(["Tick", "Dispositivo", "Protocollo", "Evento"]);

  // Senza ARP restano meno righe, e il conteggio lo dice.
  await page.getByRole("button", { name: "ARP", exact: true }).click();
  await expect(count).not.toHaveText(`${total} di ${total} eventi`);
  await expect(eventsList(page).locator("tbody")).not.toContainText("ARP request");
  await page.getByRole("button", { name: "ARP", exact: true }).click();
  await expect(count).toHaveText(`${total} di ${total} eventi`);

  // Una riga si apre da tastiera; le frecce si muovono tra le righe.
  const rows = eventsList(page).locator("tbody tr");
  await rows.last().focus();
  await page.keyboard.press("Home");
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toBeFocused();
  // Una sola fermata di Tab per tutto l'elenco.
  expect(await eventsList(page).locator('tbody tr[tabindex="0"]').count()).toBe(1);
  await page.keyboard.press("Enter");
  await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");
});

test("si leggono gli eventi di prima mentre ne arrivano di nuovi", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await action(page, "Apri il terminale di PC1").click();
  await typeCommand(page, "ping -n 4 192.168.1.11");
  await simulationBar(page).getByRole("button", { name: /Velocità/ }).click(); // 2×
  await page.getByRole("button", { name: /Avvia/ }).click();
  await page.getByRole("tab", { name: "Eventi" }).click();

  const list = eventsList(page);
  await expect(list.locator("tbody tr")).not.toHaveCount(0);
  await expect.poll(async () => list.evaluate((el) => el.scrollHeight > el.clientHeight + 40), { timeout: 30_000 }).toBe(true);
  // Finché si guarda il fondo, l'elenco segue gli eventi nuovi.
  await expect.poll(async () => list.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 24)).toBe(true);

  // Si risale in cima: arrivano altri eventi, ma l'elenco resta lì.
  await list.evaluate((el) => el.scrollTo({ top: 0 }));
  const before = await list.locator("tbody tr").count();
  await expect.poll(async () => list.locator("tbody tr").count(), { timeout: 30_000 }).toBeGreaterThan(before);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);

  // Il pulsante riporta agli ultimi, e da lì si segue di nuovo.
  await list.getByRole("button", { name: "↓ Ultimi eventi" }).click();
  await expect.poll(async () => list.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 24)).toBe(true);
  await expect(list.getByRole("button", { name: "↓ Ultimi eventi" })).toHaveCount(0);
  await page.getByRole("button", { name: /Pausa/ }).click();
});

test("in presentazione stato e messaggi restano leggibili a ogni ingrandimento", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await page.getByRole("button", { name: "Presenta" }).click();
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();

  const smaller = page.getByRole("button", { name: "Rimpicciolisci testo e disegno" });
  const larger = page.getByRole("button", { name: "Ingrandisci testo e disegno" });
  while (await smaller.isEnabled()) await smaller.click();
  const area = (await page.locator(".canvas").boundingBox())!;
  for (;;) {
    await expect(stateOf(page)).toHaveText("Ferma");
    const message = (await instructions(page).locator(".message").boundingBox())!;
    const zoom = (await page.getByRole("group", { name: "Inquadratura" }).boundingBox())!;
    const bar = (await simulationBar(page).boundingBox())!;
    expect(overlap(message, zoom)).toBe(false);
    expect(overlap(message, bar)).toBe(false);
    expect(message.x >= area.x && message.x + message.width <= area.x + area.width).toBe(true);
    if (!(await larger.isEnabled())) break;
    await larger.click();
  }
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 900, height: 700 },
]) {
  test(`a ${size.width}×${size.height} istruzione, stato e barretta non si sovrappongono`, async ({ page }) => {
    await page.setViewportSize(size);
    await openApp(page);
    await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
    await device(page, "PC1").click();
    await action(page, "Ping da PC1").click();

    const message = (await instructions(page).locator(".message").boundingBox())!;
    const toolbar = (await page.getByRole("toolbar", { name: /Azioni su/ }).boundingBox())!;
    const bar = (await simulationBar(page).boundingBox())!;
    const zoom = (await page.getByRole("group", { name: "Inquadratura" }).boundingBox())!;
    expect(overlap(message, toolbar)).toBe(false);
    expect(overlap(message, bar)).toBe(false);
    expect(overlap(message, zoom)).toBe(false);
    expect(overlap(bar, zoom)).toBe(false);
    await expect(stateOf(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  });
}

// Un Passo, aspettando che il tempo sia davvero avanzato: un clic mentre
// il passo precedente è ancora in corso non fa nulla.
async function stepAndWait(page: Page): Promise<void> {
  const tick = async () => Number((await simulationBar(page).locator(".time").innerText()).replace("tick ", ""));
  const before = await tick();
  await page.getByRole("button", { name: /Passo/ }).click();
  await expect.poll(tick).toBeGreaterThan(before);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxes(locator: Locator): Promise<Box[]> {
  const all: Box[] = [];
  for (const each of await locator.all()) all.push((await each.boundingBox())!);
  return all;
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
