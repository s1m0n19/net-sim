import { beforeEach, describe, expect, test } from "vitest";
import { disableInterface, disconnectLink, ping, resolveAddress } from "../../src/engine/actions";
import type { Simulator } from "../../src/engine/simulator";
import { serializeNetwork } from "../../src/storage/save";
import { describeTrace } from "../../src/ui/event-text";
import { session } from "../../src/ui/session.svelte";
import { buildView } from "../../src/ui/view";
import { PC1_MAC, PC3_IP, PC3_MAC, PC4_IP, buildTrunkSwitches, buildVlanLan } from "../engine/builders";

// La rete di builders.ts con due switch uniti tra le Fa0/24 (trunk): SW1
// con PC1 (VLAN 10) su Fa0/1 e PC2 (VLAN 20) su Fa0/2, SW2 con PC3 (VLAN
// 10) e PC4 (VLAN 20); Fa0/3 libera, access nella VLAN 1.
function trunkFile(sw1 = {}, sw2 = {}): string {
  const { sim } = buildTrunkSwitches(sw1, sw2);
  const positions = new Map(sim.network.devices.map((device, index) => [device.id, { x: index * 100, y: 0 }]));
  return serializeNetwork(sim.network, positions);
}

const switchView = (id = "s1") => session.view.devices.find((device) => device.id === id)!;
const portView = (id = "s1", index = 3) => switchView(id).switchPorts[index];

function cli(switchId: string, lines: string[]): string[] {
  for (const line of lines) session.execute(switchId, line);
  const terminal = session.terminals.find((t) => t.deviceId === switchId)!;
  return session.outputOf(switchId, terminal.entries.at(-1)!);
}

function pingOutcome(fromId: string, ip: string): string | undefined {
  const before = session.view.pingResults.length;
  session.ping(fromId, ip, 1);
  while (session.view.nextEvent !== null) session.step();
  return session.view.pingResults.slice(before).at(-1)?.outcome;
}

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

beforeEach(() => {
  session.open("trunk.netsim.json", trunkFile());
});

describe("ciò che il pannello mostra delle porte", () => {
  test("una porta access e una porta trunk, con nativa, consentite, VLAN che passano e segnale", () => {
    expect(portView("s1", 0)).toMatchObject({ name: "Fa0/1", mode: "access", vlan: 10, trunkConfigKept: false, signal: true });
    expect(portView()).toEqual({
      name: "Fa0/24",
      vlan: 1,
      vlanName: "default",
      enabled: true,
      linkedTo: "SW2",
      signal: true,
      mode: "trunk",
      nativeVlan: 1,
      nativeName: "default",
      allowedVlans: "all",
      carriedVlans: [1, 10, 20],
      trunkConfigKept: false,
    });
  });

  test("nativa e consentite che lo switch non ha si vedono, con il loro numero", () => {
    session.open("trunk.netsim.json", trunkFile({ nativeVlan: 99, allowedVlans: [10, 300] }));

    expect(portView()).toMatchObject({ nativeVlan: 99, nativeName: null, allowedVlans: [10, 300], carriedVlans: [10], trunkConfigKept: true });
  });

  test("nessuna VLAN consentita, e una porta trunk senza cavo o spenta", () => {
    session.open("trunk.netsim.json", trunkFile({ allowedVlans: [] }));
    expect(portView()).toMatchObject({ allowedVlans: [], carriedVlans: [] });

    session.open("trunk.netsim.json", trunkFile());
    (session as any).simulator.dispatch(disconnectLink("l5"));
    (session as any).refresh();
    expect(portView()).toMatchObject({ mode: "trunk", signal: false, linkedTo: "SW2" });
    (session as any).simulator.dispatch(disableInterface("s2", "Fa0/24"));
    (session as any).refresh();
    expect(portView("s2")).toMatchObject({ enabled: false, signal: false });
  });

  test("la sezione VLAN elenca le sole porte access, e a parte i trunk che consentono la VLAN", () => {
    session.open("trunk.netsim.json", trunkFile({ vlan: 10, allowedVlans: [20] }));

    expect(switchView().vlans.map(({ id, ports, trunks }) => ({ id, ports, trunks }))).toEqual([
      { id: 1, ports: ["Fa0/3"], trunks: [] },
      { id: 10, ports: ["Fa0/1"], trunks: [] }, // Fa0/24 ha la VLAN access 10, ma è trunk
      { id: 20, ports: ["Fa0/2"], trunks: ["Fa0/24"] },
    ]);
  });

  test("uno switch da 24 porte ha 24 righe, tutte access nella VLAN 1, senza nulla di trunk", () => {
    session.addDevice({ kind: "switch", portCount: 24 }, { x: 0, y: 300 });
    const added = session.view.devices.at(-1)!;

    expect(added.switchPorts).toHaveLength(24);
    expect(added.switchPorts.every((port) => port.mode === "access" && !port.trunkConfigKept)).toBe(true);
  });
});

