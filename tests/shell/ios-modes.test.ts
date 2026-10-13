import { describe, expect, test } from "vitest";
import type { DeviceInfo } from "../../src/shell/ios/grammar";
import { interpret } from "../../src/shell/ios/interpreter";
import { INITIAL_STATE, promptOf, type CliState } from "../../src/shell/ios/modes";

const R1: DeviceInfo = { kind: "router", name: "R1", interfaces: ["Gi0/0", "Gi0/1"] };

// Scrive una riga dopo l'altra e restituisce i prompt incontrati, compreso
// quello finale.
function prompts(lines: string[], device = R1): string[] {
  let state: CliState = INITIAL_STATE;
  const seen = [promptOf(device.name, state.mode)];
  for (const line of lines) {
    state = interpret(device, state, line).state;
    seen.push(promptOf(device.name, state.mode));
  }
  return seen;
}

// Lo stato dopo una serie di righe.
function after(lines: string[], device = R1): CliState {
  return lines.reduce((state, line) => interpret(device, state, line).state, INITIAL_STATE);
}

describe("modalità e prompt", () => {
  test("una sessione comincia in modalità utente", () => {
    expect(promptOf("R1", INITIAL_STATE.mode)).toBe("R1>");
  });

  test("si entra per gradi, e il prompt dice a che punto si è", () => {
    expect(prompts(["enable", "configure terminal", "interface Gi0/0"])).toEqual([
      "R1>",
      "R1#",
      "R1(config)#",
      "R1(config-if)#",
    ]);
  });

  test("exit torna indietro di un passo alla volta", () => {
    const inside = ["enable", "configure terminal", "interface Gi0/0"];

    expect(prompts([...inside, "exit", "exit", "exit"]).slice(-3)).toEqual(["R1(config)#", "R1#", "R1>"]);
  });

  test("end torna alla modalità privilegiata da dovunque si stia configurando", () => {
    expect(after(["enable", "configure terminal", "end"]).mode).toBe("privileged");
    expect(after(["enable", "configure terminal", "interface Gi0/0", "end"]).mode).toBe("privileged");
  });

  test("disable torna alla modalità utente", () => {
    expect(after(["enable", "disable"]).mode).toBe("user");
  });

  test("entrando in configurazione compare la riga di IOS", () => {
    const outcome = interpret(R1, after(["enable"]), "configure terminal");

    expect(outcome.lines).toEqual(["Enter configuration commands, one per line.  End with CNTL/Z."]);
  });

  test("la sessione ricorda quale interfaccia si sta configurando", () => {
    const state = after(["enable", "configure terminal", "interface Gi0/1"]);

    expect(state).toEqual({ mode: "config-if", interfaceName: "Gi0/1" });
    expect(after(["enable", "configure terminal", "interface Gi0/1", "exit"]).interfaceName).toBeNull();
  });

  test("da un'interfaccia si passa a un'altra senza uscire", () => {
    const state = after(["enable", "configure terminal", "interface Gi0/0", "interface Gi0/1"]);

    expect(state).toEqual({ mode: "config-if", interfaceName: "Gi0/1" });
  });

  test("un comando globale scritto da dentro un'interfaccia riporta alla configurazione globale", () => {
    const inside = after(["enable", "configure terminal", "interface Gi0/0"]);

    const outcome = interpret(R1, inside, "hostname Aula");

    expect(outcome.state.mode).toBe("config");
    expect(outcome.command).toEqual({ kind: "hostname", name: "Aula" });
  });

  test("il prompt usa il nome del dispositivo", () => {
    expect(promptOf("Aula", "config-if")).toBe("Aula(config-if)#");
  });

  test("una riga vuota non fa nulla", () => {
    const state = after(["enable"]);

    expect(interpret(R1, state, "   ")).toEqual({ state, lines: [], command: null });
  });
});

describe("i comandi valgono solo nella loro modalità", () => {
  test("in modalità utente non si configura e non si legge la configurazione", () => {
    expect(interpret(R1, INITIAL_STATE, "configure terminal").lines[1]).toBe("% Invalid input detected at '^' marker.");
    expect(interpret(R1, INITIAL_STATE, "show running-config").lines[1]).toBe("% Invalid input detected at '^' marker.");
    expect(interpret(R1, INITIAL_STATE, "show ip route").command).toEqual({ kind: "show", topic: "ip-route" });
  });

  test("ip address vale solo dentro un'interfaccia", () => {
    const config = after(["enable", "configure terminal"]);
    const inside = after(["enable", "configure terminal", "interface Gi0/0"]);

    expect(interpret(R1, config, "ip address 10.0.0.1 255.0.0.0").command).toBeNull();
    expect(interpret(R1, inside, "ip address 10.0.0.1 255.0.0.0").command).toEqual({
      kind: "ip-address",
      ip: "10.0.0.1",
      mask: "255.0.0.0",
    });
  });

  test("in configurazione show funziona solo con do davanti", () => {
    const config = after(["enable", "configure terminal"]);

    expect(interpret(R1, config, "show ip route").command).toBeNull();
    expect(interpret(R1, config, "do show ip route")).toEqual({
      state: config,
      lines: [],
      command: { kind: "show", topic: "ip-route" },
    });
  });

  test("do non accetta i comandi che cambiano modalità", () => {
    const config = after(["enable", "configure terminal"]);

    expect(interpret(R1, config, "do disable").state).toEqual(config);
    expect(interpret(R1, config, "do disable").lines[1]).toBe("% Invalid input detected at '^' marker.");
  });

  test("salvare la configurazione risponde [OK] e non chiede nulla alla rete", () => {
    const state = after(["enable"]);
    const expected = { state, lines: ["Building configuration...", "[OK]"], command: null };

    expect(interpret(R1, state, "copy running-config startup-config")).toEqual(expected);
    expect(interpret(R1, state, "write memory")).toEqual(expected);
    expect(interpret(R1, state, "write")).toEqual(expected);
  });
});
