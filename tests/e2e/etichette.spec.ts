// Il nome di switch e router sotto o sopra il riquadro (D-139): sopra
// quando i cavi scendono e uno di loro taglia il nome, come nella rete ad
// albero delle lezioni. Il lato si sceglie con le misure dell'editor e non
// cambia con zoom, finestra, presentazione, simulazione o tema.

import { expect, test, type Page } from "@playwright/test";
import {
  action,
  cable,
  clickDrawing,
  device,
  drawing,
  centreOf,
  expectMargins,
  exportByDownload,
  measurePng,
  openApp,
  openNetwork,
  presentationZoom,
  projectCommand,
  textBox,
} from "./helpers";

// La rete ad albero delle lezioni: un router in cima, due switch, tre PC
// sotto ciascuno, con il PC centrale proprio sotto lo switch.
function treeNetwork(): string {
  let mac = 0;
  const nextMac = () => `02:00:00:00:00:${(++mac).toString(16).padStart(2, "0")}`;
  const host = (id: string, name: string, x: number, ip: string, gateway: string) => ({
    id, kind: "host", name, position: { x, y: 420 }, ports: [{ name: "Fa0", mac: nextMac() }], ip, mask: "255.255.255.0", gateway,
  });
  const sw = (id: string, name: string, x: number) => ({
    id, kind: "switch", name, position: { x, y: 260 }, ports: [1, 2, 3, 4].map((n) => ({ name: `Fa0/${n}`, mac: nextMac() })),
  });
  const devices = [
    { id: "r1", kind: "router", name: "R1", position: { x: 450, y: 120 }, routes: [],
      ports: [{ name: "Gi0/0", mac: nextMac(), ip: "192.168.1.1", mask: "255.255.255.0", enabled: true }, { name: "Gi0/1", mac: nextMac(), ip: "192.168.2.1", mask: "255.255.255.0", enabled: true }] },
    sw("s1", "SW1", 250), sw("s2", "SW2", 650),
    host("p1", "PC1", 130, "192.168.1.10", "192.168.1.1"), host("p2", "PC2", 250, "192.168.1.11", "192.168.1.1"), host("p3", "PC3", 370, "192.168.1.12", "192.168.1.1"),
    host("p4", "PC4", 530, "192.168.2.10", "192.168.2.1"), host("p5", "PC5", 650, "192.168.2.11", "192.168.2.1"), host("p6", "PC6", 770, "192.168.2.12", "192.168.2.1"),
  ];
  const link = (id: string, a: string, pa: string, b: string, pb: string) => ({ id, a: { deviceId: a, portName: pa }, b: { deviceId: b, portName: pb } });
  const links = [
    link("l1", "s1", "Fa0/1", "r1", "Gi0/0"), link("l2", "s2", "Fa0/1", "r1", "Gi0/1"),
    link("l3", "p1", "Fa0", "s1", "Fa0/2"), link("l4", "p2", "Fa0", "s1", "Fa0/3"), link("l5", "p3", "Fa0", "s1", "Fa0/4"),
    link("l6", "p4", "Fa0", "s2", "Fa0/2"), link("l7", "p5", "Fa0", "s2", "Fa0/3"), link("l8", "p6", "Fa0", "s2", "Fa0/4"),
  ];
  return JSON.stringify({ format: "net-sim", version: 1, network: { devices, links } });
}

// Il lato del nome di ogni dispositivo, letto dal disegno.
function sides(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("g.device")].map((g) => [
        g.getAttribute("aria-label")!.replace(", selezionato", ""),
        Number(g.querySelector("text.name")!.getAttribute("y")) < 0 ? "sopra" : "sotto",
      ]),
    ),
  );
}

const TREE_SIDES = { R1: "sotto", SW1: "sopra", SW2: "sopra", PC1: "sotto", PC2: "sotto", PC3: "sotto", PC4: "sotto", PC5: "sotto", PC6: "sotto" };

