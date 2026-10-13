// Far nascere il traffico: che cosa fa un dispositivo quando gli si chiede
// un ping, un tracert o una richiesta ARP.
//
// Come sempre il dispositivo non spedisce nulla: dice che cosa vuole fare,
// e il simulatore lo esegue.

import type { Action } from "./actions";
import { startArpResolution, startPing, startTracert, NOTHING, type HostOutput } from "./devices/host";
import { startRouterPing, startTraceroute, type RouterOutput } from "./devices/router";
import type { Host, Network, Router } from "./model/network";
import { routingTableOf } from "./protocols/routing";

// Le azioni che fanno nascere traffico.
export type TrafficAction = Extract<Action, { kind: "ping" | "tracert" | "resolve-address" }>;

/**
 * Dice che cosa fa un host per compiere un'azione.
 *
 * @param host - l'host a cui l'azione è rivolta
 * @param action - ping, tracert o richiesta ARP
 * @returns frame da inviare, attese da avviare ed esiti già noti
 * @throws Error se l'azione ha un indirizzo, un numero di richieste o un
 *   TTL non validi
 */
export function startOnHost(host: Host, action: TrafficAction): HostOutput {
  switch (action.kind) {
    case "ping":
      return startPing(host, action.targetIp, action.count, action.ttl);
    case "tracert":
      return startTracert(host, action.targetIp, action.maxHops);
    case "resolve-address": {
      const request = startArpResolution(host, action.targetIp);
      return { ...NOTHING, send: request === null ? [] : [request] };
    }
  }
}

/**
 * Dice che cosa fa un router per compiere un ping o un traceroute
 * lanciato dalla sua CLI. Il TTL scelto a mano (`ping -i`) è un'opzione
 * dei soli host: qui non conta.
 *
 * @param network - la rete, da cui si ricava la tabella di routing
 * @param router - il router a cui l'azione è rivolta
 * @param action - ping o tracert
 * @returns frame da inviare, attese da avviare ed esiti già noti
 * @throws Error se l'azione ha un indirizzo, un numero di richieste o un
 *   numero di salti non validi
 */
export function startOnRouter(
  network: Network,
  router: Router,
  action: Exclude<TrafficAction, { kind: "resolve-address" }>,
): RouterOutput {
  const table = routingTableOf(network, router);
  if (action.kind === "ping") return startRouterPing(router, action.targetIp, action.count, table);
  return startTraceroute(router, action.targetIp, action.maxHops, table);
}

/**
 * Dice se un dispositivo ha chiesto di fare qualcosa, o ha già concluso
 * qualcosa: se no, l'azione non ha avuto alcun effetto.
 *
 * @param output - ciò che il dispositivo ha chiesto
 */
export function hasSomethingToDo(output: HostOutput | RouterOutput): boolean {
  return (
    output.send.length > 0 ||
    output.startTimers.length > 0 ||
    output.pingResults.length > 0 ||
    output.traceHops.length > 0
  );
}
