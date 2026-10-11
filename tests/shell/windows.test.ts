import { describe, expect, test } from "vitest";
import {
  formatArpTable,
  formatIpconfig,
  formatPing,
  formatTracert,
  parseCommand,
  type HostInfo,
} from "../../src/shell/windows";

const PC1: HostInfo = {
  ip: "192.168.1.10",
  mask: "255.255.255.0",
  gateway: null,
  linkUp: true,
  arpRows: [],
};

describe("capire un comando", () => {
  test("una riga vuota non è un comando", () => {
    expect(parseCommand("")).toEqual({ kind: "empty" });
    expect(parseCommand("   ")).toEqual({ kind: "empty" });
  });

  test("ping con il solo indirizzo manda quattro richieste", () => {
    expect(parseCommand("ping 192.168.1.11")).toEqual({ kind: "ping", target: "192.168.1.11", count: 4 });
  });

  test("-n cambia il numero di richieste, prima o dopo l'indirizzo", () => {
    expect(parseCommand("ping -n 2 192.168.1.11")).toEqual({ kind: "ping", target: "192.168.1.11", count: 2 });
    expect(parseCommand("ping 192.168.1.11 -n 1")).toEqual({ kind: "ping", target: "192.168.1.11", count: 1 });
  });

  test("maiuscole, minuscole e spazi in più non contano", () => {
    expect(parseCommand("  PING   192.168.1.11  ")).toEqual({ kind: "ping", target: "192.168.1.11", count: 4 });
    expect(parseCommand("IpConfig")).toEqual({ kind: "ipconfig" });
    expect(parseCommand("ARP -A")).toEqual({ kind: "arp" });
  });

  test("ping senza indirizzo, o con un numero di richieste sbagliato, spiega come si usa", () => {
    expect(parseCommand("ping")).toEqual({ kind: "error", lines: ["Usage: ping [-n count] [-i TTL] target_address"] });
    expect(parseCommand("ping -n 0 192.168.1.11")).toMatchObject({ kind: "error" });
    expect(parseCommand("ping -n tre 192.168.1.11")).toMatchObject({ kind: "error" });
  });

  test("ping verso un nome non trova l'host: non esiste un DNS", () => {
    expect(parseCommand("ping pc2")).toEqual({
      kind: "error",
      lines: ["Ping request could not find host pc2. Please check the name and try again."],
    });
  });

  test("arp senza -a spiega come si usa", () => {
    expect(parseCommand("arp")).toEqual({ kind: "error", lines: ["Usage: arp -a"] });
  });

  test("un comando sconosciuto riceve la risposta di Windows", () => {
    expect(parseCommand("ifconfig")).toEqual({
      kind: "error",
      lines: [
        "'ifconfig' is not recognized as an internal or external command,",
        "operable program or batch file.",
      ],
    });
  });

  test("cls e help sono riconosciuti", () => {
    expect(parseCommand("cls")).toEqual({ kind: "cls" });
    expect(parseCommand("help")).toEqual({ kind: "help" });
  });
});

describe("ipconfig", () => {
  test("mostra indirizzo, maschera e gateway", () => {
    const lines = formatIpconfig({ ...PC1, gateway: "192.168.1.1" });

    expect(lines).toContain("   IPv4 Address. . . . . . . . . . . : 192.168.1.10");
    expect(lines).toContain("   Subnet Mask . . . . . . . . . . . : 255.255.255.0");
    expect(lines).toContain("   Default Gateway . . . . . . . . . : 192.168.1.1");
  });

  test("senza gateway la riga resta vuota", () => {
    expect(formatIpconfig(PC1)).toContain("   Default Gateway . . . . . . . . . : ");
  });

  test("con il cavo staccato mostra solo che il mezzo è scollegato", () => {
    const lines = formatIpconfig({ ...PC1, linkUp: false });

    expect(lines).toContain("   Media State . . . . . . . . . . . : Media disconnected");
    expect(lines.join("\n")).not.toContain("IPv4 Address");
  });
});

describe("arp -a", () => {
  test("con la tabella vuota lo dice", () => {
    expect(formatArpTable(PC1)).toEqual(["No ARP Entries Found."]);
  });

  test("elenca le righe, con gli indirizzi MAC scritti con i trattini", () => {
    const lines = formatArpTable({ ...PC1, arpRows: [["192.168.1.11", "02:00:00:00:00:02"]] });

    expect(lines).toEqual([
      "",
      "Interface: 192.168.1.10 --- 0x1",
      "  Internet Address      Physical Address      Type",
      "  192.168.1.11          02-00-00-00-00-02     dynamic",
    ]);
  });
});

