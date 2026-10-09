// Controllo della configurazione IP di un host.
//
// Le regole sono quelle di Windows: ciò che Windows non lascerebbe
// impostare viene rifiutato. Tutto il resto è ammesso, anche se sbagliato
// per quella rete: indirizzi duplicati, maschere diverse nella stessa LAN,
// un gateway fuori dalla sottorete. Sono errori da diagnosticare, non da impedire.

import { ipToNumber, isValidMask, sameNetwork, type Ipv4Address } from "./addresses";

export interface IpConfig {
  ip: Ipv4Address | null;
  mask: Ipv4Address | null;
  gateway: Ipv4Address | null;
}

/**
 * Controlla la configurazione IP di un host. Non modifica nulla.
 *
 * @param config - indirizzo, subnet mask e gateway; ciascuno può essere null
 * @returns null se la configurazione è accettabile, altrimenti una frase
 *   che dice che cosa non va (senza maiuscola iniziale né punto finale,
 *   così chi la usa può farla precedere dal nome dell'host)
 */
export function checkIpConfig(config: IpConfig): string | null {
  const { ip, mask, gateway } = config;

  // Un host o è configurato, o non lo è: indirizzo e maschera vanno insieme.
  if (ip === null && mask === null) {
    return gateway === null ? null : "il gateway non può essere impostato senza un indirizzo IP";
  }
  if (ip === null || mask === null) {
    return "indirizzo IP e subnet mask vanno impostati insieme";
  }

  if (!isValidIp(ip)) return `indirizzo IP non valido: ${ip}`;
  if (!isValidMask(mask)) return `subnet mask non valida: ${mask}`;

  const ipProblem = checkAssignable(ip, ip, mask);
  if (ipProblem !== null) return `l'indirizzo ${ip} ${ipProblem}`;

  if (gateway !== null) {
    if (!isValidIp(gateway)) return `gateway non valido: ${gateway}`;
    const gatewayProblem = checkAssignable(gateway, ip, mask);
    if (gatewayProblem !== null) return `il gateway ${gateway} ${gatewayProblem}`;
  }

  return null;
}

/**
 * Dice se un testo è un indirizzo IPv4 scritto correttamente.
 *
 * @param ip - il testo da controllare
 * @returns true se sono quattro numeri da 0 a 255 separati da punti
 */
export function isValidIp(ip: Ipv4Address): boolean {
  try {
    ipToNumber(ip);
    return true;
  } catch {
    return false;
  }
}

// Dice perché `address` non può essere l'indirizzo di un dispositivo della
// sottorete di `hostIp`, oppure null se può esserlo.
function checkAssignable(
  address: Ipv4Address,
  hostIp: Ipv4Address,
  mask: Ipv4Address,
): string | null {
  const value = ipToNumber(address);
  const firstNumber = Math.floor(value / 2 ** 24);

  // Indirizzi che non identificano mai un dispositivo su una rete:
  // "nessun indirizzo", il loopback, il multicast e gli indirizzi riservati.
  if (value === 0 || firstNumber === 127 || firstNumber >= 224) {
    return "non è assegnabile a un dispositivo";
  }

  // In ogni sottorete il primo indirizzo indica la rete stessa e l'ultimo
  // tutti i suoi host. Il controllo ha senso solo se l'indirizzo appartiene
  // alla sottorete dell'host, e se la sottorete ha almeno quattro indirizzi
  // (con /31 e /32 non esistono né indirizzo di rete né broadcast).
  const maskBits = ipToNumber(mask);
  const hostBits = 2 ** 32 - 1 - maskBits;
  if (hostBits >= 3 && sameNetwork(address, hostIp, mask)) {
    const network = (value & maskBits) >>> 0;
    if (value === network) return "è l'indirizzo di rete della sottorete";
    if (value === network + hostBits) return "è l'indirizzo di broadcast della sottorete";
  }

  return null;
}
