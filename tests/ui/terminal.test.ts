import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";

// Ciò che si legge sullo schermo del terminale di un host, riga per riga.
function screenOf(deviceId: string): string[] {
  const terminal = session.terminals.find((t) => t.deviceId === deviceId)!;
  return terminal.entries.flatMap((entry) => [`C:\\>${entry.command}`, ...session.outputOf(deviceId, entry)]);
}

function runToEnd(): void {
  while (session.view.nextEvent !== null) session.step();
}

beforeEach(() => {
  session.open("lan-switch.netsim.json", lanFile);
  session.openTerminal("d1");
});

describe("aprire e chiudere i terminali", () => {
  test("aprire un terminale lo porta in primo piano", () => {
    expect(session.terminals.map((t) => t.deviceId)).toEqual(["d1"]);
    expect(session.activeTab).toBe("d1");
  });

  test("ogni host ha il suo, e riaprirlo non lo duplica", () => {
    session.openTerminal("d2");
    session.openTerminal("d1");

    expect(session.terminals.map((t) => t.deviceId)).toEqual(["d1", "d2"]);
    expect(session.activeTab).toBe("d1");
  });

  test("chiudere quello in primo piano riporta alla scheda Eventi", () => {
    session.closeTerminal("d1");

    expect(session.terminals).toEqual([]);
    expect(session.activeTab).toBe("events");
  });

  test("aprire un'altra rete li chiude tutti", () => {
    session.open("lan-switch.netsim.json", lanFile);

    expect(session.terminals).toEqual([]);
    expect(session.activeTab).toBe("events");
  });

  test("ricominciare li lascia aperti, ma con lo schermo vuoto", () => {
    session.execute("d1", "ipconfig");

    session.restart();

    expect(session.terminals.map((t) => t.deviceId)).toEqual(["d1"]);
    expect(screenOf("d1")).toEqual([]);
  });
});

describe("comandi che rispondono subito", () => {
  test("ipconfig mostra la configurazione dell'host su cui gira", () => {
    session.execute("d1", "ipconfig");

    expect(screenOf("d1")).toContain("   IPv4 Address. . . . . . . . . . . : 192.168.1.10");
  });

  test("arp -a segue la tabella: vuota prima di un ping, con una riga dopo", () => {
    session.execute("d1", "arp -a");
    session.execute("d1", "ping -n 1 192.168.1.11");
    runToEnd();
    session.execute("d1", "arp -a");

    const screen = screenOf("d1");
    expect(screen).toContain("No ARP Entries Found.");
    expect(screen.at(-1)).toBe("  192.168.1.11          02-00-00-00-00-02     dynamic");
  });

  test("ciò che un comando ha stampato non cambia dopo", () => {
    session.execute("d1", "arp -a");
    session.execute("d1", "ping -n 1 192.168.1.11");
    runToEnd();

    expect(screenOf("d1").slice(0, 2)).toEqual(["C:\\>arp -a", "No ARP Entries Found."]);
  });

  test("un comando sconosciuto riceve la risposta di Windows", () => {
    session.execute("d1", "ifconfig");

    expect(screenOf("d1")[1]).toBe("'ifconfig' is not recognized as an internal or external command,");
  });

  test("cls pulisce lo schermo", () => {
    session.execute("d1", "ipconfig");
    session.execute("d1", "cls");

    expect(screenOf("d1")).toEqual([]);
  });

  test("i comandi scritti si ricordano, per richiamarli", () => {
    session.execute("d1", "ipconfig");
    session.execute("d1", "");
    session.execute("d1", "  arp -a ");

    expect(session.terminals[0].history).toEqual(["ipconfig", "arp -a"]);
  });
});

