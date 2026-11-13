// L'interprete della CLI in stile IOS: una riga entra, ne escono la nuova
// modalità, il testo da stampare e, se c'è, il comando da eseguire.
//
// Come il prompt dei PC (windows.ts), è solo testo: non parla con il
// simulatore e non conosce lo schermo. I comandi che cambiano modalità li
// esegue da sé, perché non toccano la rete; gli altri li restituisce a chi
// lo ha chiamato, che li trasformerà in azioni del motore.
//
// Output e messaggi hanno il formato di IOS, senza diciture di marca (D-90).

import { commandsFor } from "./commands";
import type { Command, DeviceInfo } from "./grammar";
import { promptOf, type CliState } from "./modes";
import { parseLine } from "./parser";

// Che cosa è successo dopo una riga.
export interface Outcome {
  // La modalità in cui la sessione si trova adesso.
  state: CliState;
  // Le righe da stampare sotto quella scritta dall'utente.
  lines: string[];
  // Il comando da eseguire sulla rete; null se la riga era vuota, sbagliata
  // o riguardava solo la sessione.
  command: Command | null;
}

/**
 * Interpreta una riga scritta al prompt.
 *
 * @param device - il dispositivo su cui gira la CLI
 * @param state - la modalità in cui la sessione si trova
 * @param line - la riga scritta dall'utente, senza il prompt
 * @returns la nuova modalità, le righe da stampare e l'eventuale comando
 *   da eseguire; una riga sbagliata non cambia la modalità
 */
export function interpret(device: DeviceInfo, state: CliState, line: string): Outcome {
  const parsed = parseLine(commandsFor(state.mode), line, device);
  switch (parsed.kind) {
    case "empty":
      return { state, lines: [], command: null };
    case "invalid": {
      // Il segno va sotto il carattere sbagliato della riga, che sullo
      // schermo comincia dopo il prompt.
      const indent = promptOf(device.name, state.mode).length + parsed.position;
      return { state, lines: [`${" ".repeat(indent)}^`, "% Invalid input detected at '^' marker."], command: null };
    }
    case "ambiguous":
      return { state, lines: [`% Ambiguous command:  "${line.trim()}"`], command: null };
    case "incomplete":
      return { state, lines: ["% Incomplete command."], command: null };
    case "command":
      return run(state, parsed.command);
  }
}

// Esegue ciò che riguarda la sessione, e passa il resto a chi ha chiamato.
function run(state: CliState, command: Command): Outcome {
  const moveTo = (mode: CliState["mode"], lines: string[] = []): Outcome => ({
    state: { mode, interfaceName: null },
    lines,
    command: null,
  });

  switch (command.kind) {
    case "enable":
      return moveTo("privileged");
    case "disable":
      return moveTo("user");
    case "configure":
      return moveTo("config", ["Enter configuration commands, one per line.  End with CNTL/Z."]);
    case "interface":
      return { state: { mode: "config-if", interfaceName: command.name }, lines: [], command: null };
    case "vlan":
      // Si entra nella VLAN; crearla, se non c'è, tocca alla rete.
      return { state: { mode: "config-vlan", interfaceName: null, vlanId: command.id }, lines: [], command };
    case "end":
      return moveTo("privileged");
    case "exit":
      // Si torna indietro di un passo; dalle prime due modalità si esce
      // dalla sessione, che riparte dalla modalità utente.
      if (state.mode === "config-if" || state.mode === "config-vlan") return moveTo("config");
      if (state.mode === "config") return moveTo("privileged");
      return moveTo("user");
    case "save":
      // Non c'è una configurazione di avvio separata: la rete si salva
      // con il file. L'abitudine giusta però non va punita (D-92).
      return { state, lines: ["Building configuration...", "[OK]"], command: null };
    case "hostname":
    case "ip-route":
    case "no-ip-route":
    case "no-vlan": {
      // Un comando della configurazione globale scritto da dentro
      // un'interfaccia o una VLAN riporta alla configurazione globale.
      const inside = state.mode === "config-if" || state.mode === "config-vlan";
      return { state: inside ? { mode: "config", interfaceName: null } : state, lines: [], command };
    }
    default:
      return { state, lines: [], command };
  }
}
