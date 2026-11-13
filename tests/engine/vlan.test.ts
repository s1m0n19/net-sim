import { describe, expect, test } from "vitest";
import {
  addVlan,
  disconnectLink,
  disableInterface,
  duplicateDevice,
  enableInterface,
  ping,
  powerOff,
  powerOn,
  removeVlan,
  renameVlan,
  resolveAddress,
  restoreConfiguration,
  setPortVlan,
} from "../../src/engine/actions";
import type { Network, Switch } from "../../src/engine/model/network";
import { copyTables } from "../../src/engine/model/tables";
import { checkVlanId, macEntries, macTableOf, vlanExists } from "../../src/engine/model/vlans";
import type { Simulator, Trace } from "../../src/engine/simulator";
import { takeSnapshot } from "../../src/engine/snapshot";
import {
  PC1_IP,
  PC1_MAC,
  PC2_IP,
  PC2_MAC,
  PC3_IP,
  PC3_MAC,
  PC4_IP,
  PC4_MAC,
  PC5_IP,
  PC5_MAC,
  buildLan,
  buildTwoVlanSwitches,
  buildVlanLan,
} from "./builders";

// Fa avanzare la rete finché c'è qualcosa da fare; `limit` protegge il
// test da un ciclo senza fine.
function run(sim: Simulator, limit = 2000): void {
  let steps = 0;
  while (sim.canStep()) {
    sim.step();
    steps += 1;
    if (steps > limit) throw new Error("La simulazione non si ferma.");
  }
}

// Lancia un ping, lo porta in fondo e restituisce gli esiti degli echo.
function pingOutcomes(sim: Simulator, fromId: string, targetIp: string, count = 1): string[] {
  const start = sim.traces.length;
  sim.dispatch(ping(fromId, targetIp, count));
  run(sim);
  return sim.traces
    .slice(start)
    .filter((t) => t.kind === "ping-result" && t.deviceId === fromId)
    .map((t) => (t.kind === "ping-result" ? t.outcome : ""));
}

// I dispositivi a cui è arrivato almeno un frame, in queste tracce, che
// lo abbiano tenuto o scartato perché non era per loro.
function reached(traces: Trace[]): Set<string> {
  return new Set(
    traces.flatMap((t) => (t.kind === "frame-received" || t.kind === "frame-dropped" ? [t.at.deviceId] : [])),
  );
}

// I dispositivi verso cui lo switch s1 ha spedito un frame, in queste tracce.
function sentBySwitchTo(traces: Trace[], switchId = "s1"): string[] {
  return traces.flatMap((t) => (t.kind === "frame-sent" && t.from.deviceId === switchId ? [t.to.deviceId] : []));
}

function switchOf(network: Network, id = "s1"): Switch {
  return network.devices.find((d) => d.id === id) as Switch;
}

// Gli invarianti delle VLAN, controllati su tutti gli switch della rete.
function expectVlanInvariants(network: Network): void {
  for (const sw of network.devices) {
    if (sw.kind !== "switch") continue;
    // La VLAN 1 c'è sempre, e il registro è in ordine senza doppioni.
    expect(vlanExists(sw, 1)).toBe(true);
    const ids = sw.vlans.map((vlan) => vlan.id);
    expect(ids).toEqual([...new Set(ids)].sort((a, b) => a - b));
    for (const port of sw.ports) expect(checkVlanId(port.vlan)).toBeNull();
    // Ogni riga sta in una VLAN che esiste e indica una porta di quella VLAN.
    for (const { vlan, port } of macEntries(sw)) {
      expect(vlanExists(sw, vlan)).toBe(true);
      expect(sw.ports.find((p) => p.name === port)?.vlan).toBe(vlan);
    }
  }
}

