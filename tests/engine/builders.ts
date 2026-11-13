// Reti pronte per i test, così ogni test parte da una situazione nota.

import {
  createHost,
  createRouter,
  createSwitch,
  type Host,
  type Link,
  type Network,
  type Router,
  type RouterInterface,
  type Switch,
} from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";

export const PC1_MAC = "02:00:00:00:00:01";
export const PC2_MAC = "02:00:00:00:00:02";
export const PC3_MAC = "02:00:00:00:00:03";

export const PC1_IP = "192.168.1.10";
export const PC2_IP = "192.168.1.11";
export const PC3_IP = "192.168.1.12";

function host(id: string, name: string, mac: string, ip: string): Host {
  return createHost({
    id,
    name,
    ports: [{ name: "Fa0", mac }],
    ip,
    mask: "255.255.255.0",
    gateway: null,
  });
}

// Due PC collegati da un cavo, nella rete 192.168.1.0/24.
export function buildTwoHosts(): { sim: Simulator; pc1: Host; pc2: Host } {
  const pc1 = host("d1", "PC1", PC1_MAC, PC1_IP);
  const pc2 = host("d2", "PC2", PC2_MAC, PC2_IP);
  const network: Network = {
    devices: [pc1, pc2],
    links: [
      {
        id: "l1",
        a: { deviceId: "d1", portName: "Fa0" },
        b: { deviceId: "d2", portName: "Fa0" },
        connected: true,
      },
    ],
  };
  return { sim: new Simulator(network), pc1, pc2 };
}

function linkToSwitch(id: string, hostId: string, switchPort: string): Link {
  return {
    id,
    a: { deviceId: hostId, portName: "Fa0" },
    b: { deviceId: "s1", portName: switchPort },
    connected: true,
  };
}

// Una LAN: lo switch SW1 con PC1 su Fa0/1, PC2 su Fa0/2 e PC3 su Fa0/3.
// La porta Fa0/4 dello switch resta scollegata.
export function buildLan(): { sim: Simulator; sw: Switch; pc1: Host; pc2: Host; pc3: Host } {
  const pc1 = host("d1", "PC1", PC1_MAC, PC1_IP);
  const pc2 = host("d2", "PC2", PC2_MAC, PC2_IP);
  const pc3 = host("d3", "PC3", PC3_MAC, PC3_IP);
  const sw = createSwitch({
    id: "s1",
    name: "SW1",
    ports: [
      { name: "Fa0/1", mac: "02:00:00:00:01:01" },
      { name: "Fa0/2", mac: "02:00:00:00:01:02" },
      { name: "Fa0/3", mac: "02:00:00:00:01:03" },
      { name: "Fa0/4", mac: "02:00:00:00:01:04" },
    ],
  });
  const network: Network = {
    devices: [sw, pc1, pc2, pc3],
    links: [
      linkToSwitch("l1", "d1", "Fa0/1"),
      linkToSwitch("l2", "d2", "Fa0/2"),
      linkToSwitch("l3", "d3", "Fa0/3"),
    ],
  };
  return { sim: new Simulator(network), sw, pc1, pc2, pc3 };
}

function switchWithPorts(id: string, name: string, portCount: number): Switch {
  const ports = [];
  for (let n = 1; n <= portCount; n++) {
    ports.push({ name: `Fa0/${n}`, mac: `02:00:00:00:0${id.slice(1)}:0${n}` });
  }
  return createSwitch({ id, name, ports });
}

function cable(id: string, fromId: string, fromPort: string, toId: string, toPort: string): Link {
  return {
    id,
    a: { deviceId: fromId, portName: fromPort },
    b: { deviceId: toId, portName: toPort },
    connected: true,
  };
}

// Tre switch collegati ad anello, senza spanning tree: SW1, SW2 e SW3.
// PC1 sta su SW1 e PC2 su SW2. Un broadcast gira in tondo senza moltiplicarsi.
export function buildRing(): { sim: Simulator; pc1: Host; pc2: Host } {
  const pc1 = host("d1", "PC1", PC1_MAC, PC1_IP);
  const pc2 = host("d2", "PC2", PC2_MAC, PC2_IP);
  const network: Network = {
    devices: [
      switchWithPorts("s1", "SW1", 3),
      switchWithPorts("s2", "SW2", 3),
      switchWithPorts("s3", "SW3", 2),
      pc1,
      pc2,
    ],
    links: [
      cable("l1", "d1", "Fa0", "s1", "Fa0/1"),
      cable("l2", "d2", "Fa0", "s2", "Fa0/1"),
      cable("l3", "s1", "Fa0/2", "s2", "Fa0/2"),
      cable("l4", "s2", "Fa0/3", "s3", "Fa0/1"),
      cable("l5", "s3", "Fa0/2", "s1", "Fa0/3"),
    ],
  };
  return { sim: new Simulator(network), pc1, pc2 };
}

