import { describe, expect, test } from "vitest";
import { keyword, type Command, type DeviceInfo } from "../../src/shell/ios/grammar";
import { fullInterfaceName } from "../../src/shell/ios/interface-names";
import { interpret } from "../../src/shell/ios/interpreter";
import { INITIAL_STATE, type CliState, type Mode } from "../../src/shell/ios/modes";
import { parseLine } from "../../src/shell/ios/parser";

const R1: DeviceInfo = { kind: "router", name: "R1", interfaces: ["Gi0/0", "Gi0/1"] };
const SW1: DeviceInfo = { kind: "switch", name: "SW1", interfaces: ["Fa0/1", "Fa0/2"] };

function inMode(mode: Mode): CliState {
  return { mode, interfaceName: mode === "config-if" ? R1.interfaces[0] : null };
}

// Il comando capito da una riga, in una modalità; null se la riga è sbagliata.
function command(mode: Mode, line: string, device = R1): Command | null {
  return interpret(device, inMode(mode), line).command;
}

// Le righe stampate dopo una riga.
function lines(mode: Mode, line: string, device = R1): string[] {
  return interpret(device, inMode(mode), line).lines;
}

describe("abbreviazioni", () => {
  test("una parola si può abbreviare, se l'abbreviazione vale per una parola sola", () => {
    expect(interpret(R1, INITIAL_STATE, "en").state.mode).toBe("privileged");
    expect(interpret(R1, inMode("privileged"), "conf t").state.mode).toBe("config");
    expect(command("privileged", "sh ip int br")).toEqual({ kind: "show", topic: "ip-interface-brief" });
    expect(command("privileged", "sh run")).toEqual({ kind: "show", topic: "running-config" });
    expect(command("config-if", "no shut")).toEqual({ kind: "no-shutdown" });
    expect(command("config-if", "ip add 10.0.0.1 255.0.0.0")).toEqual({
      kind: "ip-address",
      ip: "10.0.0.1",
      mask: "255.0.0.0",
    });
  });

  test("maiuscole e minuscole non contano, ma un nome resta come è stato scritto", () => {
    expect(command("privileged", "SHOW IP Route")).toEqual({ kind: "show", topic: "ip-route" });
    expect(command("config", "HOSTNAME Aula3")).toEqual({ kind: "hostname", name: "Aula3" });
  });

  test("gli spazi in più non contano", () => {
    expect(command("privileged", "   show    ip   route  ")).toEqual({ kind: "show", topic: "ip-route" });
  });

  test("un'abbreviazione che vale per due parole è ambigua", () => {
    // configure e copy cominciano entrambe per "co".
    expect(lines("privileged", "co t")).toEqual(['% Ambiguous command:  "co t"']);
  });

  test("una parola scritta per intero vince su quelle più lunghe che cominciano uguale", () => {
    // Un albero di prova: "interface" è anche l'inizio di "interfaces".
    const tree = [
      keyword("interface", "", { command: () => ({ kind: "enable" }) }),
      keyword("interfaces", "", { command: () => ({ kind: "disable" }) }),
    ];

    expect(parseLine(tree, "interface", R1)).toEqual({ kind: "command", command: { kind: "enable" } });
    expect(parseLine(tree, "interf", R1)).toEqual({ kind: "ambiguous" });
  });
});