describe("il modello: uno switch appena creato", () => {
  test("ha la sola VLAN 1, che si chiama default", () => {
    const { sw } = buildLan();

    expect(sw.vlans).toEqual([{ id: 1, name: "default" }]);
  });

  test("ha tutte le porte nella VLAN 1, anche quelle aggiunte dall'editor", () => {
    const { sim, sw } = buildLan();
    sim.dispatch({ kind: "add-device", template: { kind: "switch", portCount: 3 } });
    const added = sim.network.devices.at(-1) as Switch;

    expect(sw.ports.map((port) => port.vlan)).toEqual([1, 1, 1, 1]);
    expect(added.ports.map((port) => port.vlan)).toEqual([1, 1, 1]);
    expect(added.vlans).toEqual([{ id: 1, name: "default" }]);
  });
});

describe("nella sola VLAN 1 lo switch è quello di sempre", () => {
  test("il ping riesce e la tabella sta tutta nella VLAN 1", () => {
    const { sim, sw } = buildLan();

    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
    expect(macEntries(sw).map(({ vlan, mac }) => [vlan, mac])).toEqual([
      [1, PC1_MAC],
      [1, PC2_MAC],
    ]);
  });

  test("una VLAN creata ma senza porte non cambia nemmeno una traccia", () => {
    const plain = buildLan();
    const withVlan = buildLan();
    withVlan.sim.dispatch(addVlan("s1", 10));
    const start = withVlan.sim.traces.length;

    plain.sim.dispatch(ping("d1", PC2_IP));
    run(plain.sim);
    withVlan.sim.dispatch(ping("d1", PC2_IP));
    run(withVlan.sim);

    const sinceStart = withVlan.sim.traces.slice(start).map((t) => ({ ...t, time: t.time - withVlan.sim.traces[start].time }));
    const plainTraces = plain.sim.traces.map((t) => ({ ...t, time: t.time - plain.sim.traces[0].time }));
    expect(sinceStart).toEqual(plainTraces);
  });
});

describe("due VLAN sullo stesso switch, nella stessa sottorete", () => {
  test("due PC della stessa VLAN si rispondono", () => {
    const { sim } = buildVlanLan();

    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["reply"]);
  });

  test("due PC di VLAN diverse non si raggiungono: l'ARP resta senza risposta", () => {
    const { sim, pc1 } = buildVlanLan();

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
    expect(pc1.arpTable.has(PC3_IP)).toBe(false);
  });

  test("la richiesta ARP, che è un broadcast, arriva solo alle porte della stessa VLAN", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(resolveAddress("d1", PC3_IP));

    const traces = sim.step(); // la richiesta arriva allo switch

    expect(sentBySwitchTo(traces)).toEqual(["d2", "d5"]); // non a PC3 e PC4, non indietro a PC1
  });

  test("nessun broadcast passa da una VLAN all'altra, per tutta la conversazione", () => {
    const { sim } = buildVlanLan();
    const start = sim.traces.length;

    sim.dispatch(ping("d3", "192.168.1.99", 1)); // nessuno ha quell'indirizzo
    run(sim);

    const got = reached(sim.traces.slice(start));
    expect(got.has("d4")).toBe(true);
    expect(["d1", "d2", "d5"].some((id) => got.has(id))).toBe(false);
  });

  test("un unicast verso un MAC sconosciuto va in flooding solo nella sua VLAN", () => {
    const { sim, pc1, pc2 } = buildVlanLan();
    // PC1 conosce già il MAC di PC2; lo switch invece non sa nulla.
    pc1.arpTable.set(PC2_IP, PC2_MAC);
    pc2.arpTable.set(PC1_IP, PC1_MAC);
    sim.dispatch(ping("d1", PC2_IP, 1));

    const traces = sim.step(); // l'echo request arriva allo switch

    expect(traces.some((t) => t.kind === "frame-received" && t.frame.etherType === "IPv4")).toBe(true);
    expect(sentBySwitchTo(traces)).toEqual(["d2", "d5"]);
  });

  test("ogni VLAN impara nella sua tabella", () => {
    const { sim, sw } = buildVlanLan();

    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);

    expect([...macTableOf(sw, 10)]).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC2_MAC, "Fa0/2"],
    ]);
    expect([...macTableOf(sw, 20)]).toEqual([
      [PC3_MAC, "Fa0/3"],
      [PC4_MAC, "Fa0/4"],
    ]);
    expect(macTableOf(sw, 1).size).toBe(0);
  });

  test("lo stesso MAC può stare in due VLAN, su porte diverse, senza conflitti", () => {
    const { sim, sw, pc4 } = buildVlanLan();
    // PC4, nella VLAN 20, ha per errore lo stesso MAC di PC1, nella VLAN 10.
    pc4.ports[0].mac = PC1_MAC;

    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d4", PC3_IP)).toEqual(["reply"]);

    expect(macTableOf(sw, 10).get(PC1_MAC)).toBe("Fa0/1");
    expect(macTableOf(sw, 20).get(PC1_MAC)).toBe("Fa0/4");
  });

  test("l'inoltro verso un MAC noto usa la tabella della VLAN del frame", () => {
    const { sim, pc4 } = buildVlanLan();
    pc4.ports[0].mac = PC1_MAC;
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d4", PC3_IP);

    // PC3 risponde di nuovo a quel MAC: il frame va a PC4, non a PC1.
    const start = sim.traces.length;
    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["reply"]);
    const switchSent = sentBySwitchTo(sim.traces.slice(start));
    expect(switchSent).not.toContain("d1");
    expect(switchSent).toContain("d4");
  });

  test("i frame escono dallo switch identici a come sono entrati: nessun tag VLAN", () => {
    const { sim } = buildVlanLan();
    const start = sim.traces.length;

    pingOutcomes(sim, "d1", PC2_IP);

    const frames = sim.traces.slice(start).flatMap((t) => (t.kind === "frame-sent" ? [t.frame] : []));
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(Object.keys(frame).sort()).toEqual(["dstMac", "etherType", "payload", "srcMac"]);
    }
  });
});

