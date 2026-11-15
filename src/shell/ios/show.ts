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
  type SwitchPort,
} from "../../engine/model/network";
import { ALL_VLANS, formatVlanList, isAllowed, type AllowedVlans } from "../../engine/model/trunks";
import { DEFAULT_VLAN, MAX_VLAN_ID, defaultVlanName, macEntries } from "../../engine/model/vlans";
import { routingTableOf } from "../../engine/protocols/routing";
import type { ShowTopic } from "./grammar";
import { fullInterfaceName } from "./interface-names";

/**
 * Risponde a un comando `show`.
 *
 * @param topic - che cosa si vuole guardare
 * @param network - la rete com'è adesso; non viene modificata
 * @param deviceId - il router o lo switch su cui gira la CLI
 * @param interfaceName - per i `show` di una sola interfaccia, il suo nome breve
 * @returns le righe da stampare
 * @throws Error se il dispositivo non esiste o è un host
 */
export function show(topic: ShowTopic, network: Network, deviceId: string, interfaceName?: string): string[] {
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
    case "interface":
      return interfaces(network, device, interfaceName);
    case "interface-switchport": {
      const port = device.kind === "switch" ? device.ports.find((p) => p.name === interfaceName) : undefined;
      return device.kind === "switch" && port !== undefined ? switchportOf(network, device, port) : [];
    }
    case "interfaces-trunk":
      return device.kind === "switch" ? trunks(network, device) : [];
    case "mac-address-table":
      return device.kind === "switch" ? macTable(device) : [];
    case "vlan-brief":
      return device.kind === "switch" ? vlanBrief(device) : [];
  }
}

