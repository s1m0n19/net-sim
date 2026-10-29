import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import threeFile from "../../examples/tre-reti-due-router.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";

// Ciò che si legge sullo schermo di un terminale, riga per riga.
function screenOf(deviceId: string): string[] {
  const terminal = session.terminals.find((t) => t.deviceId === deviceId)!;
  return terminal.entries.flatMap((entry) => [`${entry.prompt}${entry.command}`, ...session.outputOf(deviceId, entry)]);
}

function terminalOf(deviceId: string) {
  return session.terminals.find((t) => t.deviceId === deviceId)!;
}

// Scrive più righe nella CLI di un dispositivo.
function type(deviceId: string, lines: string[]): void {
  for (const line of lines) session.execute(deviceId, line);
}

function runToEnd(): void {
  while (session.view.nextEvent !== null) session.step();
}

function router(id = "r1") {
  return session.view.devices.find((device) => device.id === id)!;
}

describe("aprire la CLI", () => {
  beforeEach(() => {
    session.open("due-lan-router.netsim.json", routerFile);
  });

  test("su un router si apre la CLI, in modalità utente", () => {
    session.openTerminal("r1");

    expect(terminalOf("r1").cli).toEqual({ mode: "user", interfaceName: null });
    expect(session.promptOf(terminalOf("r1"))).toBe("R1>");
  });

  test("su un PC resta il prompt di Windows", () => {
    session.openTerminal("d1");

    expect(terminalOf("d1").cli).toBeNull();
    expect(session.promptOf(terminalOf("d1"))).toBe("C:\\>");
  });

  test("ogni riga ricorda il prompt che aveva", () => {
    session.openTerminal("r1");

    type("r1", ["enable", "configure terminal", "interface gi0/0", "end"]);

    expect(screenOf("r1")).toEqual([
      "R1>enable",
      "R1#configure terminal",
      "Enter configuration commands, one per line.  End with CNTL/Z.",
      "R1(config)#interface gi0/0",
      "R1(config-if)#end",
    ]);
    expect(session.promptOf(terminalOf("r1"))).toBe("R1#");
  });

  test("chiusa e riaperta, la CLI riparte dalla modalità utente", () => {
    session.openTerminal("r1");
    type("r1", ["enable"]);

    session.closeTerminal("r1");
    session.openTerminal("r1");

    expect(session.promptOf(terminalOf("r1"))).toBe("R1>");
  });

  test("ricominciando, e spegnendo il dispositivo, la CLI torna alla modalità utente", () => {
    session.openTerminal("r1");
    type("r1", ["enable", "conf t"]);
    session.restart();
    expect(session.promptOf(terminalOf("r1"))).toBe("R1>");

    type("r1", ["enable"]);
    session.togglePower("r1");
    session.togglePower("r1");
    expect(session.promptOf(terminalOf("r1"))).toBe("R1>");
  });
});

describe("configurare dalla CLI", () => {
  beforeEach(() => {
    session.open("tre-reti-due-router.netsim.json", threeFile);
    session.openTerminal("r1");
    type("r1", ["enable", "conf t"]);
  });

  test("ciò che si scrive compare nel pannello", () => {
    type("r1", ["int gi0/1", "shutdown"]);

    expect(router().interfaces.find((p) => p.name === "Gi0/1")!.enabled).toBe(false);
    expect(screenOf("r1").at(-1)).toBe(
      "%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to down",
    );
  });

  test("hostname cambia il nome, e il prompt lo segue", () => {
    type("r1", ["hostname Centro"]);

    expect(router().name).toBe("Centro");
    expect(session.promptOf(terminalOf("r1"))).toBe("Centro(config)#");
  });

  test("ogni comando di configurazione si annulla dalla cronologia, uno alla volta", () => {
    type("r1", ["ip route 192.168.2.0 255.255.255.0 10.0.0.2", "hostname Centro"]);

    session.undo();
    expect(router().name).toBe("R1");
    expect(router().routes).toHaveLength(1);

    session.undo();
    expect(router().routes).toEqual([]);
  });

  test("un comando che non cambia nulla non finisce nella cronologia", () => {
    type("r1", ["int gi0/0", "no shutdown"]);

    expect(session.canUndo).toBe(false);
  });

  test("ciò che si cambia dal pannello si legge dalla CLI", () => {
    session.addRoute("r1", "192.168.2.0", "/24", "10.0.0.2");

    type("r1", ["do show running-config"]);

    expect(screenOf("r1")).toContain("ip route 192.168.2.0 255.255.255.0 10.0.0.2");
  });

  test("un rifiuto si legge nel terminale, e la rete resta com'era", () => {
    type("r1", ["ip route 192.168.2.5 255.255.255.0 10.0.0.2"]);

    expect(screenOf("r1").at(-1)).toBe("%Inconsistent address and mask");
    expect(router().routes).toEqual([]);
  });
});