describe("cambiare la VLAN di una porta", () => {
  test("la porta passa all'altra VLAN e i PC ci comunicano", () => {
    const { sim } = buildVlanLan();
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);

    sim.dispatch(setPortVlan("s1", "Fa0/3", 10));

    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d4", PC3_IP)).toEqual(["unreachable"]);
  });

  test("lo switch dimentica le righe della porta nella VLAN di prima, e solo quelle", () => {
    const { sim, sw } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);

    const traces = sim.dispatch(setPortVlan("s1", "Fa0/3", 10));

    expect([...macTableOf(sw, 20)]).toEqual([[PC4_MAC, "Fa0/4"]]);
    expect([...macTableOf(sw, 10)]).toEqual([
      [PC1_MAC, "Fa0/1"],
      [PC2_MAC, "Fa0/2"],
    ]);
    expect(traces.map((t) => t.kind)).toEqual(["port-vlan-changed", "table-changed"]);
    expect(traces[0]).toMatchObject({ portName: "Fa0/3", vlan: 10, from: 20 });
  });

  test("mettere una porta nella VLAN in cui sta già non cambia nulla", () => {
    const { sim } = buildVlanLan();

    expect(sim.dispatch(setPortVlan("s1", "Fa0/3", 20))).toEqual([]);
  });

  test("un frame già sul cavo verso la porta, arrivando, appartiene alla VLAN nuova", () => {
    const { sim, sw } = buildVlanLan();
    sim.dispatch(resolveAddress("d3", PC1_IP)); // la richiesta di PC3 è sul cavo

    sim.dispatch(setPortVlan("s1", "Fa0/3", 10));
    const traces = sim.step(); // la richiesta arriva allo switch

    expect(sentBySwitchTo(traces)).toEqual(["d1", "d2", "d5"]);
    expect(macTableOf(sw, 10).get(PC3_MAC)).toBe("Fa0/3");
    expect(macTableOf(sw, 20).has(PC3_MAC)).toBe(false);
  });

  test("numeri di VLAN non validi, porte e dispositivi sbagliati vengono rifiutati", () => {
    const { sim, sw } = buildVlanLan();

    expect(() => sim.dispatch(setPortVlan("s1", "Fa0/1", 0))).toThrow("Numero di VLAN non valido");
    expect(() => sim.dispatch(setPortVlan("s1", "Fa0/1", 1002))).toThrow("Numero di VLAN non valido");
    expect(() => sim.dispatch(setPortVlan("s1", "Fa0/1", 10.5))).toThrow("Numero di VLAN non valido");
    expect(() => sim.dispatch(setPortVlan("s1", "Fa0/9", 10))).toThrow("SW1 non ha una porta Fa0/9.");
    expect(() => sim.dispatch(setPortVlan("d1", "Fa0", 10))).toThrow("PC1 non è uno switch");
    expect(sw.ports[0].vlan).toBe(10);
  });
});

