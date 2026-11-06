// La lezione del criterio di accettazione della CLI (SPEC.md, sezione 5):
// due router configurati per intero dal terminale, poi la CLI di uno switch.

import { expect, test, type Page } from "@playwright/test";
import {
  action,
  moreAction,
  clickDrawing,
  device,
  exampleFile,
  fillField,
  openApp,
  openNetwork,
  sidePanel,
  terminal,
  typeCommand,
} from "./helpers";

// La riga in cui si scrive, nel terminale aperto.
function prompt(page: Page) {
  return page.getByLabel(/Riga di comando/);
}

// Scrive più righe nella CLI aperta, una dopo l'altra.
async function typeLines(page: Page, lines: string[]): Promise<void> {
  for (const line of lines) await typeCommand(page, line);
}

// Le righe stampate sullo schermo del terminale, spazi compresi.
async function screenLines(page: Page): Promise<string[]> {
  return terminal(page).locator(".command, .output").allTextContents();
}

// Fa scorrere la simulazione alla velocità più alta.
async function runFast(page: Page): Promise<void> {
  const speed = page.getByRole("button", { name: /Velocità/ });
  while (!(await speed.getAttribute("aria-label"))!.startsWith("Velocità: 2×")) await speed.click();
  await page.getByRole("button", { name: /Avvia/ }).click();
}

// Posa un dispositivo dalla colonna, nel punto del disegno indicato.
async function place(page: Page, what: "PC" | "R2", fx: number): Promise<void> {
  if (what === "PC") {
    await page.getByRole("button", { name: "PC", exact: true }).click();
  } else {
    await page.getByRole("button", { name: /Router/ }).hover();
    await page.getByRole("menuitem", { name: "Router a 2 interfacce" }).click();
  }
  await clickDrawing(page, fx, 0.4);
  await page.keyboard.press("Escape");
}

test("la lezione sul routing statico, configurata tutta dalla CLI", async ({ page }) => {
  // Cinque ping e un traceroute in tempo reale, oltre a tutto il resto.
  test.setTimeout(240_000);

  // 1. Su un foglio vuoto: due PC e due router in fila, collegati; ai PC
  //    indirizzo e gateway dal pannello.
  await openApp(page);
  await place(page, "PC", 0.12);
  await place(page, "R2", 0.37);
  await place(page, "R2", 0.62);
  await place(page, "PC", 0.87);
  await page.getByRole("button", { name: "Cavo", exact: true }).click();
  for (const [from, to] of [["PC1", "R1"], ["R1", "R2"], ["R2", "PC2"]]) {
    await device(page, from).click();
    await device(page, to).click();
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("line.wire")).toHaveCount(3);
  await device(page, "PC1").click();
  await fillField(page, "ip", "192.168.1.10");
  await fillField(page, "gateway", "192.168.1.1");
  await device(page, "PC2").click();
  await fillField(page, "ip", "192.168.2.10");
  await fillField(page, "gateway", "192.168.2.1");

  // 2. La CLI del primo router: modalità utente, poi privilegiata, poi
  //    configurazione, e un nome nuovo.
  await device(page, "R1").click();
  await action(page, "Apri il terminale di R1").click();
  await expect(page.locator("form label", { hasText: "R1>" })).toBeVisible();
  await typeCommand(page, "enable");
  // 4. Tab completa la parola.
  await prompt(page).fill("conf");
  await prompt(page).press("Tab");
  await expect(prompt(page)).toHaveValue("configure ");
  await prompt(page).pressSequentially("terminal");
  await prompt(page).press("Enter");
  await expect(terminal(page)).toContainText("Enter configuration commands, one per line.");
  await typeCommand(page, "hostname Centro");
  await expect(device(page, "Centro")).toBeVisible();
  await expect(page.locator("form label", { hasText: "Centro(config)#" })).toBeVisible();

  // 3. Le interfacce, con le abbreviazioni. Il punto interrogativo dice
  //    che cosa può seguire, e la riga resta lì da finire.
  await prompt(page).fill("int ");
  await prompt(page).press("?");
  await expect(terminal(page)).toContainText("GigabitEthernet  Gigabit Ethernet interface");
  await expect(prompt(page)).toHaveValue("int ");
  await prompt(page).fill("int g");
  await prompt(page).press("Tab");
  await expect(prompt(page)).toHaveValue("int GigabitEthernet");
  await prompt(page).pressSequentially("0/0");
  await prompt(page).press("Enter");
  await typeLines(page, ["ip add 192.168.1.1 255.255.255.0", "no shut"]);
  await expect(terminal(page)).toContainText(
    "%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/0, changed state to up",
  );
  //    Pannello e disegno mostrano le stesse cose.
  await expect(sidePanel(page)).toContainText("192.168.1.0/24");
  await expect(page.locator("text.address", { hasText: "192.168.1.1/24" })).toBeVisible();
  await typeLines(page, ["int gi0/1", "ip add 10.0.0.1 255.255.255.252", "no shut"]);
  // Dall'altra parte R2 è ancora spento: il collegamento resta giù.
  await expect(terminal(page)).toContainText("GigabitEthernet0/1, changed state to down");

  // 5. La rotta statica; poi tutto da capo sul secondo router.
  await typeLines(page, ["exit", "ip route 192.168.2.0 255.255.255.0 10.0.0.2", "end"]);
  await device(page, "R2").click();
  await action(page, "Apri il terminale di R2").click();
  await typeLines(page, [
    "en",
    "conf t",
    "int gi0/0",
    "ip add 10.0.0.2 255.255.255.252",
    "no shut",
    "int gi0/1",
    "ip add 192.168.2.1 255.255.255.0",
    "no shut",
    "ip route 192.168.1.0 255.255.255.0 10.0.0.1",
    "end",
  ]);
  await expect(page.locator("rect.shut")).toHaveCount(0);
  await expect(sidePanel(page)).toContainText("192.168.1.0/24");

  // 6. I controlli.
  await typeCommand(page, "show ip interface brief");
  await expect(terminal(page)).toContainText("GigabitEthernet0/1 192.168.2.1 YES manual up up");
  await typeCommand(page, "show ip route");
  await expect(terminal(page)).toContainText("S 192.168.1.0/24 [1/0] via 10.0.0.1");
  await typeCommand(page, "show running-config");
  await expect(terminal(page)).toContainText("ip route 192.168.1.0 255.255.255.0 10.0.0.1");

  // 8. Un comando sbagliato: il segno sta sotto il primo carattere che
  //    non va, contando il prompt ("R2#" più "sh").
  await typeCommand(page, "shw ip route");
  await expect(terminal(page)).toContainText("% Invalid input detected at '^' marker.");
  expect(await screenLines(page)).toContain(`${" ".repeat("R2#sh".length)}^`);

  // 7. Dal router, il ping verso il PC lontano, e poi la strada.
  await typeCommand(page, "ping 192.168.1.10");
  await runFast(page);
  await expect(terminal(page)).toContainText("!!!!!", { timeout: 60_000 });
  await expect(terminal(page)).toContainText("Success rate is 100 percent (5/5)");
  await typeCommand(page, "traceroute 192.168.1.10");
  await expect(terminal(page)).toContainText(/2 192\.168\.1\.10 \d+ msec/, { timeout: 60_000 });
  await expect(terminal(page)).toContainText(/1 10\.0\.0\.1 \d+ msec/);
  await page.getByRole("button", { name: /Pausa/ }).click();
});

