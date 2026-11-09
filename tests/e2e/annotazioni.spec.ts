// Le annotazioni sul disegno (ED-9, D-117): riquadri e note si posano dalla
// colonna, si selezionano, si spostano, si ridimensionano, si modificano
// nel pannello, si eliminano, si annullano, stanno nel file, e in
// presentazione si vedono soltanto. Non toccano la rete.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { action, cable, device, drag, drawing, exampleFile, openApp, openNetwork, pointOn, sidePanel } from "./helpers";

const tool = (page: Page, name: "Riquadro" | "Nota") => page.getByRole("button", { name, exact: true });
const boxes = (page: Page) => page.locator("g.annotation.box");
const notes = (page: Page) => page.locator("g.annotation.note");
const labelField = (page: Page) => page.locator('[data-field="annotation-label"]');
const textField = (page: Page) => page.locator('[data-field="annotation-text"]');
const undo = (page: Page) => page.getByRole("button", { name: "Annulla", exact: true });
const redo = (page: Page) => page.getByRole("button", { name: "Ripristina", exact: true });

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

// Disegna un riquadro con lo strumento, tra due punti dati come frazioni del disegno.
async function drawBox(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  if ((await tool(page, "Riquadro").getAttribute("aria-pressed")) !== "true") await tool(page, "Riquadro").click();
  await drag(page, await pointOn(page, ...from), await pointOn(page, ...to));
}

// Posa una nota con lo strumento, in un punto dato come frazione del disegno.
async function placeNote(page: Page, at: [number, number]): Promise<void> {
  if ((await tool(page, "Nota").getAttribute("aria-pressed")) !== "true") await tool(page, "Nota").click();
  const point = await pointOn(page, ...at);
  await page.mouse.click(point.x, point.y);
}

// Il bordo di un riquadro, da afferrare o cliccare: un punto sul lato
// sinistro, oppure su quello alto (dove non passa la rete).
async function edgePoint(box: Locator, side: "left" | "top" = "left"): Promise<{ x: number; y: number }> {
  const area = await boxOf(box.locator("rect.edge"));
  return side === "left" ? { x: area.x + 1, y: area.y + area.height / 2 } : { x: area.x + area.width * 0.7, y: area.y + 1 };
}

test("gli strumenti della colonna: ne resta scelto uno solo, un secondo clic e Esc lo lasciano", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  const box = tool(page, "Riquadro");
  const note = tool(page, "Nota");
  const pc = page.getByRole("button", { name: "PC", exact: true });
  const cableTool = page.getByRole("button", { name: "Cavo", exact: true });

  await box.click();
  await expect(box).toHaveAttribute("aria-pressed", "true");
  await note.click();
  await expect(box).toHaveAttribute("aria-pressed", "false");
  await expect(note).toHaveAttribute("aria-pressed", "true");
  await pc.click();
  await expect(note).toHaveAttribute("aria-pressed", "false");
  await expect(pc).toHaveAttribute("aria-pressed", "true");
  await box.click();
  await expect(pc).toHaveAttribute("aria-pressed", "false");
  await cableTool.click();
  await expect(box).toHaveAttribute("aria-pressed", "false");
  await expect(cableTool).toHaveAttribute("aria-pressed", "true");
  await note.click();
  await expect(cableTool).toHaveAttribute("aria-pressed", "false");
  await note.click();
  await expect(note).toHaveAttribute("aria-pressed", "false");
  await box.click();
  await page.keyboard.press("Escape");
  await expect(box).toHaveAttribute("aria-pressed", "false");
});

test("un riquadro si disegna trascinando in ogni direzione; un clic o Esc non ne creano", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));

  // Da destra in basso verso sinistra in alto: nasce selezionato, ed è un solo passo.
  await drawBox(page, [0.45, 0.8], [0.25, 0.6]);
  await expect(boxes(page)).toHaveCount(1);
  await expect(sidePanel(page).locator("header h2")).toHaveText("Riquadro");
  await expect(boxes(page).first()).toHaveAttribute("aria-label", "Riquadro senza etichetta, selezionato");

  // Un clic senza trascinare non crea nulla.
  const point = await pointOn(page, 0.8, 0.2);
  await page.mouse.click(point.x, point.y);
  await expect(boxes(page)).toHaveCount(1);

  // Esc a metà trascinamento rinuncia, e l'anteprima sparisce.
  const from = await pointOn(page, 0.6, 0.15);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y + 60, { steps: 4 });
  await expect(page.locator("rect.sketch")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("rect.sketch")).toHaveCount(0);
  await page.mouse.move(from.x + 100, from.y + 70, { steps: 2 });
  await page.mouse.up();
  await expect(boxes(page)).toHaveCount(1);

  // Un trascinamento minimo dà il riquadro più piccolo possibile: 40×40.
  const small = await pointOn(page, 0.75, 0.75);
  await drag(page, small, { x: small.x + 8, y: small.y + 6 });
  await expect(boxes(page)).toHaveCount(2);
  await expect(sidePanel(page).locator("header")).toContainText("40 × 40");

  // Annulla toglie un riquadro alla volta.
  await page.keyboard.press("Escape");
  await undo(page).click();
  await expect(boxes(page)).toHaveCount(1);
  await undo(page).click();
  await expect(boxes(page)).toHaveCount(0);
  await redo(page).click();
  await expect(boxes(page)).toHaveCount(1);
});