describe("ping", () => {
  test("appena lanciato stampa solo l'intestazione", () => {
    expect(formatPing("192.168.1.11", 4, 0, [], PC1.ip)).toEqual(["", "Pinging 192.168.1.11 with 32 bytes of data:"]);
  });

  test("ogni risposta ha la sua riga, con la durata dalla precedente: un millisecondo per tick", () => {
    const lines = formatPing("192.168.1.11", 4, 0, [
      { time: 8, outcome: "reply" },
      { time: 12, outcome: "reply" },
    ], PC1.ip);

    expect(lines.slice(2)).toEqual([
      "Reply from 192.168.1.11: bytes=32 time=8ms TTL=128",
      "Reply from 192.168.1.11: bytes=32 time=4ms TTL=128",
    ]);
  });

  test("la durata parte dal momento in cui il comando è stato lanciato", () => {
    const lines = formatPing("192.168.1.11", 1, 30, [{ time: 34, outcome: "reply" }], PC1.ip);

    expect(lines[2]).toBe("Reply from 192.168.1.11: bytes=32 time=4ms TTL=128");
  });

  test("una risposta immediata, come dal loopback, dura meno di un millisecondo", () => {
    const lines = formatPing("127.0.0.1", 1, 5, [{ time: 5, outcome: "reply" }], PC1.ip);

    expect(lines[2]).toBe("Reply from 127.0.0.1: bytes=32 time<1ms TTL=128");
  });

  test("gli altri esiti hanno le parole di Windows", () => {
    const lines = formatPing("192.168.1.99", 3, 0, [
      { time: 20, outcome: "unreachable" },
      { time: 60, outcome: "timeout" },
      { time: 60, outcome: "transmit-failed" },
    ], PC1.ip);

    expect(lines.slice(2, 5)).toEqual([
      "Reply from 192.168.1.10: Destination host unreachable.",
      "Request timed out.",
      "PING: transmit failed. General failure.",
    ]);
  });

  test("le statistiche compaiono solo quando tutti gli echo sono conclusi", () => {
    const three = [8, 12, 16].map((time) => ({ time, outcome: "reply" as const }));
    const four = [...three, { time: 56, outcome: "timeout" as const }];

    expect(formatPing("192.168.1.11", 4, 0, three, PC1.ip).join("\n")).not.toContain("Ping statistics");
    expect(formatPing("192.168.1.11", 4, 0, four, PC1.ip).slice(-3)).toEqual([
      "",
      "Ping statistics for 192.168.1.11:",
      "    Packets: Sent = 4, Received = 3, Lost = 1 (25% loss),",
    ]);
  });
});

describe("ping attraverso i router", () => {
  const TARGET = "192.168.2.10";

  test("la risposta riporta il TTL con cui è arrivata", () => {
    const lines = formatPing(TARGET, 1, 0, [{ time: 12, outcome: "reply", from: TARGET, ttl: 126 }], "192.168.1.10");

    expect(lines[2]).toBe("Reply from 192.168.2.10: bytes=32 time=12ms TTL=126");
  });

  test("gli avvisi di un router riportano l'indirizzo del router, non della destinazione", () => {
    const from = "192.168.1.1";
    const line = (outcome: "net-unreachable" | "host-unreachable" | "ttl-expired") =>
      formatPing(TARGET, 4, 0, [{ time: 4, outcome, from, ttl: null }], "192.168.1.10")[2];

    expect(line("net-unreachable")).toBe("Reply from 192.168.1.1: Destination net unreachable.");
    expect(line("host-unreachable")).toBe("Reply from 192.168.1.1: Destination host unreachable.");
    expect(line("ttl-expired")).toBe("Reply from 192.168.1.1: TTL expired in transit.");
  });

  test("come su Windows, un avviso conta come pacchetto ricevuto", () => {
    const results = [
      { time: 4, outcome: "net-unreachable" as const, from: "192.168.1.1", ttl: null },
      { time: 6, outcome: "net-unreachable" as const, from: "192.168.1.1", ttl: null },
    ];

    expect(formatPing(TARGET, 2, 0, results, "192.168.1.10").at(-1)).toBe(
      "    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss),",
    );
  });

  test("una richiesta scaduta e una trasmissione non riuscita restano perse", () => {
    const results = [
      { time: 40, outcome: "timeout" as const },
      { time: 40, outcome: "transmit-failed" as const },
    ];

    expect(formatPing(TARGET, 2, 0, results, "192.168.1.10").at(-1)).toBe(
      "    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss),",
    );
  });
});

