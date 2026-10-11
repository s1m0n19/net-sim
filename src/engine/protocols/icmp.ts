// ICMP (Internet Control Message Protocol): i messaggi di servizio di IP.
//
// I due del ping: chi fa il ping manda un echo request; chi lo riceve
// risponde con un echo reply che riporta gli stessi identificativo e
// numero di sequenza.
//
// E i messaggi di errore, con cui un router avvisa il mittente che un suo
// pacchetto non è arrivato: "time exceeded" quando il TTL si esaurisce,
// "destination unreachable" quando la destinazione non si raggiunge.

import type { EchoMessage, IcmpError, IcmpMessage, Ipv4Packet } from "../model/frames";

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
export function makeEchoRequest(identifier: number, sequence: number): EchoMessage {
  return { type: "echo-request", identifier, sequence };
}

/**
 * Costruisce l'echo reply che risponde a un echo request.
 *
 * @param request - la richiesta a cui si risponde
 * @returns il messaggio ICMP di risposta, con gli stessi identificativo
 *   e numero di sequenza della richiesta
 */
export function makeEchoReply(request: EchoMessage): EchoMessage {
  return { type: "echo-reply", identifier: request.identifier, sequence: request.sequence };
}

/**
 * Dice se un messaggio ICMP è uno dei due del ping, e non un errore.
 *
 * @param message - il messaggio da guardare
 */
export function isEcho(message: IcmpMessage): message is EchoMessage {
  return message.type === "echo-request" || message.type === "echo-reply";
}

// Perché un router non ha potuto consegnare un pacchetto.
export type DeliveryFailure = "ttl-expired" | "net-unreachable" | "host-unreachable";

/**
 * Prepara il messaggio ICMP di errore che riguarda un pacchetto scartato.
 *
 * @param failure - perché il pacchetto non è stato consegnato
 * @param packet - il pacchetto scartato
 * @returns il messaggio, oppure null se il pacchetto scartato era a sua
 *   volta un messaggio di errore: sugli errori non si mandano errori,
 *   altrimenti due router potrebbero rimpallarsi avvisi senza fine
 */
export function makeIcmpError(failure: DeliveryFailure, packet: Ipv4Packet): IcmpError | null {
  const message = packet.payload;
  if (!isEcho(message)) return null;

  const original = {
    srcIp: packet.srcIp,
    dstIp: packet.dstIp,
    type: message.type,
    identifier: message.identifier,
    sequence: message.sequence,
  };
  if (failure === "ttl-expired") return { type: "time-exceeded", original };
  return { type: "destination-unreachable", code: failure === "net-unreachable" ? "net" : "host", original };
}
