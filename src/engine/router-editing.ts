// Modifiche alla configurazione di un router: indirizzi delle interfacce
// e rotte statiche. Accendere e spegnere un'interfaccia vale anche per le
// porte degli switch, e sta in port-editing.ts.
//
// Come le funzioni di editing.ts, cambiano la configurazione e nient'altro:
// a tenere in ordine la simulazione pensa network-changes.ts. Ciò che un
// router vero rifiuterebbe viene rifiutato, con le regole di
// model/router-config.ts.

import type { Ipv4Address } from "./model/addresses";
import { findDevice, type Network, type Router, type RouterInterface, type StaticRoute } from "./model/network";
import { checkInterfaceAddress, checkInterfacesApart, checkRoute, sameRoute } from "./model/router-config";
import { checkSubinterfaces } from "./model/subinterfaces";

/**
 * Cambia l'indirizzo di un'interfaccia di un router, dopo averlo
 * controllato: valgono le regole degli host, e in più la rete non deve
 * sovrapporsi a quella di un'altra interfaccia dello stesso router.
 *
 * @param network - la rete da modificare
 * Vale anche per una sottointerfaccia ("Gi0/0.10"), che deve avere già la
 * sua VLAN. In ogni caso le reti di tutte le interfacce logiche non si
 * devono sovrapporre, e una porta con una sottointerfaccia native non può
 * avere un indirizzo (vincoli V8–V10, model/subinterfaces.ts).
 *
 * @param deviceId - il router
 * @param portName - l'interfaccia, per esempio "Gi0/0", o la sottointerfaccia
 * @param ip - l'indirizzo, oppure null per toglierlo
 * @param mask - la subnet mask, oppure null
 * @returns il router modificato, e se è cambiato qualcosa: per una porta
 *   fisica sempre sì, come prima delle sottointerfacce; per una
 *   sottointerfaccia solo se l'indirizzo è diverso
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
): { router: Router; changed: boolean } {
  const router = findRouter(network, deviceId);
  const sub = router.subinterfaces.find((s) => s.name === portName);
  if (sub !== undefined) {
    if (sub.ip === ip && sub.mask === mask) return { router, changed: false };
    // Si prova con la sottointerfaccia cambiata: tutti i vincoli, poi la modifica.
    const changed = { ...sub, ip, mask };
    const problem = checkSubinterfaces({ ...router, subinterfaces: router.subinterfaces.map((s) => (s === sub ? changed : s)) });
    if (problem !== null) throw new Error(`${router.name}: ${problem}.`);
    sub.ip = ip;
    sub.mask = mask;
    return { router, changed: true };
  }
  const port = findInterface(router, portName);
  const ports = router.ports.map((other) => (other === port ? { ...port, ip, mask } : other));
  const problem =
    checkInterfaceAddress(ip, mask) ??
    // Le altre interfacce restano com'erano: si prova con questa cambiata.
    checkInterfacesApart(ports);
  if (problem !== null) {
    throw new Error(`${router.name} ${portName}: ${problem}.`);
  }
  // Le sottointerfacce: niente reti sovrapposte, e niente indirizzo su una
  // porta con una sottointerfaccia native.
  const withSubinterfaces = checkSubinterfaces({ ...router, ports });
  if (withSubinterfaces !== null) throw new Error(`${router.name}: ${withSubinterfaces}.`);
  port.ip = ip;
  port.mask = mask;
  return { router, changed: true };
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