describe("capire tracert e ping -i", () => {
  test("tracert con un indirizzo, e con il limite dei salti", () => {
    expect(parseCommand("tracert 192.168.2.10")).toEqual({ kind: "tracert", target: "192.168.2.10", maxHops: 30 });
    expect(parseCommand("TRACERT -h 5 192.168.2.10")).toEqual({ kind: "tracert", target: "192.168.2.10", maxHops: 5 });
    expect(parseCommand("tracert 192.168.2.10 -h 5")).toEqual({ kind: "tracert", target: "192.168.2.10", maxHops: 5 });
  });

  test("tracert usato male spiega come si usa", () => {
    expect(parseCommand("tracert")).toEqual({ kind: "error", lines: ["Usage: tracert [-h maximum_hops] target_name"] });
    expect(parseCommand("tracert -h 0 192.168.2.10")).toEqual({ kind: "error", lines: ["Bad value for option -h."] });
    expect(parseCommand("tracert pc2")).toEqual({
      kind: "error",
      lines: ["Unable to resolve target system name pc2."],
    });
    expect(parseCommand("tracert 192.168.2.10 boh")).toEqual({
      kind: "error",
      lines: ["boh is not a valid command option."],
    });
  });

  test("ping -i imposta il TTL di partenza, insieme alle altre opzioni", () => {
    expect(parseCommand("ping -i 6 172.16.0.1")).toEqual({ kind: "ping", target: "172.16.0.1", count: 4, ttl: 6 });
    expect(parseCommand("ping -n 1 -i 6 172.16.0.1")).toEqual({ kind: "ping", target: "172.16.0.1", count: 1, ttl: 6 });
  });

  test("senza -i il comando non porta un TTL", () => {
    expect(parseCommand("ping 172.16.0.1")).toEqual({ kind: "ping", target: "172.16.0.1", count: 4 });
  });

  test("un TTL fuori da 1-255 viene rifiutato", () => {
    const error = { kind: "error", lines: ["Bad value for option -i, valid range is from 1 to 255."] };

    expect(parseCommand("ping -i 0 172.16.0.1")).toEqual(error);
    expect(parseCommand("ping -i 256 172.16.0.1")).toEqual(error);
    expect(parseCommand("ping -i")).toEqual(error);
  });
});

describe("tracert", () => {
  const TARGET = "192.168.2.10";

  test("appena lanciato stampa solo l'intestazione", () => {
    expect(formatTracert(TARGET, 30, 0, [], "192.168.1.10")).toEqual([
      "",
      "Tracing route to 192.168.2.10 over a maximum of 30 hops",
      "",
    ]);
  });

  test("una riga per salto, con la durata della sua sonda, e alla fine \"Trace complete.\"", () => {
    const lines = formatTracert(
      TARGET,
      30,
      0,
      [
        { time: 4, hop: 1, outcome: "hop", from: "192.168.1.1", done: false },
        { time: 10, hop: 2, outcome: "hop", from: "10.0.0.2", done: false },
        { time: 18, hop: 3, outcome: "reached", from: TARGET, done: true },
      ],
      "192.168.1.10",
    );

    expect(lines.slice(3)).toEqual([
      "  1     4 ms  192.168.1.1",
      "  2     6 ms  10.0.0.2",
      "  3     8 ms  192.168.2.10",
      "",
      "Trace complete.",
    ]);
  });

  test("finché non è finito non compare \"Trace complete.\"", () => {
    const lines = formatTracert(TARGET, 30, 0, [{ time: 4, hop: 1, outcome: "hop", from: "192.168.1.1", done: false }], null);

    expect(lines.at(-1)).toBe("  1     4 ms  192.168.1.1");
  });

  test("un salto che non risponde ha un asterisco", () => {
    const lines = formatTracert(TARGET, 30, 0, [{ time: 40, hop: 2, outcome: "timeout", from: null, done: false }], null);

    expect(lines.at(-1)).toBe("  2     *     Request timed out.");
  });

  test("un router che avvisa compare con il suo indirizzo e il motivo", () => {
    const line = (outcome: "net-unreachable" | "host-unreachable") =>
      formatTracert(TARGET, 30, 0, [{ time: 6, hop: 2, outcome, from: "192.168.1.1", done: true }], null)[3];

    expect(line("net-unreachable")).toBe("  2  192.168.1.1  reports: Destination net unreachable.");
    expect(line("host-unreachable")).toBe("  2  192.168.1.1  reports: Destination host unreachable.");
  });

  test("se è il PC a non trovare la destinazione nella sua LAN, compare il suo indirizzo", () => {
    const lines = formatTracert("192.168.1.77", 30, 0, [{ time: 20, hop: 1, outcome: "unreachable", from: null, done: true }], "192.168.1.10");

    expect(lines[3]).toBe("  1  192.168.1.10  reports: Destination host unreachable.");
  });

  test("se non può nemmeno partire stampa l'errore di trasmissione di Windows", () => {
    const lines = formatTracert(TARGET, 30, 0, [{ time: 0, hop: 1, outcome: "transmit-failed", from: null, done: true }], null);

    expect(lines.slice(3)).toEqual(["  1  Transmit error: code 1231.", "", "Trace complete."]);
  });

  test("una risposta immediata dura meno di un millisecondo", () => {
    const lines = formatTracert("192.168.1.10", 30, 0, [{ time: 0, hop: 1, outcome: "reached", from: "192.168.1.10", done: true }], "192.168.1.10");

    expect(lines[3]).toBe("  1    <1 ms  192.168.1.10");
  });
});
