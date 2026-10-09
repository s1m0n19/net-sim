// ICMP (Internet Control Message Protocol), limitato ai due messaggi del ping.
//
// Chi fa il ping manda un echo request; chi lo riceve risponde con un echo
// reply che riporta gli stessi identificativo e numero di sequenza.

import type { IcmpMessage } from "../model/frames";

// Per quanti tick chi fa il ping aspetta l'echo reply prima di considerare
// la richiesta scaduta. È più lunga dell'attesa ARP: così, se il problema
// è un MAC che non si trova, lo si scopre prima.
export const ECHO_TIMEOUT_TICKS = 40;

// Quanti echo request manda un ping, se non si chiede altro. È il valore di Windows.
export const DEFAULT_PING_COUNT = 4;

/**
 * Costruisce un echo request, la domanda del ping.
 *
 * @param identifier - numero che distingue questo ping dagli altri dello stesso host
 * @param sequence - numero progressivo della richiesta all'interno del ping
 * @returns il messaggio ICMP
 */
export function makeEchoRequest(identifier: number, sequence: number): IcmpMessage {
  return { type: "echo-request", identifier, sequence };
}

/**
 * Costruisce l'echo reply che risponde a un echo request.
 *
 * @param request - la richiesta a cui si risponde
 * @returns il messaggio ICMP di risposta, con gli stessi identificativo
 *   e numero di sequenza della richiesta
 */
export function makeEchoReply(request: IcmpMessage): IcmpMessage {
  return { type: "echo-reply", identifier: request.identifier, sequence: request.sequence };
}
