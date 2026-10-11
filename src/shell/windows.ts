// Il prompt dei comandi di un PC, in stile Windows.
//
// Qui il testo diventa un comando, e il risultato di un comando diventa
// testo. Non c'è altro: questo file non parla con il simulatore e non
// conosce lo schermo. I messaggi sono in inglese, come quelli che si
// trovano sui libri, in rete e sugli apparati.

import { isValidIp } from "../engine/model/ip-config";
import { DEFAULT_PING_COUNT } from "../engine/protocols/icmp";
import { DEFAULT_TTL } from "../engine/protocols/ipv4";

export const PROMPT = "C:\\>";

// Che cosa l'utente ha chiesto.
export type Command =
  | { kind: "empty" }
  | { kind: "ping"; target: string; count: number }
  | { kind: "ipconfig" }
  | { kind: "arp" }
  | { kind: "cls" }
  | { kind: "help" }
  // Il comando non si può eseguire: le righe dicono perché.
  | { kind: "error"; lines: string[] };

/**
 * Capisce una riga scritta al prompt.
 *
 * @param line - ciò che l'utente ha scritto, senza il prompt
 * @returns il comando riconosciuto; se la riga non è un comando valido,
 *   un comando di tipo "error" con il messaggio da mostrare
 */
export function parseCommand(line: string): Command {
  const words = line.trim().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return { kind: "empty" };

  const [name, ...args] = words;
  switch (name.toLowerCase()) {
    case "ping":
      return parsePing(args);
    case "ipconfig":
      return { kind: "ipconfig" };
    case "arp":
      if (args.length === 1 && args[0].toLowerCase() === "-a") return { kind: "arp" };
      return { kind: "error", lines: ["Usage: arp -a"] };
    case "cls":
      return { kind: "cls" };
    case "help":
      return { kind: "help" };
    default:
      return {
        kind: "error",
        lines: [
          `'${name}' is not recognized as an internal or external command,`,
          "operable program or batch file.",
        ],
      };
  }
}

// ping [-n count] target, con l'opzione prima o dopo l'indirizzo.
function parsePing(args: string[]): Command {
  let target: string | null = null;
  let count = DEFAULT_PING_COUNT;

  for (let i = 0; i < args.length; i++) {
    if (args[i].toLowerCase() === "-n") {
      const value = args[i + 1] ?? "";
      if (!/^\d+$/.test(value) || Number(value) < 1) {
        return { kind: "error", lines: ["Bad value for option -n, valid range is from 1 to 4294967295."] };
      }
      count = Number(value);
      i += 1;
    } else if (target === null) {
      target = args[i];
    } else {
      return { kind: "error", lines: [`Bad parameter ${args[i]}.`] };
    }
  }

  if (target === null) {
    return { kind: "error", lines: ["Usage: ping [-n count] target_address"] };
  }
  // Non esiste un DNS: un nome non si può risolvere.
  if (!isValidIp(target)) {
    return {
      kind: "error",
      lines: [`Ping request could not find host ${target}. Please check the name and try again.`],
    };
  }
  return { kind: "ping", target, count };
}

/** Le righe stampate dal comando `help`. */
export function formatHelp(): string[] {
  return [
    "IPCONFIG       Displays the IP configuration of this computer.",
    "PING           Sends echo requests to an address: ping [-n count] address",
    "ARP -A         Displays the ARP table.",
    "CLS            Clears the screen.",
  ];
}

// Ciò che il prompt deve sapere dell'host su cui gira.
export interface HostInfo {
  ip: string | null;
  mask: string | null;
  gateway: string | null;
  linkUp: boolean;
  arpRows: [ip: string, mac: string][];
}

/**
 * Le righe stampate da `ipconfig`.
 *
 * @param host - la configurazione IP dell'host e lo stato del suo cavo
 * @returns l'elenco delle righe; con il cavo staccato Windows mostra solo
 *   "Media disconnected"
 */
export function formatIpconfig(host: HostInfo): string[] {
  const lines = ["", "Windows IP Configuration", "", "Ethernet adapter Ethernet:", ""];
  if (!host.linkUp) {
    lines.push("   Media State . . . . . . . . . . . : Media disconnected");
  } else {
    lines.push(`   IPv4 Address. . . . . . . . . . . : ${host.ip ?? ""}`);
    lines.push(`   Subnet Mask . . . . . . . . . . . : ${host.mask ?? ""}`);
    lines.push(`   Default Gateway . . . . . . . . . : ${host.gateway ?? ""}`);
  }
  return lines;
}