// Due switch uniti da tre cavi: a ogni passaggio un broadcast si sdoppia.
export function buildTripleLink(): { sim: Simulator; pc1: Host } {
  const pc1 = host("d1", "PC1", PC1_MAC, PC1_IP);
  const network: Network = {
    devices: [switchWithPorts("s1", "SW1", 4), switchWithPorts("s2", "SW2", 3), pc1],
    links: [
      cable("l1", "d1", "Fa0", "s1", "Fa0/1"),
      cable("l2", "s1", "Fa0/2", "s2", "Fa0/1"),
      cable("l3", "s1", "Fa0/3", "s2", "Fa0/2"),
      cable("l4", "s1", "Fa0/4", "s2", "Fa0/3"),
    ],
  };
  return { sim: new Simulator(network), pc1 };
}

// --- Reti con router ---------------------------------------------------------

function routedHost(id: string, name: string, mac: string, ip: string, gateway: string | null): Host {
  return createHost({ id, name, ports: [{ name: "Fa0", mac }], ip, mask: "255.255.255.0", gateway });
}

function iface(name: string, mac: string, ip: string, mask: string): RouterInterface {
  return { name, mac, ip, mask, enabled: true };
}

function wire(id: string, a: [string, string], b: [string, string]): Link {
  return {
    id,
    a: { deviceId: a[0], portName: a[1] },
    b: { deviceId: b[0], portName: b[1] },
    connected: true,
  };
}

// Due LAN unite da un router, con i PC attaccati direttamente a lui:
//
//   PC1 192.168.1.10 ── Gi0/0 [R1] Gi0/1 ── PC2 192.168.2.10
//
// R1 ha 192.168.1.1 e 192.168.2.1; ogni PC ha come gateway il "suo" lato.
export function buildTwoLans(): { sim: Simulator; pc1: Host; pc2: Host; r1: Router } {
  const pc1 = routedHost("d1", "PC1", "02:00:00:00:00:01", "192.168.1.10", "192.168.1.1");
  const pc2 = routedHost("d2", "PC2", "02:00:00:00:00:02", "192.168.2.10", "192.168.2.1");
  const r1 = createRouter({
    id: "r1",
    name: "R1",
    ports: [
      iface("Gi0/0", "02:00:00:00:03:01", "192.168.1.1", "255.255.255.0"),
      iface("Gi0/1", "02:00:00:00:03:02", "192.168.2.1", "255.255.255.0"),
    ],
    routes: [],
  });
  const network: Network = {
    devices: [pc1, r1, pc2],
    links: [wire("l1", ["d1", "Fa0"], ["r1", "Gi0/0"]), wire("l2", ["r1", "Gi0/1"], ["d2", "Fa0"])],
  };
  return { sim: new Simulator(network), pc1, pc2, r1 };
}

// Tre reti e due router in fila, senza rotte statiche:
//
//   PC1 192.168.1.10 ── [R1] 10.0.0.1 ── 10.0.0.2 [R2] ── PC2 192.168.2.10
//
// La rete tra i due router è 10.0.0.0/30. Senza rotte, R1 non conosce
// 192.168.2.0/24 e R2 non conosce 192.168.1.0/24.
export function buildThreeNetworks(): { sim: Simulator; pc1: Host; pc2: Host; r1: Router; r2: Router } {
  const pc1 = routedHost("d1", "PC1", "02:00:00:00:00:01", "192.168.1.10", "192.168.1.1");
  const pc2 = routedHost("d2", "PC2", "02:00:00:00:00:02", "192.168.2.10", "192.168.2.1");
  const r1 = createRouter({
    id: "r1",
    name: "R1",
    ports: [
      iface("Gi0/0", "02:00:00:00:03:01", "192.168.1.1", "255.255.255.0"),
      iface("Gi0/1", "02:00:00:00:03:02", "10.0.0.1", "255.255.255.252"),
    ],
    routes: [],
  });
  const r2 = createRouter({
    id: "r2",
    name: "R2",
    ports: [
      iface("Gi0/0", "02:00:00:00:04:01", "10.0.0.2", "255.255.255.252"),
      iface("Gi0/1", "02:00:00:00:04:02", "192.168.2.1", "255.255.255.0"),
    ],
    routes: [],
  });
  const network: Network = {
    devices: [pc1, r1, r2, pc2],
    links: [
      wire("l1", ["d1", "Fa0"], ["r1", "Gi0/0"]),
      wire("l2", ["r1", "Gi0/1"], ["r2", "Gi0/0"]),
      wire("l3", ["r2", "Gi0/1"], ["d2", "Fa0"]),
    ],
  };
  return { sim: new Simulator(network), pc1, pc2, r1, r2 };
}

// --- Reti con VLAN -----------------------------------------------------------

export const PC4_MAC = "02:00:00:00:00:04";
export const PC5_MAC = "02:00:00:00:00:05";
export const PC4_IP = "192.168.1.13";
export const PC5_IP = "192.168.1.14";

