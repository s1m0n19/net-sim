// IPv4: porta un pacchetto da un host a un altro, anche attraverso più reti.
//
// La domanda a cui risponde questo file è quella che ogni host si fa prima
// di spedire: la destinazione è nella mia rete, o devo passare dal gateway?

import { sameNetwork, type Ipv4Address } from "../model/addresses";
import type { IcmpMessage, Ipv4Packet } from "../model/frames";
import type { Host } from "../model/network";

// TTL con cui Windows fa partire i pacchetti.
export const DEFAULT_TTL = 128;

/**
 * Costruisce un pacchetto IPv4 che trasporta un messaggio ICMP.
 *
 * @param srcIp - indirizzo di chi spedisce
 * @param dstIp - indirizzo del destinatario finale
 * @param payload - il messaggio ICMP da trasportare
 * @returns il pacchetto, con il TTL iniziale
 */
export function makeIpv4Packet(
  srcIp: Ipv4Address,
  dstIp: Ipv4Address,
  payload: IcmpMessage,
): Ipv4Packet {
  return { srcIp, dstIp, ttl: DEFAULT_TTL, protocol: "ICMP", payload };
}

/**
 * Sceglie il prossimo salto: a quale indirizzo della propria LAN un host
 * deve consegnare un pacchetto perché arrivi a destinazione. Non modifica nulla.
 *
 * - Destinazione nella stessa rete: la destinazione stessa.
 * - Destinazione in un'altra rete: il gateway.
 *
 * @param host - l'host che spedisce, di cui si leggono indirizzo, maschera e gateway
 * @param dstIp - l'indirizzo del destinatario finale
 * @returns l'indirizzo del prossimo salto, oppure null se l'host non può
 *   spedire: non ha indirizzo o maschera, oppure la destinazione è in
 *   un'altra rete e non c'è un gateway
 * @throws Error se un indirizzo o la maschera non sono IPv4 validi
 */
export function nextHopFor(host: Host, dstIp: Ipv4Address): Ipv4Address | null {
  if (host.ip === null || host.mask === null) return null;

  if (sameNetwork(host.ip, dstIp, host.mask)) {
    return dstIp;
  }
  return host.gateway;
}
