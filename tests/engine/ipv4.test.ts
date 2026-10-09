import { describe, expect, test } from "vitest";
import { ipToNumber, isValidMask, sameNetwork } from "../../src/engine/model/addresses";
import { createHost, type Host } from "../../src/engine/model/network";
import { makeEchoReply, makeEchoRequest } from "../../src/engine/protocols/icmp";
import { DEFAULT_TTL, makeIpv4Packet, nextHopFor } from "../../src/engine/protocols/ipv4";

function host(ip: string | null, mask: string | null, gateway: string | null): Host {
  return createHost({
    id: "d1",
    name: "PC1",
    ports: [{ name: "Fa0", mac: "02:00:00:00:00:01" }],
    ip,
    mask,
    gateway,
  });
}

describe("indirizzi IPv4", () => {
  test("un indirizzo diventa un numero a 32 bit", () => {
    expect(ipToNumber("0.0.0.1")).toBe(1);
    expect(ipToNumber("0.0.1.0")).toBe(256);
    expect(ipToNumber("192.168.1.10")).toBe(3232235786);
    expect(ipToNumber("255.255.255.255")).toBe(4294967295);
  });

  test("un testo che non è un indirizzo viene rifiutato", () => {
    expect(() => ipToNumber("192.168.1")).toThrow("non valido");
    expect(() => ipToNumber("192.168.1.256")).toThrow("non valido");
    expect(() => ipToNumber("192.168.1.x")).toThrow("non valido");
    expect(() => ipToNumber("")).toThrow("non valido");
  });
});

describe("subnet mask", () => {
  test("sono valide le maschere con i bit a 1 tutti a sinistra", () => {
    expect(isValidMask("255.255.255.0")).toBe(true); // /24
    expect(isValidMask("255.255.0.0")).toBe(true); // /16
    expect(isValidMask("255.255.255.128")).toBe(true); // /25
    expect(isValidMask("255.255.252.0")).toBe(true); // /22
    expect(isValidMask("255.255.255.255")).toBe(true); // /32
    expect(isValidMask("0.0.0.0")).toBe(true); // /0
  });

  test("non sono valide le maschere con i bit a 1 non contigui", () => {
    expect(isValidMask("255.0.255.0")).toBe(false);
    expect(isValidMask("255.255.255.1")).toBe(false);
    expect(isValidMask("0.255.255.255")).toBe(false);
    expect(isValidMask("255.255.250.0")).toBe(false); // 250 = 11111010
  });

  test("non è valido ciò che non è un indirizzo", () => {
    expect(isValidMask("255.255.255")).toBe(false);
    expect(isValidMask("/24")).toBe(false);
  });
});

describe("stessa rete", () => {
  test("una maschera non valida viene rifiutata", () => {
    expect(() => sameNetwork("192.168.1.10", "192.168.1.11", "255.0.255.0")).toThrow(
      "Subnet mask non valida",
    );
  });

  test("con maschera /24 conta solo l'ultimo numero", () => {
    expect(sameNetwork("192.168.1.10", "192.168.1.200", "255.255.255.0")).toBe(true);
    expect(sameNetwork("192.168.1.10", "192.168.2.10", "255.255.255.0")).toBe(false);
  });

  test("con maschera /16 la stessa coppia di indirizzi cambia risposta", () => {
    expect(sameNetwork("192.168.1.10", "192.168.2.10", "255.255.0.0")).toBe(true);
  });

  test("con maschera /25 la rete si divide a metà dell'ultimo numero", () => {
    expect(sameNetwork("192.168.1.1", "192.168.1.126", "255.255.255.128")).toBe(true);
    expect(sameNetwork("192.168.1.126", "192.168.1.129", "255.255.255.128")).toBe(false);
  });

  test("funziona anche con indirizzi oltre 128.0.0.0", () => {
    expect(sameNetwork("200.1.1.1", "200.1.1.2", "255.255.255.0")).toBe(true);
    expect(sameNetwork("200.1.1.1", "72.1.1.1", "255.255.255.0")).toBe(false);
  });
});

describe("prossimo salto", () => {
  test("destinazione nella stessa rete: consegna diretta", () => {
    const pc = host("192.168.1.10", "255.255.255.0", "192.168.1.1");

    expect(nextHopFor(pc, "192.168.1.11")).toBe("192.168.1.11");
  });

  test("destinazione in un'altra rete: si passa dal gateway", () => {
    const pc = host("192.168.1.10", "255.255.255.0", "192.168.1.1");

    expect(nextHopFor(pc, "10.0.0.5")).toBe("192.168.1.1");
  });

  test("destinazione in un'altra rete senza gateway: non si può spedire", () => {
    const pc = host("192.168.1.10", "255.255.255.0", null);

    expect(nextHopFor(pc, "10.0.0.5")).toBeNull();
  });

  test("un host senza indirizzo o senza maschera non può spedire", () => {
    expect(nextHopFor(host(null, null, null), "192.168.1.11")).toBeNull();
    expect(nextHopFor(host("192.168.1.10", null, null), "192.168.1.11")).toBeNull();
  });
});

describe("pacchetti", () => {
  test("un pacchetto IP parte con il TTL di Windows", () => {
    const packet = makeIpv4Packet("192.168.1.10", "192.168.1.11", makeEchoRequest(1, 1));

    expect(DEFAULT_TTL).toBe(128);
    expect(packet).toEqual({
      srcIp: "192.168.1.10",
      dstIp: "192.168.1.11",
      ttl: 128,
      protocol: "ICMP",
      payload: { type: "echo-request", identifier: 1, sequence: 1 },
    });
  });

  test("l'echo reply riporta identificativo e numero di sequenza della richiesta", () => {
    const reply = makeEchoReply(makeEchoRequest(7, 3));

    expect(reply).toEqual({ type: "echo-reply", identifier: 7, sequence: 3 });
  });
});