// Una LAN divisa in due VLAN sullo stesso switch, tutti nella stessa
// sottorete 192.168.1.0/24:
//
//   VLAN 10 (STUDENTI): PC1 su Fa0/1, PC2 su Fa0/2, PC5 su Fa0/5
//   VLAN 20 (DOCENTI):  PC3 su Fa0/3, PC4 su Fa0/4
//
// La porta Fa0/6 resta scollegata, nella VLAN 1.
export function buildVlanLan(): FiveHostLan {
  return fiveHostLan([10, 10, 20, 20, 10, 1], [
    { id: 10, name: "STUDENTI" },
    { id: 20, name: "DOCENTI" },
  ]);
}

// La stessa rete di buildVlanLan, ma senza VLAN: tutte le porte nella
// VLAN 1, come uno switch appena acceso. Serve a configurare le VLAN da zero.
export function buildFlatLan(): FiveHostLan {
  return fiveHostLan([1, 1, 1, 1, 1, 1], []);
}

type FiveHostLan = { sim: Simulator; sw: Switch; pc1: Host; pc2: Host; pc3: Host; pc4: Host; pc5: Host };

function fiveHostLan(vlanOfPort: number[], vlans: { id: number; name: string }[]): FiveHostLan {
  const pc1 = host("d1", "PC1", PC1_MAC, PC1_IP);
  const pc2 = host("d2", "PC2", PC2_MAC, PC2_IP);
  const pc3 = host("d3", "PC3", PC3_MAC, PC3_IP);
  const pc4 = host("d4", "PC4", PC4_MAC, PC4_IP);
  const pc5 = host("d5", "PC5", PC5_MAC, PC5_IP);
  const sw = createSwitch({
    id: "s1",
    name: "SW1",
    ports: vlanOfPort.map((vlan, index) => ({ name: `Fa0/${index + 1}`, mac: `02:00:00:00:01:0${index + 1}`, vlan })),
    vlans,
  });
  const network: Network = {
    devices: [sw, pc1, pc2, pc3, pc4, pc5],
    links: [
      linkToSwitch("l1", "d1", "Fa0/1"),
      linkToSwitch("l2", "d2", "Fa0/2"),
      linkToSwitch("l3", "d3", "Fa0/3"),
      linkToSwitch("l4", "d4", "Fa0/4"),
      linkToSwitch("l5", "d5", "Fa0/5"),
    ],
  };
  return { sim: new Simulator(network), sw, pc1, pc2, pc3, pc4, pc5 };
}

// Due switch uniti da un cavo tra due porte access, Fa0/3 di SW1 e Fa0/3
// di SW2; tutti nella sottorete 192.168.1.0/24:
//
//   SW1: PC1 su Fa0/1 nella VLAN 10, PC3 su Fa0/2 nella VLAN 20,
//        Fa0/3 verso SW2 nella VLAN 10
//   SW2: PC2 su Fa0/1 e Fa0/3 verso SW1, entrambe nella VLAN `farVlan`
//
// Il cavo tra gli switch non porta la VLAN: ogni switch dà ai frame la
// VLAN della sua porta.
export function buildTwoVlanSwitches(farVlan: number): {
  sim: Simulator;
  sw1: Switch;
  sw2: Switch;
} {
  const pc1 = host("d1", "PC1", PC1_MAC, PC1_IP);
  const pc2 = host("d2", "PC2", PC2_MAC, PC2_IP);
  const pc3 = host("d3", "PC3", PC3_MAC, PC3_IP);
  const sw1 = createSwitch({
    id: "s1",
    name: "SW1",
    ports: [
      { name: "Fa0/1", mac: "02:00:00:00:01:01", vlan: 10 },
      { name: "Fa0/2", mac: "02:00:00:00:01:02", vlan: 20 },
      { name: "Fa0/3", mac: "02:00:00:00:01:03", vlan: 10 },
    ],
    vlans: [
      { id: 10, name: "VLAN0010" },
      { id: 20, name: "VLAN0020" },
    ],
  });
  const sw2 = createSwitch({
    id: "s2",
    name: "SW2",
    ports: [
      { name: "Fa0/1", mac: "02:00:00:00:02:01", vlan: farVlan },
      { name: "Fa0/3", mac: "02:00:00:00:02:03", vlan: farVlan },
    ],
    vlans: [{ id: farVlan, name: `VLAN00${farVlan}` }],
  });
  const network: Network = {
    devices: [sw1, sw2, pc1, pc2, pc3],
    links: [
      cable("l1", "d1", "Fa0", "s1", "Fa0/1"),
      cable("l2", "d3", "Fa0", "s1", "Fa0/2"),
      cable("l3", "s1", "Fa0/3", "s2", "Fa0/3"),
      cable("l4", "d2", "Fa0", "s2", "Fa0/1"),
    ],
  };
  return { sim: new Simulator(network), sw1, sw2 };
}
