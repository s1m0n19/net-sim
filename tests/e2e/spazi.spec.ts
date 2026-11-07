// Lo spazio del disegno (D-118): la fascia in basso non si apre da sola
// mentre si costruisce, l'inquadratura automatica non ingrandisce troppo le
// reti piccole (lo zoom manuale sì), e Adatta, l'apertura di un file e la
// presentazione inquadrano anche le annotazioni.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { action, clickDrawing, device, drag, exampleFile, moreAction, openApp, openNetwork, pointOn } from "./helpers";

const stripBody = (page: Page) => page.locator("footer .body");
const canvas = (page: Page) => page.locator(".canvas");

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("L'elemento non si vede");
  return box;
}

const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;

// La larghezza sullo schermo del riquadro di un dispositivo.
const widthOf = async (page: Page, name: string) => (await boxOf(device(page, name).locator("rect.box"))).width;

// Un PC è largo 52 unità del disegno, più il bordo (1,8): con il limite di
// 1,25 pixel per unità, circa 67 pixel. Un router è largo 60.
const PC_AT_LIMIT = (52 + 1.8) * 1.25;
const ROUTER_AT_LIMIT = (60 + 1.8) * 1.25;

test.describe("la fascia in basso", () => {
  test("costruire la rete non la apre; gli eventi ci sono e si leggono aprendola", async ({ page }) => {
    await openApp(page);
    // Il primo PC, altri dispositivi, un cavo, una nota: la fascia resta chiusa.
    await page.getByRole("button", { name: "PC", exact: true }).click();
    await clickDrawing(page, 0.3, 0.4);
    await expect(stripBody(page)).toHaveCount(0);
    await clickDrawing(page, 0.6, 0.4);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Cavo", exact: true }).click();
    await device(page, "PC1").click();
    await device(page, "PC2").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("line.wire")).toHaveCount(1);
    await page.getByRole("button", { name: "Nota", exact: true }).click();
    await clickDrawing(page, 0.4, 0.8);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await device(page, "PC1").click();
    await page.locator('[data-field="name"]').fill("Aula");
    await page.locator('[data-field="name"]').press("Enter");
    await expect(stripBody(page)).toHaveCount(0);

    // Gli eventi sono stati registrati: la scheda Eventi li mostra.
    await page.getByRole("tab", { name: "Eventi" }).click();
    await expect(stripBody(page)).toBeVisible();
    await expect(page.locator("footer .list")).toContainText("viene aggiunto alla rete");
    await expect(page.locator("footer .list")).toContainText("nuovo cavo tra");
  });

  test("chiusa dall'utente resta chiusa mentre arrivano eventi; aperta resta aperta e sulla sua scheda", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
    await page.getByRole("tab", { name: "Eventi" }).click();
    await page.getByRole("button", { name: "Chiudi la fascia in basso" }).click();
    await expect(stripBody(page)).toHaveCount(0);

    // Un ping scrive molti eventi: la fascia non si riapre.
    await device(page, "PC1").click();
    await action(page, "Ping da PC1").click();
    await device(page, "PC2").click();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /Passo/ }).click();
    await expect(stripBody(page)).toHaveCount(0);

    // Riaperta, resta aperta sulla scheda Eventi mentre si posa un dispositivo.
    await page.getByRole("button", { name: "Apri la fascia in basso" }).click();
    await expect(page.getByRole("tab", { name: "Eventi" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "PC", exact: true }).click();
    await clickDrawing(page, 0.85, 0.2);
    await page.keyboard.press("Escape");
    await expect(stripBody(page)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Eventi" })).toHaveAttribute("aria-selected", "true");
  });

  test("aprire un terminale la apre; in presentazione E e T la aprono e la chiudono", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
    await device(page, "PC1").click();
    await action(page, "Apri il terminale di PC1").click();
    await expect(stripBody(page)).toBeVisible();
    await expect(page.getByRole("tab", { name: /Terminale · PC1/ })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: "Presenta" }).click();
    await expect(stripBody(page)).toHaveCount(0);
    await page.keyboard.press("e");
    await expect(stripBody(page)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Eventi" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("e");
    await expect(stripBody(page)).toHaveCount(0);
    await page.keyboard.press("t");
    await expect(page.getByRole("tab", { name: /Terminale · PC1/ })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("la scala della rete", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("un PC solo, su uno schermo grande, non diventa enorme: né da sé né con Adatta", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "PC", exact: true }).click();
    await clickDrawing(page, 0.5, 0.5);
    await page.keyboard.press("Escape");
    expect(await widthOf(page, "PC1")).toBeLessThanOrEqual(PC_AT_LIMIT + 1);
    await page.getByRole("button", { name: "Adatta" }).click();
    expect(await widthOf(page, "PC1")).toBeLessThanOrEqual(PC_AT_LIMIT + 1);
    expect(await widthOf(page, "PC1")).toBeGreaterThanOrEqual(PC_AT_LIMIT - 2);
    // Al centro del disegno, in orizzontale.
    const pc = await boxOf(device(page, "PC1").locator("rect.box"));
    const area = await boxOf(canvas(page));
    expect(Math.abs(pc.x + pc.width / 2 - (area.x + area.width / 2))).toBeLessThan(20);

    // Con + si ingrandisce oltre il limite, quanto si vuole.
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
    expect(await widthOf(page, "PC1")).toBeGreaterThan(PC_AT_LIMIT * 1.8);
  });

  test("una piccola rete con un router ha la stessa misura, ed è tutta nel disegno", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
    expect(await widthOf(page, "R1")).toBeLessThanOrEqual(ROUTER_AT_LIMIT + 1);
    for (const name of ["PC1", "SW1", "R1", "SW2", "PC2"]) {
      expect(inside(await boxOf(device(page, name)), await boxOf(canvas(page)))).toBe(true);
    }
  });

  test("una rete grande si inquadra tutta con Adatta", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page);
    await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
    // Venti copie di PC3, in fila: la rete diventa molto larga.
    await device(page, "PC3").click();
    for (let i = 0; i < 20; i++) await (await moreAction(page, "Duplica")).click();
    await expect(page.locator("g.device")).toHaveCount(24);
    await page.getByRole("button", { name: "Adatta" }).click();
    const area = await boxOf(canvas(page));
    for (const each of await page.locator("g.device").all()) expect(inside(await boxOf(each), area)).toBe(true);
    // Qui la scala la decide la rete, non il limite.
    expect(await widthOf(page, "PC1")).toBeLessThan(PC_AT_LIMIT * 0.8);
  });

  test("con una vista scelta a mano, posare un dispositivo non la cambia", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
    const before = await boxOf(device(page, "PC1").locator("rect.box"));
    await page.getByRole("button", { name: "PC", exact: true }).click();
    await clickDrawing(page, 0.8, 0.15);
    await page.keyboard.press("Escape");
    const after = await boxOf(device(page, "PC1").locator("rect.box"));
    expect(after).toEqual(before);
  });

  test("con l'inquadratura automatica, trascinare un dispositivo non fa saltare il disegno", async ({ page }) => {
    // Su un foglio nuovo l'inquadratura è quella automatica (aprire un file fa già Adatta).
    await openApp(page);
    await page.getByRole("button", { name: "PC", exact: true }).click();
    await clickDrawing(page, 0.4, 0.4);
    await page.keyboard.press("Escape");
    const target = await pointOn(page, 0.85, 0.85);
    const from = await boxOf(device(page, "PC1").locator("rect.box"));
    await drag(page, { x: from.x + from.width / 2, y: from.y + from.height / 2 }, target);
    const moved = await boxOf(device(page, "PC1").locator("rect.box"));
    expect(Math.abs(moved.x + moved.width / 2 - target.x)).toBeLessThan(4);
    expect(Math.abs(moved.y + moved.height / 2 - target.y)).toBeLessThan(4);
  });
});