describe("modo, nativa e consentite dal pannello", () => {
  test("da access a trunk e ritorno: VLAN access, nativa e consentite restano", () => {
    session.setNativeVlan("s1", "Fa0/3", "99");
    session.setAllowedVlans("s1", "Fa0/3", [10, 20]);
    session.makeAccess("s1", "Fa0/3", 20);

    session.makeTrunk("s1", "Fa0/3");
    expect(portView("s1", 2)).toMatchObject({ mode: "trunk", vlan: 20, nativeVlan: 99, allowedVlans: [10, 20] });
    session.makeAccess("s1", "Fa0/3", 10);
    expect(portView("s1", 2)).toMatchObject({ mode: "access", vlan: 10, nativeVlan: 99, allowedVlans: [10, 20], trunkConfigKept: true });
  });

  test("da trunk ad access in una VLAN nuova è un passo solo della cronologia", () => {
    session.makeAccess("s1", "Fa0/24", 20);
    expect(portView()).toMatchObject({ mode: "access", vlan: 20 });

    session.undo();
    expect(portView()).toMatchObject({ mode: "trunk", vlan: 1 });
    session.redo();
    expect(portView()).toMatchObject({ mode: "access", vlan: 20 });
  });

  test("la nativa si scrive come numero, anche di una VLAN che non c'è; vuoto torna alla 1; un testo si rifiuta", () => {
    expect(session.setNativeVlan("s1", "Fa0/24", "99")).toBeNull();
    expect(portView()).toMatchObject({ nativeVlan: 99, nativeName: null });
    expect(switchView().vlans.map((vlan) => vlan.id)).toEqual([1, 10, 20]);
    expect(session.setNativeVlan("s1", "Fa0/24", "")).toBeNull();
    expect(portView().nativeVlan).toBe(1);
    expect(session.setNativeVlan("s1", "Fa0/24", "dieci")).toBe("Scrivi il numero della VLAN, da 1 a 1001.");
    expect(session.setNativeVlan("s1", "Fa0/24", "1002")).toContain("Numero di VLAN non valido: 1002");
    expect(portView().nativeVlan).toBe(1);
  });

  test("le consentite: tutte, nessuna, un elenco; i numeri non configurati restano; tutte non diventa un elenco", () => {
    expect(session.setAllowedVlans("s1", "Fa0/24", [])).toBeNull();
    expect(portView().allowedVlans).toEqual([]);
    expect(session.addAllowedVlans("s1", "Fa0/24", "10,300-301")).toBeNull();
    expect(portView().allowedVlans).toEqual([10, 300, 301]);
    // Una casella tolta: si toglie solo quella, le altre restano.
    session.setAllowedVlans("s1", "Fa0/24", [300, 301]);
    expect(portView().allowedVlans).toEqual([300, 301]);
    expect(session.setAllowedVlans("s1", "Fa0/24", "all")).toBeNull();
    expect(portView().allowedVlans).toBe("all");
    expect(session.addAllowedVlans("s1", "Fa0/24", "30")).toBeNull();
    expect(portView().allowedVlans).toBe("all");
  });

  test("valori sbagliati si rifiutano con il motivo, e una scelta uguale non aggiunge passi", () => {
    session.setAllowedVlans("s1", "Fa0/24", [10]);
    expect(session.addAllowedVlans("s1", "Fa0/24", "10,,20")).toBe("Elenco di VLAN non valido: 10,,20.");
    expect(session.addAllowedVlans("s1", "Fa0/24", "2000")).toContain("Numero di VLAN non valido: 2000");
    expect(session.setAllowedVlans("s1", "Fa0/24", [10, 5000])).toContain("Numero di VLAN non valido: 5000");
    session.setAllowedVlans("s1", "Fa0/24", [10, 10]);
    session.setNativeVlan("s1", "Fa0/24", "1");
    session.makeTrunk("s1", "Fa0/24");

    session.undo();
    expect(portView().allowedVlans).toBe("all");
    expect(session.canUndo).toBe(false);
  });

  test("ogni gesto è un passo, e Annulla e Ripristina li percorrono in ordine", () => {
    const steps = [
      () => session.setNativeVlan("s1", "Fa0/24", "99"),
      () => session.setAllowedVlans("s1", "Fa0/24", [1, 10, 20]),
      () => session.setAllowedVlans("s1", "Fa0/24", [1, 10]),
      () => session.makeAccess("s1", "Fa0/24", 10),
      () => session.makeTrunk("s1", "Fa0/24"),
    ];
    const states = [JSON.stringify(portView())];
    for (const step of steps) {
      step();
      states.push(JSON.stringify(portView()));
    }
    for (let i = states.length - 2; i >= 0; i--) {
      session.undo();
      expect(JSON.stringify(portView())).toBe(states[i]);
    }
    for (let i = 1; i < states.length; i++) {
      session.redo();
      expect(JSON.stringify(portView())).toBe(states[i]);
    }
  });
});

