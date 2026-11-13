import { describe, expect, test } from "vitest";
import { chooseOutputPorts, receiveFrameOnSwitch } from "../../src/engine/devices/switch";
import { BROADCAST_MAC } from "../../src/engine/model/addresses";
import type { EthernetFrame } from "../../src/engine/model/frames";
import { createSwitch, type Switch } from "../../src/engine/model/network";
import { macTableOf } from "../../src/engine/model/vlans";

const MAC_A = "02:00:00:00:00:0a";
const MAC_B = "02:00:00:00:00:0b";

// Uno switch a quattro porte, con la tabella MAC vuota.
function fourPortSwitch(): Switch {
  return createSwitch({
    id: "s1",
    name: "SW1",
    ports: [
      { name: "Fa0/1", mac: "02:00:00:00:01:01" },
      { name: "Fa0/2", mac: "02:00:00:00:01:02" },
      { name: "Fa0/3", mac: "02:00:00:00:01:03" },
      { name: "Fa0/4", mac: "02:00:00:00:01:04" },
    ],
  });
}

// Lo switch guarda solo i due MAC: il contenuto del frame qui non conta.
function frame(srcMac: string, dstMac: string): EthernetFrame {
  return {
    srcMac,
    dstMac,
    etherType: "ARP",
    payload: {
      operation: "request",
      senderMac: srcMac,
      senderIp: "192.168.1.10",
      targetMac: null,
      targetIp: "192.168.1.11",
    },
  };
}

describe("apprendimento", () => {
  test("lo switch registra il MAC sorgente sulla porta di arrivo", () => {
    const sw = fourPortSwitch();

    const reaction = receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_A, MAC_B));

    expect(macTableOf(sw).get(MAC_A)).toBe("Fa0/1");
    expect(reaction.tableChanged).toBe(true);
  });

  test("un MAC già noto sulla stessa porta non cambia la tabella", () => {
    const sw = fourPortSwitch();
    receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_A, MAC_B));

    const reaction = receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_A, MAC_B));

    expect(reaction.tableChanged).toBe(false);
    expect(macTableOf(sw).size).toBe(1);
  });

  test("un MAC che ricompare su un'altra porta viene aggiornato", () => {
    const sw = fourPortSwitch();
    receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_A, MAC_B));

    const reaction = receiveFrameOnSwitch(sw, "Fa0/3", frame(MAC_A, MAC_B));

    expect(macTableOf(sw).get(MAC_A)).toBe("Fa0/3");
    expect(reaction.tableChanged).toBe(true);
  });

  test("lo switch non impara nulla dal MAC di destinazione", () => {
    const sw = fourPortSwitch();

    receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_A, MAC_B));

    expect(macTableOf(sw).has(MAC_B)).toBe(false);
  });
});

describe("inoltro", () => {
  test("destinazione sconosciuta: flooding su tutte le porte tranne quella di arrivo", () => {
    const sw = fourPortSwitch();

    const reaction = receiveFrameOnSwitch(sw, "Fa0/2", frame(MAC_A, MAC_B));

    expect(reaction.forwardTo).toEqual(["Fa0/1", "Fa0/3", "Fa0/4"]);
    expect(reaction.dropped).toBeNull();
  });

  test("destinazione broadcast: flooding su tutte le porte tranne quella di arrivo", () => {
    const sw = fourPortSwitch();

    const reaction = receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_A, BROADCAST_MAC));

    expect(reaction.forwardTo).toEqual(["Fa0/2", "Fa0/3", "Fa0/4"]);
  });

  test("destinazione nota: inoltro sulla sola porta giusta", () => {
    const sw = fourPortSwitch();
    receiveFrameOnSwitch(sw, "Fa0/3", frame(MAC_B, MAC_A)); // lo switch impara dov'è B

    const reaction = receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_A, MAC_B));

    expect(reaction.forwardTo).toEqual(["Fa0/3"]);
    expect(reaction.dropped).toBeNull();
  });

  test("destinazione nota sulla porta di arrivo: il frame viene scartato", () => {
    const sw = fourPortSwitch();
    receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_B, MAC_A)); // B sta dietro Fa0/1

    const reaction = receiveFrameOnSwitch(sw, "Fa0/1", frame(MAC_A, MAC_B));

    expect(reaction.forwardTo).toEqual([]);
    expect(reaction.dropped).toBe("destination-on-incoming-port");
  });

  test("scegliere le porte di uscita non modifica la tabella MAC", () => {
    const sw = fourPortSwitch();

    chooseOutputPorts(sw, 1, "Fa0/1", MAC_B); // nella VLAN 1, come tutte le porte

    expect(macTableOf(sw).size).toBe(0);
  });
});