test("una nota si posa con un clic e il testo, su più righe, si scrive nel pannello", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await placeNote(page, [0.3, 0.8]);
  await expect(notes(page)).toHaveCount(1);
  // Vuota si vede e si ritrova; il cursore è già nel testo.
  await expect(notes(page).first()).toContainText("Nota vuota");
  await expect(notes(page).first()).toHaveAttribute("aria-label", "Nota vuota, selezionata");
  await expect(textField(page)).toBeFocused();

  // Invio va a capo; Ctrl+Invio conferma. Punteggiatura e accenti restano.
  await page.keyboard.type("Consegna: «configura» le rotte!");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Poi prova un ping — è tutto?");
  await page.keyboard.press("Control+Enter");
  await expect(notes(page).first().locator("tspan")).toHaveText(["Consegna: «configura» le rotte!", "Poi prova un ping — è tutto?"]);
  await expect(notes(page).first()).toHaveAttribute("aria-label", /^Nota: Consegna: «configura» le rotte! Poi prova/);

  // Esc rimette il testo di prima e non toglie la selezione.
  await textField(page).click();
  await page.keyboard.type(" altro");
  await page.keyboard.press("Escape");
  await expect(textField(page)).toHaveValue("Consegna: «configura» le rotte!\nPoi prova un ping — è tutto?");
  await expect(sidePanel(page).locator("header h2")).toHaveText("Nota");

  // Uscire dal campo conferma; una riga lunga va a capo da sola.
  await textField(page).fill("Configura le rotte statiche necessarie per permettere la comunicazione tra le due reti");
  await textField(page).press("Tab");
  await expect(notes(page).first().locator("tspan")).toHaveCount(3);
  // Un solo passo per il testo confermato: Annulla torna al testo di prima.
  await undo(page).click();
  await expect(notes(page).first().locator("tspan")).toHaveCount(2);
});