describe("ping dal terminale", () => {
  test("manda quattro richieste, e l'output cresce man mano che arrivano le risposte", () => {
    session.execute("d1", "ping 192.168.1.11");
    expect(screenOf("d1")).toEqual(["C:\\>ping 192.168.1.11", "", "Pinging 192.168.1.11 with 32 bytes of data:"]);
    expect(session.isBusy(session.terminals[0])).toBe(true);

    for (let i = 0; i < 8; i++) session.step();
    expect(screenOf("d1").at(-1)).toBe("Reply from 192.168.1.11: bytes=32 time=8ms TTL=128");
    expect(session.isBusy(session.terminals[0])).toBe(true);

    runToEnd();
    expect(screenOf("d1").slice(3)).toEqual([
      "Reply from 192.168.1.11: bytes=32 time=8ms TTL=128",
      "Reply from 192.168.1.11: bytes=32 time=4ms TTL=128",
      "Reply from 192.168.1.11: bytes=32 time=4ms TTL=128",
      "Reply from 192.168.1.11: bytes=32 time=4ms TTL=128",
      "",
      "Ping statistics for 192.168.1.11:",
      "    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),",
    ]);
    expect(session.isBusy(session.terminals[0])).toBe(false);
  });

  test("verso un indirizzo che nessuno ha: host di destinazione non raggiungibile", () => {
    session.execute("d1", "ping -n 1 192.168.1.99");
    runToEnd();

    expect(screenOf("d1").slice(3)).toEqual([
      "Reply from 192.168.1.10: Destination host unreachable.",
      "",
      "Ping statistics for 192.168.1.99:",
      // Come su Windows: una risposta di errore conta come ricevuta.
      "    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),",
    ]);
  });

  test("verso un'altra rete senza gateway: trasmissione non riuscita, subito", () => {
    session.execute("d1", "ping -n 2 10.0.0.5");

    expect(screenOf("d1").slice(3, 5)).toEqual([
      "PING: transmit failed. General failure.",
      "PING: transmit failed. General failure.",
    ]);
    expect(session.isBusy(session.terminals[0])).toBe(false);
  });

  test("verso se stessi: risposta immediata", () => {
    session.execute("d1", "ping -n 1 127.0.0.1");

    expect(screenOf("d1")[3]).toBe("Reply from 127.0.0.1: bytes=32 time<1ms TTL=128");
  });

  test("un secondo ping misura la durata dal momento in cui è stato lanciato", () => {
    session.execute("d1", "ping -n 1 192.168.1.11");
    runToEnd();
    session.execute("d1", "ping -n 1 192.168.1.11");
    runToEnd();

    expect(screenOf("d1").filter((line) => line.startsWith("Reply"))).toEqual([
      "Reply from 192.168.1.11: bytes=32 time=8ms TTL=128",
      "Reply from 192.168.1.11: bytes=32 time=4ms TTL=128",
    ]);
  });

  test("due terminali pingano insieme senza mescolare le risposte", () => {
    session.openTerminal("d3");
    session.execute("d1", "ping -n 1 192.168.1.11");
    session.execute("d3", "ping -n 1 192.168.1.99");
    runToEnd();

    expect(screenOf("d1")[3]).toBe("Reply from 192.168.1.11: bytes=32 time=8ms TTL=128");
    expect(screenOf("d3")[3]).toBe("Reply from 192.168.1.12: Destination host unreachable.");
  });

  test("il ping dal terminale compare tra le conversazioni del filtro", () => {
    session.execute("d1", "ping -n 1 192.168.1.11");

    expect(session.view.conversations).toEqual([{ id: 1, label: "ping PC1 → 192.168.1.11" }]);
  });
});

describe("tracert e ping attraverso un router, dal terminale", () => {
  // PC2 sta a destra del router e ha il gateway; PC1, a sinistra, no.
  beforeEach(() => {
    session.open("due-lan-router.netsim.json", routerFile);
    session.openTerminal("d2");
  });

  test("tracert verso l'altra interfaccia del router: un solo salto", () => {
    session.execute("d2", "tracert 192.168.1.1");
    expect(session.isBusy(session.terminals[0])).toBe(true);
    runToEnd();

    const screen = screenOf("d2");
    expect(screen[2]).toBe("Tracing route to 192.168.1.1 over a maximum of 30 hops");
    expect(screen[4]).toMatch(/^  1 +\d+ ms  192\.168\.1\.1$/);
    expect(screen.slice(-2)).toEqual(["", "Trace complete."]);
    expect(session.isBusy(session.terminals[0])).toBe(false);
  });

  test("tracert verso un PC dell'altra LAN: prima il router, poi il PC", () => {
    session.configure("d1", "gateway", "192.168.1.1");
    session.execute("d2", "tracert 192.168.1.10");
    runToEnd();

    const hops = screenOf("d2").slice(4, 6);
    expect(hops[0]).toMatch(/^  1 +\d+ ms  192\.168\.2\.1$/);
    expect(hops[1]).toMatch(/^  2 +\d+ ms  192\.168\.1\.10$/);
  });

  test("tracert verso una rete che non esiste: il router avvisa", () => {
    session.execute("d2", "tracert 10.9.9.9");
    runToEnd();

    expect(screenOf("d2").slice(4)).toEqual([
      expect.stringMatching(/^  1 +\d+ ms  192\.168\.2\.1$/),
      "  2  192.168.2.1  reports: Destination net unreachable.",
      "",
      "Trace complete.",
    ]);
  });

  test("il ping attraverso il router stampa il TTL con cui la risposta è arrivata", () => {
    session.configure("d1", "gateway", "192.168.1.1");
    session.execute("d2", "ping -n 1 192.168.1.10");
    runToEnd();

    expect(screenOf("d2")[3]).toMatch(/^Reply from 192\.168\.1\.10: bytes=32 time=\d+ms TTL=127$/);
  });

  test("ping -i 1 si ferma al router, che lo dice", () => {
    session.configure("d1", "gateway", "192.168.1.1");
    session.execute("d2", "ping -n 1 -i 1 192.168.1.10");
    runToEnd();

    expect(screenOf("d2")[3]).toBe("Reply from 192.168.2.1: TTL expired in transit.");
  });

  test("tracert compare tra le conversazioni che si possono seguire", () => {
    session.execute("d2", "tracert 192.168.1.1");

    expect(session.view.conversations.at(-1)?.label).toBe("tracert PC2 → 192.168.1.1");
  });

  test("Ricomincia svuota anche l'output di un tracert", () => {
    session.execute("d2", "tracert 192.168.1.1");
    runToEnd();

    session.restart();

    expect(screenOf("d2")).toEqual([]);
  });
});
