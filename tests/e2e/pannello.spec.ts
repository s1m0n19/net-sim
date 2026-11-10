// Il pannello laterale (D-114): l'intestazione, la configurazione di PC,
// server e router, le tabelle, le rotte statiche, gli strati di un
// pacchetto. Si guarda che i campi si usino davvero e si leggano per
// intero, non solo che ci siano.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { cable, clickDrawing, device, exampleFile, fillField, openApp, openInterface, openNetwork, openRouteForm, sidePanel } from "./helpers";

const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);
const section = (page: Page, title: string) => sidePanel(page).getByRole("region", { name: title, exact: true });

// Il testo del campo si vede tutto, senza tagli.
async function expectReadable(input: Locator): Promise<void> {
  await expect(input).toBeVisible();
  // Il testo sta tutto nel campo: nulla da scorrere. Le due misure finiscono
  // nel messaggio, così un fallimento dice di quanto.
  const { scroll, client, value } = await input.evaluate((el: HTMLInputElement) => ({ scroll: el.scrollWidth, client: el.clientWidth, value: el.value }));
  expect(scroll, `«${value}» nel campo: larghezza del testo e del campo`).toBeLessThanOrEqual(client);
}

// Apre la scheda dell'interfaccia di un campo come "ip-Gi0/1", se è di
// un'interfaccia: chiusa, i suoi campi non si vedono (D-131).
async function reveal(page: Page, name: string): Promise<void> {
  const port = /^(?:ip|mask)-(.+)$/.exec(name)?.[1];
  if (port !== undefined) await openInterface(page, port);
}

// Scrive in un campo qualsiasi del pannello e conferma con Invio.
async function fill(page: Page, name: string, text: string): Promise<void> {
  await reveal(page, name);
  await field(page, name).fill(text);
  await field(page, name).press("Enter");
}

async function addRoute(page: Page, network: string, mask: string, nextHop: string): Promise<void> {
  await openRouteForm(page);
  await field(page, "route-network").fill(network);
  await field(page, "route-mask").fill(mask);
  await field(page, "route-next-hop").fill(nextHop);
  await page.getByRole("button", { name: "Aggiungi rotta" }).click();
}

test("PC e server: identità e configurazione IPv4, con Invio, uscendo dal campo ed Esc", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();

  // L'intestazione: nome, tipo e stati.
  await expect(sidePanel(page).locator("header h2")).toHaveText("PC1");
  await expect(sidePanel(page).locator("header")).toContainText("PC · acceso · segnale presente");
  // Due gruppi: identità (nome e MAC) e configurazione IPv4.
  await expect(section(page, "Identità")).toContainText("02:00:00:00:00:01");
  await expect(section(page, "Identità").locator('[data-field="name"]')).toHaveValue("PC1");
  for (const name of ["ip", "mask", "gateway"]) {
    await expect(section(page, "Configurazione IPv4").locator(`[data-field="${name}"]`)).toBeVisible();
  }
  // Ogni campo ha la sua etichetta.
  await expect(page.getByLabel("Indirizzo IP")).toHaveValue("192.168.1.10");
  await expect(page.getByLabel("Subnet mask")).toHaveValue("255.255.255.0");

  // Invio conferma.
  await fillField(page, "ip", "192.168.1.20");
  await expect(device(page, "PC1")).toContainText("192.168.1.20/24");
  // Uscire dal campo conferma.
  await field(page, "gateway").fill("192.168.1.1");
  await field(page, "gateway").press("Tab");
  await device(page, "PC2").click();
  await device(page, "PC1").click();
  await expect(field(page, "gateway")).toHaveValue("192.168.1.1");

  // Esc rimette il valore della rete e non toglie la selezione.
  await field(page, "ip").fill("10.0.0.1");
  await field(page, "ip").press("Escape");
  await expect(field(page, "ip")).toHaveValue("192.168.1.20");
  await expect(sidePanel(page).locator("header h2")).toHaveText("PC1");
  await expect(device(page, "PC1")).toContainText("192.168.1.20/24");

  // Un server ha gli stessi due gruppi.
  await page.getByRole("button", { name: "Server", exact: true }).click();
  await clickDrawing(page, 0.85, 0.85);
  await page.keyboard.press("Escape");
  await device(page, "SRV1").click();
  await expect(sidePanel(page).locator("header")).toContainText("Server · acceso");
  await fillField(page, "ip", "192.168.1.50");
  await expect(field(page, "mask")).toHaveValue("255.255.255.0");
  await expect(section(page, "Configurazione IPv4")).toBeVisible();
});

