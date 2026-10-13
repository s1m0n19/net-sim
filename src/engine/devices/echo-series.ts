// Una serie di echo request, vista da chi la manda: che cosa si conclude
// quando uno di loro finisce, e che cosa parte dopo.
//
// Vale per chiunque faccia un ping o tracci una strada, un host o un
// router: cambia come si spedisce il pacchetto, non la logica della serie.
// Qui non si spedisce nulla: si decide soltanto.

import type { Ipv4Address } from "../model/addresses";
import type { IcmpError } from "../model/frames";
import type { AwaitedEcho } from "../model/network";
import type { PingResult, TraceHop } from "./host-output";

// Chi manda echo request: tiene il conto delle sequenze e ricorda quelli
// di cui aspetta ancora la risposta. Sono fatti così sia `Host` sia `Router`.
export interface Pinger {
  nextEchoSequence: number;
  awaitedEchoes: AwaitedEcho[];
}

// Un echo request da preparare: il numero di sequenza lo riceverà partendo.
export type EchoToSend = Omit<AwaitedEcho, "sequence">;

// Che cosa succede quando un echo request si conclude.
export interface Conclusion {
  // L'esito, se era uno degli echo request di un ping.
  pingResults: PingResult[];
  // Il salto scoperto, se era una sonda di tracert.
  traceHops: TraceHop[];
  // L'echo request da far partire subito dopo; null se la serie è finita.
  next: EchoToSend | null;
}

/**
 * Chiude un echo request con il suo esito, e dice che cosa viene dopo.
 *
 * In un ping, finché ne restano, parte il successivo, con lo stesso TTL.
 * In un tracert, se un router ha fermato la sonda o se nessuno ha
 * risposto, parte la sonda successiva con un salto in più; se ha risposto
 * la destinazione, o se non si può proseguire, tracert finisce.
 *
 * @param echo - l'echo request che si conclude
 * @param outcome - com'è finito
 * @param answer - chi ha risposto e con quale TTL, se qualcuno ha risposto
 */
export function conclude(
  echo: AwaitedEcho,
  outcome: PingResult["outcome"],
  answer: { from: Ipv4Address | null; ttl: number | null } = { from: null, ttl: null },
): Conclusion {
  const { targetIp, sequence, remaining, probe } = echo;

  if (probe === undefined) {
    const result: PingResult = { targetIp, sequence, remaining, outcome, ...answer };
    const next = remaining === 0 ? null : { ...withoutSequence(echo), remaining: remaining - 1 };
    return { pingResults: [result], traceHops: [], next };
  }

  const found: TraceHop["outcome"] = outcome === "reply" ? "reached" : outcome === "ttl-expired" ? "hop" : outcome;
  const goesOn = (found === "hop" || found === "timeout") && probe.hop < probe.maxHops;
  const hop: TraceHop = { targetIp, hop: probe.hop, outcome: found, from: answer.from, done: !goesOn };
  const next = goesOn
    ? { targetIp, remaining: 0, sendTtl: probe.hop + 1, probe: { hop: probe.hop + 1, maxHops: probe.maxHops } }
    : null;
  return { pingResults: [], traceHops: [hop], next };
}

/**
 * Smette di aspettare un echo reply.
 *
 * @param pinger - chi lo aspettava; l'echo viene tolto dai suoi sospesi
 * @param targetIp - a chi era diretto
 * @param sequence - il suo numero di sequenza
 * @returns ciò che si stava aspettando, oppure null se non si stava
 *   aspettando nulla del genere
 */
export function stopAwaiting(pinger: Pinger, targetIp: Ipv4Address, sequence: number): AwaitedEcho | null {
  const index = pinger.awaitedEchoes.findIndex(
    (awaited) => awaited.targetIp === targetIp && awaited.sequence === sequence,
  );
  if (index === -1) return null;
  return pinger.awaitedEchoes.splice(index, 1)[0];
}

/**
 * Traduce un avviso ICMP nell'esito dell'echo request che riguarda.
 *
 * @param error - il messaggio di errore mandato da un router
 */
export function outcomeOfError(error: IcmpError): PingResult["outcome"] {
  if (error.type === "time-exceeded") return "ttl-expired";
  return error.code === "net" ? "net-unreachable" : "host-unreachable";
}

function withoutSequence(echo: AwaitedEcho): EchoToSend {
  const { sequence: _sequence, ...rest } = echo;
  return rest;
}