describe("pannello e CLI: lo stesso switch", () => {
  beforeEach(() => {
    session.openTerminal("s1");
    cli("s1", ["enable", "configure terminal", "interface fa0/24"]);
  });

  test("ciò che fa la CLI compare nel pannello", () => {
    cli("s1", ["switchport trunk native vlan 30", "switchport trunk allowed vlan 10,30", "switchport mode access"]);

    expect(portView()).toMatchObject({ mode: "access", nativeVlan: 30, allowedVlans: [10, 30], trunkConfigKept: true });
  });

  test("ciò che fa il pannello compare nella CLI, e Annulla torna indietro in tutti e due", () => {
    session.setAllowedVlans("s1", "Fa0/24", [10, 20]);
    expect(cli("s1", ["do show interfaces trunk"])[4]).toBe("Fa0/24      10,20");

    session.undo();
    expect(portView().allowedVlans).toBe("all");
    expect(cli("s1", ["do show interfaces trunk"])[4]).toBe("Fa0/24      1-1001");

    session.makeAccess("s1", "Fa0/24", 20);
    expect(cli("s1", ["do show running-config"])).toContain(" switchport access vlan 20");
    expect(cli("s1", ["do show interfaces trunk"])).toEqual([]);
  });

  test("una configurazione conservata su una porta access passa dal pannello alla CLI e torna", () => {
    session.makeAccess("s1", "Fa0/24", 10);
    session.setNativeVlan("s1", "Fa0/24", "99");

    expect(cli("s1", ["do show interfaces fa0/24 switchport"]).slice(2, 7)).toEqual([
      "Administrative Mode: static access",
      "Operational Mode: static access",
      "Administrative Trunking Encapsulation: dot1q",
      "Access Mode VLAN: 10 (STUDENTI)",
      "Trunking Native Mode VLAN: 99 (Inactive)",
    ]);
    cli("s1", ["switchport mode trunk"]);
    expect(portView()).toMatchObject({ mode: "trunk", nativeVlan: 99, vlan: 10 });
  });
});