// Un file di formato 2: la LAN dell'esempio, con un riquadro molto più
// grande della rete e una nota molto lontana.
function farAnnotations(): string {
  const file = JSON.parse(exampleFile("lan-switch"));
  file.version = 2;
  file.annotations = [
    { kind: "box", id: "a1", x: -600, y: -400, width: 2200, height: 1400, color: "green", label: "Tutta la scuola" },
    { kind: "note", id: "a2", x: 2400, y: 1500, color: "yellow", text: "Nota lontana" },
  ];
  return JSON.stringify(file);
}

test.describe("l'inquadratura delle annotazioni", () => {
  test("un file con annotazioni lontane, appena aperto, si vede tutto", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "scuola.netsim.json", farAnnotations());
    await expect(page.locator(".top .file")).toHaveText("scuola");
    const area = await boxOf(canvas(page));
    expect(inside(await boxOf(page.locator("g.annotation.box rect.edge")), area)).toBe(true);
    expect(inside(await boxOf(page.locator("g.annotation.note rect.paper")), area)).toBe(true);
    expect(inside(await boxOf(device(page, "PC1")), area)).toBe(true);
  });

  test("zoom a mano e modifiche non spostano la vista; Adatta riporta tutto in vista", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "scuola.netsim.json", farAnnotations());
    await expect(page.locator(".top .file")).toHaveText("scuola");
    // Si ingrandisce con la rotella attorno all'etichetta del riquadro, che
    // resta sotto il puntatore.
    const start = await boxOf(page.locator("g.annotation.box text.label"));
    await page.mouse.move(start.x + 5, start.y + 5);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
    const pcBefore = await boxOf(device(page, "PC1").locator("rect.box"));

    // Si sposta il riquadro grande trascinandone l'etichetta: la vista resta.
    const label = await boxOf(page.locator("g.annotation.box text.label"));
    await drag(page, { x: label.x + 5, y: label.y + 5 }, { x: label.x + 45, y: label.y + 25 });
    await expect(page.locator("g.annotation")).toHaveCount(2);
    expect(await boxOf(device(page, "PC1").locator("rect.box"))).toEqual(pcBefore);

    // Adatta: riquadro, nota e rete in vista.
    await page.getByRole("button", { name: "Adatta" }).click();
    const area = await boxOf(canvas(page));
    expect(inside(await boxOf(page.locator("g.annotation.box rect.edge")), area)).toBe(true);
    expect(inside(await boxOf(page.locator("g.annotation.note rect.paper")), area)).toBe(true);
  });

  test("in presentazione rete e annotazioni si vedono, e all'uscita torna la vista di prima", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "scuola.netsim.json", farAnnotations());
    await expect(page.locator(".top .file")).toHaveText("scuola");
    const before = await boxOf(device(page, "PC1").locator("rect.box"));
    await page.getByRole("button", { name: "Presenta" }).click();
    const area = await boxOf(canvas(page));
    expect(inside(await boxOf(page.locator("g.annotation.note rect.paper")), area)).toBe(true);
    expect(inside(await boxOf(device(page, "PC1")), area)).toBe(true);
    await page.getByRole("button", { name: "Esci" }).click();
    expect(await boxOf(device(page, "PC1").locator("rect.box"))).toEqual(before);
  });
});
