import { describe, expect, test } from "vitest";
import type { DeviceInfo } from "../../src/shell/ios/grammar";
import { complete, helpFor } from "../../src/shell/ios/help";

const R1: DeviceInfo = { kind: "router", name: "R1", interfaces: ["Gi0/0", "Gi0/1"] };
const SW1: DeviceInfo = { kind: "switch", name: "SW1", interfaces: ["Fa0/1", "Fa0/2"] };

describe("il punto interrogativo", () => {
  test("da solo elenca i comandi della modalità, in ordine alfabetico, con la descrizione", () => {
    expect(helpFor(R1, "user", "")).toEqual([
      "  enable      Enter privileged mode",
      "  exit        Leave the command line",
      "  ping        Send echo requests",
      "  show        Display information about the device",
      "  traceroute  Trace the route to a destination",
    ]);
  });

  test("dopo una parola e uno spazio elenca ciò che può seguire", () => {
    expect(helpFor(R1, "privileged", "show ip ")).toEqual([
      "  interface  Interfaces with their addresses",
      "  route      Routing table",
    ]);
  });

  test("attaccato a una parola elenca quelle che cominciano così", () => {
    expect(helpFor(R1, "privileged", "sh")).toEqual(["show"]);
    expect(helpFor(R1, "privileged", "c")).toEqual(["configure  copy"]);
  });

  test("le parole prima del punto interrogativo si possono abbreviare", () => {
    expect(helpFor(R1, "privileged", "sh ip int ")).toEqual(["  brief  One line per interface"]);
  });

  test("dove serve un argomento dice quale", () => {
    expect(helpFor(R1, "privileged", "ping ")).toEqual(["  A.B.C.D  Destination address"]);
    expect(helpFor(R1, "config", "ip route 192.168.2.0 ")).toEqual(["  A.B.C.D  Network mask"]);
    expect(helpFor(R1, "config", "hostname ")).toEqual(["  WORD  Name of the device"]);
  });

  test("dopo interface elenca i tipi di interfaccia che il dispositivo ha", () => {
    expect(helpFor(R1, "config", "interface ")).toEqual(["  GigabitEthernet  Gigabit Ethernet interface"]);
    expect(helpFor(SW1, "config", "interface ")).toEqual(["  FastEthernet  Fast Ethernet interface"]);
  });

  test("<cr> dice che la riga può finire lì", () => {
    expect(helpFor(R1, "privileged", "write ")).toEqual(["  memory  Save to the startup configuration", "  <cr>"]);
    expect(helpFor(R1, "privileged", "show ip route ")).toEqual(["  <cr>"]);
  });

  test("l'aiuto cambia con il dispositivo", () => {
    const afterShow = (device: DeviceInfo) => helpFor(device, "privileged", "show ").map((line) => line.trim().split(" ")[0]);

    expect(afterShow(R1)).not.toContain("mac");
    expect(afterShow(SW1)).toContain("mac");
    expect(helpFor(SW1, "config-if", "").map((line) => line.trim().split(" ")[0])).not.toContain("ip");
  });

  test("se ciò che precede non è un comando, lo dice", () => {
    expect(helpFor(R1, "privileged", "x")).toEqual(["% Unrecognized command"]);
    expect(helpFor(R1, "privileged", "sciopero ")).toEqual(["% Unrecognized command"]);
    expect(helpFor(R1, "privileged", "co t ")).toEqual(['% Ambiguous command:  "co t"']);
  });
});

describe("il tasto Tab", () => {
  test("completa la parola, se è una sola, e aggiunge uno spazio", () => {
    expect(complete(R1, "privileged", "sh")).toBe("show ");
    expect(complete(R1, "privileged", "conf")).toBe("configure ");
    expect(complete(R1, "privileged", "show ip int")).toBe("show ip interface ");
  });

  test("lascia come sono le parole già scritte, anche se abbreviate", () => {
    expect(complete(R1, "privileged", "sh ip ro")).toBe("sh ip route ");
  });

  test("non fa nulla se le parole possibili sono più d'una, o nessuna", () => {
    expect(complete(R1, "privileged", "co")).toBe("co");
    expect(complete(R1, "privileged", "xyz")).toBe("xyz");
  });

  test("non fa nulla dopo uno spazio, o su una riga vuota", () => {
    expect(complete(R1, "privileged", "show ")).toBe("show ");
    expect(complete(R1, "privileged", "")).toBe("");
  });

  test("completa solo i comandi della modalità in cui si è", () => {
    expect(complete(R1, "user", "conf")).toBe("conf");
    expect(complete(R1, "config", "host")).toBe("hostname ");
  });
});
