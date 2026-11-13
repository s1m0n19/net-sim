// Duplicare un dispositivo (requisito ED-6, decisione D-101).
//
// La copia è un dispositivo nuovo dello stesso tipo, con nome, identificativo
// e MAC scelti come per qualsiasi dispositivo aggiunto (D-46). Della
// configurazione dell'originale prende solo ciò che serve a costruire in
// fretta una rete che funziona:
//
// - un PC o un server: maschera e gateway, e il primo indirizzo libero della
//   stessa sottorete dopo quello dell'originale;
// - uno switch: il numero di porte, quali sono spente, le VLAN e la VLAN
//   di ogni porta. Le tabelle MAC no: la copia nasce senza aver imparato
//   nulla, come ogni dispositivo nuovo;
// - un router: il numero di interfacce, che nascono spente e senza indirizzi,
//   senza rotte. Copiarne gli indirizzi produrrebbe solo conflitti.
//
// La copia nasce accesa e senza cavi, come ogni dispositivo nuovo.

import { addDevice, type DeviceTemplate } from "./editing";
import { ipToNumber, numberToIp, sameNetwork, type Ipv4Address } from "./model/addresses";
import { checkIpConfig } from "./model/ip-config";
import { findDevice, type Device, type Host, type Network } from "./model/network";

/**
 * Aggiunge alla rete una copia di un dispositivo.
 *
 * @param network - la rete da modificare
 * @param deviceId - il dispositivo da copiare
 * @returns la copia, già nella rete
 * @throws Error se il dispositivo non esiste
 */
export function duplicateDevice(network: Network, deviceId: string): Device {
  const original = findDevice(network, deviceId);
  const copy = addDevice(network, templateOf(original));

  if (original.kind === "switch" && copy.kind === "switch") {
    copy.ports.forEach((port, index) => {
      port.enabled = original.ports[index].enabled;
      port.vlan = original.ports[index].vlan;
    });
    copy.vlans = original.vlans.map((vlan) => ({ ...vlan }));
  }
  if (original.kind === "host" && copy.kind === "host") {
    const ip = nextFreeAddress(network, original);
    // Senza un indirizzo libero la copia resta non configurata: maschera e
    // gateway da soli non sono una configurazione accettabile (CFG-7).
    if (ip !== null) {
      copy.ip = ip;
      copy.mask = original.mask;
      copy.gateway = original.gateway;
    }
  }
  return copy;
}

/**
 * Il primo indirizzo libero della sottorete di un host, dopo il suo.
 *
 * Libero vuol dire che nessun host e nessuna interfaccia di router lo usa,
 * che non è il gateway dell'host, e che Windows lo accetterebbe come
 * indirizzo (quindi non è il broadcast della sottorete).
 *
 * @param network - la rete in cui cercare
 * @param host - l'host da cui partire
 * @returns l'indirizzo, oppure null se l'host non è configurato o se dopo
 *   il suo indirizzo, nella sottorete, non ce n'è uno libero
 */
export function nextFreeAddress(network: Network, host: Host): Ipv4Address | null {
  const { ip, mask, gateway } = host;
  if (ip === null || mask === null) return null;

  const used = new Set<Ipv4Address>(usedAddresses(network));
  if (gateway !== null) used.add(gateway);

  for (let n = ipToNumber(ip) + 1; n <= 0xffffffff; n++) {
    const candidate = numberToIp(n);
    // Usciti dalla sottorete non c'è più nulla da cercare.
    if (!sameNetwork(candidate, ip, mask)) return null;
    if (used.has(candidate)) continue;
    if (checkIpConfig({ ip: candidate, mask, gateway }) === null) return candidate;
  }
  return null;
}

// Gli indirizzi già assegnati nella rete: quelli degli host e quelli delle
// interfacce dei router.
function usedAddresses(network: Network): Ipv4Address[] {
  return network.devices.flatMap((device) => {
    if (device.kind === "host") return device.ip === null ? [] : [device.ip];
    if (device.kind === "router") return device.ports.flatMap((port) => (port.ip === null ? [] : [port.ip]));
    return [];
  });
}

// Che cosa aggiungere per avere un dispositivo dello stesso tipo e della
// stessa grandezza.
function templateOf(device: Device): DeviceTemplate {
  switch (device.kind) {
    case "host":
      return { kind: device.role === "server" ? "server" : "host" };
    case "switch":
      return { kind: "switch", portCount: device.ports.length };
    case "router":
      return { kind: "router", interfaceCount: device.ports.length };
  }
}
