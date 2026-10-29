// Condurre la dimostrazione: guasti, ping col mouse, terminali degli host,
// tabelle appuntate, filtro del traffico.
//
// È il terzo strato di `session`: aggiunge alla rete aperta e al suo file
// ciò che serve per osservarla e provocarla, senza modificarne la
// configurazione.

import { connectLink, disconnectLink, powerOff, powerOn } from "../engine/actions";
import {
  formatArpTable,
  formatHelp,
  formatIpconfig,
  formatPing,
  formatTracert,
  parseCommand,
  PROMPT,
} from "../shell/windows";
import { INITIAL_STATE } from "../shell/ios/modes";
import { SessionFile } from "./session-file.svelte";
import type { Pin, PinTable, Terminal, TerminalEntry } from "./session-types";
import type { Protocol } from "./view";

export class SessionDemo extends SessionFile {
  // Le tabelle tenute in vista sul disegno: di quale dispositivo, e a che
  // distanza da lui. Riguardano solo lo schermo e non si salvano nel file.
  pins = $state<Pin[]>([]);

  // I terminali aperti, uno per host, nell'ordine in cui sono stati aperti.
  terminals = $state<Terminal[]>([]);

  // La scheda in primo piano nella fascia in basso: "events", oppure
  // l'identificativo dell'host di cui si vede il terminale.
  activeTab = $state("events");

  // Quale conversazione si sta seguendo; null = tutte.
  followed = $state<number | null>(null);

  // Quali protocolli sono visibili.
  protocols = $state<Record<Protocol, boolean>>({ ARP: true, ICMP: true });

  // Ciò su cui sta il mouse nell'elenco degli eventi: va evidenziato sul disegno.
  highlight = $state.raw<{ deviceId: string | null; packetId: number | null } | null>(null);

  /**
   * Dice se il filtro lascia vedere qualcosa. Vale per le righe dell'elenco
   * degli eventi e per le buste sul disegno.
   *
   * @param conversationId - la conversazione a cui appartiene; null se a nessuna
   * @param protocol - il suo protocollo; null se non ne ha uno
   * @returns true se va mostrato
   */
  shows(conversationId: number | null, protocol: Protocol | null): boolean {
    // Ciò che non appartiene a una conversazione, come un guasto, si vede sempre.
    if (this.followed !== null && conversationId !== null && conversationId !== this.followed) {
      return false;
    }
    return protocol === null || this.protocols[protocol];
  }

  /**
   * Apre il terminale di un dispositivo e lo porta in primo piano: il
   * prompt dei comandi per un host, la CLI per un router o uno switch. Se
   * era già aperto, lo porta soltanto in primo piano.
   */
  openTerminal(deviceId: string): void {
    const device = this.view.devices.find((d) => d.id === deviceId);
    if (device === undefined) return;
    if (!this.terminals.some((terminal) => terminal.deviceId === deviceId)) {
      // La CLI comincia sempre dalla modalità utente.
      const cli = device.kind === "host" ? null : INITIAL_STATE;
      this.terminals.push({ deviceId, entries: [], history: [], cli });
    }
    this.activeTab = deviceId;
  }

  /** Chiude un terminale. Il suo contenuto va perso, e la CLI riparte da capo. */
  closeTerminal(deviceId: string): void {
    this.terminals = this.terminals.filter((terminal) => terminal.deviceId !== deviceId);
    if (this.activeTab === deviceId) this.activeTab = "events";
  }

  /**
   * Dice se un dispositivo è spento. Un dispositivo spento non ha un
   * prompt: il suo terminale resta visibile ma non accetta comandi, e la
   * sua configurazione non si cambia da lì (I3). Il pannello laterale
   * invece resta modificabile: è l'editor della rete.
   *
   * @param deviceId - il dispositivo
   * @returns true se esiste ed è spento
   */
  isOff(deviceId: string): boolean {
    return this.view.devices.find((d) => d.id === deviceId)?.powered === false;
  }

