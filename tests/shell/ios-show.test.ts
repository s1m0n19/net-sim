import { describe, expect, test } from "vitest";
import {
  addRoute,
  configureInterface,
  disableInterface,
  disconnectLink,
  ping,
  renameDevice,
} from "../../src/engine/actions";
import { Simulator } from "../../src/engine/simulator";
import { show } from "../../src/shell/ios/show";
import {
  buildLan,
  buildThreeNetworks,
  buildTwoLans,
  buildVlanLan,
  PC1_MAC,
  PC2_IP,
  PC2_MAC,
  PC3_MAC,
  PC4_IP,
  PC4_MAC,
} from "../engine/builders";

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

// Le reti di prova con i router:
//   buildTwoLans        PC1 192.168.1.10 ── Gi0/0 [R1] Gi0/1 ── PC2 192.168.2.10
//   buildThreeNetworks  PC1 ── [R1] 10.0.0.1 ── 10.0.0.2 [R2] ── PC2

describe("show running-config", () => {
  test("scrive la configurazione con i comandi che la imposterebbero", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" }));

    expect(show("running-config", sim.network, "r1")).toEqual([
      "Building configuration...",
      "",
      "Current configuration:",
      "!",
      "hostname R1",
      "!",
      "interface GigabitEthernet0/0",
      " ip address 192.168.1.1 255.255.255.0",
      "!",
      "interface GigabitEthernet0/1",
      " ip address 10.0.0.1 255.255.255.252",
      "!",
      "ip route 192.168.2.0 255.255.255.0 10.0.0.2",
      "!",
      "end",
    ]);
  });

  test("un'interfaccia spenta e senza indirizzo lo dice", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(configureInterface("r1", "Gi0/1", null, null));
    sim.dispatch(disableInterface("r1", "Gi0/1"));

    const lines = show("running-config", sim.network, "r1");

    expect(lines.slice(lines.indexOf("interface GigabitEthernet0/1"))).toEqual([
      "interface GigabitEthernet0/1",
      " no ip address",
      " shutdown",
      "!",
      "end",
    ]);
  });

  test("il nome è quello di adesso", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(renameDevice("r1", "Aula"));

    expect(show("running-config", sim.network, "r1")).toContain("hostname Aula");
  });

  test("su uno switch le porte non hanno indirizzo, e quelle spente lo dicono", () => {
    const { sim } = buildLan();
    sim.dispatch(disableInterface("s1", "Fa0/2"));

    expect(show("running-config", sim.network, "s1").slice(3)).toEqual([
      "!",
      "hostname SW1",
      "!",
      "interface FastEthernet0/1",
      "!",
      "interface FastEthernet0/2",
      " shutdown",
      "!",
      "interface FastEthernet0/3",
      "!",
      "interface FastEthernet0/4",
      "!",
      "end",
    ]);
  });

  test("show startup-config mostra la stessa configurazione, senza le righe iniziali", () => {
    const { sim } = buildTwoLans();

    expect(show("startup-config", sim.network, "r1")).toEqual(show("running-config", sim.network, "r1").slice(3));
  });
});

describe("show ip interface brief", () => {
  test("una riga per interfaccia: indirizzo, stato e protocollo", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(disableInterface("r1", "Gi0/1"));

    expect(show("ip-interface-brief", sim.network, "r1")).toEqual([
      "Interface              IP-Address      OK? Method Status                Protocol",
      "GigabitEthernet0/0     192.168.1.1     YES manual up                    up",
      "GigabitEthernet0/1     192.168.2.1     YES manual administratively down down",
    ]);
  });

  test("accesa ma senza segnale dall'altra parte, un'interfaccia è down", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(disconnectLink("l1"));

    expect(show("ip-interface-brief", sim.network, "r1")[1]).toBe(
      "GigabitEthernet0/0     192.168.1.1     YES manual down                  down",
    );
  });

  test("le porte di uno switch non hanno indirizzo; quelle senza cavo sono down", () => {
    const { sim } = buildLan();

    const lines = show("ip-interface-brief", sim.network, "s1");

    expect(lines[1]).toBe("FastEthernet0/1        unassigned      YES unset  up                    up");
    expect(lines[4]).toBe("FastEthernet0/4        unassigned      YES unset  down                  down");
  });
});

