// Routing: come un router sceglie da quale interfaccia far uscire un
// pacchetto, e a chi consegnarlo.
//
// La tabella di routing è un elenco di reti. Per ciascuna dice da quale
// interfaccia si esce e, se la rete non è collegata direttamente, a quale
// vicino va consegnato il pacchetto (il "prossimo salto"). Tra le reti che
// contengono la destinazione vince la più precisa, cioè quella con la
// maschera più lunga.

import { maskToPrefix, sameNetwork, type Ipv4Address } from "../model/addresses";
import { linkAt, linkCarriesSignal, type Network, type Router } from "../model/network";

export interface Route {
  // "connected": la rete di un'interfaccia; "static": impostata a mano.
  kind: "connected" | "static";
  network: Ipv4Address;
  mask: Ipv4Address;
  // Il vicino a cui consegnare il pacchetto; null per una rete collegata,
  // dove il pacchetto va consegnato direttamente al destinatario.
  nextHop: Ipv4Address | null;
  // L'interfaccia da cui si esce. Null per una rotta statica inutilizzabile:
  // il suo prossimo salto non sta su nessuna rete collegata.
  portName: string | null;
}

/**
 * Costruisce la tabella di routing di un router, com'è in questo momento.
 * Non modifica nulla.
 *
 * - Le reti collegate entrano da sole: una per ogni interfaccia accesa,
 *   con un indirizzo, e che sente il segnale sul cavo. Staccando il cavo,
 *   la rete sparisce dalla tabella.
 * - Le rotte statiche sono quelle impostate. Una rotta statica serve solo
 *   se il suo prossimo salto sta su una rete collegata: da lì si ricava
 *   l'interfaccia di uscita. Altrimenti resta in tabella, ma senza
 *   interfaccia, e non viene mai scelta.
 *
 * @param network - la rete, per sapere quali cavi portano segnale
 * @param router - il router
 * @returns prima le reti collegate, nell'ordine delle interfacce, poi le
 *   rotte statiche, nell'ordine in cui sono state impostate
 */
export function routingTableOf(network: Network, router: Router): Route[] {
  const connected: Route[] = [];
  for (const port of router.ports) {
    if (!port.enabled || port.ip === null || port.mask === null) continue;
    const link = linkAt(network, { deviceId: router.id, portName: port.name });
    if (link === null || !linkCarriesSignal(network, link)) continue;
    connected.push({ kind: "connected", network: port.ip, mask: port.mask, nextHop: null, portName: port.name });
  }

  const statics = router.routes.map((route): Route => {
    const exit = connected.find((net) => sameNetwork(net.network, route.nextHop, net.mask));
    return { kind: "static", ...route, portName: exit?.portName ?? null };
  });
  return [...connected, ...statics];
}

/**
 * Sceglie la rotta per una destinazione. Non modifica nulla.
 *
 * Tra le rotte utilizzabili la cui rete contiene la destinazione vince
 * quella con la maschera più lunga; a parità, la prima della tabella. La
 * rotta di default (0.0.0.0 con maschera 0.0.0.0) contiene ogni
 * destinazione, e quindi vince solo quando non c'è di meglio.
 *
 * @param table - la tabella di routing, da `routingTableOf`
 * @param dstIp - l'indirizzo del destinatario finale
 * @returns la rotta scelta, oppure null se nessuna porta a quella destinazione
 */
export function lookupRoute(table: Route[], dstIp: Ipv4Address): Route | null {
  let best: Route | null = null;
  for (const route of table) {
    if (route.portName === null) continue;
    if (!sameNetwork(route.network, dstIp, route.mask)) continue;
    if (best === null || maskToPrefix(route.mask) > maskToPrefix(best.mask)) {
      best = route;
    }
  }
  return best;
}