describe("creare, rinominare ed eliminare le VLAN", () => {
  test("una VLAN nuova prende il nome VLAN e il numero su quattro cifre, e si mette in ordine", () => {
    const { sim, sw } = buildVlanLan();

    const traces = sim.dispatch(addVlan("s1", 5));

    expect(sw.vlans.map((vlan) => [vlan.id, vlan.name])).toEqual([
      [1, "default"],
      [5, "VLAN0005"],
      [10, "STUDENTI"],
      [20, "DOCENTI"],
    ]);
    expect(traces).toMatchObject([{ kind: "vlan-changed", vlan: 5, change: "added" }]);
  });

  test("una VLAN può esistere senza porte, e crearla di nuovo non cambia nulla", () => {
    const { sim, sw } = buildVlanLan();
    sim.dispatch(addVlan("s1", 30, "LAB"));

    expect(sim.dispatch(addVlan("s1", 30, "ALTRO"))).toEqual([]);
    expect(sw.vlans.find((vlan) => vlan.id === 30)?.name).toBe("LAB");
    expect(sw.ports.some((port) => port.vlan === 30)).toBe(false);
  });

  test("rinominare cambia solo il nome", () => {
    const { sim, sw } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);

    sim.dispatch(renameVlan("s1", 10, "CLASSE3A"));

    expect(sw.vlans.find((vlan) => vlan.id === 10)?.name).toBe("CLASSE3A");
    expect(macTableOf(sw, 10).size).toBe(2);
  });

  test("la VLAN 1 non si rinomina e non si elimina; numeri e nomi sbagliati vengono rifiutati", () => {
    const { sim, sw } = buildVlanLan();

    expect(() => sim.dispatch(renameVlan("s1", 1, "ALTRO"))).toThrow("Il nome della VLAN 1 non si può cambiare.");
    expect(() => sim.dispatch(removeVlan("s1", 1))).toThrow("La VLAN 1 non si può eliminare.");
    expect(() => sim.dispatch(removeVlan("s1", 30))).toThrow("SW1 non ha la VLAN 30.");
    expect(() => sim.dispatch(renameVlan("s1", 30, "X"))).toThrow("SW1 non ha la VLAN 30.");
    expect(() => sim.dispatch(addVlan("s1", 1005))).toThrow("Numero di VLAN non valido");
    expect(() => sim.dispatch(addVlan("s1", 30, ""))).toThrow("non può essere vuoto");
    expect(() => sim.dispatch(addVlan("s1", 30, "DUE PAROLE"))).toThrow("spazi");
    expect(() => sim.dispatch(addVlan("s1", 30, "X".repeat(33)))).toThrow("32 caratteri");
    expect(sw.vlans.map((vlan) => vlan.id)).toEqual([1, 10, 20]);
  });
});