test("etichetta e colore di un riquadro, un passo da annullare ciascuno", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await drawBox(page, [0.1, 0.3], [0.4, 0.7]);
  await page.keyboard.press("Escape"); // lascia lo strumento
  await labelField(page).fill("LAN 192.168.1.0/24");
  await labelField(page).press("Enter");
  await expect(boxes(page).first().locator("text.label")).toHaveText("LAN 192.168.1.0/24");

  // Il colore: cinque scelte con il nome, e il campione del riquadro cambia.
  const colors = sidePanel(page).getByRole("radiogroup", { name: /Colore/ });
  await expect(colors.getByRole("radio")).toHaveCount(5);
  await colors.getByRole("radio", { name: "Verde" }).check();
  await expect(boxes(page).first()).toHaveClass(/green/);
  await expect(sidePanel(page).locator("header")).toContainText("Verde");
  // Da tastiera, con le frecce.
  await colors.getByRole("radio", { name: "Verde" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(boxes(page).first()).toHaveClass(/yellow/);

  await undo(page).click();
  await expect(boxes(page).first()).toHaveClass(/green/);
  await undo(page).click();
  await expect(boxes(page).first()).toHaveClass(/blue/);
  await undo(page).click();
  await expect(boxes(page).first().locator("text.label")).toHaveCount(0);
  await redo(page).click();
  await expect(boxes(page).first().locator("text.label")).toHaveText("LAN 192.168.1.0/24");
});

test("spostare e ridimensionare: un passo ciascuno, e mai sotto 40×40", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await drawBox(page, [0.1, 0.2], [0.35, 0.55]);
  await page.keyboard.press("Escape");
  const box = boxes(page).first();
  const start = await boxOf(box.locator("rect.edge"));

  // Trascinato dal bordo, si sposta; Annulla lo riporta indietro in un colpo.
  const grip = await edgePoint(box);
  await drag(page, grip, { x: grip.x + 90, y: grip.y + 40 });
  const moved = await boxOf(box.locator("rect.edge"));
  expect(moved.x - start.x).toBeCloseTo(90, -1);
  expect(moved.y - start.y).toBeCloseTo(40, -1);
  await undo(page).click();
  expect((await boxOf(box.locator("rect.edge"))).x).toBeCloseTo(start.x, 0);
  await redo(page).click();

  // Dall'angolo in basso a destra si allarga.
  await expect(box.locator("rect.handle")).toHaveCount(4);
  const se = await boxOf(box.locator("rect.handle.se"));
  await drag(page, { x: se.x + se.width / 2, y: se.y + se.height / 2 }, { x: se.x + 70, y: se.y + 50 });
  const bigger = await boxOf(box.locator("rect.edge"));
  expect(bigger.width).toBeGreaterThan(moved.width + 50);
  await undo(page).click();
  expect((await boxOf(box.locator("rect.edge"))).width).toBeCloseTo(moved.width, 0);
  await redo(page).click();

  // Dall'angolo in alto a sinistra, oltre l'angolo opposto: si ferma a 40×40.
  // (Oltre l'angolo opposto ma dentro la finestra: Firefox non segue il
  // mouse dei test fuori dalla finestra.)
  const nw = await boxOf(box.locator("rect.handle.nw"));
  const far = await boxOf(box.locator("rect.handle.se"));
  const viewport = page.viewportSize()!;
  const beyond = { x: Math.min(far.x + 120, viewport.width - 5), y: Math.min(far.y + 120, viewport.height - 5) };
  await drag(page, { x: nw.x + nw.width / 2, y: nw.y + nw.height / 2 }, beyond);
  await expect(sidePanel(page).locator("header")).toContainText("40 × 40");
  // Un clic sul bordo senza muovere non è una modifica: Annulla torna al ridimensionamento.
  await page.mouse.click((await edgePoint(box)).x, (await edgePoint(box)).y);
  await undo(page).click();
  await expect(sidePanel(page).locator("header")).not.toContainText("40 × 40");
});

test("eliminare dalla barretta, dal pannello e con Canc; Annulla la fa tornare", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await placeNote(page, [0.3, 0.85]);
  await page.keyboard.press("Escape"); // esce dal testo
  await page.keyboard.press("Escape"); // lascia lo strumento

  await action(page, "Elimina la nota dal disegno").click();
  await expect(notes(page)).toHaveCount(0);
  await expect(sidePanel(page).locator("header h2")).toHaveText("Nessuna selezione");
  await undo(page).click();
  await expect(notes(page)).toHaveCount(1);

  await notes(page).first().click();
  await sidePanel(page).getByRole("button", { name: "Elimina la nota" }).click();
  await expect(notes(page)).toHaveCount(0);
  await undo(page).click();

  await notes(page).first().click();
  await page.keyboard.press("Delete");
  await expect(notes(page)).toHaveCount(0);
  await undo(page).click();
  await expect(notes(page)).toHaveCount(1);
  // Nel campo del testo, Canc cancella il testo e non la nota.
  await notes(page).first().click();
  await textField(page).fill("ciao");
  await textField(page).press("Backspace");
  await expect(notes(page)).toHaveCount(1);
});

test("salvare e riaprire conserva le annotazioni (formato 2); senza annotazioni resta il formato 1", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));

  // Senza annotazioni il file resta com'era: formato 1, niente "annotations".
  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  const plain = JSON.parse(await (await download).createReadStream().then(readAll));
  expect(plain.version).toBe(1);
  expect(plain.annotations).toBeUndefined();

  await drawBox(page, [0.1, 0.2], [0.4, 0.6]);
  await page.keyboard.press("Escape");
  await labelField(page).fill("LAN 1");
  await labelField(page).press("Enter");
  await sidePanel(page).getByRole("radio", { name: "Rosso" }).check();
  await placeNote(page, [0.5, 0.85]);
  await page.keyboard.type("Prima riga\nSeconda riga");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  const saved = await (await download).createReadStream().then(readAll);
  const file = JSON.parse(saved);
  expect(file.version).toBe(2);
  expect(file.annotations).toHaveLength(2);
  expect(file.annotations[0]).toMatchObject({ kind: "box", id: "a1", color: "red", label: "LAN 1" });
  expect(file.annotations[1]).toMatchObject({ kind: "note", id: "a2", color: "blue", text: "Prima riga\nSeconda riga" });
  expect(file.network.devices.length).toBe(plain.network.devices.length);

  // Riaperto: le stesse annotazioni, nello stesso posto.
  const before = await page.locator("g.annotation").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  await openNetwork(page, "lezione.netsim.json", saved);
  // La lettura del file è asincrona: si aspetta che la rete nuova sia aperta.
  await expect(page.locator(".top .file")).toHaveText("lezione");
  const after = await page.locator("g.annotation").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(after).toEqual(before.map((label) => label?.replace(/, selezionat[oa]$/, "")));
  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  expect(JSON.parse(await (await download).createReadStream().then(readAll)).annotations).toEqual(file.annotations);

  // Un file di formato 1 si apre come sempre, senza annotazioni.
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await expect(page.locator("g.annotation")).toHaveCount(0);
  await expect(page.locator("g.device")).toHaveCount(4);
});

