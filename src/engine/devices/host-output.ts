// Che cosa un host chiede al simulatore, e che cosa gli racconta.
//
// Un host non spedisce nulla e non misura il tempo: ogni sua funzione
// restituisce un elenco di cose da fare (frame da inviare, attese da
// avviare o annullare) e di cose concluse (esiti dei ping, salti di un
// tracert). Il simulatore le esegue e le registra.

import type { Ipv4Address } from "../model/addresses";
import type { EthernetFrame } from "../model/frames";
import type { PendingPacket } from "../model/network";

// Perché un frame è stato scartato. Serve ai test: l'interfaccia mostra
// che il frame è stato scartato, ma non ne spiega la causa.
export type DropReason = "not-my-mac" | "arp-not-for-me" | "ip-not-for-me";

// Un'attesa dell'host: se scade, l'host deve fare qualcosa.
export type HostTimer =
  // Attesa della risposta ARP per un indirizzo.
  | { kind: "arp-timeout"; ip: Ipv4Address }
  // Attesa dell'echo reply con un certo numero di sequenza.
  | { kind: "echo-timeout"; sequence: number };

/**
 * Dice se due attese sono la stessa attesa.
 *
 * @param a - la prima attesa
 * @param b - la seconda attesa
 * @returns true se hanno lo stesso tipo e riguardano lo stesso indirizzo
 *   o lo stesso numero di sequenza
 */
export function sameTimer(a: HostTimer, b: HostTimer): boolean {
  if (a.kind === "arp-timeout" && b.kind === "arp-timeout") return a.ip === b.ip;
  if (a.kind === "echo-timeout" && b.kind === "echo-timeout") return a.sequence === b.sequence;
  return false;
}

// Com'è finito un echo request, dal punto di vista di chi ha fatto il ping.
// Sono gli esiti che il comando ping di Windows stampa: distinguerli è il
// primo passo per capire dove sta il problema.
export interface PingResult {
  targetIp: Ipv4Address;
  sequence: number;
  // Quanti echo request dello stesso ping devono ancora partire: zero
  // significa che il ping è finito.
  remaining: number;
  outcome:
    // È arrivato l'echo reply.
    | "reply"
    // L'echo request è partito, ma la risposta non è arrivata in tempo.
    | "timeout"
    // L'host sapeva a chi consegnarlo sulla propria LAN, ma quel
    // dispositivo non ha risposto all'ARP.
    | "unreachable"
    // L'host non ha nemmeno potuto provarci: non sente il segnale sul
    // cavo, non ha un indirizzo, oppure la destinazione è in un'altra
    // rete e non c'è una strada.
    | "transmit-failed"
    // Un router lungo la strada ha avvisato che non ha una rotta verso
    // la rete di destinazione.
    | "net-unreachable"
    // L'ultimo router ha avvisato che la destinazione non risponde.
    | "host-unreachable"
    // Un router ha avvisato che il TTL si è esaurito prima dell'arrivo.
    | "ttl-expired";
  // Chi ha risposto: la destinazione, per un echo reply; il router che ha
  // mandato l'avviso, per un errore. Null se non ha risposto nessuno.
  from: Ipv4Address | null;
  // Il TTL con cui è arrivato l'echo reply: 128 meno i router attraversati
  // al ritorno. Null se non è arrivato un echo reply.
  ttl: number | null;
}

// Che cosa ha scoperto una sonda di tracert, cioè un echo request partito
// con un TTL piccolo apposta per farsi fermare lungo la strada.
export interface TraceHop {
  targetIp: Ipv4Address;
  // Il numero del salto: è il TTL con cui la sonda è partita.
  hop: number;
  outcome:
    // Un router ha fermato la sonda e ha detto chi è: un salto della strada.
    | "hop"
    // Ha risposto la destinazione: la strada è finita.
    | "reached"
    // Nessuno ha risposto in tempo: quel salto resta ignoto.
    | "timeout"
    // Un router ha avvisato che oltre non si passa.
    | "net-unreachable"
    | "host-unreachable"
    // L'host non trova sulla propria LAN a chi consegnare la sonda.
    | "unreachable"
    // L'host non ha nemmeno potuto spedirla.
    | "transmit-failed";
  // Chi ha risposto; null se nessuno.
  from: Ipv4Address | null;
  // true se tracert finisce qui.
  done: boolean;
}

// Richiesta di avviare un'attesa che scadrà dopo `delay` tick.
export interface TimerRequest {
  delay: number;
  timer: HostTimer;
}

// Che cosa l'host chiede al simulatore di fare.
export interface HostOutput {
  send: EthernetFrame[];
  startTimers: TimerRequest[];
  cancelTimers: HostTimer[];
  // Echo request arrivati a una conclusione.
  pingResults: PingResult[];
  // Sonde di tracert arrivate a una conclusione.
  traceHops: TraceHop[];
  // Cose da fare per conto di un'altra conversazione: ciò che riguarda i
  // pacchetti che aspettavano un MAC, quando la risposta ARP li fa partire
  // o l'attesa scade. Restano della conversazione che li aveva fatti
  // nascere, non di quella che li sblocca.
  onBehalfOf?: OnBehalfOf<HostOutput>[];
}

/** Un elenco di cose da fare che appartiene a una conversazione precisa. */
export interface OnBehalfOf<Output> {
  conversationId: number;
  output: Output;
}

// Che cosa ha fatto l'host dopo aver ricevuto un frame.
export interface HostReaction extends HostOutput {
  dropped: DropReason | null;
  tableChanged: boolean;
}

// Che cosa ha fatto l'host allo scadere di un'attesa.
export interface TimerReaction extends HostOutput {
  // Pacchetti a cui l'host ha rinunciato, ciascuno con la sua conversazione.
  droppedPackets: PendingPacket[];
}

// L'elenco vuoto: nulla da inviare, nulla da aspettare, nulla di concluso.
export const NOTHING: HostOutput = { send: [], startTimers: [], cancelTimers: [], pingResults: [], traceHops: [] };

/**
 * Unisce due elenchi di cose da fare in uno solo.
 *
 * @param a - il primo elenco
 * @param b - il secondo; le sue voci vengono dopo quelle del primo
 */
export function merge(a: HostOutput, b: HostOutput): HostOutput {
  return {
    send: [...a.send, ...b.send],
    startTimers: [...a.startTimers, ...b.startTimers],
    cancelTimers: [...a.cancelTimers, ...b.cancelTimers],
    pingResults: [...a.pingResults, ...b.pingResults],
    traceHops: [...a.traceHops, ...b.traceHops],
    onBehalfOf: [...(a.onBehalfOf ?? []), ...(b.onBehalfOf ?? [])],
  };
}

/**
 * Mette ciò che riguarda un pacchetto in attesa nella conversazione del
 * pacchetto. Se il simulatore non gli ha ancora dato un numero, resta
 * della conversazione corrente.
 *
 * @param pending - il pacchetto che aspettava un MAC
 * @param output - ciò che ne nasce: il frame che parte, l'esito di un ping
 */
export function onBehalfOf(pending: PendingPacket, output: HostOutput): HostOutput {
  if (pending.conversationId === null) return output;
  return { ...NOTHING, onBehalfOf: [{ conversationId: pending.conversationId, output }] };
}
