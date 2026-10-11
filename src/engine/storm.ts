// Come si riconosce una tempesta di broadcast.
//
// Senza spanning tree, un ciclo tra switch fa girare un frame all'infinito.
// Il simulatore la lascia avvenire per un po', poi si sospende. I segnali
// sono due, perché le tempeste sono di due tipi.

import type { SimEvent } from "./events";
import type { Network } from "./model/network";

// 1. Un frame che gira in tondo. In una rete senza cicli un frame passa da
//    ogni switch al massimo una volta: se è stato inoltrato più volte di
//    quanti sono gli switch, c'è di sicuro un ciclo. Lo si lascia girare
//    per questo numero di volte il numero degli switch, poi basta.
export const STORM_LAPS = 3;
// 2. I frame che si moltiplicano. Se gli switch del ciclo hanno più strade
//    tra loro, a ogni giro le copie aumentano: oltre questo numero di frame
//    in viaggio ci si ferma comunque.
export const STORM_FRAME_LIMIT = 200;

/**
 * Guarda i frame in viaggio e dice se mostrano una tempesta di broadcast.
 * Non modifica nulla.
 *
 * @param network - la rete, per contare gli switch
 * @param queue - la coda dei fatti futuri
 * @returns quanti frame sono in viaggio, se è in corso una tempesta;
 *   altrimenti null
 */
export function stormSize(network: Network, queue: SimEvent[]): number | null {
  const inFlight = queue.filter((event) => event.kind === "frame-arrival");
  const switches = network.devices.filter((device) => device.kind === "switch").length;

  const goingInCircles = inFlight.some((event) => event.hops > switches * STORM_LAPS);
  const multiplying = inFlight.length > STORM_FRAME_LIMIT;
  return goingInCircles || multiplying ? inFlight.length : null;
}