async function openTree(page: Page) {
  await openApp(page);
  await openNetwork(page, "albero.netsim.json", treeNetwork());
  await expect(device(page, "SW1")).toBeVisible();
}

test("nella rete ad albero SW1 e SW2 hanno il nome sopra, staccato dal riquadro e non attraversato; R1 e i PC sotto", async ({ page }) => {
  await openTree(page);
  expect(await sides(page)).toEqual(TREE_SIDES);
  for (const name of ["SW1", "SW2"]) {
    const box = (await device(page, name).locator("rect.box").boundingBox())!;
    const label = await textBox(device(page, name).locator("text.name"));
    // Sopra il riquadro, vicino, e centrato come prima.
    expect(label.y + label.height).toBeLessThanOrEqual(box.y);
    expect(box.y - (label.y + label.height)).toBeLessThan(20);
    expect(Math.abs(label.x + label.width / 2 - (box.x + box.width / 2))).toBeLessThan(1.5);
    // Nessun cavo passa sul nome: i cavi dello switch partono dal centro del riquadro.
    const crossed = await page.evaluate(
      ({ label }) =>
        [...document.querySelectorAll("line.wire")].some((line) => {
          const m = (line as SVGLineElement).getScreenCTM()!;
          const at = (x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
          const p = at(+line.getAttribute("x1")!, +line.getAttribute("y1")!);
          const q = at(+line.getAttribute("x2")!, +line.getAttribute("y2")!);
          for (let i = 0; i <= 100; i++) {
            const x = p.x + ((q.x - p.x) * i) / 100, y = p.y + ((q.y - p.y) * i) / 100;
            if (x > label.x && x < label.x + label.width && y > label.y && y < label.y + label.height) return true;
          }
          return false;
        }),
      { label },
    );
    expect(crossed, name).toBe(false);
  }
});

test("il lato non cambia con zoom, finestra, simulazione, pannello, fascia, tema e presentazione", async ({ page }) => {
  await openTree(page);
  const check = async (note: string) => expect(await sides(page), note).toEqual(TREE_SIDES);
  await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
  await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
  await check("zoom");
  await page.setViewportSize({ width: 900, height: 700 });
  await check("finestra 900×700");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await check("finestra 1920×1080");
  // Un ping che passa per lo switch, con la simulazione in corso.
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC2").click();
  await page.getByRole("button", { name: "Avvia" }).click();
  await expect(page.locator("g.packet").first()).toBeVisible();
  await check("simulazione");
  await page.getByRole("button", { name: /Pausa/ }).click();
  await page.getByRole("button", { name: "Chiudi il pannello laterale" }).click();
  await page.getByRole("button", { name: "Apri la fascia in basso" }).click();
  await check("pannello e fascia");
  await page.getByRole("button", { name: "Visualizza" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Tema scuro" }).click();
  await page.keyboard.press("Escape");
  await check("tema scuro");
  await page.getByRole("button", { name: "Presenta" }).click();
  for (const percent of [140, 180, 200]) {
    await presentationZoom(page, percent);
    await check(`presentazione ${percent}%`);
  }
});

test("eliminare il cavo che scende riporta il nome sotto; Annulla e Ripristina lo seguono", async ({ page }) => {
  await openTree(page);
  // Il cavo è verticale: per il clic non ha larghezza, lo si sceglie da tastiera.
  await cable(page, "PC2", "SW1").focus();
  await page.keyboard.press("Enter");
  await action(page, "Elimina il cavo dalla rete").click();
  await expect.poll(async () => (await sides(page)).SW1).toBe("sotto");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await sides(page)).SW1).toBe("sopra");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await sides(page)).SW1).toBe("sotto");
});

