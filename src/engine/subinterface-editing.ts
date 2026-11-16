// Le sottointerfacce di un router: crearle, toglierle, sceglierne la VLAN
// (model/subinterfaces.ts). Indirizzo e stato si cambiano con le azioni di
// sempre, `configure-interface` e `set-interface-enabled`, che accettano
// anche il nome di una sottointerfaccia (router-editing.ts, port-editing.ts).
//
// Come le funzioni di editing.ts, cambiano la configurazione e nient'altro:
// a far dimenticare al router ciò che non vale più pensa network-changes.ts
// (D-174). Ogni modifica si prova prima su una copia del router e si
// controlla con tutti i vincoli (checkSubinterfaces): se ne viola uno, il
// router resta com'era. Nulla si corregge da sé.

import { findDevice, type Network, type Router, type Subinterface } from "./model/network";
import { checkSubinterfaces, newSubinterface } from "./model/subinterfaces";

/**
 * Crea una sottointerfaccia vuota: senza VLAN, senza indirizzo, accesa.
 *
 * @param network - la rete da modificare
 * @param deviceId - identificativo del router
 * @param name - il nome, per esempio "Gi0/0.10"
 * @returns la sottointerfaccia creata
 * @throws Error se il dispositivo non è un router, o se il nome non va bene
 *   (forma, porta padre, numero, già usato); in quel caso il router non cambia
 */
export function addSubinterface(network: Network, deviceId: string, name: string): Subinterface {
  const router = findRouter(network, deviceId);
  const created = newSubinterface(name);
  refuseUnlessValid(router, [...router.subinterfaces, created]);
  router.subinterfaces.push(created);
  return created;
}

/**
 * Toglie una sottointerfaccia. La porta padre e i cavi restano.
 *
 * @param network - la rete da modificare
 * @param deviceId - identificativo del router
 * @param name - il nome della sottointerfaccia
 * @throws Error se il dispositivo non è un router o non ha quella sottointerfaccia
 */
export function removeSubinterface(network: Network, deviceId: string, name: string): void {
  const router = findRouter(network, deviceId);
  findSubinterface(router, name);
  router.subinterfaces = router.subinterfaces.filter((sub) => sub.name !== name);
}

/**
 * Sceglie la VLAN di una sottointerfaccia (`encapsulation dot1Q N`), ed
 * eventualmente native. Indirizzo e stato restano. Una VLAN null toglie
 * l'incapsulamento, ma solo se la sottointerfaccia non ha un indirizzo:
 * quello va tolto prima, nella stessa modifica (D-166).
 *
 * @param network - la rete da modificare
 * @param deviceId - identificativo del router
 * @param name - il nome della sottointerfaccia
 * @param vlan - la VLAN, da 1 a 1001, oppure null
 * @param native - se i frame della VLAN passano senza tag
 * @returns true se è cambiato qualcosa
 * @throws Error se il dispositivo non è un router, non ha quella
 *   sottointerfaccia, o la modifica viola un vincolo (VLAN fuori intervallo
 *   o già usata sullo stesso padre, due native, native con un indirizzo sul
 *   padre, indirizzo senza VLAN); in quel caso il router non cambia
 */
export function setSubinterfaceEncapsulation(
  network: Network,
  deviceId: string,
  name: string,
  vlan: number | null,
  native: boolean,
): boolean {
  const router = findRouter(network, deviceId);
  const sub = findSubinterface(router, name);
  if (sub.vlan === vlan && sub.native === native) return false;
  const changed = { ...sub, vlan, native };
  refuseUnlessValid(
    router,
    router.subinterfaces.map((other) => (other === sub ? changed : other)),
  );
  sub.vlan = vlan;
  sub.native = native;
  return true;
}

/**
 * Trova una sottointerfaccia di un router.
 *
 * @param router - il router
 * @param name - il nome della sottointerfaccia
 * @returns la sottointerfaccia
 * @throws Error se il router non ce l'ha
 */
export function findSubinterface(router: Router, name: string): Subinterface {
  const sub = router.subinterfaces.find((s) => s.name === name);
  if (sub === undefined) throw new Error(`${router.name} non ha una sottointerfaccia ${name}.`);
  return sub;
}

// Il router, o un errore se il dispositivo non lo è.
function findRouter(network: Network, deviceId: string): Router {
  const device = findDevice(network, deviceId);
  if (device.kind !== "router") throw new Error(`${device.name} non è un router: non ha sottointerfacce.`);
  return device;
}

// Prova le sottointerfacce date su una copia del router: se violano un
// vincolo, la modifica si ferma prima di toccare il router vero.
function refuseUnlessValid(router: Router, subinterfaces: Subinterface[]): void {
  const problem = checkSubinterfaces({ ...router, subinterfaces });
  if (problem !== null) throw new Error(`${router.name}: ${problem}.`);
}