  /**
   * Esegue una riga scritta al prompt di un host. Su un host spento non fa
   * nulla.
   *
   * @param deviceId - l'host su cui gira il terminale
   * @param line - ciò che l'utente ha scritto
   */
  execute(deviceId: string, line: string): void {
    const terminal = this.terminals.find((t) => t.deviceId === deviceId);
    const host = this.view.devices.find((d) => d.id === deviceId);
    if (terminal === undefined || host === undefined || this.simulator === null) return;
    if (this.isOff(deviceId)) return;

    const command = parseCommand(line);
    if (line.trim() !== "") terminal.history.push(line.trim());
    const print = (lines: string[]) => terminal.entries.push({ kind: "text", prompt: PROMPT, command: line, lines });

    switch (command.kind) {
      case "empty":
        print([]);
        break;
      case "cls":
        terminal.entries = [];
        break;
      case "help":
        print(formatHelp());
        break;
      case "error":
        print(command.lines);
        break;
      case "ipconfig":
        print(formatIpconfig(host));
        break;
      case "arp":
        print(formatArpTable(host));
        break;
      case "ping": {
        // Il ping apre una conversazione: il terminale ne ricorda il numero
        // e ne leggerà gli esiti man mano che arrivano.
        const before = this.simulator.conversations.length;
        const problem = this.ping(deviceId, command.target, command.count, command.ttl);
        const conversation = this.simulator.conversations.at(-1);
        if (problem !== null || conversation === undefined || this.simulator.conversations.length === before) {
          print([problem ?? "PING: transmit failed. General failure."]);
          break;
        }
        terminal.entries.push({
          kind: "ping",
          prompt: PROMPT,
          command: line,
          target: command.target,
          count: command.count,
          startTime: this.view.time,
          conversationId: conversation.id,
        });
        break;
      }
      case "tracert": {
        // Come il ping: una conversazione di cui leggere i salti man mano.
        const before = this.simulator.conversations.length;
        const problem = this.tracert(deviceId, command.target, command.maxHops);
        const conversation = this.simulator.conversations.at(-1);
        if (problem !== null || conversation === undefined || this.simulator.conversations.length === before) {
          print([problem ?? "Unable to contact IP driver. General failure."]);
          break;
        }
        terminal.entries.push({
          kind: "tracert",
          prompt: PROMPT,
          command: line,
          target: command.target,
          maxHops: command.maxHops,
          startTime: this.view.time,
          conversationId: conversation.id,
        });
        break;
      }
    }
  }

  /**
   * Le righe che un comando ha stampato finora. Per un ping o un tracert
   * crescono man mano che gli echo request si concludono.
   */
  outputOf(deviceId: string, entry: TerminalEntry): string[] {
    if (entry.kind === "text") return entry.lines;
    const ownIp = this.view.devices.find((d) => d.id === deviceId)?.ip ?? null;
    if (entry.kind === "tracert") {
      const hops = this.view.traceHops.filter((hop) => hop.conversationId === entry.conversationId);
      return formatTracert(entry.target, entry.maxHops, entry.startTime, hops, ownIp);
    }
    const results = this.view.pingResults.filter((r) => r.conversationId === entry.conversationId);
    return formatPing(entry.target, entry.count, entry.startTime, results, ownIp);
  }

  /** Dice se un terminale sta ancora eseguendo un ping o un tracert, e non accetta comandi. */
  isBusy(terminal: Terminal): boolean {
    const last = terminal.entries.at(-1);
    if (last === undefined || last.kind === "text") return false;
    // Se nella simulazione non resta più nulla di quella conversazione, è
    // finita comunque: per esempio perché il dispositivo è stato spento, o
    // riconfigurato, mentre aspettava una risposta.
    const pending = this.simulator?.queue.some((event) => event.conversationId === last.conversationId) ?? false;
    if (!pending) return false;
    if (last.kind === "tracert") {
      const hops = this.view.traceHops.filter((hop) => hop.conversationId === last.conversationId);
      return hops.at(-1)?.done !== true;
    }
    const done = this.view.pingResults.filter((r) => r.conversationId === last.conversationId).length;
    return done < last.count;
  }

