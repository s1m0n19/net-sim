// La barretta delle azioni accanto a ciò che è selezionato (D-111): quali
// azioni offre per ogni dispositivo e per un cavo, che cosa fanno, la
// tastiera, la presentazione, i bordi del disegno e lo zoom.

import { expect, test, type Page } from "@playwright/test";
import {
  action,
  cable,
  clickDrawing,
  device,
  drag,
  drawing,
  exampleFile,
  moreAction,
  openApp,
  openNetwork,
  pointOn,
  presentationZoom,
  presentRouterWithTerminal,
  sidePanel,
} from "./helpers";

const toolbar = (page: Page) => page.getByRole("toolbar", { name: /Azioni su/ });

// Le scritte dei pulsanti sempre in vista, e quelle del menu "Altro".
async function actionsOf(page: Page): Promise<{ primary: string[]; more: string[] }> {
  const primary = await toolbar(page).locator(":scope > button .text").allInnerTexts();
  await page.getByRole("button", { name: /^Altre azioni su/ }).click();
  const more = await page.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  return { primary, more: more.map((text) => text.trim()) };
}

test("ogni dispositivo mostra le sue azioni principali, e le altre nel menu Altro", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));

  await device(page, "PC1").click();
  expect(await actionsOf(page)).toEqual({
    primary: ["Terminale", "Ping", "Collega"],
    more: ["Tabella ARP", "Spegni", "Duplica", "Elimina"],
  });

  await device(page, "SW1").click();
  expect(await actionsOf(page)).toEqual({
    primary: ["Terminale", "Collega", "Tabella MAC"],
    more: ["Spegni", "Duplica", "Elimina"],
  });

  await device(page, "R1").click();
  expect(await actionsOf(page)).toEqual({
    primary: ["Terminale", "Collega", "Tabella routing"],
    more: ["Spegni", "Duplica", "Elimina"],
  });

  // Un cavo: staccare (si riattacca) ed eliminare sono distinti, senza menu.
  await cable(page, "PC1", "SW1").click({ force: true });
  await expect(toolbar(page).locator(":scope > button .text")).toHaveText(["Stacca", "Elimina"]);
  await expect(page.getByRole("button", { name: /^Altre azioni su/ })).toHaveCount(0);
});

test("Ping e Collega restano premuti mentre l'app aspetta il secondo clic", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));

  await device(page, "PC1").click();
  const ping = action(page, "Ping da PC1");
  await expect(ping).toHaveAttribute("aria-pressed", "false");
  await ping.click();
  await expect(ping).toHaveAttribute("aria-pressed", "true");
  // La riga in alto, quella di sempre, dice che cosa fare.
  await expect(page.getByRole("status")).toContainText("Ping da PC1.");
  await device(page, "PC2").click();
  await expect(page.locator("g.packet")).toHaveCount(1);

  // Collega: premuto, poi il cavo nasce sul secondo clic.
  const duplicated = await (async () => {
    await device(page, "PC1").click();
    await (await moreAction(page, "Duplica")).click();
    return device(page, "PC4");
  })();
  await expect(duplicated).toBeVisible();
  const link = action(page, "Collega PC4");
  await link.click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText("Cavo da PC4.");
  await device(page, "SW1").click();
  await expect(page.locator("line.wire")).toHaveCount(4);
});

test("Terminale apre la scheda; Spegni toglie il Ping, Accendi lo rimette", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));

  await device(page, "PC2").click();
  await action(page, "Apri il terminale di PC2").click();
  await expect(page.getByRole("tab", { name: /Terminale · PC2/ })).toBeVisible();

  await (await moreAction(page, "Spegni")).click();
  await expect(action(page, "Ping da PC2")).toHaveCount(0);
  await (await moreAction(page, "Accendi")).click();
  await expect(action(page, "Ping da PC2")).toBeVisible();
});

test("la tabella si appunta e si toglie, e il pulsante dice se è appuntata", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await device(page, "R1").click();

  const table = action(page, "Appunta la tabella di routing di R1");
  await expect(table).toHaveAttribute("aria-pressed", "false");
  await table.click();
  await expect(page.locator("g.table")).toContainText("Tabella di routing · R1");
  const unpin = action(page, "Togli la tabella di routing di R1");
  await expect(unpin).toHaveAttribute("aria-pressed", "true");
  await unpin.click();
  await expect(page.locator("g.table")).toHaveCount(0);
});