test("un valore rifiutato resta scritto, con il motivo legato al campo, e la rete non cambia", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();

  await fillField(page, "ip", "192.168.1.300");
  const ip = field(page, "ip");
  await expect(ip).toHaveValue("192.168.1.300");
  await expect(ip).toHaveAttribute("aria-invalid", "true");
  const problemId = await ip.getAttribute("aria-describedby");
  const problem = page.locator(`[id="${problemId}"]`);
  await expect(problem).toHaveText(/Indirizzo IP non valido/);
  await expect(problem).toHaveAttribute("role", "alert");
  await expect(device(page, "PC1")).toContainText("192.168.1.10/24");

  // Su un altro dispositivo non resta né la bozza né l'errore.
  await device(page, "PC2").click();
  await expect(field(page, "ip")).toHaveValue("192.168.1.11");
  await expect(field(page, "ip")).toHaveAttribute("aria-invalid", "false");
  await expect(sidePanel(page)).not.toContainText("non valido");
});

test("un router: interfacce accese e spente, con indirizzo o senza, e due router diversi", async ({ page }) => {
  await openApp(page);
  for (const [x, count] of [[0.3, 4], [0.7, 8]] as const) {
    await page.getByRole("button", { name: /^Router/ }).click();
    await page.getByRole("menuitem", { name: `Router a ${count} interfacce` }).click();
    await clickDrawing(page, x, 0.5);
    await page.keyboard.press("Escape");
  }

  await device(page, "R1").click();
  const interfaces = sidePanel(page).getByRole("group", { name: /^Interfaccia Gi0\// });
  await expect(interfaces).toHaveCount(4);
  // Spenta e senza indirizzo: due cose che si leggono diverse.
  const gi0 = sidePanel(page).getByRole("group", { name: "Interfaccia Gi0/0" });
  await expect(gi0.getByRole("button", { name: /Interfaccia Gi0\/0: spenta/ })).toHaveText("spenta");
  await expect(field(page, "ip-Gi0/0")).toHaveAttribute("placeholder", "nessun indirizzo");

  // Accesa, poi due interfacce configurate.
  await page.getByRole("button", { name: /Interfaccia Gi0\/0: spenta/ }).click();
  await expect(gi0.getByRole("button", { name: /Interfaccia Gi0\/0: accesa/ })).toHaveAttribute("aria-pressed", "true");
  await fill(page, "ip-Gi0/0", "192.168.1.1");
  await expect(field(page, "mask-Gi0/0")).toHaveValue("255.255.255.0");
  await fill(page, "ip-Gi0/1", "10.0.0.1");
  await fill(page, "mask-Gi0/1", "255.255.255.252");
  await expectReadable(field(page, "mask-Gi0/1"));
  // Spenta di nuovo: l'indirizzo resta.
  await page.getByRole("button", { name: /Interfaccia Gi0\/0: accesa/ }).click();
  await expect(field(page, "ip-Gi0/0")).toHaveValue("192.168.1.1");

  // Il secondo router ha le sue otto interfacce, vuote: nulla del primo.
  await reveal(page, "ip-Gi0/2");
  await field(page, "ip-Gi0/2").fill("172.16.0.1");
  await device(page, "R2").click();
  await expect(interfaces).toHaveCount(8);
  for (let i = 0; i < 8; i++) await expect(field(page, `ip-Gi0/${i}`)).toHaveValue("");
  await expect(sidePanel(page).locator("header h2")).toHaveText("R2");
  await reveal(page, "ip-Gi0/7");
  await field(page, "ip-Gi0/7").scrollIntoViewIfNeeded();
  await expect(field(page, "ip-Gi0/7")).toBeInViewport();
});

test("tabelle ARP e MAC, e i pulsanti per appuntarle", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await expect(section(page, "Tabella ARP")).toContainText("Vuota.");

  // Un ping a passi riempie le tabelle.
  await page.getByRole("button", { name: "Apri il terminale di PC1" }).click();
  await page.getByLabel(/Riga di comando/).fill("ping -n 1 192.168.1.11");
  await page.getByLabel(/Riga di comando/).press("Enter");
  await page.getByRole("button", { name: /Avvia/ }).click();
  await expect(section(page, "Tabella ARP").locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();
  await expect(section(page, "Tabella ARP").locator("thead th")).toHaveText(["Indirizzo IP", "Indirizzo MAC"]);
  await expect(section(page, "Tabella ARP").locator("tbody")).toContainText("192.168.1.11");

  await device(page, "SW1").click();
  const mac = section(page, "Tabella MAC");
  await expect(mac.locator("thead th")).toHaveText(["Indirizzo MAC", "Porta"]);
  await expect(mac.locator("tbody tr")).not.toHaveCount(0);

  // Il pulsante dice di quale tabella è, e se è appuntata.
  const pin = mac.getByRole("button", { name: "appunta" });
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  await expect(pin).toHaveAccessibleDescription("Tabella MAC");
  await pin.click();
  await expect(mac.getByRole("button", { name: /appuntata/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("g.table")).toContainText("Tabella MAC · SW1");
  await mac.getByRole("button", { name: /appuntata/ }).click();
  await expect(page.locator("g.table")).toHaveCount(0);
});

test("la tabella di routing: rotte collegate e statiche, una non usata, aggiungere e togliere", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  await device(page, "R1").click();
  const routing = section(page, "Tabella di routing");
  const routes = routing.getByRole("list", { name: "Rotte" }).locator("li:not(.heading)");
  await expect(routes).toHaveCount(2);
  await expect(routes.nth(0)).toContainText("C");
  await expect(routes.nth(0)).toContainText("192.168.1.0/24");
  await expect(routing).toContainText("rete collegata");

  // Una statica usata, e una con indirizzi lunghi il cui prossimo salto
  // non sta su una rete collegata: non usata.
  await addRoute(page, "192.168.3.0", "/24", "10.0.0.2");
  await expect(field(page, "route-network")).toHaveValue("");
  await addRoute(page, "172.16.128.0", "255.255.128.0", "192.168.200.254");
  await expect(routes).toHaveCount(4);
  await expect(routes.nth(2)).toContainText("S");
  await expect(routes.nth(2)).toContainText("10.0.0.2");
  await expect(routes.nth(2)).toContainText("Gi0/1");
  await expect(routes.nth(3)).toContainText("non usata");
  // Anche con gli indirizzi più lunghi il pannello non scorre di lato.
  expect(await sidePanel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  // Un dato rifiutato: il motivo sotto il modulo, e i campi restano.
  await addRoute(page, "192.168.3.7", "/24", "10.0.0.2");
  await expect(routing.getByRole("alert")).toContainText("non è un indirizzo di rete");
  await expect(field(page, "route-network")).toHaveValue("192.168.3.7");

  await page.getByRole("button", { name: "Togli la rotta verso 172.16.128.0/17 via 192.168.200.254" }).click();
  await expect(routes).toHaveCount(3);
});

test("gli strati di un pacchetto: Ethernet con dentro ARP, oppure IPv4 con dentro ICMP", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC1").click();
  await page.getByRole("button", { name: "Apri il terminale di PC1" }).click();
  await page.getByLabel(/Riga di comando/).fill("ping -n 1 192.168.1.11");
  await page.getByLabel(/Riga di comando/).press("Enter");
  await page.getByRole("button", { name: /Passo/ }).click();

  await page.locator("g.packet").first().click();
  const ethernet = sidePanel(page).locator(".layer").first();
  await expect(ethernet.locator(":scope > strong")).toHaveText("Ethernet");
  await expect(ethernet.locator(":scope > .layer > strong")).toHaveText("ARP");
  await expect(ethernet).toContainText("ff:ff:ff:ff:ff:ff");
  await expect(sidePanel(page).locator("header")).toContainText("In viaggio");

  // Avanti finché non viaggia l'echo request.
  const icmpPacket = page.locator('g.packet[aria-label^="ICMP"]');
  for (let i = 0; i < 12 && (await icmpPacket.count()) === 0; i++) {
    await page.getByRole("button", { name: /Passo/ }).click();
    await page.waitForTimeout(900);
  }
  await icmpPacket.first().click();
  const outer = sidePanel(page).locator(".layer").first();
  await expect(outer.locator(":scope > strong")).toHaveText("Ethernet");
  const ipv4 = outer.locator(":scope > .layer");
  await expect(ipv4.locator(":scope > strong")).toHaveText("IPv4");
  await expect(ipv4.locator(":scope > .layer > strong")).toHaveText("ICMP");
  await expect(ipv4).toContainText("TTL");
  await expect(ipv4).toContainText("echo request");
  // Arrivato, il pacchetto resta leggibile.
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /Passo/ }).click();
    await page.waitForTimeout(900);
  }
  await expect(sidePanel(page).locator("header")).toContainText("Arrivato");
  await expect(ipv4).toContainText("echo request");
});