// La configurazione, scritta con gli stessi comandi con cui la si imposta:
// copiandola riga per riga su un dispositivo nuovo si otterrebbe questo.
// Il punto esclamativo separa i blocchi, e IOS lo ignora quando legge.
function configurationOf(device: Router | Switch): string[] {
  const lines = ["!", `hostname ${device.name}`, "!"];
  // Le VLAN di uno switch, oltre la 1. Su IOS stanno a parte (vlan.dat),
  // e compaiono qui solo in certe configurazioni: qui ci sono sempre, così
  // un comando mostra tutto. Il nome si scrive solo se non è quello da sé.
  if (device.kind === "switch") {
    for (const vlan of device.vlans) {
      if (vlan.id === DEFAULT_VLAN) continue;
      lines.push(`vlan ${vlan.id}`);
      if (vlan.name !== defaultVlanName(vlan.id)) lines.push(` name ${vlan.name}`);
      lines.push("!");
    }
  }
  for (const port of device.ports) {
    lines.push(`interface ${fullInterfaceName(port.name)}`);
    if (device.kind === "router") {
      const address = addressOf(device, port.name);
      lines.push(address === null ? " no ip address" : ` ip address ${address.ip} ${address.mask}`);
    }
    if (device.kind === "switch") lines.push(...switchportLines(port as SwitchPort));
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

// La configurazione di una porta di switch, nell'ordine di IOS: VLAN
// access, nativa, VLAN consentite, modo. Si scrive solo ciò che non è il
// valore di partenza, anche su una porta access che conserva nativa e
// consentite, e la VLAN access anche se è stata eliminata: la porta resta
// assegnata al suo numero.
function switchportLines(port: SwitchPort): string[] {
  const lines: string[] = [];
  if (port.vlan !== DEFAULT_VLAN) lines.push(` switchport access vlan ${port.vlan}`);
  if (port.nativeVlan !== DEFAULT_VLAN) lines.push(` switchport trunk native vlan ${port.nativeVlan}`);
  if (port.allowedVlans !== ALL_VLANS) lines.push(` switchport trunk allowed vlan ${vlanListText(port.allowedVlans, "none")}`);
  if (port.mode === "trunk") lines.push(" switchport mode trunk");
  return lines;
}

// Un elenco di VLAN in forma compatta, come lo scrive IOS; `empty` per
// nessuna. Tutte le VLAN si scrivono come l'intervallo che net-sim usa,
// 1-1001, e non 1-4094 come su IOS (D-153).
function vlanListText(vlans: AllowedVlans, empty: string): string {
  if (vlans === ALL_VLANS) return `1-${MAX_VLAN_ID}`;
  return vlans.length === 0 ? empty : formatVlanList(vlans);
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

// show interfaces: stato e indirizzi di ogni interfaccia, o di una sola.
// Un apparato vero aggiunge una ventina di righe di contatori, che qui
// non esistono.
function interfaces(network: Network, device: Router | Switch, only?: string): string[] {
  const lines: string[] = [];
  for (const port of device.ports) {
    if (only !== undefined && port.name !== only) continue;
    const { status, protocol } = statusOf(network, device, port.name);
    lines.push(`${fullInterfaceName(port.name)} is ${status}, line protocol is ${protocol}`);
    lines.push(`  Hardware address is ${port.mac}`);
    const address = addressOf(device, port.name);
    if (address !== null) lines.push(`  Internet address is ${address.ip}/${maskToPrefix(address.mask)}`);
  }
  return lines;
}

// show interfaces trunk: le porte trunk che funzionano, cioè accese e con
// il segnale sul cavo; le altre non ci sono, come su IOS, e senza trunk
// funzionanti non si stampa nulla. Tre blocchi: modo, incapsulamento,
// stato e nativa; le VLAN consentite; quelle consentite e configurate
// sullo switch, cioè quelle che il trunk porta davvero. Il quarto blocco
// di IOS, sullo spanning tree, non c'è: net-sim non lo simula. Il modo è
// sempre "on", perché il trunk si configura a mano e non si negozia.
function trunks(network: Network, sw: Switch): string[] {
  const working = sw.ports.filter((port) => port.mode === "trunk" && statusOf(network, sw, port.name).status === "up");
  if (working.length === 0) return [];
  const row = (name: string, rest: string) => `${name.padEnd(12)}${rest}`;
  const active = (port: SwitchPort) => sw.vlans.map((vlan) => vlan.id).filter((id) => isAllowed(port.allowedVlans, id));
  return [
    row("Port", "Mode             Encapsulation  Status        Native vlan"),
    ...working.map((port) => row(port.name, `${"on".padEnd(17)}${"802.1q".padEnd(15)}${"trunking".padEnd(14)}${port.nativeVlan}`)),
    "",
    row("Port", "Vlans allowed on trunk"),
    ...working.map((port) => row(port.name, vlanListText(port.allowedVlans, "none"))),
    "",
    row("Port", "Vlans allowed and active in management domain"),
    ...working.map((port) => row(port.name, vlanListText(active(port), "none"))),
  ];
}

// show interfaces fa0/24 switchport: la configurazione di una porta,
// access e trunk, anche quella conservata e senza effetto. Il modo in uso
// è "down" se la porta è spenta o senza segnale. Una VLAN che lo switch
// non ha è segnata "Inactive", come su IOS. Nessuna riga sulla
// negoziazione dei trunk (DTP), che non c'è.
function switchportOf(network: Network, sw: Switch, port: SwitchPort): string[] {
  const vlanText = (id: number) => {
    const vlan = sw.vlans.find((v) => v.id === id);
    return `${id} (${vlan === undefined ? "Inactive" : vlan.name})`;
  };
  const administrative = port.mode === "trunk" ? "trunk" : "static access";
  const up = statusOf(network, sw, port.name).status === "up";
  const enabled = port.allowedVlans === ALL_VLANS ? "ALL" : vlanListText(port.allowedVlans, "NONE");
  return [
    `Name: ${port.name}`,
    "Switchport: Enabled",
    `Administrative Mode: ${administrative}`,
    `Operational Mode: ${up ? administrative : "down"}`,
    "Administrative Trunking Encapsulation: dot1q",
    `Access Mode VLAN: ${vlanText(port.vlan)}`,
    `Trunking Native Mode VLAN: ${vlanText(port.nativeVlan)}`,
    `Trunking VLANs Enabled: ${enabled}`,
  ];
}

// show vlan brief: una riga per VLAN, con le porte che ci stanno, quattro
// per riga. Le porte rimaste su una VLAN eliminata sono inattive e non
// compaiono, come su IOS. Le VLAN da 1002 a 1005, che IOS elenca sempre,
// qui non esistono.
function vlanBrief(sw: Switch): string[] {
  const PORTS_PER_LINE = 4;
  const lines = [
    "VLAN Name                             Status    Ports",
    "---- -------------------------------- --------- -------------------------------",
  ];
  for (const vlan of sw.vlans) {
    // Solo le porte access: un trunk non sta in una VLAN, e non compare, come su IOS.
    const ports = sw.ports.filter((port) => port.mode === "access" && port.vlan === vlan.id).map((port) => port.name);
    const groups: string[] = [];
    for (let i = 0; i < ports.length; i += PORTS_PER_LINE) groups.push(ports.slice(i, i + PORTS_PER_LINE).join(", "));
    const head = `${String(vlan.id).padEnd(4)} ${vlan.name.padEnd(32)} ${"active".padEnd(9)} `;
    lines.push(`${head}${groups[0] ?? ""}`.trimEnd());
    for (const group of groups.slice(1)) lines.push(`${" ".repeat(head.length)}${group}`);
  }
  return lines;
}

// show mac address-table: ciò che lo switch ha imparato, VLAN per VLAN.
function macTable(sw: Switch): string[] {
  const lines = [
    "          Mac Address Table",
    "-------------------------------------------",
    "",
    "Vlan    Mac Address          Type        Ports",
    "----    -----------------    --------    -----",
  ];
  for (const { vlan, mac, port } of macEntries(sw)) {
    lines.push(`${String(vlan).padStart(4)}    ${mac}    DYNAMIC     ${port}`);
  }
  return lines;
}