test("un cavo si stacca e si riattacca; eliminare un dispositivo si annulla", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));

  await cable(page, "PC2", "SW1").click({ force: true });
  await action(page, "Stacca il cavo").click();
  await expect(sidePanel(page)).toContainText("Staccato");
  await action(page, "Riattacca il cavo").click();
  await expect(sidePanel(page)).not.toContainText("Staccato");

  await device(page, "PC3").click();
  await (await moreAction(page, "Elimina")).click();
  await expect(page.locator("g.device")).toHaveCount(3);
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.locator("g.device")).toHaveCount(4);
});

test("la barretta si usa con la tastiera: frecce, Invio, e il menu Altro con Esc", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();

  await action(page, "Apri il terminale di PC1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(action(page, "Ping da PC1")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /Terminale · PC1/ })).toBeVisible();

  // Fino al pulsante Altro: si apre con Invio, Esc lo chiude e ridà il fuoco.
  await action(page, "Collega PC1").focus();
  await page.keyboard.press("ArrowRight");
  const more = page.getByRole("button", { name: /^Altre azioni su PC1/ });
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Tabella ARP" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more).toBeFocused();
  // Esc ha chiuso il menu, non tolto la selezione.
  await expect(toolbar(page)).toBeVisible();
});

test("in presentazione la barretta cresce con l'ingrandimento e non offre gli strumenti per costruire", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  const normal = (await toolbar(page).boundingBox())!.height;

  await page.getByRole("button", { name: "Presenta" }).click();
  await device(page, "PC1").click();
  await expect(toolbar(page).locator(":scope > button .text")).toHaveText(["Terminale", "Ping"]);
  expect((await toolbar(page).boundingBox())!.height).toBeGreaterThan(normal * 1.3);
});

// La barretta sta tutta dentro il disegno.
async function insideDrawing(page: Page): Promise<boolean> {
  const bar = (await toolbar(page).boundingBox())!;
  const area = (await page.locator(".canvas").boundingBox())!;
  return bar.x >= area.x && bar.y >= area.y && bar.x + bar.width <= area.x + area.width && bar.y + bar.height <= area.y + area.height;
}

test("vicino al bordo alto la barretta va sotto il dispositivo, e resta nel disegno", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  // Si sposta la vista finché PC1 non è contro il bordo alto.
  const box = await device(page, "PC1").locator("rect.box").boundingBox();
  const area = (await page.locator(".canvas").boundingBox())!;
  const from = await pointOn(page, 0.5, 0.85);
  await drag(page, from, { x: from.x, y: from.y - (box!.y - area.y) + 12 });
  await device(page, "PC1").click();

  const bar = (await toolbar(page).boundingBox())!;
  const pc = (await device(page, "PC1").locator("rect.box").boundingBox())!;
  expect(bar.y).toBeGreaterThan(pc.y + pc.height);
  expect(await insideDrawing(page)).toBe(true);
});

test("con lo zoom la barretta resta grande uguale e dentro il disegno", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  await device(page, "PC2").click();
  const before = (await toolbar(page).boundingBox())!;

  const centre = await pointOn(page, 0.5, 0.5);
  await page.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await toolbar(page).boundingBox())!.height).toBeCloseTo(before.height, 0);
  expect(await insideDrawing(page)).toBe(true);

  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await toolbar(page).boundingBox())!.width).toBeCloseTo(before.width, 0);
  expect(await insideDrawing(page)).toBe(true);
  // Il disegno sotto è sempre lì: la barretta non ha mosso la vista.
  await expect(drawing(page)).toBeVisible();
});

// Il menu Altro sta tutto dentro il disegno, anche vicino ai bordi (D-116).

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const within = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Sposta la vista finché il dispositivo non tocca quasi il bordo sinistro o destro del disegno.
async function toEdge(page: Page, name: string, side: "left" | "right"): Promise<void> {
  const box = (await device(page, name).locator("rect.box").boundingBox())!;
  const area = (await page.locator(".canvas").boundingBox())!;
  const shift = side === "left" ? area.x + 12 - box.x : area.x + area.width - 12 - (box.x + box.width);
  const from = await pointOn(page, 0.5, 0.12);
  await drag(page, from, { x: from.x + shift, y: from.y });
}

