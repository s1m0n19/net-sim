// `ping` e `traceroute` lanciati dalla CLI di un router: dagli esiti al
// testo, come lo scrive IOS.
//
// A differenza di Windows, che stampa una riga per ogni risposta, IOS
// stampa un simbolo: una fila di punti esclamativi è un ping riuscito.
//
//   !   è arrivata la risposta
//   .   non è arrivato nulla in tempo, o il pacchetto non è potuto partire
//   U   un router lungo la strada avvisa che la destinazione è irraggiungibile

import { ECHO_TIMEOUT_TICKS } from "../../engine/protocols/icmp";

// Quanti echo request manda `ping`, se non si dice altro: IOS ne manda
// cinque, Windows quattro.
export const PING_COUNT = 5;

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
}

// Un salto scoperto da traceroute, e quando.
export interface HopResult {
  time: number;
  hop: number;
  outcome: "hop" | "reached" | "timeout" | "net-unreachable" | "host-unreachable" | "unreachable" | "transmit-failed";
  // Chi ha risposto: un router, oppure la destinazione.
  from: string | null;
  // true se traceroute finisce con questo salto.
  done: boolean;
}

/**
 * Le righe che `ping` ha stampato finora: l'intestazione, la fila dei
 * simboli che cresce e, quando gli echo request sono finiti tutti, la
 * percentuale di successo con i tempi.
 *
 * Il tempo simulato si misura in tick, scritti come millisecondi: è un
 * numero di comodo, che dice quanti cavi ha attraversato lo scambio.
 *
 * @param target - l'indirizzo a cui si fa ping
 * @param count - quanti echo request sono stati chiesti
 * @param startTime - il tick in cui il comando è stato lanciato
 * @param results - gli echo request conclusi finora, in ordine
 * @returns le righe da mostrare
 */
export function formatPing(target: string, count: number, startTime: number, results: EchoResult[]): string[] {
  const lines = [
    "",
    `Sending ${count}, 100-byte ICMP Echos to ${target}, timeout is ${ECHO_TIMEOUT_TICKS} ms:`,
    results.map(symbolOf).join(""),
  ];
  if (results.length < count) return lines;

  // La durata di un echo va dalla fine del precedente alla sua conclusione.
  const times: number[] = [];
  let previous = startTime;
  for (const result of results) {
    if (result.outcome === "reply") times.push(result.time - previous);
    previous = result.time;
  }

  const percent = Math.round((times.length / count) * 100);
  let summary = `Success rate is ${percent} percent (${times.length}/${count})`;
  if (times.length > 0) {
    const average = Math.round(times.reduce((sum, time) => sum + time, 0) / times.length);
    summary += `, round-trip min/avg/max = ${Math.min(...times)}/${average}/${Math.max(...times)} ms`;
  }
  lines.push(summary);
  return lines;
}

function symbolOf(result: EchoResult): string {
  switch (result.outcome) {
    case "reply":
      return "!";
    case "net-unreachable":
    case "host-unreachable":
      return "U";
    default:
      return ".";
  }
}

/**
 * Le righe che `traceroute` ha stampato finora: l'intestazione e una riga
 * per ogni salto scoperto.
 *
 *   *    nessuno ha risposto in tempo
 *   !N   un router avvisa che la rete non è raggiungibile
 *   !H   un router avvisa che l'host non è raggiungibile
 *
 * @param target - l'indirizzo verso cui si traccia la strada
 * @param startTime - il tick in cui il comando è stato lanciato
 * @param hops - i salti conclusi finora, in ordine
 * @returns le righe da mostrare
 */
export function formatTraceroute(target: string, startTime: number, hops: HopResult[]): string[] {
  const lines = ["", `Tracing the route to ${target}`, ""];

  // La durata di una sonda va dalla fine della precedente alla sua conclusione.
  let previous = startTime;
  for (const hop of hops) {
    lines.push(`${String(hop.hop).padStart(3)} ${hopText(hop, hop.time - previous)}`);
    previous = hop.time;
  }
  return lines;
}

function hopText(hop: HopResult, ticks: number): string {
  switch (hop.outcome) {
    case "hop":
    case "reached":
      return `${hop.from ?? ""} ${ticks} msec`;
    case "net-unreachable":
      return `${hop.from ?? ""} !N`;
    case "host-unreachable":
      return `${hop.from ?? ""} !H`;
    default:
      return " *";
  }
}
