// I comandi `show` della CLI: la configurazione e le tabelle di un
// dispositivo, scritte come le scrive IOS.
//
// Sono funzioni che leggono soltanto: prendono la rete com'è in questo
// momento e restituiscono righe di testo. Intestazioni, numeri di versione
// e diciture di marca non ci sono (D-90); i MAC sono scritti con i due
// punti, come nel resto dell'app.

import { maskToPrefix, networkAddress, sameNetwork } from "../../engine/model/addresses";
import {
  findDevice,
  linkAt,
  linkCarriesSignal,
  type Network,
  type Router,
  type Switch,
} from "../../engine/model/network";
import { routingTableOf } from "../../engine/protocols/routing";
import type { ShowTopic } from "./grammar";
import { fullInterfaceName } from "./interface-names";

/**
 * Risponde a un comando `show`.
 *
 * @param topic - che cosa si vuole guardare
 * @param network - la rete com'è adesso; non viene modificata
 * @param deviceId - il router o lo switch su cui gira la CLI
 * @returns le righe da stampare
 * @throws Error se il dispositivo non esiste o è un host
 */
export function show(topic: ShowTopic, network: Network, deviceId: string): string[] {
  const device = findDevice(network, deviceId);
  if (device.kind === "host") {
    throw new Error(`${device.name} non ha una CLI di questo tipo.`);
  }
  switch (topic) {
    case "running-config":
      return ["Building configuration...", "", "Current configuration:", ...configurationOf(device)];
    case "startup-config":
      // Non c'è una configurazione di avvio separata: è quella in uso (D-92).
      return configurationOf(device);
    case "ip-interface-brief":
      return interfaceBrief(network, device);
    case "ip-route":
      return device.kind === "router" ? routingTable(network, device) : [];
    case "arp":
      return device.kind === "router" ? arpTable(network, device) : [];
    case "interfaces":
      return interfaces(network, device);
    case "mac-address-table":
      return device.kind === "switch" ? macTable(device) : [];
  }
}

// La configurazione, scritta con gli stessi comandi con cui la si imposta:
// copiandola riga per riga su un dispositivo nuovo si otterrebbe questo.
// Il punto esclamativo separa i blocchi, e IOS lo ignora quando legge.
function configurationOf(device: Router | Switch): string[] {
  const lines = ["!", `hostname ${device.name}`, "!"];
  for (const port of device.ports) {
    lines.push(`interface ${fullInterfaceName(port.name)}`);
    if (device.kind === "router") {
      const address = addressOf(device, port.name);
      lines.push(address === null ? " no ip address" : ` ip address ${address.ip} ${address.mask}`);
    }
    if (!port.enabled) lines.push(" shutdown");
    lines.push("!");
  }
  if (device.kind === "router" && device.routes.length > 0) {
    for (const route of device.routes) {
      lines.push(`ip route ${route.network} ${route.mask} ${route.nextHop}`);
    }
    lines.push("!");
  }
  lines.push("end");
  return lines;
}

// L'indirizzo di un'interfaccia; null se non ne ha uno. Le porte di uno
// switch di livello 2 non ne hanno mai.
function addressOf(device: Router | Switch, portName: string): { ip: string; mask: string } | null {
  if (device.kind !== "router") return null;
  const port = device.ports.find((p) => p.name === portName);
  if (port === undefined || port.ip === null || port.mask === null) return null;
  return { ip: port.ip, mask: port.mask };
}

// Lo stato di un'interfaccia, in due parole. La prima dice se è accesa
// (Status), la seconda se dall'altra parte del cavo c'è qualcuno
// (Protocol): spenta con `shutdown` è "administratively down".
function statusOf(network: Network, device: Router | Switch, portName: string): { status: string; protocol: string } {
  const port = device.ports.find((p) => p.name === portName);
  if (port === undefined || !port.enabled) return { status: "administratively down", protocol: "down" };
  const cable = linkAt(network, { deviceId: device.id, portName });
  const up = cable !== null && linkCarriesSignal(network, cable);
  return up ? { status: "up", protocol: "up" } : { status: "down", protocol: "down" };
}

