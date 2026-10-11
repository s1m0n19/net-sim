// Che cosa si può impostare su un router: gli indirizzi delle interfacce e
// le rotte statiche. Come per gli host (ip-config.ts), ciò che un apparato
// vero rifiuterebbe viene rifiutato qui; tutto il resto è ammesso, anche
// se sbagliato per quella rete.

import { isValidMask, networkAddress, networksOverlap, type Ipv4Address } from "./addresses";
import { checkIpConfig, isValidIp } from "./ip-config";
import type { RouterInterface, StaticRoute } from "./network";

/**
 * Controlla l'indirizzo di un'interfaccia. Valgono le regole degli host:
 * indirizzo e maschera insieme, oppure nessuno dei due; niente indirizzo
 * di rete o di broadcast della sottorete.
 *
 * @param ip - l'indirizzo, oppure null
 * @param mask - la subnet mask, oppure null
 * @returns null se va bene, altrimenti una frase che dice che cosa non va
 *   (senza maiuscola iniziale né punto finale)
 */
export function checkInterfaceAddress(ip: Ipv4Address | null, mask: Ipv4Address | null): string | null {
  return checkIpConfig({ ip, mask, gateway: null });
}

/**
 * Controlla che le interfacce di un router guardino reti diverse: due
 * interfacce dello stesso router non possono avere reti che si
 * sovrappongono. Le maschere possono essere di qualsiasi lunghezza, e
 * diverse tra loro: 10.0.0.1/30 e 10.0.0.5/30 vanno bene, 192.168.1.1/24
 * e 192.168.1.129/25 no.
 *
 * @param interfaces - le interfacce del router, con indirizzi già validi
 * @returns null se va bene, altrimenti una frase che nomina le due
 *   interfacce in conflitto
 */
export function checkInterfacesApart(interfaces: RouterInterface[]): string | null {
  const configured = interfaces.filter((port) => port.ip !== null && port.mask !== null);
  for (let i = 0; i < configured.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = configured[j];
      const b = configured[i];
      if (networksOverlap(a.ip!, a.mask!, b.ip!, b.mask!)) {
        return `la rete di ${b.name} (${b.ip}) si sovrappone a quella di ${a.name} (${a.ip})`;
      }
    }
  }
  return null;
}

/**
 * Controlla una rotta statica.
 *
 * Il prossimo salto non deve per forza essere raggiungibile: una rotta
 * verso un vicino che non c'è è un errore di configurazione legittimo, da
 * diagnosticare.
 *
 * @param route - rete di destinazione, maschera e prossimo salto
 * @returns null se va bene, altrimenti una frase che dice che cosa non va:
 *   indirizzo o maschera scritti male, oppure rete e maschera che non
 *   vanno d'accordo (192.168.2.5 con 255.255.255.0 non è una rete)
 */
export function checkRoute(route: StaticRoute): string | null {
  if (!isValidIp(route.network)) return `rete non valida: ${route.network}`;
  if (!isValidMask(route.mask)) return `subnet mask non valida: ${route.mask}`;
  if (!isValidIp(route.nextHop)) return `prossimo salto non valido: ${route.nextHop}`;
  if (networkAddress(route.network, route.mask) !== route.network) {
    return `${route.network} non è un indirizzo di rete con la maschera ${route.mask}`;
  }
  return null;
}

/**
 * Dice se due rotte sono la stessa: stessa rete, stessa maschera, stesso
 * prossimo salto.
 */
export function sameRoute(a: StaticRoute, b: StaticRoute): boolean {
  return a.network === b.network && a.mask === b.mask && a.nextHop === b.nextHop;
}