// Apre il menu Altro del dispositivo e controlla che stia tutto nel disegno,
// voci comprese, e che non vada sopra la colonna dei dispositivi.
async function expectMoreMenuInside(page: Page, name: string): Promise<void> {
  await device(page, name).click();
  await page.getByRole("button", { name: `Altre azioni su ${name}` }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCSS("opacity", "1");
  const area = (await page.locator(".canvas").boundingBox())!;
  const box = (await menu.boundingBox())!;
  expect(within(box, area)).toBe(true);
  for (const item of await menu.getByRole("menuitem").all()) {
    expect(within((await item.boundingBox())!, area)).toBe(true);
  }
  const palette = page.locator(".shell > aside").first();
  if ((await palette.count()) > 0 && (await palette.isVisible())) {
    expect(overlaps(box, (await palette.boundingBox())!)).toBe(false);
  }
}

test("il menu Altro vicino al bordo sinistro e a quello destro resta tutto nel disegno", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));

  await toEdge(page, "PC1", "left");
  await expectMoreMenuInside(page, "PC1");
  await page.keyboard.press("Escape");

  await toEdge(page, "PC2", "right");
  await expectMoreMenuInside(page, "PC2");
  await page.keyboard.press("Escape");

  // Con la colonna dei dispositivi chiusa il disegno è più largo: vale lo stesso.
  await page.getByRole("button", { name: "Chiudi la colonna dei dispositivi" }).click();
  await toEdge(page, "PC1", "left");
  await expectMoreMenuInside(page, "PC1");
});

test("il menu Altro si apre dentro il disegno anche in presentazione al 200%", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  await page.getByRole("button", { name: "Presenta" }).click();
  const larger = page.getByRole("button", { name: "Ingrandisci testo e disegno" });
  while (await larger.isEnabled()) await larger.click();

  for (const [name, side] of [["PC1", "left"], ["PC2", "right"]] as const) {
    await toEdge(page, name, side);
    await expectMoreMenuInside(page, name);
    await page.keyboard.press("Escape");
  }
});