describe("una VLAN eliminata", () => {
  test("lo switch dimentica le sue righe; le porte restano assegnate al suo numero", () => {
    const { sim, sw } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);

    const traces = sim.dispatch(removeVlan("s1", 20));

    expect(vlanExists(sw, 20)).toBe(false);
    expect(macTableOf(sw, 20).size).toBe(0);
    expect(macTableOf(sw, 10).size).toBe(2);
    expect(sw.ports.map((port) => port.vlan)).toEqual([10, 10, 20, 20, 10, 1]);
    expect(traces.map((t) => t.kind)).toEqual(["vlan-changed", "table-changed"]);
  });

  test("le sue porte, accese, sono inattive: scartano tutto e non imparano", () => {
    const { sim, sw } = buildVlanLan();
    sim.dispatch(removeVlan("s1", 20));
    const start = sim.traces.length;

    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["unreachable"]);

    const traces = sim.traces.slice(start);
    expect(traces.some((t) => t.kind === "frame-dropped" && t.reason === "inactive-vlan")).toBe(true);
    expect(sentBySwitchTo(traces)).toEqual([]);
    expect(macEntries(sw)).toEqual([]);
    // Spenta la porta non è: è accesa, e il PC sente il segnale.
    expect(sw.ports[2].enabled).toBe(true);
    expect(sim.network.devices.find((d) => d.id === "d3")).toMatchObject({ linkUp: true });
  });

  test("dalle altre VLAN non arriva nulla alle porte inattive", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(removeVlan("s1", 20));
    const start = sim.traces.length;

    pingOutcomes(sim, "d1", "192.168.1.99");

    expect(sentBySwitchTo(sim.traces.slice(start))).not.toContain("d3");
  });

  test("ricreata la VLAN, le porte tornano attive", () => {
    const { sim } = buildVlanLan();
    sim.dispatch(removeVlan("s1", 20));
    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["unreachable"]);

    sim.dispatch(addVlan("s1", 20));

    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["reply"]);
  });

  test("le tabelle di partenza non mettono righe su una porta inattiva", () => {
    const { sim, sw } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);
    sim.setStartingTables(copyTables(sim.network));
    sim.dispatch(removeVlan("s1", 20));

    sim.reset();

    expect(macEntries(sw).map(({ vlan }) => vlan)).toEqual([10, 10]);
  });
});

describe("porte spente, cavi staccati, switch spento", () => {
  test("una porta spenta resta nella sua VLAN e lo switch dimentica le sue righe solo lì", () => {
    const { sim, sw } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);

    sim.dispatch(disableInterface("s1", "Fa0/2"));

    expect(sw.ports[1]).toMatchObject({ enabled: false, vlan: 10 });
    expect([...macTableOf(sw, 10).keys()]).toEqual([PC1_MAC]);
    expect(macTableOf(sw, 20).size).toBe(2);
    // PC1 conosce già il MAC di PC2: l'echo parte, ma non arriva.
    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["timeout"]);

    sim.dispatch(enableInterface("s1", "Fa0/2"));
    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
  });

  test("con un cavo staccato lo switch dimentica le righe di quella porta, nella sua VLAN", () => {
    const { sim, sw } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);

    sim.dispatch(disconnectLink("l4"));

    expect([...macTableOf(sw, 20).keys()]).toEqual([PC3_MAC]);
    expect(macTableOf(sw, 10).size).toBe(2);
  });

  test("uno switch spento dimentica tutte le tabelle ma non le VLAN, e si riaccende isolato", () => {
    const { sim, sw } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    pingOutcomes(sim, "d3", PC4_IP);

    sim.dispatch(powerOff("s1"));
    expect(sw.macTable.size).toBe(0);
    expect(sw.vlans.map((vlan) => vlan.id)).toEqual([1, 10, 20]);
    expect(sw.ports.map((port) => port.vlan)).toEqual([10, 10, 20, 20, 10, 1]);

    sim.dispatch(powerOn("s1"));
    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
  });
});

describe("due switch uniti da porte access", () => {
  test("con la stessa VLAN ai due capi, la VLAN si estende ai due switch", () => {
    const { sim, sw1, sw2 } = buildTwoVlanSwitches(10);

    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d3", PC2_IP)).toEqual(["unreachable"]);

    expect(macTableOf(sw1, 10).get(PC2_MAC)).toBe("Fa0/3");
    expect(macTableOf(sw2, 10).get(PC1_MAC)).toBe("Fa0/3");
  });

  test("con VLAN diverse ai due capi il traffico passa lo stesso: il cavo non porta la VLAN", () => {
    // SW1 manda sul cavo frame della sua VLAN 10, SW2 li riceve nella sua
    // VLAN 20: le due VLAN diventano un'unica rete, come su switch veri.
    const { sim, sw1, sw2 } = buildTwoVlanSwitches(20);

    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);

    expect(macTableOf(sw1, 10).get(PC2_MAC)).toBe("Fa0/3");
    expect(macTableOf(sw2, 20).get(PC1_MAC)).toBe("Fa0/3");
    // PC3, nella VLAN 20 di SW1, resta fuori: la VLAN 20 di SW1 non è quella di SW2.
    expect(pingOutcomes(sim, "d3", PC2_IP)).toEqual(["unreachable"]);
  });
});