test("il pannello passa da un dispositivo a un cavo e a un pacchetto, e chiuderlo non cambia nulla", async ({ page }) => {
  await openApp(page);
  await openNetwork(page, "lan-switch.netsim.json", exampleFile("lan-switch"));
  await device(page, "PC2").click();
  await expect(sidePanel(page).locator("header h2")).toHaveText("PC2");

  await cable(page, "PC2", "SW1").click({ force: true });
  await expect(sidePanel(page).locator("header h2")).toHaveText("Cavo tra PC2 e SW1");
  await expect(sidePanel(page).locator("header")).toContainText("Collegato · segnale presente");
  await expect(section(page, "Capi del cavo")).toContainText("SW1 · Fa0/2");

  await device(page, "PC1").click();
  await page.getByRole("button", { name: "Ping da PC1: poi fai clic sulla destinazione" }).click();
  await device(page, "PC2").click();
  await page.locator("g.packet").first().click();
  await expect(section(page, "Contenuto del frame")).toContainText("Ethernet");

  // Chiudere e riaprire il pannello non tocca la rete.
  await device(page, "PC1").click();
  await page.getByRole("button", { name: "Chiudi il pannello laterale" }).click();
  await page.getByRole("button", { name: "Apri il pannello laterale" }).click();
  await expect(field(page, "ip")).toHaveValue("192.168.1.10");
  await expect(page.getByRole("button", { name: "Annulla" })).toBeDisabled();
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 900, height: 700 },
]) {
  test(`a ${size.width}×${size.height} il pannello del router si legge, anche in presentazione`, async ({ page }) => {
    await page.setViewportSize(size);
    await openApp(page);
    await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
    await device(page, "R1").click();
    await addRoute(page, "172.16.128.0", "255.255.128.0", "192.168.200.254");

    const check = async () => {
      expect(await sidePanel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      for (const name of ["ip-Gi0/0", "mask-Gi0/1"]) await reveal(page, name);
      for (const name of ["ip-Gi0/0", "mask-Gi0/1"]) await expectReadable(field(page, name));
    };
    await check();

    await page.getByRole("button", { name: "Presenta" }).click();
    await device(page, "R1").click();
    const smaller = page.getByRole("button", { name: "Rimpicciolisci testo e disegno" });
    const larger = page.getByRole("button", { name: "Ingrandisci testo e disegno" });
    while (await smaller.isEnabled()) await smaller.click();
    for (;;) {
      await check();
      if (!(await larger.isEnabled())) break;
      await larger.click();
    }
  });
}

test("se il pannello perde spazio (una barra di scorrimento larga), gli indirizzi delle interfacce restano interi", async ({ page }) => {
  // Firefox su Linux mette nel pannello una barra di scorrimento che occupa
  // posto dentro la parte che scorre, mentre il pannello resta largo uguale:
  // qui la si imita togliendo 40 pixel a ciò che il pannello contiene (D-123).
  const squeeze = () =>
    sidePanel(page).evaluate((panel) => {
      for (const el of [panel, ...panel.querySelectorAll<HTMLElement>("*")]) {
        if (getComputedStyle(el).containerName === "panel") for (const child of el.children) (child as HTMLElement).style.marginRight = "40px";
      }
    });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
  await page.getByRole("button", { name: "Presenta" }).click();
  await device(page, "R1").click();
  const larger = page.getByRole("button", { name: "Ingrandisci testo e disegno" });
  for (;;) {
    for (const name of ["ip-Gi0/0", "mask-Gi0/1"]) await reveal(page, name);
    await squeeze();
    for (const name of ["ip-Gi0/0", "mask-Gi0/1"]) await expectReadable(field(page, name));
    if (!(await larger.isEnabled())) break;
    await larger.click();
  }
});

test.describe("le interfacce di un router come schede (D-131)", () => {
  const card = (page: Page, name: string) => sidePanel(page).getByRole("group", { name: `Interfaccia ${name}`, exact: true });
  const toggle = (page: Page, name: string) => card(page, name).locator("button.disclosure");

  test("all'inizio tutte chiuse, con nome, stato e indirizzo; si aprono con un clic o da tastiera, anche più insieme", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
    await device(page, "R1").click();
    for (const name of ["Gi0/0", "Gi0/1"]) {
      await expect(toggle(page, name)).toHaveAttribute("aria-expanded", "false");
      await expect(field(page, `ip-${name}`)).toBeHidden();
    }
    // Chiusa, la scheda dice nome e indirizzo con il prefisso, e lo stato.
    await expect(toggle(page, "Gi0/0")).toHaveText(/Gi0\/0\s*192\.168\.1\.1\/24/);
    await expect(card(page, "Gi0/0").getByRole("button", { name: /accesa/ })).toBeVisible();
    // Il pulsante dice che cosa apre.
    const controlled = await toggle(page, "Gi0/0").getAttribute("aria-controls");
    await expect(page.locator(`[id="${controlled}"]`)).toBeHidden();

    await toggle(page, "Gi0/0").click();
    await expect(toggle(page, "Gi0/0")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`[id="${controlled}"]`)).toBeVisible();
    await expect(field(page, "ip-Gi0/0")).toHaveValue("192.168.1.1");
    // Da tastiera, e senza chiudere l'altra.
    await toggle(page, "Gi0/1").focus();
    await page.keyboard.press("Enter");
    await expect(field(page, "mask-Gi0/1")).toBeVisible();
    await expect(field(page, "ip-Gi0/0")).toBeVisible();
    // Un altro clic la richiude.
    await toggle(page, "Gi0/0").click();
    await expect(field(page, "ip-Gi0/0")).toBeHidden();
  });

  test("una modifica, l'interruttore, Annulla e la simulazione non aprono né chiudono le schede", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: /^Router/ }).click();
    await page.getByRole("menuitem", { name: "Router a 8 interfacce" }).click();
    await clickDrawing(page, 0.5, 0.5);
    await page.keyboard.press("Escape");
    await device(page, "R1").click();
    await expect(toggle(page, "Gi0/3")).toHaveText(/nessun indirizzo/);

    await toggle(page, "Gi0/3").click();
    await fill(page, "ip-Gi0/3", "10.3.0.1");
    // Il riassunto si aggiorna, la scheda resta aperta.
    await expect(toggle(page, "Gi0/3")).toHaveText(/10\.3\.0\.1\/8/);
    await expect(field(page, "ip-Gi0/3")).toBeVisible();
    // Accenderla dalla riga non apre né chiude nulla.
    await card(page, "Gi0/5").getByRole("button", { name: /spenta/ }).click();
    await expect(card(page, "Gi0/5").getByRole("button", { name: /accesa/ })).toBeVisible();
    await expect(toggle(page, "Gi0/5")).toHaveAttribute("aria-expanded", "false");
    await expect(field(page, "ip-Gi0/3")).toBeVisible();
    // Annulla e Ripristina cambiano la rete, non le schede.
    await page.getByRole("button", { name: "Annulla", exact: true }).click();
    await page.getByRole("button", { name: "Annulla", exact: true }).click();
    await expect(toggle(page, "Gi0/3")).toHaveText(/nessun indirizzo/);
    await expect(field(page, "ip-Gi0/3")).toBeVisible();
    await page.getByRole("button", { name: "Ripristina", exact: true }).click();
    await expect(toggle(page, "Gi0/3")).toHaveText(/10\.3\.0\.1\/8/);
    await expect(toggle(page, "Gi0/3")).toHaveAttribute("aria-expanded", "true");
  });

  test("ciò che si stava scrivendo resta anche chiudendo la scheda; cambiando router si riparte chiusi", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
    await device(page, "R1").click();
    await toggle(page, "Gi0/1").click();
    // Un indirizzo rifiutato resta nel campo, con il motivo (D-53).
    await fill(page, "ip-Gi0/1", "10.0.0.3/30");
    await expect(field(page, "ip-Gi0/1")).toHaveValue("10.0.0.3/30");
    await toggle(page, "Gi0/1").click();
    await toggle(page, "Gi0/1").click();
    await expect(field(page, "ip-Gi0/1")).toHaveValue("10.0.0.3/30");

    await device(page, "R2").click();
    await expect(toggle(page, "Gi0/1")).toHaveAttribute("aria-expanded", "false");
    await device(page, "R1").click();
    await expect(toggle(page, "Gi0/1")).toHaveAttribute("aria-expanded", "false");
  });

  test("su un router a otto interfacce la tabella di routing si vede senza scorrere", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page);
    await page.getByRole("button", { name: /^Router/ }).click();
    await page.getByRole("menuitem", { name: "Router a 8 interfacce" }).click();
    await clickDrawing(page, 0.5, 0.5);
    await page.keyboard.press("Escape");
    await device(page, "R1").click();
    await expect(section(page, "Tabella di routing")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Nuova rotta statica" })).toBeInViewport();
  });

  test("il modulo delle rotte si apre con un clic; la tabella resta sempre in vista", async ({ page }) => {
    await openApp(page);
    await openNetwork(page, "tre-reti.netsim.json", exampleFile("tre-reti-due-router"));
    await device(page, "R1").click();
    const routes = section(page, "Tabella di routing").getByRole("list", { name: "Rotte" });
    await expect(routes).toBeVisible();
    const open = page.getByRole("button", { name: "Nuova rotta statica" });
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await expect(field(page, "route-network")).toBeHidden();
    await open.click();
    await expect(field(page, "route-network")).toBeVisible();
    await field(page, "route-network").fill("192.168.3.0");
    // Chiuso e riaperto, ciò che si era scritto c'è ancora.
    await open.click();
    await open.click();
    await expect(field(page, "route-network")).toHaveValue("192.168.3.0");
    await field(page, "route-mask").fill("/24");
    await field(page, "route-next-hop").fill("10.0.0.2");
    await page.getByRole("button", { name: "Aggiungi rotta" }).click();
    await expect(routes.locator("li:not(.heading)")).toHaveCount(3);
    await expect(field(page, "route-network")).toBeVisible();
  });
});
