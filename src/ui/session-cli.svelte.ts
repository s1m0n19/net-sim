// La CLI dei router e degli switch, nei terminali della fascia in basso.
//
// È l'ottavo strato di `session`. L'interprete (src/shell/ios/) capisce
// le righe e dice che cosa fare; qui lo si fa: le modifiche passano dalla
// cronologia, come quelle del pannello, i comandi `show` leggono la rete,
// e ping e traceroute aprono una conversazione di cui seguire gli esiti.

import type { Router, Switch } from "../engine/model/network";
import { configure, describeDevice } from "../shell/ios/configure";
import type { Command } from "../shell/ios/grammar";
import { complete, helpFor } from "../shell/ios/help";
import { interpret } from "../shell/ios/interpreter";
import { INITIAL_STATE, promptOf } from "../shell/ios/modes";
import { formatPing, formatTraceroute, PING_COUNT } from "../shell/ios/ping";
import { show } from "../shell/ios/show";
import { DEFAULT_MAX_HOPS } from "../engine/protocols/icmp";
import { SessionRouter } from "./session-router.svelte";
import type { Terminal, TerminalEntry } from "./session-types";

export class SessionCli extends SessionRouter {
  /**
   * Il prompt con cui un terminale aspetta la prossima riga: "C:\>" per un
   * host, quello della modalità in cui si trova per un router o uno switch.
   */
  promptOf(terminal: Terminal): string {
    const device = this.view.devices.find((d) => d.id === terminal.deviceId);
    if (terminal.cli === null || device === undefined) return "C:\\>";
    return promptOf(device.name, terminal.cli.mode);
  }

  /**
   * Esegue una riga scritta in un terminale: al prompt di Windows per un
   * host, nella CLI per un router o uno switch.
   *
   * @param deviceId - il dispositivo su cui gira il terminale
   * @param line - ciò che l'utente ha scritto
   */
  override execute(deviceId: string, line: string): void {
    const terminal = this.terminals.find((t) => t.deviceId === deviceId);
    const device = this.cliDevice(deviceId);
    if (terminal?.cli == null || device === null) {
      super.execute(deviceId, line);
      return;
    }

    const prompt = promptOf(device.name, terminal.cli.mode);
    if (line.trim() !== "") terminal.history.push(line.trim());
    const print = (lines: string[]) => terminal.entries.push({ kind: "text", prompt, command: line, lines });

    const outcome = interpret(describeDevice(device), terminal.cli, line);
    terminal.cli = outcome.state;
    if (outcome.command === null) {
      print(outcome.lines);
      return;
    }
    this.runCommand(terminal, device, outcome.command, prompt, line, print);
  }

  /**
   * Risponde al punto interrogativo, appena premuto: stampa le parole
   * possibili sotto la riga scritta, che resta da finire.
   *
   * @param deviceId - il router o lo switch su cui gira la CLI
   * @param line - ciò che è scritto sulla riga, senza il punto interrogativo
   */
  help(deviceId: string, line: string): void {
    const terminal = this.terminals.find((t) => t.deviceId === deviceId);
    const device = this.cliDevice(deviceId);
    if (terminal?.cli == null || device === null) return;
    const prompt = promptOf(device.name, terminal.cli.mode);
    const lines = helpFor(describeDevice(device), terminal.cli.mode, line);
    terminal.entries.push({ kind: "text", prompt, command: `${line}?`, lines });
  }

  /**
   * Completa la parola che si sta scrivendo, come il tasto Tab.
   *
   * @param deviceId - il router o lo switch su cui gira la CLI
   * @param line - ciò che è scritto sulla riga
   * @returns la riga completata, oppure com'era se non c'è nulla da completare
   */
  complete(deviceId: string, line: string): string {
    const terminal = this.terminals.find((t) => t.deviceId === deviceId);
    const device = this.cliDevice(deviceId);
    if (terminal?.cli == null || device === null) return line;
    return complete(describeDevice(device), terminal.cli.mode, line);
  }