describe("un ciclo tra switch in una VLAN", () => {
  test("la tempesta resta nella VLAN del ciclo, e la VLAN accanto continua a funzionare", () => {
    const { sim } = buildVlanLan();
    // Un secondo switch, unito a SW1 da due cavi su porte della VLAN 10:
    // per la VLAN 10 è un ciclo, per la VLAN 20 no.
    sim.dispatch({ kind: "add-device", template: { kind: "switch", portCount: 2 } });
    const sw2 = sim.network.devices.at(-1) as Switch;
    sim.dispatch(addVlan(sw2.id, 10));
    sim.dispatch(setPortVlan(sw2.id, "Fa0/1", 10));
    sim.dispatch(setPortVlan(sw2.id, "Fa0/2", 10));
    sim.dispatch(setPortVlan("s1", "Fa0/6", 10));
    sim.dispatch({ kind: "remove-link", linkId: "l5" }); // PC5 lascia libera Fa0/5
    sim.dispatch({ kind: "add-link", a: { deviceId: "s1", portName: "Fa0/5" }, b: { deviceId: sw2.id, portName: "Fa0/1" } });
    sim.dispatch({ kind: "add-link", a: { deviceId: "s1", portName: "Fa0/6" }, b: { deviceId: sw2.id, portName: "Fa0/2" } });

    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["reply"]);
    expect(sim.suspended).toBe(false);

    const start = sim.traces.length;
    sim.dispatch(resolveAddress("d1", "192.168.1.99"));
    run(sim);

    expect(sim.suspended).toBe(true);
    const toVlan20 = sentBySwitchTo(sim.traces.slice(start)).filter((id) => id === "d3" || id === "d4");
    expect(toVlan20).toEqual([]);
  });
});

describe("annulla e ripristina", () => {
  test("ogni modifica alle VLAN si annulla e si ripristina", () => {
    const { sim, sw } = buildVlanLan();
    const before = takeSnapshot(sim.network);

    sim.dispatch(addVlan("s1", 30, "LAB"));
    sim.dispatch(setPortVlan("s1", "Fa0/1", 30));
    sim.dispatch(renameVlan("s1", 10, "CLASSE3A"));
    sim.dispatch(removeVlan("s1", 20));
    const after = takeSnapshot(sim.network);

    sim.dispatch(restoreConfiguration(before));
    expect(takeSnapshot(sim.network)).toEqual(before);
    expect(sw.vlans).toEqual([
      { id: 1, name: "default" },
      { id: 10, name: "STUDENTI" },
      { id: 20, name: "DOCENTI" },
    ]);
    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);

    sim.dispatch(restoreConfiguration(after));
    expect(takeSnapshot(sim.network)).toEqual(after);
    // I PC conoscono già i MAC dai ping di prima: gli echo partono, ma la
    // VLAN 20 non c'è più e PC1 ora sta nella VLAN 30.
    expect(pingOutcomes(sim, "d3", PC4_IP)).toEqual(["timeout"]);
    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["timeout"]);
    expectVlanInvariants(sim.network);
  });

  test("annullare passo per passo torna a ogni stato intermedio", () => {
    const { sim } = buildVlanLan();
    const snapshots = [takeSnapshot(sim.network)];
    for (const action of [
      addVlan("s1", 30),
      setPortVlan("s1", "Fa0/2", 30),
      removeVlan("s1", 10),
      renameVlan("s1", 30, "NUOVA"),
      setPortVlan("s1", "Fa0/2", 20),
    ]) {
      sim.dispatch(action);
      snapshots.push(takeSnapshot(sim.network));
    }

    for (const snapshot of [...snapshots].reverse()) {
      sim.dispatch(restoreConfiguration(snapshot));
      expect(takeSnapshot(sim.network)).toEqual(snapshot);
      expectVlanInvariants(sim.network);
    }
  });

  test("uno switch tolto torna con le sue VLAN", () => {
    const { sim } = buildVlanLan();
    const before = takeSnapshot(sim.network);
    sim.dispatch({ kind: "remove-device", deviceId: "s1" });

    sim.dispatch(restoreConfiguration(before));

    expect(takeSnapshot(sim.network)).toEqual(before);
    expect(pingOutcomes(sim, "d1", PC2_IP)).toEqual(["reply"]);
    expect(pingOutcomes(sim, "d1", PC3_IP)).toEqual(["unreachable"]);
  });

  test("la fotografia è una copia: le modifiche successive non la toccano", () => {
    const { sim } = buildVlanLan();
    const before = takeSnapshot(sim.network);

    sim.dispatch(renameVlan("s1", 10, "ALTRO"));
    sim.dispatch(setPortVlan("s1", "Fa0/1", 20));

    const saved = before.devices.find((d) => d.id === "s1");
    expect(saved).toMatchObject({ vlans: [{ id: 1 }, { id: 10, name: "STUDENTI" }, { id: 20 }] });
    expect(saved?.ports[0]).toMatchObject({ vlan: 10 });
  });
});