describe("salvare e riaprire una configurazione fatta dal pannello", () => {
  test("il file è di versione 4, si riapre uguale, e la rete funziona", () => {
    session.setNativeVlan("s1", "Fa0/24", "99");
    session.setNativeVlan("s2", "Fa0/24", "99");
    session.setAllowedVlans("s1", "Fa0/24", [10, 20]);
    const before = JSON.stringify(switchView().switchPorts);
    const text = session.serialize();

    session.open("trunk.netsim.json", text);

    expect(JSON.parse(text).version).toBe(4);
    expect(JSON.stringify(switchView().switchPorts)).toBe(before);
    expect(pingOutcome("d1", PC3_IP)).toBe("reply");
    expect(pingOutcome("d1", PC4_IP)).toBe("unreachable");
    expect(switchView().macRows).toContainEqual(["10", PC3_MAC, "Fa0/24"]);
  });
});

describe("i frame e gli eventi: il tag di ciò che viaggia davvero", () => {
  // Le righe degli eventi di una rete appena fatta lavorare.
  function eventsOf(sim: Simulator): string[] {
    return sim.traces.map((trace, index) => {
      const row = describeTrace(sim.network, trace, index);
      return `${row.deviceName}: ${row.text}`;
    });
  }

  test("PC1 senza tag, SW1 sul trunk con il tag della VLAN 10, SW2 verso PC3 senza tag", () => {
    const { sim } = buildTrunkSwitches();
    sim.dispatch(resolveAddress("d1", PC3_IP));
    run(sim);
    const sent = eventsOf(sim).filter((line) => line.includes("invia ARP request"));

    expect(sent).toEqual([
      "PC1: invia ARP request dalla porta Fa0, destinazione ff:ff:ff:ff:ff:ff",
      "SW1: invia ARP request dalla porta Fa0/24 con tag VLAN 10, destinazione ff:ff:ff:ff:ff:ff",
      "SW2: invia ARP request dalla porta Fa0/1, destinazione ff:ff:ff:ff:ff:ff",
    ]);
    expect(eventsOf(sim)).toContain("SW2: riceve ARP request sulla porta Fa0/24 con tag VLAN 10");
  });

  test("i dettagli del pacchetto sono il frame di quel tratto: con il tag sul trunk, senza verso il PC", () => {
    const { sim } = buildTrunkSwitches();
    sim.dispatch(resolveAddress("d1", PC3_IP));
    sim.step();
    const onTrunk = buildView(sim, new Map()).packets.find((packet) => packet.fromName === "SW1")!;
    expect(onTrunk.frame.vlanTag).toBe(10);
    sim.step();
    const toPc = buildView(sim, new Map()).packets.find((packet) => packet.fromName === "SW2")!;
    expect("vlanTag" in toPc.frame).toBe(false);
  });

  test("la VLAN nativa passa sul trunk senza tag, e la 20 con il suo", () => {
    const { sim } = buildTrunkSwitches({ nativeVlan: 10 }, { nativeVlan: 10 });
    sim.dispatch(ping("d1", PC3_IP, 1));
    run(sim);
    sim.dispatch(resolveAddress("d2", PC4_IP));
    run(sim);
    const trunkLines = eventsOf(sim).filter((line) => line.startsWith("SW1: invia") && line.includes("Fa0/24"));

    expect(trunkLines.some((line) => line.includes("con tag VLAN 10"))).toBe(false);
    expect(trunkLines.some((line) => line.includes("con tag VLAN 20"))).toBe(true);
  });

  test("un frame con il tag che arriva a una porta access è scartato, e l'evento non dice perché", () => {
    const { sim } = buildTrunkSwitches({}, { mode: "access", vlan: 10 });
    sim.dispatch(resolveAddress("d1", PC3_IP));
    run(sim);
    const drops = eventsOf(sim).filter((line) => line.startsWith("SW2: scarta"));

    expect(drops).toEqual(["SW2: scarta ARP request"]);
  });

  test("in una rete senza trunk nessun evento parla di tag", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(ping("d1", "192.168.1.11", 1));
    run(sim);

    expect(eventsOf(sim).some((line) => line.includes("tag"))).toBe(false);
    expect(PC1_MAC).toBeDefined();
  });
});