  /**
   * Ctrl+Z nella CLI: come `end`, lascia la configurazione e torna alla
   * modalità privilegiata. Fuori dalla configurazione non fa nulla.
   *
   * @param deviceId - il router o lo switch su cui gira la CLI
   */
  endConfiguration(deviceId: string): void {
    const terminal = this.terminals.find((t) => t.deviceId === deviceId);
    const device = this.cliDevice(deviceId);
    if (terminal?.cli == null || device === null) return;
    if (terminal.cli.mode !== "config" && terminal.cli.mode !== "config-if") return;
    const prompt = promptOf(device.name, terminal.cli.mode);
    terminal.entries.push({ kind: "text", prompt, command: "^Z", lines: [] });
    terminal.cli = { mode: "privileged", interfaceName: null };
  }

  /**
   * Le righe che un comando ha stampato finora. Ping e traceroute di un
   * router si scrivono come li scrive IOS.
   */
  override outputOf(deviceId: string, entry: TerminalEntry): string[] {
    const device = this.view.devices.find((d) => d.id === deviceId);
    if (device?.kind !== "router" || entry.kind === "text") return super.outputOf(deviceId, entry);
    if (entry.kind === "tracert") {
      const hops = this.view.traceHops.filter((hop) => hop.conversationId === entry.conversationId);
      return formatTraceroute(entry.target, entry.startTime, hops);
    }
    const results = this.view.pingResults.filter((r) => r.conversationId === entry.conversationId);
    return formatPing(entry.target, entry.count, entry.startTime, results);
  }

  /** Spegne o accende un dispositivo. Spento, è come riavviato: la sua CLI riparte dalla modalità utente. */
  override togglePower(deviceId: string): void {
    super.togglePower(deviceId);
    this.resetCli((terminal) => terminal.deviceId === deviceId);
  }

  /**
   * Riporta la rete allo stato di una appena accesa. Anche le CLI
   * ripartono dalla modalità utente.
   */
  override restart(): void {
    this.resetCli(() => true);
    super.restart();
  }

  // Esegue un comando che la CLI non ha potuto eseguire da sola.
  private runCommand(
    terminal: Terminal,
    device: Router | Switch,
    command: Command,
    prompt: string,
    line: string,
    print: (lines: string[]) => void,
  ): void {
    switch (command.kind) {
      case "show":
        print(show(command.topic, this.simulator!.network, device.id));
        return;
      case "ping":
      case "traceroute": {
        // Come al prompt dei PC: una conversazione di cui leggere gli
        // esiti man mano che arrivano.
        const before = this.simulator!.conversations.length;
        const problem =
          command.kind === "ping"
            ? this.ping(device.id, command.target, PING_COUNT)
            : this.tracert(device.id, command.target, DEFAULT_MAX_HOPS);
        const conversation = this.simulator!.conversations.at(-1);
        if (problem !== null || conversation === undefined || this.simulator!.conversations.length === before) {
          print(problem === null ? [] : [`% ${problem}`]);
          return;
        }
        const started = { prompt, command: line, target: command.target, startTime: this.view.time };
        terminal.entries.push(
          command.kind === "ping"
            ? { kind: "ping", ...started, count: PING_COUNT, conversationId: conversation.id }
            : { kind: "tracert", ...started, maxHops: DEFAULT_MAX_HOPS, conversationId: conversation.id },
        );
        return;
      }
      default: {
        // Un comando di configurazione: diventa un'azione del motore, la
        // stessa del pannello, e un passo della cronologia.
        const configured = configure(command, this.simulator!.network, device.id, terminal.cli?.interfaceName ?? null);
        if (configured === null) {
          print([]);
          return;
        }
        const problem = configured.action === null ? null : this.attempt(configured.action);
        print([...configured.lines, ...(problem === null ? [] : [`% ${problem}`])]);
      }
    }
  }

  // Il router o lo switch su cui gira una CLI; null per un host, o se non c'è.
  private cliDevice(deviceId: string): Router | Switch | null {
    const device = this.simulator?.network.devices.find((d) => d.id === deviceId);
    return device === undefined || device.kind === "host" ? null : device;
  }

  // Riporta alla modalità utente le CLI indicate.
  private resetCli(which: (terminal: Terminal) => boolean): void {
    for (const terminal of this.terminals) {
      if (terminal.cli !== null && which(terminal)) terminal.cli = INITIAL_STATE;
    }
  }
}
