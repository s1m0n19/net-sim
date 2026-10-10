import { describe, expect, test } from "vitest";
import {
  formatArpTable,
  formatIpconfig,
  formatPing,
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
    expect(parseCommand("ping")).toEqual({ kind: "error", lines: ["Usage: ping [-n count] target_address"] });
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

  test("ogni risposta ha la sua riga, con la durata in tick dalla precedente", () => {
    const lines = formatPing("192.168.1.11", 4, 0, [
      { time: 8, outcome: "reply" },
      { time: 12, outcome: "reply" },
    ], PC1.ip);

    expect(lines.slice(2)).toEqual([
      "Reply from 192.168.1.11: bytes=32 time=8 ticks TTL=128",
      "Reply from 192.168.1.11: bytes=32 time=4 ticks TTL=128",
    ]);
  });

  test("la durata parte dal momento in cui il comando è stato lanciato", () => {
    const lines = formatPing("192.168.1.11", 1, 30, [{ time: 34, outcome: "reply" }], PC1.ip);

    expect(lines[2]).toBe("Reply from 192.168.1.11: bytes=32 time=4 ticks TTL=128");
  });

  test("una risposta immediata, come dal loopback, dura meno di un tick", () => {
    const lines = formatPing("127.0.0.1", 1, 5, [{ time: 5, outcome: "reply" }], PC1.ip);

    expect(lines[2]).toBe("Reply from 127.0.0.1: bytes=32 time<1 tick TTL=128");
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