// show ip interface brief: una riga per interfaccia.
function interfaceBrief(network: Network, device: Router | Switch): string[] {
  const row = (name: string, ip: string, method: string, status: string, protocol: string) =>
    `${name.padEnd(23)}${ip.padEnd(16)}YES ${method.padEnd(7)}${status.padEnd(22)}${protocol}`;

  const lines = ["Interface              IP-Address      OK? Method Status                Protocol"];
  for (const port of device.ports) {
    const ip = addressOf(device, port.name)?.ip ?? null;
    const { status, protocol } = statusOf(network, device, port.name);
    lines.push(row(fullInterfaceName(port.name), ip ?? "unassigned", ip === null ? "unset" : "manual", status, protocol));
  }
  return lines;
}

// show ip route: le reti collegate (C) e le rotte statiche in uso (S).
// Una rotta statica il cui prossimo salto non è raggiungibile non compare:
// resta nella configurazione, ma il router non la usa.
function routingTable(network: Network, router: Router): string[] {
  const routes = routingTableOf(network, router).filter((route) => route.portName !== null);
  // La rotta di default, 0.0.0.0/0: dove va tutto ciò che non ha di meglio.
  const lastResort = routes.find((route) => route.kind === "static" && route.mask === "0.0.0.0");

  const lines = [
    "Codes: C - connected, S - static, * - candidate default",
    "",
    lastResort === undefined
      ? "Gateway of last resort is not set"
      : `Gateway of last resort is ${lastResort.nextHop} to network 0.0.0.0`,
    "",
  ];
  for (const route of routes) {
    const destination = `${networkAddress(route.network, route.mask)}/${maskToPrefix(route.mask)}`;
    if (route.kind === "connected") {
      lines.push(`C    ${destination} is directly connected, ${fullInterfaceName(route.portName!)}`);
    } else {
      // [1/0]: distanza amministrativa di una rotta statica, e metrica.
      const code = route === lastResort ? "S*" : "S ";
      lines.push(`${code}   ${destination} [1/0] via ${route.nextHop}`);
    }
  }
  return lines;
}

// show arp: gli indirizzi del router stesso (senza età, perché non
// scadono) e quelli imparati, ciascuno con l'interfaccia dietro cui sta.
function arpTable(network: Network, router: Router): string[] {
  const row = (address: string, age: string, mac: string, portName: string) =>
    `Internet  ${address.padEnd(17)}${age.padStart(9)}  ${mac}  ARPA   ${fullInterfaceName(portName)}`;

  const connected = routingTableOf(network, router).filter((route) => route.kind === "connected");
  const rows: string[] = [];
  for (const route of connected) {
    const port = router.ports.find((p) => p.name === route.portName)!;
    rows.push(row(port.ip!, "-", port.mac, port.name));
  }
  for (const [ip, mac] of router.arpTable) {
    const behind = connected.find((route) => sameNetwork(route.network, ip, route.mask));
    if (behind !== undefined) rows.push(row(ip, "0", mac, behind.portName!));
  }
  if (rows.length === 0) return [];
  return ["Protocol  Address          Age (min)  Hardware Addr      Type   Interface", ...rows];
}

// show interfaces: stato e indirizzi di ogni interfaccia. Un apparato
// vero aggiunge una ventina di righe di contatori, che qui non esistono.
function interfaces(network: Network, device: Router | Switch): string[] {
  const lines: string[] = [];
  for (const port of device.ports) {
    const { status, protocol } = statusOf(network, device, port.name);
    lines.push(`${fullInterfaceName(port.name)} is ${status}, line protocol is ${protocol}`);
    lines.push(`  Hardware address is ${port.mac}`);
    const address = addressOf(device, port.name);
    if (address !== null) lines.push(`  Internet address is ${address.ip}/${maskToPrefix(address.mask)}`);
  }
  return lines;
}

// show mac address-table: ciò che lo switch ha imparato. Tutte le porte
// stanno nella VLAN 1, come su uno switch appena acceso.
function macTable(sw: Switch): string[] {
  const lines = [
    "          Mac Address Table",
    "-------------------------------------------",
    "",
    "Vlan    Mac Address          Type        Ports",
    "----    -----------------    --------    -----",
  ];
  for (const [mac, portName] of sw.macTable) {
    lines.push(`   1    ${mac}    DYNAMIC     ${portName}`);
  }
  return lines;
}