describe("duplicare uno switch", () => {
  test("la copia ha le stesse VLAN e le porte nelle stesse VLAN, ma nessuna riga imparata", () => {
    const { sim, sw } = buildVlanLan();
    pingOutcomes(sim, "d1", PC2_IP);
    sim.dispatch(removeVlan("s1", 20)); // Fa0/3 e Fa0/4 restano sulla 20, inattive

    sim.dispatch(duplicateDevice("s1"));
    const copy = sim.network.devices.at(-1) as Switch;

    expect(copy.vlans).toEqual(sw.vlans);
    expect(copy.vlans).not.toBe(sw.vlans);
    expect(copy.vlans[1]).not.toBe(sw.vlans[1]);
    expect(copy.ports.map((port) => port.vlan)).toEqual([10, 10, 20, 20, 10, 1]);
    expect(copy.macTable.size).toBe(0);

    sim.dispatch(renameVlan(copy.id, 10, "COPIA"));
    expect(sw.vlans[1].name).toBe("STUDENTI");
  });
});

describe("gli invarianti reggono", () => {
  test("dopo una lunga serie di modifiche e traffico", () => {
    const { sim } = buildVlanLan();
    const steps: Array<() => void> = [
      () => pingOutcomes(sim, "d1", PC2_IP),
      () => pingOutcomes(sim, "d3", PC4_IP),
      () => sim.dispatch(setPortVlan("s1", "Fa0/2", 20)),
      () => pingOutcomes(sim, "d2", PC3_IP),
      () => sim.dispatch(removeVlan("s1", 20)),
      () => pingOutcomes(sim, "d2", PC3_IP),
      () => sim.dispatch(addVlan("s1", 20)),
      () => pingOutcomes(sim, "d4", PC2_IP),
      () => sim.dispatch(setPortVlan("s1", "Fa0/5", 30)),
      () => pingOutcomes(sim, "d5", PC1_IP),
      () => sim.dispatch(addVlan("s1", 30)),
      () => sim.dispatch(setPortVlan("s1", "Fa0/1", 30)),
      () => pingOutcomes(sim, "d5", PC1_IP),
      () => sim.dispatch(disableInterface("s1", "Fa0/1")),
      () => sim.dispatch(enableInterface("s1", "Fa0/1")),
      () => pingOutcomes(sim, "d1", PC5_IP),
    ];

    for (const step of steps) {
      step();
      expectVlanInvariants(sim.network);
    }
    const sw = switchOf(sim.network);
    expect(macTableOf(sw, 30).get(PC5_MAC)).toBe("Fa0/5");
    expect(macTableOf(sw, 30).get(PC1_MAC)).toBe("Fa0/1");
  });
});