describe("comandi con argomenti", () => {
  test("una rotta statica: rete, maschera, prossimo salto", () => {
    const route = { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" };

    expect(command("config", "ip route 192.168.2.0 255.255.255.0 10.0.0.2")).toEqual({ kind: "ip-route", ...route });
    expect(command("config", "no ip route 192.168.2.0 255.255.255.0 10.0.0.2")).toEqual({
      kind: "no-ip-route",
      ...route,
    });
  });

  test("no ip address si può scrivere con o senza l'indirizzo", () => {
    expect(command("config-if", "no ip address")).toEqual({ kind: "no-ip-address" });
    expect(command("config-if", "no ip address 10.0.0.1 255.0.0.0")).toEqual({ kind: "no-ip-address" });
  });

  test("ping e traceroute vogliono un indirizzo", () => {
    expect(command("privileged", "ping 192.168.2.10")).toEqual({ kind: "ping", target: "192.168.2.10" });
    expect(command("user", "traceroute 192.168.2.10")).toEqual({ kind: "traceroute", target: "192.168.2.10" });
  });
});

describe("errori, nel formato di IOS", () => {
  test("il segno va sotto il primo carattere sbagliato, contando il prompt", () => {
    // "shw": le prime due lettere sono quelle di show, la terza no.
    expect(lines("privileged", "shw ip")).toEqual(["     ^", "% Invalid input detected at '^' marker."]);
  });

  test("una parola di troppo viene segnata dove comincia", () => {
    expect(lines("privileged", "show ip route adesso")[0]).toBe(`${" ".repeat("R1#show ip route ".length)}^`);
  });

  test("un indirizzo scritto male viene segnato", () => {
    expect(lines("privileged", "ping 10.0.0")).toEqual([`${" ".repeat("R1#ping ".length)}^`, "% Invalid input detected at '^' marker."]);
    expect(lines("config-if", "ip address 10.0.0.1 255.0.0.256")[1]).toBe("% Invalid input detected at '^' marker.");
  });

  test("una riga giusta ma non finita è incompleta", () => {
    expect(lines("privileged", "show")).toEqual(["% Incomplete command."]);
    expect(lines("privileged", "configure")).toEqual(["% Incomplete command."]);
    expect(lines("config-if", "ip address 10.0.0.1")).toEqual(["% Incomplete command."]);
    expect(lines("config", "hostname")).toEqual(["% Incomplete command."]);
  });

  test("una riga sbagliata non cambia la modalità", () => {
    const state = inMode("config-if");

    expect(interpret(R1, state, "sciopero").state).toBe(state);
  });
});

describe("nomi delle interfacce", () => {
  const selected = (line: string, device = R1) => interpret(device, inMode("config"), line).state.interfaceName;

  test("si scrivono per esteso o abbreviati, con o senza spazio prima del numero", () => {
    expect(selected("interface GigabitEthernet0/1")).toBe("Gi0/1");
    expect(selected("interface gi0/1")).toBe("Gi0/1");
    expect(selected("int g0/1")).toBe("Gi0/1");
    expect(selected("int gigabitEthernet 0/1")).toBe("Gi0/1");
    expect(selected("int fa0/2", SW1)).toBe("Fa0/2");
  });

  test("un'interfaccia che il dispositivo non ha viene rifiutata, col segno sul numero", () => {
    expect(lines("config", "int gi0/9")).toEqual([`${" ".repeat("R1(config)#int gi".length)}^`, "% Invalid input detected at '^' marker."]);
    expect(lines("config", "int gi 0/9")[0]).toBe(`${" ".repeat("R1(config)#int gi ".length)}^`);
  });

  test("un tipo di interfaccia che non esiste viene segnato dall'inizio", () => {
    expect(lines("config", "int se0/0")[0]).toBe(`${" ".repeat("R1(config)#int ".length)}^`);
    // Un router ha interfacce Gigabit, non Fast Ethernet.
    expect(selected("int fa0/1")).toBeNull();
  });

  test("nell'output si scrivono per esteso", () => {
    expect(fullInterfaceName("Gi0/0")).toBe("GigabitEthernet0/0");
    expect(fullInterfaceName("Fa0/12")).toBe("FastEthernet0/12");
  });
});

describe("router e switch non hanno gli stessi comandi", () => {
  const INVALID = "% Invalid input detected at '^' marker.";

  test("le rotte e gli indirizzi sono solo del router", () => {
    expect(lines("config", "ip route 10.0.0.0 255.0.0.0 1.1.1.1", SW1)[1]).toBe(INVALID);
    expect(lines("config-if", "ip address 10.0.0.1 255.0.0.0", SW1)[1]).toBe(INVALID);
    expect(lines("privileged", "show ip route", SW1)[1]).toBe(INVALID);
    expect(lines("privileged", "ping 10.0.0.1", SW1)[1]).toBe(INVALID);
  });

  test("la tabella MAC è solo dello switch", () => {
    expect(command("privileged", "show mac address-table", SW1)).toEqual({ kind: "show", topic: "mac-address-table" });
    expect(lines("privileged", "show mac address-table")[1]).toBe(INVALID);
  });

  test("lo switch rinomina, mostra e spegne le porte", () => {
    const port: CliState = { mode: "config-if", interfaceName: "Fa0/1" };

    expect(command("config", "hostname Piano1", SW1)).toEqual({ kind: "hostname", name: "Piano1" });
    expect(command("privileged", "show interfaces", SW1)).toEqual({ kind: "show", topic: "interfaces" });
    expect(interpret(SW1, port, "shutdown")).toEqual({ state: port, lines: [], command: { kind: "shutdown" } });
    expect(interpret(SW1, port, "no shut").command).toEqual({ kind: "no-shutdown" });
  });
});
