// Reti pronte per i test, così ogni test parte da una situazione nota.

import {
  createHost,
  createSwitch,
  type Host,
  type Link,
  type Network,
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
