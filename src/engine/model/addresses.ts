// Gli indirizzi sono semplici stringhe, scritte come sul libro di testo.

export type MacAddress = string; // "02:00:00:00:00:01"
export type Ipv4Address = string; // "192.168.1.10"

// Un frame con questo MAC di destinazione è diretto a tutti i dispositivi della LAN.
export const BROADCAST_MAC: MacAddress = "ff:ff:ff:ff:ff:ff";

/**
 * Trasforma un indirizzo IPv4 scritto in notazione decimale puntata nel
 * numero a 32 bit corrispondente, su cui si possono fare i calcoli.
 *
 * @param ip - l'indirizzo, per esempio "192.168.1.10"
 * @returns il numero a 32 bit
 * @throws Error se il testo non è un indirizzo IPv4 valido
 */
export function ipToNumber(ip: Ipv4Address): number {
  const parts = ip.split(".");
  const valid =
    parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  if (!valid) {
    throw new Error(`Indirizzo IPv4 non valido: ${ip}`);
  }
  // Ogni parte occupa 8 bit: la prima è la più significativa.
  let value = 0;
  for (const part of parts) {
    value = value * 256 + Number(part);
  }
  return value;
}

/**
 * Dice se un indirizzo è di loopback, cioè uno dei 127.x.x.x: indirizzi
 * con cui un dispositivo parla con se stesso, senza passare dalla rete.
 *
 * @param ip - l'indirizzo da controllare
 * @returns true se il primo numero è 127
 * @throws Error se il testo non è un indirizzo IPv4 valido
 */
export function isLoopbackAddress(ip: Ipv4Address): boolean {
  return Math.floor(ipToNumber(ip) / 2 ** 24) === 127;
}

/**
 * Dice se un testo è una subnet mask valida: scritta in binario deve avere
 * tutti i bit a 1 (la parte di rete) seguiti da tutti i bit a 0 (la parte
 * di host), senza alternanze. È la regola della notazione CIDR.
 *
 * @param mask - la maschera da controllare, per esempio "255.255.255.0"
 * @returns true se è una maschera valida; false se non è un indirizzo
 *   IPv4 o se i bit a 1 non sono contigui, come in "255.0.255.0"
 */
export function isValidMask(mask: Ipv4Address): boolean {
  let bits: string;
  try {
    bits = ipToNumber(mask).toString(2).padStart(32, "0");
  } catch {
    return false;
  }
  return /^1*0*$/.test(bits);
}

/**
 * Dice se due indirizzi appartengono alla stessa rete.
 * Lo sono quando, applicata la maschera, resta lo stesso indirizzo di rete.
 *
 * @param a - il primo indirizzo
 * @param b - il secondo indirizzo
 * @param mask - la subnet mask, per esempio "255.255.255.0"
 * @returns true se i due indirizzi hanno lo stesso indirizzo di rete
 * @throws Error se un indirizzo non è IPv4 valido o se la maschera non è valida
 */
export function sameNetwork(a: Ipv4Address, b: Ipv4Address, mask: Ipv4Address): boolean {
  if (!isValidMask(mask)) {
    throw new Error(`Subnet mask non valida: ${mask}`);
  }
  const maskBits = ipToNumber(mask);
  // `>>> 0` riporta il risultato dell'AND a un numero senza segno.
  const networkOfA = (ipToNumber(a) & maskBits) >>> 0;
  const networkOfB = (ipToNumber(b) & maskBits) >>> 0;
  return networkOfA === networkOfB;
}