describe("show, ping e traceroute", () => {
  beforeEach(() => {
    session.open("due-lan-router.netsim.json", routerFile);
    session.openTerminal("r1");
    type("r1", ["enable"]);
  });

  test("show stampa subito", () => {
    type("r1", ["sh ip int br"]);

    expect(screenOf("r1").slice(-3)).toEqual([
      "Interface              IP-Address      OK? Method Status                Protocol",
      "GigabitEthernet0/0     192.168.1.1     YES manual up                    up",
      "GigabitEthernet0/1     192.168.2.1     YES manual up                    up",
    ]);
  });

  test("la fila dei simboli cresce man mano che la simulazione avanza, e intanto il prompt è occupato", () => {
    type("r1", ["ping 192.168.2.10"]);
    expect(session.isBusy(terminalOf("r1"))).toBe(true);
    expect(screenOf("r1").at(-1)).toBe("");

    runToEnd();

    expect(session.isBusy(terminalOf("r1"))).toBe(false);
    expect(screenOf("r1").slice(-2)).toEqual([
      "!!!!!",
      expect.stringMatching(/^Success rate is 100 percent \(5\/5\)/),
    ]);
  });

  test("il ping dal router compare tra le conversazioni", () => {
    type("r1", ["ping 192.168.2.10"]);

    expect(session.view.conversations.length).toBe(1);
  });

  test("traceroute stampa un salto per riga", () => {
    type("r1", ["traceroute 192.168.2.10"]);
    runToEnd();

    expect(screenOf("r1").at(-1)).toMatch(/^ {2}1 192\.168\.2\.10 \d+ msec$/);
  });

  test("se il router viene spento a metà ping, il prompt torna libero quando quel traffico si esaurisce", () => {
    type("r1", ["ping 192.168.2.10"]);
    session.step();

    session.togglePower("r1");
    runToEnd();

    // Il ping non si è concluso, ma non c'è più nulla da aspettare.
    expect(screenOf("r1").at(-1)).toBe("");
    expect(session.isBusy(terminalOf("r1"))).toBe(false);
  });
});

describe("aiuto, completamento e Ctrl+Z", () => {
  beforeEach(() => {
    session.open("lan-switch.netsim.json", lanFile);
    session.openTerminal("s1");
  });

  test("il punto interrogativo stampa le possibilità sotto la riga scritta", () => {
    session.help("s1", "en");

    expect(screenOf("s1")).toEqual(["SW1>en?", "enable"]);
    // La riga non è stata eseguita: si è ancora in modalità utente.
    expect(session.promptOf(terminalOf("s1"))).toBe("SW1>");
  });

  test("Tab completa la parola", () => {
    expect(session.complete("s1", "ena")).toBe("enable ");
  });

  test("Ctrl+Z lascia la configurazione, e fuori dalla configurazione non fa nulla", () => {
    session.endConfiguration("s1");
    expect(screenOf("s1")).toEqual([]);

    type("s1", ["enable", "conf t", "int fa0/2"]);
    session.endConfiguration("s1");

    expect(screenOf("s1").at(-1)).toBe("SW1(config-if)#^Z");
    expect(session.promptOf(terminalOf("s1"))).toBe("SW1#");
  });

  test("lo switch spegne una porta, e il cavo lo mostra", () => {
    type("s1", ["enable", "conf t", "int fa0/1", "shut"]);

    const cable = session.view.links.find((link) => link.id === "l1")!;
    expect(cable).toMatchObject({ toOff: true, signal: false });
  });
});

describe("un dispositivo spento non ha un prompt", () => {
  test("la CLI di un router spento non accetta comandi né cambia la configurazione", () => {
    session.open("due-lan-router.netsim.json", routerFile);
    session.openTerminal("r1");
    type("r1", ["enable", "configure terminal", "interface gi0/0"]);
    const before = terminalOf("r1").entries.length;
    session.togglePower("r1");

    type("r1", ["ip address 172.16.0.1 255.255.0.0", "end", "show ip interface brief"]);
    session.help("r1", "sh");
    session.endConfiguration("r1");

    expect(terminalOf("r1").entries).toHaveLength(before);
    expect(session.complete("r1", "sh")).toBe("sh");
    // Nel file l'interfaccia ha ancora l'indirizzo di prima.
    const r1 = JSON.parse(session.serialize()).network.devices.find((d: any) => d.id === "r1");
    expect(r1.ports[0].ip).toBe("192.168.1.1");
  });

  test("il prompt di un PC spento non accetta comandi", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.openTerminal("d1");
    session.togglePower("d1");

    type("d1", ["ipconfig", "ping 192.168.1.11"]);

    expect(terminalOf("d1").entries).toHaveLength(0);
    expect(session.view.nextEvent).toBeNull();
  });

  test("riacceso, il terminale torna a funzionare, dalla modalità utente", () => {
    session.open("due-lan-router.netsim.json", routerFile);
    session.openTerminal("r1");
    type("r1", ["enable"]);
    session.togglePower("r1");
    session.togglePower("r1");

    type("r1", ["show ip interface brief"]);

    expect(screenOf("r1")).toContain("R1>show ip interface brief");
  });
});
