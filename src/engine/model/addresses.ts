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
 * Scrive un numero a 32 bit come indirizzo IPv4 in notazione decimale
 * puntata: è il contrario di `ipToNumber` (3232235786 diventa 192.168.1.10).
 *
 * @param value - il numero, da 0 a 4294967295
 * @returns l'indirizzo
 * @throws Error se il numero non è un intero in quell'intervallo
 */
export function numberToIp(value: number): Ipv4Address {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`Numero fuori dagli indirizzi IPv4: ${value}`);
  }
  // Ogni 8 bit sono una parte, a cominciare dai più significativi.
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
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
 * Conta i bit a 1 di una subnet mask: è il numero che si scrive dopo la
 * barra nella notazione CIDR (255.255.255.0 diventa 24).
 *
 * @param mask - la subnet mask
 * @returns la lunghezza del prefisso, da 0 a 32
 * @throws Error se la maschera non è valida
 */
export function maskToPrefix(mask: Ipv4Address): number {
  if (!isValidMask(mask)) {
    throw new Error(`Subnet mask non valida: ${mask}`);
  }
  return ipToNumber(mask).toString(2).split("1").length - 1;
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

/**
 * Calcola l'indirizzo di rete: ciò che resta di un indirizzo dopo aver
 * applicato la maschera (192.168.1.10 con 255.255.255.0 dà 192.168.1.0).
 *
 * @param ip - un indirizzo della rete
 * @param mask - la subnet mask
 * @returns l'indirizzo di rete, in notazione decimale puntata
 * @throws Error se l'indirizzo non è IPv4 valido o se la maschera non è valida
 */
export function networkAddress(ip: Ipv4Address, mask: Ipv4Address): Ipv4Address {
  if (!isValidMask(mask)) {
    throw new Error(`Subnet mask non valida: ${mask}`);
  }
  const value = (ipToNumber(ip) & ipToNumber(mask)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

/**
 * Dice se due reti si sovrappongono, cioè se hanno indirizzi in comune.
 *
 * Le maschere possono essere diverse e di qualsiasi lunghezza: conta solo
 * la più corta delle due. Se, guardati con quella, i due indirizzi stanno
 * nella stessa rete, allora la rete più piccola è contenuta nella più
 * grande. Così 192.168.1.0/24 e 192.168.1.128/25 si sovrappongono, mentre
 * 10.0.0.0/30 e 10.0.0.4/30 no.
 *
 * @param ipA - un indirizzo della prima rete
 * @param maskA - la maschera della prima rete
 * @param ipB - un indirizzo della seconda rete
 * @param maskB - la maschera della seconda rete
 * @returns true se le due reti hanno almeno un indirizzo in comune
 * @throws Error se un indirizzo o una maschera non sono validi
 */
export function networksOverlap(
  ipA: Ipv4Address,
  maskA: Ipv4Address,
  ipB: Ipv4Address,
  maskB: Ipv4Address,
): boolean {
  const shorter = maskToPrefix(maskA) <= maskToPrefix(maskB) ? maskA : maskB;
  return sameNetwork(ipA, ipB, shorter);
}

/**
 * Scrive la subnet mask che ha un certo numero di bit a 1: è il contrario
 * di `maskToPrefix` (24 diventa 255.255.255.0).
 *
 * @param prefix - la lunghezza del prefisso, da 0 a 32
 * @returns la maschera in notazione decimale puntata
 * @throws Error se il prefisso non è un intero tra 0 e 32
 */
export function prefixToMask(prefix: number): Ipv4Address {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Prefisso non valido: ${prefix}`);
  }
  const bits = "1".repeat(prefix).padEnd(32, "0");
  return [0, 8, 16, 24].map((start) => parseInt(bits.slice(start, start + 8), 2)).join(".");
}