test("in un disegno più stretto del menu, il menu si stringe e resta tutto leggibile", async ({ page }) => {
  // Una finestra più stretta di quelle previste, perché il disegno sia più
  // stretto del menu (250 px più i margini).
  await page.setViewportSize({ width: 620, height: 700 });
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  const area = (await page.locator(".canvas").boundingBox())!;
  expect(area.width).toBeLessThan(266);

  await expectMoreMenuInside(page, "R1");
  const box = (await page.getByRole("menu").boundingBox())!;
  expect(box.width).toBeLessThan(250);
  // Nessuna voce taglia la sua scritta.
  for (const item of await page.getByRole("menuitem").all()) {
    expect(await item.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});

test("il menu Altro vicino al bordo si usa ancora con la tastiera, ed Esc ridà il fuoco", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  await toEdge(page, "PC1", "left");
  await device(page, "PC1").click();
  const more = page.getByRole("button", { name: "Altre azioni su PC1" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("con un dispositivo vicino sopra, la barretta non lo copre se trova un altro posto", async ({ page }) => {
  await openApp(page);
  // PC2 proprio sopra PC1, e niente sotto: la barretta va sotto le scritte.
  const file = JSON.parse(exampleFile("lan-switch"));
  const at = (name: string, x: number, y: number) => {
    file.network.devices.find((d: { name: string }) => d.name === name).position = { x, y };
  };
  at("PC1", 300, 300);
  at("PC2", 300, 210);
  at("PC3", 700, 300);
  at("SW1", 500, 300);
  await openNetwork(page, "vicini.netsim.json", JSON.stringify(file));
  await expect(page.locator(".top .file")).toHaveText("vicini");
  await device(page, "PC1").click();
  const bar = (await toolbar(page).boundingBox())!;
  const above = (await device(page, "PC2").boundingBox())!;
  const own = (await device(page, "PC1").locator("rect.box").boundingBox())!;
  const overlaps = (a: typeof bar, b: typeof bar) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlaps(bar, above)).toBe(false);
  expect(bar.y).toBeGreaterThan(own.y + own.height);
  // Le azioni si usano come sempre.
  await action(page, "Apri il terminale di PC1").click();
  await expect(page.getByRole("tab", { name: /Terminale · PC1/ })).toBeVisible();
});

test.describe("in presentazione la barretta si fa compatta quando non trova spazio (R-1b, D-135)", () => {
  type Box = { x: number; y: number; width: number; height: number };
  const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  // I pulsanti da non coprire: quelli della simulazione e quelli dello zoom.
  async function controlButtons(page: Page): Promise<Box[]> {
    const buttons = page
      .getByRole("toolbar", { name: "Comandi della simulazione" })
      .getByRole("button")
      .or(page.getByRole("group", { name: "Inquadratura" }).getByRole("button"));
    const boxes: Box[] = [];
    for (const button of await buttons.all()) boxes.push((await button.boundingBox())!);
    return boxes;
  }

  // La barretta è tutta nel disegno e non copre nessun pulsante dei comandi.
  // Dopo un cambio d'ingrandimento la barretta si rimisura e si sposta nel
  // fotogramma successivo: si aspetta che sia ferma al suo posto.
  async function problems(page: Page): Promise<string[]> {
    const bar = (await toolbar(page).boundingBox())!;
    const canvas = (await page.locator(".canvas").boundingBox())!;
    const found: string[] = [];
    if (bar.x < canvas.x || bar.y < canvas.y) found.push("esce in alto o a sinistra");
    if (bar.x + bar.width > canvas.x + canvas.width + 1 || bar.y + bar.height > canvas.y + canvas.height + 1) found.push("esce in basso o a destra");
    const covered = (await controlButtons(page)).filter((button) => overlap(bar, button));
    if (covered.length > 0) found.push(`copre ${covered.length} pulsanti: barretta ${JSON.stringify(bar)}, ${JSON.stringify(covered)}`);
    return found;
  }
  async function expectClear(page: Page, note: string) {
    await expect.poll(() => problems(page), { message: note, timeout: 3000 }).toEqual([]);
  }

  test("lo scenario R-1: al 200% la barretta compatta è più bassa, lascia liberi simulazione e zoom, e ha tutte le azioni", async ({ page }) => {
    await presentRouterWithTerminal(page, 1366, 768);
    await presentationZoom(page, 140);
    await expect(toolbar(page)).not.toHaveClass(/compact/);
    const normal = (await toolbar(page).boundingBox())!;
    await presentationZoom(page, 200);
    await expect(toolbar(page)).toHaveClass(/compact/);
    const compact = (await toolbar(page).boundingBox())!;
    // Al 200% la forma normale sarebbe alta 118 pixel: la compatta molto meno.
    expect(compact.height).toBeLessThan((normal.height / 1.4) * 2 * 0.8);
    await expectClear(page, "200%");
    // Sole icone, ma la descrizione resta, per il lettore di schermo e il suggerimento.
    await expect(toolbar(page).locator(".text").first()).toBeHidden();
    await expect(action(page, "Apri il terminale di R1")).toHaveAttribute("title", /terminale di R1/);
    await expect(action(page, "Appunta la tabella di routing di R1")).toBeVisible();
    // Il menu Altro si apre e resta nella finestra.
    await page.getByRole("button", { name: /^Altre azioni su R1/ }).click();
    const menu = (await page.getByRole("menu").boundingBox())!;
    expect(menu.y).toBeGreaterThanOrEqual(0);
    expect(menu.y + menu.height).toBeLessThanOrEqual(768);
    await page.keyboard.press("Escape");
  });

  test("con la simulazione in corso i suoi pulsanti si premono, e la barretta resta al suo posto", async ({ page }) => {
    await presentRouterWithTerminal(page, 1366, 768);
    await presentationZoom(page, 200);
    const simulation = page.getByRole("toolbar", { name: "Comandi della simulazione" });
    // Un ping dal router: traffico pronto da far scorrere.
    await page.getByLabel(/Riga di comando/).fill("ping 192.168.2.10");
    await page.getByLabel(/Riga di comando/).press("Enter");
    await simulation.getByRole("button", { name: "Avvia" }).click();
    await expectClear(page, "in corso");
    await expect(page.locator(".screen")).toContainText("Success rate", { timeout: 15000 });
    await simulation.getByRole("button", { name: /^Velocità/ }).click();
    await simulation.getByRole("button", { name: "Ricomincia" }).click();
    await page.getByRole("group", { name: "Inquadratura" }).getByRole("button", { name: /Adatta/ }).click();
    await expect(toolbar(page)).toBeVisible();
  });

  test("passa alla compatta e torna normale con l'ingrandimento, senza oscillare", async ({ page }) => {
    await presentRouterWithTerminal(page, 1366, 768);
    for (const [percent, compact] of [[200, true], [140, false], [200, true], [100, false]] as const) {
      await presentationZoom(page, percent);
      if (compact) await expect(toolbar(page)).toHaveClass(/compact/);
      else await expect(toolbar(page)).not.toHaveClass(/compact/);
      // Ferma: la forma non cambia da sola nei momenti successivi.
      const before = await toolbar(page).getAttribute("class");
      await page.waitForTimeout(300);
      expect(await toolbar(page).getAttribute("class"), `${percent}%`).toBe(before);
      await expectClear(page, `${percent}%`);
    }
  });

  test("compatta si usa con la tastiera: frecce, Invio, e il menu Altro", async ({ page }) => {
    await presentRouterWithTerminal(page, 1366, 768);
    await presentationZoom(page, 200);
    await expect(toolbar(page)).toHaveClass(/compact/);
    await action(page, "Apri il terminale di R1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(action(page, "Appunta la tabella di routing di R1")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: /^Altre azioni su R1/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Altre azioni su R1/ })).toBeFocused();
  });

  test("un dispositivo al bordo destro, con il pannello chiuso o aperto: barretta nel disegno, comandi liberi", async ({ page }) => {
    await presentRouterWithTerminal(page, 1366, 768);
    await presentationZoom(page, 200);
    await device(page, "PC2").click();
    await expectClear(page, "PC2, pannello aperto");
    await page.getByRole("button", { name: "Chiudi il pannello laterale" }).click();
    await expectClear(page, "PC2, pannello chiuso");
    await device(page, "R1").click();
    await expectClear(page, "R1, pannello chiuso");
  });

  for (const [width, height] of [[1920, 1080], [1600, 900], [1366, 768], [1280, 800], [1024, 768], [900, 700]] as const) {
    test(`a ${width}×${height}, al 140, 180 e 200%: la barretta non copre simulazione e zoom, con la fascia aperta e chiusa`, async ({ page }) => {
      await presentRouterWithTerminal(page, width, height);
      for (const percent of [140, 180, 200]) {
        await presentationZoom(page, percent);
        await expectClear(page, `${percent}%, fascia aperta`);
      }
      await page.getByRole("button", { name: "Chiudi la fascia in basso" }).click();
      await expectClear(page, "200%, fascia chiusa");
    });
  }
});

test("nell'editor, con spazio, la barretta resta con le scritte anche accanto ai comandi", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  await openNetwork(page, "r.netsim.json", exampleFile("tre-reti-due-router"));
  for (const name of ["PC1", "R1", "R2", "PC2"]) {
    await device(page, name).click();
    await expect(toolbar(page)).not.toHaveClass(/compact/);
    await expect(toolbar(page).locator(".text").first()).toBeVisible();
  }
});

test.describe("con uno strumento della colonna la barretta non si vede (U-4, D-138)", () => {
  const palette = (page: Page) => page.locator("aside").first();
  const devices = (page: Page) => page.locator("g.device");
  const selected = (page: Page) => page.locator('g.device[aria-label$=", selezionato"]');

  // La rete con due LAN e un router, SW1 selezionato e la sua barretta in vista.
  async function selectSwitch(page: Page) {
    await openApp(page);
    await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
    await device(page, "SW1").click();
    await expect(toolbar(page)).toBeVisible();
  }

  test("con PC scelto la barretta sparisce, la selezione resta, e un clic dov'era la barretta posa un PC", async ({ page }) => {
    await selectSwitch(page);
    const where = (await toolbar(page).boundingBox())!;
    const before = await devices(page).count();
    await palette(page).getByRole("button", { name: "PC", exact: true }).click();
    await expect(toolbar(page)).toHaveCount(0);
    await expect(device(page, "SW1")).toHaveAttribute("aria-label", "SW1, selezionato");

    // Il punto prima coperto dalla barretta ora è del disegno.
    await page.mouse.click(where.x + where.width / 2, where.y + where.height / 2);
    await expect(devices(page)).toHaveCount(before + 1);
    // Il PC posato è selezionato, ma la sua barretta non compare finché si posa.
    await expect(selected(page)).toHaveCount(1);
    await expect(toolbar(page)).toHaveCount(0);

    // Altri PC, uno dopo l'altro, e la barretta non ricompare mai.
    for (const [x, y] of [[0.15, 0.15], [0.85, 0.15], [0.5, 0.92]]) {
      await clickDrawing(page, x, y);
      await expect(toolbar(page)).toHaveCount(0);
    }
    await expect(devices(page)).toHaveCount(before + 4);

    // Esc lascia lo strumento: torna la barretta del dispositivo selezionato.
    const last = (await selected(page).getAttribute("aria-label"))!.replace(", selezionato", "");
    await page.keyboard.press("Escape");
    await expect(toolbar(page)).toBeVisible();
    await expect(toolbar(page)).toHaveAttribute("aria-label", `Azioni su ${last}`);
  });

  for (const kind of [
    { tile: /^Server$/, label: "Server" },
    { tile: /^Switch/, variant: "Switch a 8 porte", label: "Switch" },
    { tile: /^Router/, variant: "Router a 2 interfacce", label: "Router" },
  ]) {
    test(`con ${kind.label} scelto la barretta sparisce, e torna lasciando lo strumento`, async ({ page }) => {
      await selectSwitch(page);
      await palette(page).getByRole("button", { name: kind.tile }).click();
      if (kind.variant !== undefined) await page.getByRole("menuitem", { name: kind.variant }).click();
      await expect(toolbar(page)).toHaveCount(0);
      await clickDrawing(page, 0.15, 0.15);
      await expect(toolbar(page)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(toolbar(page)).toBeVisible();
    });
  }

  test("con Cavo la barretta resta nascosta per tutti i cavi, e i capi e le porte si scelgono come sempre", async ({ page }) => {
    // Su un foglio vuoto due PC e uno switch, tutti con le porte libere.
    await openApp(page);
    await palette(page).getByRole("button", { name: "PC", exact: true }).click();
    await clickDrawing(page, 0.2, 0.3);
    await clickDrawing(page, 0.8, 0.3);
    await page.keyboard.press("Escape");
    await palette(page).getByRole("button", { name: /^Switch/ }).click();
    await page.getByRole("menuitem", { name: "Switch a 8 porte" }).click();
    await clickDrawing(page, 0.5, 0.8);
    await page.keyboard.press("Escape");
    await expect(toolbar(page)).toBeVisible();

    await palette(page).getByRole("button", { name: "Cavo", exact: true }).click();
    await expect(toolbar(page)).toHaveCount(0);
    for (const pc of ["PC1", "PC2"]) {
      await device(page, pc).click();
      await device(page, "SW1").click();
      // Nemmeno dopo un cavo nuovo, che viene selezionato.
      await expect(toolbar(page)).toHaveCount(0);
    }
    await expect(page.locator("line.wire")).toHaveCount(2);
    // Lasciato lo strumento, la barretta del cavo selezionato torna, e le porte si cambiano.
    await page.keyboard.press("Escape");
    await expect(toolbar(page)).toHaveAttribute("aria-label", "Azioni su il cavo");
  });

  test("con Riquadro e con Nota la barretta sparisce, e torna lasciando lo strumento", async ({ page }) => {
    await selectSwitch(page);
    for (const name of ["Riquadro", "Nota"]) {
      await palette(page).getByRole("button", { name, exact: true }).click();
      await expect(toolbar(page)).toHaveCount(0);
      await expect(device(page, "SW1")).toHaveAttribute("aria-label", "SW1, selezionato");
      await palette(page).getByRole("button", { name, exact: true }).click();
      await expect(toolbar(page)).toBeVisible();
    }
  });

  test("Ping e Collega premuti sulla barretta la lasciano in vista, con il pulsante premuto", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
    await device(page, "PC1").click();
    await action(page, "Ping da PC1").click();
    await expect(toolbar(page)).toBeVisible();
    await expect(action(page, "Ping da PC1")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");

    await action(page, "Collega PC1").click();
    await expect(toolbar(page)).toBeVisible();
    await expect(action(page, "Collega PC1")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(action(page, "Collega PC1")).toHaveAttribute("aria-pressed", "false");
  });

  test("con uno strumento scelto, un clic su un altro dispositivo lo seleziona senza mostrare la barretta", async ({ page }) => {
    await selectSwitch(page);
    await palette(page).getByRole("button", { name: "PC", exact: true }).click();
    await device(page, "R1").click();
    await expect(device(page, "R1")).toHaveAttribute("aria-label", "R1, selezionato");
    await expect(toolbar(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(toolbar(page)).toHaveAttribute("aria-label", "Azioni su R1");
  });
});
