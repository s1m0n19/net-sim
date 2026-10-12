// Modifiche alla configurazione di un router: indirizzi e stato delle
// interfacce, rotte statiche.
//
// Come le funzioni di editing.ts, cambiano la configurazione e nient'altro:
// a tenere in ordine la simulazione pensa network-changes.ts. Ciò che un
// router vero rifiuterebbe viene rifiutato, con le regole di
// model/router-config.ts.

import type { Ipv4Address } from "./model/addresses";
import { findDevice, type Network, type Router, type RouterInterface, type StaticRoute } from "./model/network";
import { checkInterfaceAddress, checkInterfacesApart, checkRoute, sameRoute } from "./model/router-config";

/**
 * Cambia l'indirizzo di un'interfaccia di un router, dopo averlo
 * controllato: valgono le regole degli host, e in più la rete non deve
 * sovrapporsi a quella di un'altra interfaccia dello stesso router.
 *
 * @param network - la rete da modificare
 * @param deviceId - il router
 * @param portName - l'interfaccia, per esempio "Gi0/0"
 * @param ip - l'indirizzo, oppure null per toglierlo
 * @param mask - la subnet mask, oppure null
 * @returns il router modificato
 * @throws Error se il dispositivo non è un router, se non ha
 *   quell'interfaccia, o se l'indirizzo non è accettabile; in quel caso
 *   l'interfaccia resta com'era
 */
export function configureInterface(
  network: Network,
  deviceId: string,
  portName: string,
  ip: Ipv4Address | null,
  mask: Ipv4Address | null,
): Router {
  const router = findRouter(network, deviceId);
  const port = findInterface(router, portName);
  const problem =
    checkInterfaceAddress(ip, mask) ??
    // Le altre interfacce restano com'erano: si prova con questa cambiata.
    checkInterfacesApart(router.ports.map((other) => (other === port ? { ...port, ip, mask } : other)));
  if (problem !== null) {
    throw new Error(`${router.name} ${portName}: ${problem}.`);
  }
  port.ip = ip;
  port.mask = mask;
  return router;
}

/**
 * Accende o spegne un'interfaccia di un router. Spenta, è come se il suo
 * cavo non ci fosse.
 *
 * @param network - la rete da modificare
 * @param deviceId - il router
 * @param portName - l'interfaccia
 * @param enabled - true per accenderla, false per spegnerla
 * @returns true se lo stato è cambiato, false se era già così
 * @throws Error se il dispositivo non è un router o non ha quell'interfaccia
 */
export function setInterfaceEnabled(
  network: Network,
  deviceId: string,
  portName: string,
  enabled: boolean,
): boolean {
  const port = findInterface(findRouter(network, deviceId), portName);
  if (port.enabled === enabled) return false;
  port.enabled = enabled;
  return true;
}

/**
 * Aggiunge una rotta statica a un router, in fondo all'elenco.
 *
 * @param network - la rete da modificare
 * @param deviceId - il router
 * @param route - rete di destinazione, maschera e prossimo salto
 * @throws Error se il dispositivo non è un router, se la rotta non è
 *   accettabile, o se il router ne ha già una uguale
 */
export function addRoute(network: Network, deviceId: string, route: StaticRoute): void {
  const router = findRouter(network, deviceId);
  const problem = checkRoute(route);
  if (problem !== null) {
    throw new Error(`${router.name}: ${problem}.`);
  }
  if (router.routes.some((other) => sameRoute(other, route))) {
    throw new Error(`${router.name} ha già questa rotta.`);
  }
  router.routes.push({ network: route.network, mask: route.mask, nextHop: route.nextHop });
}

/**
 * Toglie una rotta statica da un router.
 *
 * @param network - la rete da modificare
 * @param deviceId - il router
 * @param route - la rotta da togliere: rete, maschera e prossimo salto
 * @throws Error se il dispositivo non è un router o non ha quella rotta
 */
export function removeRoute(network: Network, deviceId: string, route: StaticRoute): void {
  const router = findRouter(network, deviceId);
  const index = router.routes.findIndex((other) => sameRoute(other, route));
  if (index === -1) {
    throw new Error(`${router.name} non ha questa rotta.`);
  }
  router.routes.splice(index, 1);
}

function findRouter(network: Network, deviceId: string): Router {
  const device = findDevice(network, deviceId);
  if (device.kind !== "router") {
    throw new Error(`${device.name} non è un router.`);
  }
  return device;
}

function findInterface(router: Router, portName: string): RouterInterface {
  const port = router.ports.find((p) => p.name === portName);
  if (port === undefined) {
    throw new Error(`${router.name} non ha un'interfaccia ${portName}.`);
  }
  return port;
}
