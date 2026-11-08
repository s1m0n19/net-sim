// Il criterio di accettazione degli strumenti dell'editor (SPEC, sezione 5),
// eseguito di fila come lo farebbe il docente che prepara una lezione:
// griglia, duplicare, router, annotazioni, file, presentazione, immagine.

import { expect, test, type Page } from "@playwright/test";
import { action, clickDrawing, device, drag, moreAction, openApp, openNetwork, sidePanel } from "./helpers";

const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);

// Dove sta un dispositivo sul disegno, in coordinate del disegno.
async function positionOf(page: Page, name: string): Promise<{ x: number; y: number }> {
  const transform = (await device(page, name).getAttribute("transform")) ?? "";
  const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform) ?? [];
  return { x: Number(x), y: Number(y) };
}

// Che cosa c'è in un'immagine PNG: il colore dell'angolo, e quanti pixel
// somigliano a ciascuno dei colori dati.
async function lookAt(page: Page, png: Buffer, colors: Record<string, [number, number, number]>) {
  return page.evaluate(
    async ({ data, colors }) => {
      const picture = new Image();
      picture.src = `data:image/png;base64,${data}`;
      await picture.decode();
      const canvas = document.createElement("canvas");
      canvas.width = picture.width;
      canvas.height = picture.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(picture, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const counts: Record<string, number> = Object.fromEntries(Object.keys(colors).map((name) => [name, 0]));
      for (let i = 0; i < pixels.length; i += 4) {
        for (const [name, [r, g, b]] of Object.entries(colors)) {
          if (Math.abs(pixels[i] - r) + Math.abs(pixels[i + 1] - g) + Math.abs(pixels[i + 2] - b) < 30) counts[name]++;
        }
      }
      return { width: canvas.width, height: canvas.height, corner: [pixels[0], pixels[1], pixels[2]], counts };
    },
    { data: png.toString("base64"), colors },
  );
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

test("la preparazione di una lezione con gli strumenti dell'editor, dall'inizio alla fine", async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);

  // 1. Griglia accesa: switch e PC cadono sui punti della griglia.
  await page.getByRole("button", { name: "Visualizza" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Griglia magnetica/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Switch/ }).click();
  await page.getByRole("menuitem", { name: "Switch a 8 porte" }).click();
  await clickDrawing(page, 0.33, 0.22);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await clickDrawing(page, 0.12, 0.5);
  await page.keyboard.press("Escape");
  for (const name of ["SW1", "PC1"]) {
    const { x, y } = await positionOf(page, name);
    expect([x % 20, y % 20]).toEqual([0, 0]);
  }

  // 2. Il PC configurato, duplicato quattro volte e collegato allo switch.
  await device(page, "PC1").click();
  await field(page, "ip").fill("192.168.1.10");
  await field(page, "ip").press("Enter");
  await field(page, "gateway").fill("192.168.1.1");
  await field(page, "gateway").press("Enter");
  for (let i = 0; i < 4; i++) await (await moreAction(page, "Duplica")).click();
  const macs = new Set<string>();
  for (let n = 1; n <= 5; n++) {
    await expect(device(page, `PC${n}`)).toContainText(`192.168.1.${9 + n}/24`);
    await device(page, `PC${n}`).click();
    await expect(field(page, "mask")).toHaveValue("255.255.255.0");
    await expect(field(page, "gateway")).toHaveValue("192.168.1.1");
    macs.add(await sidePanel(page).getByRole("region", { name: "Identità" }).locator(".value").innerText());
  }
  expect(macs.size).toBe(5);
  await expect(page.locator("line.wire")).toHaveCount(0);
  for (let n = 1; n <= 5; n++) {
    await device(page, `PC${n}`).click();
    await action(page, `Collega PC${n}`).click();
    await device(page, "SW1").click();
  }
  await expect(page.locator("line.wire")).toHaveCount(5);

  // 3. Un router e la sua copia: stesse interfacce, spente e senza indirizzi, nessuna rotta.
  await page.getByRole("button", { name: /^Router/ }).click();
  await page.getByRole("menuitem", { name: "Router a 4 interfacce" }).click();
  await clickDrawing(page, 0.62, 0.22);
  await page.keyboard.press("Escape");
  await device(page, "R1").click();
  await (await moreAction(page, "Duplica")).click();
  await expect(sidePanel(page).locator("header h2")).toHaveText("R2");
  await expect(sidePanel(page).getByRole("group", { name: /^Interfaccia Gi0\// })).toHaveCount(4);
  await expect(sidePanel(page).getByRole("button", { name: /: spenta, premi per accenderla/ })).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(field(page, `ip-Gi0/${i}`)).toHaveValue("");
  await expect(sidePanel(page).getByRole("region", { name: "Tabella di routing" })).toContainText("Vuota.");

  // 4. Un riquadro attorno alla LAN, verde, con l'etichetta; accanto una nota con la consegna.
  const first = await device(page, "PC1").boundingBox();
  const last = await device(page, "PC5").boundingBox();
  const sw = await device(page, "SW1").boundingBox();
  await page.getByRole("button", { name: "Riquadro", exact: true }).click();
  await drag(page, { x: first!.x - 30, y: sw!.y - 30 }, { x: last!.x + last!.width + 30, y: last!.y + last!.height + 30 });
  await page.keyboard.press("Escape");
  await field(page, "annotation-label").fill("LAN 192.168.1.0/24");
  await field(page, "annotation-label").press("Enter");
  await sidePanel(page).getByRole("radio", { name: "Verde" }).check();
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await clickDrawing(page, 0.15, 0.88);
  await page.keyboard.type("Consegna: fai ping da PC1 a PC5");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const box = page.locator("g.annotation.box");
  await expect(box).toHaveAttribute("aria-label", /^Riquadro: LAN 192.168.1.0\/24/);

  // 5. Si sposta, si ridimensiona dagli angoli, si elimina e torna con Annulla.
  const edge = (await box.locator("rect.edge").boundingBox())!;
  await drag(page, { x: edge.x + 1, y: edge.y + edge.height / 2 }, { x: edge.x + 21, y: edge.y + edge.height / 2 + 10 });
  const moved = (await box.locator("rect.edge").boundingBox())!;
  expect(moved.x).toBeGreaterThan(edge.x + 10);
  const se = (await box.locator("rect.handle.se").boundingBox())!;
  await drag(page, { x: se.x + se.width / 2, y: se.y + se.height / 2 }, { x: se.x + 40, y: se.y + 20 });
  expect((await box.locator("rect.edge").boundingBox())!.width).toBeGreaterThan(moved.width + 20);
  await action(page, "Elimina il riquadro dal disegno").click();
  await expect(box).toHaveCount(0);
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(box).toHaveCount(1);

  // 6. Salvata e riaperta: riquadro e nota sono al loro posto.
  const placed = await page.locator("g.annotation").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")?.replace(/, selezionat[oa]$/, "")));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  const saved = (await readAll(await (await download).createReadStream())).toString("utf8");
  await openNetwork(page, "lezione-lan.netsim.json", saved);
  await expect(page.locator(".top .file")).toHaveText("lezione-lan");
  expect(await page.locator("g.annotation").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(placed);

  // 7. In presentazione riquadro e nota si vedono, ma non si spostano né si modificano.
  await page.getByRole("button", { name: "Presenta" }).click();
  await expect(page.locator("g.annotation")).toHaveCount(2);
  const shown = (await box.locator("rect.edge").boundingBox())!;
  const top = { x: shown.x + shown.width * 0.5, y: shown.y + 1 };
  await page.mouse.click(top.x, top.y);
  await expect(sidePanel(page).locator("input, textarea")).toHaveCount(0);
  await drag(page, top, { x: top.x + 60, y: top.y + 40 });
  expect((await box.locator("rect.edge").boundingBox())!.x).toBeCloseTo(shown.x, 0);
  await page.getByRole("button", { name: "Esci" }).click();

  // 8. Con il tema scuro e una busta in viaggio, l'immagine è su sfondo chiaro,
  //    con riquadro e nota, e senza buste.
  await page.getByRole("button", { name: "Visualizza" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Tema scuro/ }).click();
  await page.keyboard.press("Escape");
  await device(page, "PC1").click();
  await action(page, "Ping da PC1").click();
  await device(page, "PC5").click();
  await page.getByRole("button", { name: /Passo/ }).click();
  await expect(page.locator("g.packet")).not.toHaveCount(0);
  const picture = page.waitForEvent("download");
  await page.getByRole("button", { name: "Progetto" }).click();
  await page.getByRole("menuitem", { name: "Esporta immagine…" }).click();
  const image = await picture;
  expect(image.suggestedFilename()).toBe("lezione-lan.png");
  const png = await readAll(await image.createReadStream());
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  const look = await lookAt(page, png, {
    green: [0x2f, 0x85, 0x5a], // il bordo del riquadro verde, tema chiaro
    note: [0x3a, 0x6f, 0xc4], // il segno della nota blu
    arp: [0xa6, 0x5f, 0x00], // le buste ARP, che non devono esserci
  });
  expect(look.corner).toEqual([251, 252, 253]); // lo sfondo del disegno del tema chiaro
  expect(look.counts.green).toBeGreaterThan(100);
  expect(look.counts.note).toBeGreaterThan(20);
  expect(look.counts.arp).toBe(0);
  // Doppia risoluzione: l'immagine è più grande del disegno sullo schermo.
  const area = (await page.locator(".canvas").boundingBox())!;
  expect(look.width).toBeGreaterThan(area.width);
  // Sullo schermo è tutto com'era: il tema scuro e la busta in viaggio.
  await expect(page.locator("g.packet")).not.toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("su un foglio vuoto l'esportazione non è disponibile; con una sola nota sì", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Progetto" }).click();
  await expect(page.getByRole("menuitem", { name: "Esporta immagine…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await clickDrawing(page, 0.5, 0.5);
  await page.keyboard.type("Solo una nota");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const picture = page.waitForEvent("download");
  await page.getByRole("button", { name: "Progetto" }).click();
  await page.getByRole("menuitem", { name: "Esporta immagine…" }).click();
  expect((await picture).suggestedFilename()).toBe("rete.png");
  // Il comando non c'è in presentazione, dove il menu Progetto non c'è.
  await page.getByRole("button", { name: "Presenta" }).click();
  await expect(page.getByRole("button", { name: "Progetto" })).toHaveCount(0);
});