test("un cavo nuovo verso un PC proprio sotto lo switch porta il nome sopra", async ({ page }) => {
  await openApp(page);
  // Uno switch con due PC ai lati, alla stessa altezza: il nome sta sotto.
  await page.locator("aside").first().getByRole("button", { name: /^Switch/ }).click();
  await page.getByRole("menuitem", { name: "Switch a 8 porte" }).click();
  await clickDrawing(page, 0.5, 0.3);
  await page.keyboard.press("Escape");
  await page.locator("aside").first().getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.25, 0.3);
  await clickDrawing(page, 0.75, 0.3);
  await page.keyboard.press("Escape");
  for (const pc of ["PC1", "PC2"]) {
    await device(page, "SW1").click();
    await action(page, "Collega SW1").click();
    await device(page, pc).click();
  }
  expect((await sides(page)).SW1).toBe("sotto");
  // Un terzo PC proprio sotto, collegato: il cavo taglierebbe il nome.
  const sw = await centreOf(device(page, "SW1").locator("rect.box"));
  const area = (await drawing(page).boundingBox())!;
  await page.locator("aside").first().getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, (sw.x - area.x) / area.width, 0.75);
  await page.keyboard.press("Escape");
  await device(page, "SW1").click();
  await action(page, "Collega SW1").click();
  await device(page, "PC3").click();
  await expect.poll(async () => (await sides(page)).SW1).toBe("sopra");
});

test("trascinando un PC il nome dello switch non salta; si aggiorna quando lo si lascia", async ({ page }) => {
  await openTree(page);
  const from = await centreOf(device(page, "PC2").locator("rect.box"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // A metà strada il nome resta dov'era.
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + i * 12, from.y + i * 4);
  expect((await sides(page)).SW1).toBe("sopra");
  await page.mouse.move(from.x + 200, from.y + 60, { steps: 5 });
  expect((await sides(page)).SW1).toBe("sopra");
  await page.mouse.up();
  // Lasciato lontano, il suo cavo non passa più sul nome: torna sotto.
  await expect.poll(async () => (await sides(page)).SW1).toBe("sotto");
});

test("salvata e riaperta la rete ha gli stessi lati, e il file non li contiene", async ({ page }) => {
  await openTree(page);
  page.once("dialog", (dialog) => dialog.accept("albero-salvato"));
  const download = page.waitForEvent("download");
  await projectCommand(page, "Salva con nome…");
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text).not.toMatch(/above|sopra|nameSide/);
  await projectCommand(page, "Nuova rete");
  await openNetwork(page, "albero-salvato.netsim.json", text);
  await expect(device(page, "SW1")).toBeVisible();
  expect(await sides(page)).toEqual(TREE_SIDES);
});

test("nell'immagine esportata il nome sopra lo switch più in alto c'è tutto, con il margine", async ({ page }) => {
  // Lo switch è il dispositivo più in alto: il suo nome sopra è il primo inchiostro dell'immagine.
  await openApp(page);
  const tree = JSON.parse(treeNetwork());
  tree.network.devices = tree.network.devices.filter((d: { id: string }) => d.id !== "r1");
  tree.network.links = tree.network.links.filter((l: { b: { deviceId: string } }) => l.b.deviceId !== "r1");
  await openNetwork(page, "switch.netsim.json", JSON.stringify(tree));
  await expect(device(page, "SW1")).toBeVisible();
  expect((await sides(page)).SW1).toBe("sopra");
  expectMargins(await measurePng(page, await exportByDownload(page)));
});

test("con il nome sopra, selezionato con il mouse o con la tastiera, la barretta non lo copre", async ({ page }) => {
  await openTree(page);
  for (const how of ["mouse", "tastiera"]) {
    await page.keyboard.press("Escape");
    if (how === "mouse") await device(page, "SW1").click();
    else {
      await device(page, "SW1").focus();
      await page.keyboard.press("Enter");
    }
    await expect(device(page, "SW1")).toHaveAttribute("aria-label", "SW1, selezionato");
    const bar = (await page.getByRole("toolbar", { name: "Azioni su SW1" }).boundingBox())!;
    const label = await textBox(device(page, "SW1").locator("text.name"));
    const overlap = bar.x < label.x + label.width && label.x < bar.x + bar.width && bar.y < label.y + label.height && label.y < bar.y + bar.height;
    expect(overlap, how).toBe(false);
  }
});