test("dentro un riquadro dispositivi e cavi restano da cliccare, e lo sfondo toglie la selezione", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  const pc = await boxOf(device(page, "PC1").locator("rect.box"));
  const sw = await boxOf(device(page, "SW1").locator("rect.box"));
  await tool(page, "Riquadro").click();
  await drag(page, { x: pc.x - 50, y: pc.y - 60 }, { x: sw.x + sw.width + 30, y: pc.y + pc.height + 70 });
  await page.keyboard.press("Escape");

  await device(page, "PC1").click();
  await expect(sidePanel(page).locator("header h2")).toHaveText("PC1");
  await cable(page, "PC1", "SW1").click({ force: true });
  await expect(sidePanel(page).locator("header h2")).toHaveText(/Cavo tra/);
  // Un punto vuoto dentro il riquadro: è il disegno, e toglie la selezione.
  // (Il PC si rimisura: con il pannello aperto il disegno può essersi spostato.)
  const now = await boxOf(device(page, "PC1").locator("rect.box"));
  await page.mouse.click(now.x + now.width / 2, now.y - 30);
  await expect(sidePanel(page).locator("header h2")).toHaveText("Nessuna selezione");
  // Il riquadro si seleziona dal bordo.
  const grip = await edgePoint(boxes(page).first());
  await page.mouse.click(grip.x, grip.y);
  await expect(sidePanel(page).locator("header h2")).toHaveText("Riquadro");
});

