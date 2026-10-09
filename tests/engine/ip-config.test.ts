import { describe, expect, test } from "vitest";
import { checkIpConfig, isValidIp } from "../../src/engine/model/ip-config";

const MASK_24 = "255.255.255.0";

function check(ip: string | null, mask: string | null, gateway: string | null = null) {
  return checkIpConfig({ ip, mask, gateway });
}

describe("configurazioni accettate", () => {
  test("un host senza alcuna configurazione IP", () => {
    expect(check(null, null)).toBeNull();
  });

  test("indirizzo e maschera, senza gateway", () => {
    expect(check("192.168.1.10", MASK_24)).toBeNull();
  });

  test("indirizzo, maschera e gateway nella stessa sottorete", () => {
    expect(check("192.168.1.10", MASK_24, "192.168.1.1")).toBeNull();
  });

  test("il primo e l'ultimo indirizzo utilizzabili di una sottorete", () => {
    expect(check("192.168.1.1", MASK_24)).toBeNull();
    expect(check("192.168.1.254", MASK_24)).toBeNull();
    expect(check("192.168.1.129", "255.255.255.128")).toBeNull();
  });

  test("un indirizzo che finisce per 0 o 255, se la maschera non lo rende di rete o di broadcast", () => {
    expect(check("10.0.1.0", "255.255.0.0")).toBeNull();
    expect(check("10.0.1.255", "255.255.0.0")).toBeNull();
  });

  test("le sottoreti /31 e /32, che non hanno indirizzo di rete né di broadcast", () => {
    expect(check("10.0.0.0", "255.255.255.254")).toBeNull();
    expect(check("10.0.0.1", "255.255.255.254")).toBeNull();
    expect(check("10.0.0.7", "255.255.255.255")).toBeNull();
  });
});

describe("errori ammessi, perché vanno diagnosticati e non impediti", () => {
  test("un gateway fuori dalla sottorete dell'host", () => {
    expect(check("192.168.1.10", MASK_24, "192.168.2.1")).toBeNull();
  });

  test("un gateway uguale all'indirizzo dell'host", () => {
    expect(check("192.168.1.10", MASK_24, "192.168.1.10")).toBeNull();
  });

  test("un gateway fuori sottorete che finisce per 0 o 255: non si può sapere che maschera ha la sua rete", () => {
    expect(check("192.168.1.10", MASK_24, "10.0.0.255")).toBeNull();
  });
});

describe("configurazioni rifiutate", () => {
  test("indirizzo senza maschera, o maschera senza indirizzo", () => {
    expect(check("192.168.1.10", null)).toBe("indirizzo IP e subnet mask vanno impostati insieme");
    expect(check(null, MASK_24)).toBe("indirizzo IP e subnet mask vanno impostati insieme");
  });

  test("gateway senza indirizzo", () => {
    expect(check(null, null, "192.168.1.1")).toBe(
      "il gateway non può essere impostato senza un indirizzo IP",
    );
  });

  test("indirizzo scritto male", () => {
    expect(check("192.168.1.256", MASK_24)).toBe("indirizzo IP non valido: 192.168.1.256");
    expect(check("192.168.1", MASK_24)).toBe("indirizzo IP non valido: 192.168.1");
  });

  test("maschera con i bit a 1 non contigui", () => {
    expect(check("192.168.1.10", "255.0.255.0")).toBe("subnet mask non valida: 255.0.255.0");
  });

  test("indirizzo di rete e indirizzo di broadcast della sottorete", () => {
    expect(check("192.168.1.0", MASK_24)).toBe(
      "l'indirizzo 192.168.1.0 è l'indirizzo di rete della sottorete",
    );
    expect(check("192.168.1.255", MASK_24)).toBe(
      "l'indirizzo 192.168.1.255 è l'indirizzo di broadcast della sottorete",
    );
  });

  test("rete e broadcast dipendono dalla maschera: con /25 sono .128 e .127", () => {
    expect(check("192.168.1.128", "255.255.255.128")).toContain("indirizzo di rete");
    expect(check("192.168.1.127", "255.255.255.128")).toContain("indirizzo di broadcast");
    expect(check("192.168.1.128", MASK_24)).toBeNull(); // con /24 è un indirizzo qualsiasi
  });

  test("0.0.0.0, il loopback, il multicast e gli indirizzi riservati", () => {
    const refused = "non è assegnabile a un dispositivo";
    expect(check("0.0.0.0", MASK_24)).toContain(refused);
    expect(check("127.0.0.1", "255.0.0.0")).toContain(refused);
    expect(check("224.0.0.5", MASK_24)).toContain(refused);
    expect(check("240.1.2.3", MASK_24)).toContain(refused);
    expect(check("255.255.255.255", MASK_24)).toContain(refused);
  });

  test("223.x è l'ultimo blocco assegnabile", () => {
    expect(check("223.255.255.1", MASK_24)).toBeNull();
  });

  test("gateway scritto male, riservato, o indirizzo di rete o di broadcast della sottorete dell'host", () => {
    expect(check("192.168.1.10", MASK_24, "192.168.1.300")).toBe("gateway non valido: 192.168.1.300");
    expect(check("192.168.1.10", MASK_24, "127.0.0.1")).toBe(
      "il gateway 127.0.0.1 non è assegnabile a un dispositivo",
    );
    expect(check("192.168.1.10", MASK_24, "192.168.1.0")).toBe(
      "il gateway 192.168.1.0 è l'indirizzo di rete della sottorete",
    );
    expect(check("192.168.1.10", MASK_24, "192.168.1.255")).toBe(
      "il gateway 192.168.1.255 è l'indirizzo di broadcast della sottorete",
    );
  });
});

describe("indirizzo scritto correttamente", () => {
  test("quattro numeri da 0 a 255 separati da punti", () => {
    expect(isValidIp("192.168.1.10")).toBe(true);
    expect(isValidIp("192.168.1.256")).toBe(false);
    expect(isValidIp("192.168.1")).toBe(false);
    expect(isValidIp("ciao")).toBe(false);
  });
});
