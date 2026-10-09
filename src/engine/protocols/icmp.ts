// ICMP (Internet Control Message Protocol), limitato ai due messaggi del ping.
//
// Chi fa il ping manda un echo request; chi lo riceve risponde con un echo
// reply che riporta gli stessi identificativo e numero di sequenza.

import type { IcmpMessage } from "../model/frames";

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