test("Ping e Collega non scelgono un'annotazione, e un ping attraversa un riquadro", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await placeNote(page, [0.5, 0.88]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await drawBox(page, [0.05, 0.05], [0.95, 0.75]);
  await page.keyboard.press("Escape");

  // Ping premuto: un clic sulla nota non è una destinazione, non parte nulla.
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await notes(page).first().click({ force: true });
  await expect(page.locator("g.packet")).toHaveCount(0);
  await expect(sidePanel(page).locator("header h2")).not.toHaveText("Nota");

  // Collega premuto: la nota non è l'altro capo.
  await device(page, "PC1").click();
  await action(page, "Collega PC1").click();
  await notes(page).first().click({ force: true });
  await expect(page.locator("line.wire")).toHaveCount(3);

  // Un ping vero, dentro il riquadro, arriva come sempre.
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await page.getByRole("button", { name: /Avvia/ }).click();
  await page.getByRole("tab", { name: "Eventi" }).click();
  await expect(page.locator("footer .list")).toContainText("echo reply", { timeout: 30_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();
});

test("zoom, spostamento della vista e Adatta tengono conto delle annotazioni, anche senza dispositivi", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await placeNote(page, [0.92, 0.92]);
  await page.keyboard.type("Lontana");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const pc = () => boxOf(device(page, "PC1").locator("rect.box"));
  const note = () => boxOf(notes(page).first().locator("rect.paper"));

  // La rotella e lo sfondo trascinato muovono nota e dispositivi insieme.
  const centre = await pointOn(page, 0.5, 0.5);
  await page.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
  const [pcA, noteA] = [await pc(), await note()];
  await drag(page, await pointOn(page, 0.5, 0.1), await pointOn(page, 0.3, 0.1));
  const [pcB, noteB] = [await pc(), await note()];
  expect(noteB.x - pcB.x).toBeCloseTo(noteA.x - pcA.x, 0);

  // Adatta riporta tutto in vista, nota compresa.
  await page.getByRole("button", { name: "Adatta" }).click();
  const area = await boxOf(page.locator(".canvas"));
  expect(inside(await note(), area)).toBe(true);
  expect(inside(await pc(), area)).toBe(true);

  // Su un foglio senza dispositivi, una nota si vede e Adatta la inquadra.
  // Ci sono modifiche non salvate: alla domanda si risponde di sì.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Progetto" }).click();
  await page.getByRole("menuitem", { name: "Nuova rete" }).click();
  await expect(page.locator("g.device")).toHaveCount(0);
  await placeNote(page, [0.9, 0.1]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByText("La rete è vuota")).toHaveCount(0);
  await page.getByRole("button", { name: "Adatta" }).click();
  expect(inside(await note(), await boxOf(page.locator(".canvas")))).toBe(true);
  await expect(page.getByRole("toolbar", { name: "Comandi della simulazione" })).toHaveCount(0);
});

test("in presentazione le annotazioni si vedono e si selezionano, ma non si modificano", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await drawBox(page, [0.1, 0.2], [0.4, 0.6]);
  await page.keyboard.press("Escape");
  await labelField(page).fill("LAN 1");
  await labelField(page).press("Enter");
  await placeNote(page, [0.5, 0.85]);
  await page.keyboard.type("Consegna");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Presenta" }).click();
  await expect(boxes(page)).toHaveCount(1);
  await expect(notes(page)).toHaveCount(1);
  await expect(tool(page, "Riquadro")).toHaveCount(0);
  // Il testo cresce con l'ingrandimento.
  const size = await notes(page).first().locator("text").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThan(14);

  const box = boxes(page).first();
  // Con l'ingrandimento i dispositivi crescono: si afferra il lato alto.
  const grip = await edgePoint(box, "top");
  await page.mouse.click(grip.x, grip.y);
  await expect(sidePanel(page).locator("header h2")).toHaveText("Riquadro");
  await expect(sidePanel(page)).toContainText("LAN 1");
  // Niente campi, niente Elimina, niente maniglie, niente barretta.
  await expect(sidePanel(page).locator("input, textarea")).toHaveCount(0);
  await expect(sidePanel(page).getByRole("button", { name: /Elimina/ })).toHaveCount(0);
  await expect(box.locator("rect.handle")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: /Azioni su/ })).toHaveCount(0);

  // Trascinare non sposta, Canc non elimina.
  const before = await boxOf(box.locator("rect.edge"));
  await drag(page, grip, { x: grip.x + 80, y: grip.y + 40 });
  expect((await boxOf(box.locator("rect.edge"))).x).toBeCloseTo(before.x, 0);
  await page.keyboard.press("Delete");
  await expect(boxes(page)).toHaveCount(1);
});

test("un'annotazione si seleziona da tastiera, con un nome comprensibile", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await drawBox(page, [0.1, 0.2], [0.4, 0.6]);
  await page.keyboard.press("Escape");
  await labelField(page).fill("LAN 1");
  await labelField(page).press("Enter");
  await page.keyboard.press("Escape"); // toglie la selezione

  const box = page.getByRole("button", { name: "Riquadro: LAN 1" });
  await box.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Riquadro: LAN 1, selezionato" })).toBeVisible();
  await expect(sidePanel(page).locator("header h2")).toHaveText("Riquadro");
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 900, height: 700 },
]) {
  test(`a ${size.width}×${size.height} strumenti e pannello delle annotazioni restano raggiungibili`, async ({ page }) => {
    await page.setViewportSize(size);
    await openApp(page);
    await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
    // Anche con la fascia in basso aperta, tutte le voci della colonna sono nella finestra.
    await page.getByRole("tab", { name: "Eventi" }).click();
    await expect(page.locator("footer .body")).toBeVisible();
    const column = await boxOf(page.locator(".shell > aside").first());
    for (const name of ["PC", "Cavo", "Riquadro", "Nota"]) {
      expect(inside(await boxOf(page.getByRole("button", { name, exact: true })), column)).toBe(true);
    }

    await placeNote(page, [0.4, 0.4]);
    await page.keyboard.type("Una nota");
    await page.keyboard.press("Control+Enter");
    await expect(textField(page)).toBeVisible();
    const panel = await boxOf(sidePanel(page));
    expect(inside(await boxOf(sidePanel(page).getByRole("radiogroup", { name: /Colore/ })), panel)).toBe(true);
    expect(await sidePanel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await expect(drawing(page)).toBeVisible();
  });
}

// Legge tutto il contenuto di un file scaricato.
async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}
