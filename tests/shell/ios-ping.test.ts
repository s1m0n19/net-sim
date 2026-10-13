import { describe, expect, test } from "vitest";
import { formatPing, formatTraceroute, type EchoResult, type HopResult } from "../../src/shell/ios/ping";

const HEADER = ["", "Sending 5, 100-byte ICMP Echos to 192.168.2.10, timeout is 40 ms:"];

// Cinque esiti uguali, uno ogni `every` tick.
function five(outcome: EchoResult["outcome"], every: number): EchoResult[] {
  return [1, 2, 3, 4, 5].map((n) => ({ time: n * every, outcome }));
}

describe("ping dal router, come lo scrive IOS", () => {
  test("cinque risposte: cinque punti esclamativi e il cento per cento", () => {
    expect(formatPing("192.168.2.10", 5, 0, five("reply", 4))).toEqual([
      ...HEADER,
      "!!!!!",
      "Success rate is 100 percent (5/5), round-trip min/avg/max = 4/4/4 ms",
    ]);
  });

  test("a metà ping la fila è ancora corta, e la percentuale non c'è", () => {
    expect(formatPing("192.168.2.10", 5, 0, five("reply", 4).slice(0, 2))).toEqual([...HEADER, "!!"]);
    expect(formatPing("192.168.2.10", 5, 0, [])).toEqual([...HEADER, ""]);
  });

  test("nessuna risposta: cinque punti, zero per cento, nessun tempo", () => {
    expect(formatPing("192.168.2.10", 5, 0, five("timeout", 40))).toEqual([
      ...HEADER,
      ".....",
      "Success rate is 0 percent (0/5)",
    ]);
  });

  test("un router avvisa che la destinazione non è raggiungibile: U", () => {
    expect(formatPing("192.168.2.10", 5, 0, five("net-unreachable", 2))[2]).toBe("UUUUU");
    expect(formatPing("192.168.2.10", 5, 0, five("host-unreachable", 22))[2]).toBe("UUUUU");
  });

  test("ciò che non è nemmeno partito è un punto", () => {
    expect(formatPing("192.168.2.10", 5, 0, five("transmit-failed", 0))[2]).toBe(".....");
    expect(formatPing("192.168.2.10", 5, 0, five("unreachable", 20))[2]).toBe(".....");
  });

  test("i tempi sono quelli delle sole risposte: il primo, che aspetta l'ARP, è il più lungo", () => {
    const results: EchoResult[] = [
      { time: 8, outcome: "reply" },
      { time: 12, outcome: "reply" },
      { time: 52, outcome: "timeout" },
      { time: 56, outcome: "reply" },
      { time: 60, outcome: "reply" },
    ];

    expect(formatPing("192.168.2.10", 5, 0, results).slice(2)).toEqual([
      "!!.!!",
      "Success rate is 80 percent (4/5), round-trip min/avg/max = 4/5/8 ms",
    ]);
  });

  test("il tempo si conta da quando il comando è stato lanciato", () => {
    const results = five("reply", 4).map((result) => ({ ...result, time: result.time + 100 }));

    expect(formatPing("192.168.2.10", 5, 100, results)[3]).toContain("min/avg/max = 4/4/4 ms");
  });
});

describe("traceroute dal router, come lo scrive IOS", () => {
  const hop = (n: number, outcome: HopResult["outcome"], from: string | null, time: number, done = false): HopResult => ({
    hop: n,
    outcome,
    from,
    time,
    done,
  });

  test("una riga per salto, con chi ha risposto e in quanto tempo", () => {
    const hops = [hop(1, "hop", "10.0.0.2", 4), hop(2, "reached", "192.168.2.10", 10, true)];

    expect(formatTraceroute("192.168.2.10", 0, hops)).toEqual([
      "",
      "Tracing the route to 192.168.2.10",
      "",
      "  1 10.0.0.2 4 msec",
      "  2 192.168.2.10 6 msec",
    ]);
  });

  test("appena lanciato c'è solo l'intestazione", () => {
    expect(formatTraceroute("192.168.2.10", 0, [])).toEqual(["", "Tracing the route to 192.168.2.10", ""]);
  });

  test("un salto che non risponde è un asterisco", () => {
    expect(formatTraceroute("192.168.2.10", 0, [hop(1, "timeout", null, 40)])[3]).toBe("  1  *");
  });

  test("gli avvisi di un router: !N per la rete, !H per l'host", () => {
    const lines = formatTraceroute("172.16.0.5", 0, [
      hop(1, "hop", "10.0.0.2", 4),
      hop(2, "net-unreachable", "10.0.0.2", 8, true),
    ]);

    expect(lines[4]).toBe("  2 10.0.0.2 !N");
    expect(formatTraceroute("192.168.2.99", 0, [hop(1, "host-unreachable", "10.0.0.2", 24, true)])[3]).toBe(
      "  1 10.0.0.2 !H",
    );
  });
});