  /**
   * Dice se una tabella di un dispositivo è appuntata sul disegno.
   *
   * @param table - quale tabella; se manca, quella principale del
   *   dispositivo: ARP per un host, MAC per uno switch, di routing per un router
   */
  isPinned(deviceId: string, table?: PinTable): boolean {
    const which = table ?? this.mainTableOf(deviceId);
    return this.pins.some((pin) => pin.deviceId === deviceId && pin.table === which);
  }

  /**
   * Appunta sul disegno una tabella di un dispositivo, oppure la toglie se
   * è già appuntata. Nasce sotto il dispositivo, e da lì si può trascinare.
   *
   * @param table - quale tabella; se manca, quella principale del dispositivo
   */
  togglePin(deviceId: string, table?: PinTable): void {
    const device = this.view.devices.find((d) => d.id === deviceId);
    const which = table ?? this.mainTableOf(deviceId);
    if (device === undefined || which === null) return;
    if (this.isPinned(deviceId, which)) {
      this.pins = this.pins.filter((pin) => !(pin.deviceId === deviceId && pin.table === which));
      return;
    }
    // Sotto un host ci sono più righe di etichetta che sotto gli altri. Le
    // due tabelle di un router nascono una a sinistra e una a destra.
    const dx = device.kind === "router" ? (which === "routing" ? -190 : 30) : -100;
    this.pins.push({ deviceId, table: which, dx, dy: device.kind === "host" ? 92 : 62 });
  }

  /** Sposta una tabella appuntata a una nuova distanza dal suo dispositivo. */
  movePin(deviceId: string, dx: number, dy: number, table?: PinTable): void {
    const which = table ?? this.mainTableOf(deviceId);
    const pin = this.pins.find((p) => p.deviceId === deviceId && p.table === which);
    if (pin !== undefined) {
      pin.dx = dx;
      pin.dy = dy;
    }
  }

  // La tabella che si appunta dalla barretta: ARP per un host, MAC per uno
  // switch, di routing per un router.
  private mainTableOf(deviceId: string): PinTable | null {
    const device = this.view.devices.find((d) => d.id === deviceId);
    if (device === undefined) return null;
    return device.kind === "host" ? "arp" : device.kind === "switch" ? "mac" : "routing";
  }

  /** Spegne un dispositivo acceso, o accende uno spento. */
  togglePower(deviceId: string): void {
    const device = this.view.devices.find((d) => d.id === deviceId);
    if (device === undefined) return;
    this.run(device.powered ? powerOff(deviceId) : powerOn(deviceId));
  }

  /** Stacca un cavo collegato, o riattacca uno staccato. */
  toggleLink(linkId: string): void {
    const link = this.view.links.find((l) => l.id === linkId);
    if (link === undefined) return;
    this.run(link.connected ? disconnectLink(linkId) : connectLink(linkId));
  }

  /**
   * Prepara un ping dalla barretta: il prossimo dispositivo cliccato sarà
   * la destinazione.
   */
  armPing(deviceId: string): void {
    this.pingFrom = deviceId;
    this.linkFrom = null;
    this.notice = null;
  }

  /**
   * Conclude il ping preparato con `armPing`, verso il dispositivo indicato.
   * Manda un solo echo request.
   */
  pingTo(targetId: string): void {
    const from = this.pingFrom;
    const target = this.view.devices.find((d) => d.id === targetId);
    this.pingFrom = null;
    if (from === null || target === undefined) return;
    if (target.ip === null) {
      this.notice = `${target.name} non ha un indirizzo IP a cui fare ping.`;
      return;
    }
    this.notice = this.ping(from, target.ip, 1);
  }

  /**
   * Riporta la rete allo stato di una appena accesa. Configurazione e
   * guasti restano; i terminali restano aperti, ma vuoti.
   */
  override restart(): void {
    // I PC sono come appena accesi: ciò che avevano stampato non vale più.
    for (const terminal of this.terminals) terminal.entries = [];
    super.restart();
  }

  protected override rewind(): void {
    this.highlight = null;
    // Le conversazioni di prima non esistono più.
    this.followed = null;
    super.rewind();
  }

  protected override networkReplaced(): void {
    this.pins = [];
    this.terminals = [];
    this.activeTab = "events";
    super.networkReplaced();
  }
}