describe("show ip route", () => {
  test("elenca le reti collegate e le rotte statiche, con le sigle", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" }));

    expect(show("ip-route", sim.network, "r1")).toEqual([
      "Codes: C - connected, S - static, * - candidate default",
      "",
      "Gateway of last resort is not set",
      "",
      "C    192.168.1.0/24 is directly connected, GigabitEthernet0/0",
      "C    10.0.0.0/30 is directly connected, GigabitEthernet0/1",
      "S    192.168.2.0/24 [1/0] via 10.0.0.2",
    ]);
  });

  test("la rotta di default è il gateway di ultima istanza", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" }));

    const lines = show("ip-route", sim.network, "r1");

    expect(lines[2]).toBe("Gateway of last resort is 10.0.0.2 to network 0.0.0.0");
    expect(lines.at(-1)).toBe("S*   0.0.0.0/0 [1/0] via 10.0.0.2");
  });

  test("una rete collegata sparisce quando la sua interfaccia è spenta", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(disableInterface("r1", "Gi0/0"));

    expect(show("ip-route", sim.network, "r1").slice(4)).toEqual([
      "C    10.0.0.0/30 is directly connected, GigabitEthernet0/1",
    ]);
  });

  test("una rotta statica il cui prossimo salto non è raggiungibile non compare", () => {
    const { sim } = buildThreeNetworks();
    sim.dispatch(addRoute("r1", { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "172.16.0.9" }));

    const lines = show("ip-route", sim.network, "r1");

    expect(lines.some((line) => line.startsWith("S"))).toBe(false);
    expect(show("running-config", sim.network, "r1")).toContain("ip route 192.168.2.0 255.255.255.0 172.16.0.9");
  });
});

describe("show arp", () => {
  test("su un router appena acceso ci sono solo i suoi indirizzi", () => {
    const { sim } = buildTwoLans();

    expect(show("arp", sim.network, "r1")).toEqual([
      "Protocol  Address          Age (min)  Hardware Addr      Type   Interface",
      "Internet  192.168.1.1              -  02:00:00:00:03:01  ARPA   GigabitEthernet0/0",
      "Internet  192.168.2.1              -  02:00:00:00:03:02  ARPA   GigabitEthernet0/1",
    ]);
  });

  test("dopo un ping compaiono i due PC, ciascuno dietro la sua interfaccia", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);

    expect(show("arp", sim.network, "r1").slice(3)).toEqual([
      "Internet  192.168.1.10             0  02:00:00:00:00:01  ARPA   GigabitEthernet0/0",
      "Internet  192.168.2.10             0  02:00:00:00:00:02  ARPA   GigabitEthernet0/1",
    ]);
  });

  test("uno switch non ha una tabella ARP", () => {
    const { sim } = buildLan();

    expect(show("arp", sim.network, "s1")).toEqual([]);
  });
});

describe("show interfaces", () => {
  test("per ogni interfaccia: stato, MAC e indirizzo", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(disableInterface("r1", "Gi0/1"));

    expect(show("interfaces", sim.network, "r1")).toEqual([
      "GigabitEthernet0/0 is up, line protocol is up",
      "  Hardware address is 02:00:00:00:03:01",
      "  Internet address is 192.168.1.1/24",
      "GigabitEthernet0/1 is administratively down, line protocol is down",
      "  Hardware address is 02:00:00:00:03:02",
      "  Internet address is 192.168.2.1/24",
    ]);
  });

  test("le porte di uno switch non hanno la riga dell'indirizzo", () => {
    const { sim } = buildLan();

    expect(show("interfaces", sim.network, "s1").slice(0, 2)).toEqual([
      "FastEthernet0/1 is up, line protocol is up",
      "  Hardware address is 02:00:00:00:01:01",
    ]);
  });
});

describe("show mac address-table", () => {
  test("all'inizio è vuota: solo l'intestazione", () => {
    const { sim } = buildLan();

    expect(show("mac-address-table", sim.network, "s1")).toEqual([
      "          Mac Address Table",
      "-------------------------------------------",
      "",
      "Vlan    Mac Address          Type        Ports",
      "----    -----------------    --------    -----",
    ]);
  });

  test("dopo un ping elenca i MAC imparati, con la porta", () => {
    const { sim } = buildLan();
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(show("mac-address-table", sim.network, "s1").slice(5)).toEqual([
      `   1    ${PC1_MAC}    DYNAMIC     Fa0/1`,
      `   1    ${PC2_MAC}    DYNAMIC     Fa0/2`,
    ]);
  });

  test("con più VLAN scrive la VLAN di ogni riga, in ordine di VLAN", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(ping("d3", PC4_IP, 1));
    run(sim);
    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(show("mac-address-table", sim.network, "s1").slice(5)).toEqual([
      `  10    ${PC1_MAC}    DYNAMIC     Fa0/1`,
      `  10    ${PC2_MAC}    DYNAMIC     Fa0/2`,
      `  20    ${PC3_MAC}    DYNAMIC     Fa0/3`,
      `  20    ${PC4_MAC}    DYNAMIC     Fa0/4`,
    ]);
  });
});