/**
 * Le righe stampate da `arp -a`. Windows scrive gli indirizzi MAC con i
 * trattini al posto dei due punti.
 *
 * @param host - l'host, con la sua tabella ARP
 * @returns l'elenco delle righe
 */
export function formatArpTable(host: HostInfo): string[] {
  if (host.arpRows.length === 0) return ["No ARP Entries Found."];

  const lines = ["", `Interface: ${host.ip ?? ""} --- 0x1`, "  Internet Address      Physical Address      Type"];
  for (const [ip, mac] of host.arpRows) {
    lines.push(`  ${ip.padEnd(22)}${mac.replaceAll(":", "-").padEnd(22)}dynamic`);
  }
  return lines;
}

// Com'è finito un echo request, e quando.
export interface EchoResult {
  time: number;
  outcome:
    | "reply"
    | "timeout"
    | "unreachable"
    | "transmit-failed"
    | "net-unreachable"
    | "host-unreachable"
    | "ttl-expired";
  // Chi ha risposto: la destinazione, oppure il router che ha avvisato.
  from?: string | null;
  // Il TTL con cui è arrivata la risposta.
  ttl?: number | null;
}

// Gli esiti in cui qualcuno ha risposto, anche solo per dire che non si
// passa. Windows li conta tutti come pacchetti ricevuti: dopo un
// "Destination net unreachable" le statistiche dicono "Lost = 0".
const ANSWERED: EchoResult["outcome"][] = ["reply", "unreachable", "net-unreachable", "host-unreachable", "ttl-expired"];

/**
 * Le righe che `ping` ha stampato finora: l'intestazione, una riga per
 * ogni echo request concluso e, quando sono finiti tutti, le statistiche.
 *
 * @param target - l'indirizzo a cui si fa ping
 * @param count - quanti echo request sono stati chiesti
 * @param startTime - il tick in cui il comando è stato lanciato
 * @param results - gli echo request conclusi finora, in ordine
 * @param ownIp - l'indirizzo dell'host che fa ping
 * @returns le righe da mostrare
 */
export function formatPing(
  target: string,
  count: number,
  startTime: number,
  results: EchoResult[],
  ownIp: string | null,
): string[] {
  const lines = ["", `Pinging ${target} with 32 bytes of data:`];

  // La durata di un echo va dalla fine del precedente alla sua conclusione.
  let previous = startTime;
  for (const result of results) {
    lines.push(formatEcho(target, result, result.time - previous, ownIp));
    previous = result.time;
  }

  if (results.length >= count) {
    const received = results.filter((result) => ANSWERED.includes(result.outcome)).length;
    const lost = count - received;
    lines.push("");
    lines.push(`Ping statistics for ${target}:`);
    lines.push(
      `    Packets: Sent = ${count}, Received = ${received}, Lost = ${lost} (${Math.round((lost / count) * 100)}% loss),`,
    );
  }
  return lines;
}

function formatEcho(target: string, result: EchoResult, ticks: number, ownIp: string | null): string {
  switch (result.outcome) {
    case "reply": {
      // Il tempo simulato si misura in tick, ma la riga è quella di
      // Windows: un tick viene scritto come un millisecondo. È un numero
      // di comodo, che dice quanti cavi ha attraversato lo scambio.
      const time = ticks === 0 ? "time<1ms" : `time=${ticks}ms`;
      // Il TTL è quello con cui la risposta è arrivata: 128 meno i router
      // attraversati al ritorno.
      return `Reply from ${result.from ?? target}: bytes=32 ${time} TTL=${result.ttl ?? DEFAULT_TTL}`;
    }
    case "timeout":
      return "Request timed out.";
    case "unreachable":
      // Su Windows è il PC stesso a dirlo: per questo compare il suo indirizzo.
      return `Reply from ${ownIp ?? ""}: Destination host unreachable.`;
    case "transmit-failed":
      return "PING: transmit failed. General failure.";
    // Gli avvisi di un router: compare il suo indirizzo, non quello della
    // destinazione.
    case "net-unreachable":
      return `Reply from ${result.from ?? ""}: Destination net unreachable.`;
    case "host-unreachable":
      return `Reply from ${result.from ?? ""}: Destination host unreachable.`;
    case "ttl-expired":
      return `Reply from ${result.from ?? ""}: TTL expired in transit.`;
  }
}