test("la CLI di uno switch: tabella MAC e una porta spenta", async ({ page }) => {
  test.setTimeout(120_000);

  // 9. PC1 ── SW1 ── R1 ── SW2 ── PC2. Un ping da PC1 al router, nella
  //    stessa LAN, fa imparare a SW1 i MAC dei due.
  await openApp(page);
  await openNetwork(page, "due-lan-router.netsim.json", exampleFile("due-lan-router"));
  await device(page, "PC1").click();
  await action(page, "Apri il terminale di PC1").click();
  await typeCommand(page, "ping -n 1 192.168.1.1");
  await runFast(page);
  await expect(terminal(page)).toContainText("Reply from 192.168.1.1", { timeout: 40_000 });
  await page.getByRole("button", { name: /Pausa/ }).click();

  //    Dalla CLI di SW1 si guarda la tabella MAC, e si spegne la porta di PC1.
  await device(page, "SW1").click();
  await action(page, "Apri il terminale di SW1").click();
  await typeCommand(page, "en");
  await typeCommand(page, "show mac address-table");
  await expect(terminal(page)).toContainText(/02:00:00:00:00:01 +DYNAMIC +Fa0\/1/);
  await expect(page.locator("rect.shut")).toHaveCount(0);
  await typeLines(page, ["conf t", "int fa0/1", "shutdown"]);
  await expect(terminal(page)).toContainText("FastEthernet0/1, changed state to administratively down");
  //    La porta spenta si vede sul disegno, sul cavo di PC1.
  await expect(page.locator("rect.shut")).toHaveCount(1);

  // Spento lo switch, il terminale resta ma non ha più la riga di comando:
  // un avviso lo dice, e la scheda lo segna. Riacceso, si scrive di nuovo.
  await device(page, "SW1").click();
  await (await moreAction(page, "Spegni")).click();
  await expect(page.getByRole("status")).toContainText("SW1 è spento.");
  await expect(page.getByRole("tab", { name: /Terminale · SW1 · spento/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /Riga di comando di SW1/ })).toHaveCount(0);
  await (await moreAction(page, "Accendi")).click();
  await expect(page.getByRole("textbox", { name: /Riga di comando di SW1/ })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});
