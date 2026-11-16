import { describe, expect, test } from "vitest";
import {
  addSubinterface,
  configureInterface,
  disableInterface,
  duplicateDevice,
  enableInterface,
  ping,
  removeSubinterface,
  restoreConfiguration,
  setSubinterfaceEncapsulation,
} from "../../src/engine/actions";
import { createRouter, type Router, type RouterInterface, type Subinterface } from "../../src/engine/model/network";
import { checkSubinterfaces, interfaceOfAddress, layer3InterfacesOf } from "../../src/engine/model/subinterfaces";
import type { Simulator } from "../../src/engine/simulator";
import { stepsToRestore, takeSnapshot, type Snapshot } from "../../src/engine/snapshot";
import { buildRouterOnAStick, buildTwoLans } from "./builders";

// Una sottointerfaccia per i test: nome, VLAN e indirizzo; native e stato facoltativi.
function sub(name: string, vlan: number | null = null, ip: string | null = null, extra: Partial<Subinterface> = {}): Subinterface {
  const mask = ip === null ? null : "255.255.255.0";
  return { name, parent: name.slice(0, name.lastIndexOf(".")), vlan, native: false, ip, mask, enabled: true, ...extra };
}

function port(name: string, ip: string | null = null): RouterInterface {
  return { name, mac: `02:00:00:00:0a:0${name.at(-1)}`, ip, mask: ip === null ? null : "255.255.255.0", enabled: true };
}

// Un router da solo, con due porte e le sottointerfacce date.
function routerWith(subinterfaces: Subinterface[], ports = [port("Gi0/0"), port("Gi0/1")]): Router {
  return createRouter({ id: "r1", name: "R1", ports, routes: [], subinterfaces });
}

function r1Of(sim: Simulator): Router {
  return sim.network.devices.find((d) => d.id === "r1") as Router;
}

// La configurazione e le tracce, per controllare che un rifiuto non cambi nulla.
function stateOf(sim: Simulator): string {
  return JSON.stringify(takeSnapshot(sim.network)) + `|${sim.traces.length}`;
}

function expectRefused(sim: Simulator, action: Parameters<Simulator["dispatch"]>[0], message: string): void {
  const before = stateOf(sim);
  expect(() => sim.dispatch(action)).toThrow(message);
  expect(stateOf(sim)).toBe(before);
}

describe("le interfacce logiche", () => {
  test("ogni porta seguita dalle sue sottointerfacce in ordine di numero, con il MAC della porta", () => {
    const router = routerWith([sub("Gi0/1.5", 5), sub("Gi0/0.20", 20), sub("Gi0/0.3", 3)]);
    const before = JSON.stringify(router);

    const ifaces = layer3InterfacesOf(router);

    expect(ifaces.map((i) => i.name)).toEqual(["Gi0/0", "Gi0/0.3", "Gi0/0.20", "Gi0/1", "Gi0/1.5"]);
    expect(ifaces.map((i) => i.physical)).toEqual([true, false, false, true, false]);
    expect(ifaces[2]).toMatchObject({ parent: "Gi0/0", vlan: 20, mac: router.ports[0].mac });
    expect(router.ports).toHaveLength(2);
    expect(JSON.stringify(router)).toBe(before);
  });

  test("l'interfaccia nella cui rete sta un indirizzo; nessuna se l'indirizzo è fuori", () => {
    const router = routerWith([sub("Gi0/0.10", 10, "192.168.10.1")], [port("Gi0/0"), port("Gi0/1", "10.0.0.1")]);

    expect(interfaceOfAddress(router, "192.168.10.77")?.name).toBe("Gi0/0.10");
    expect(interfaceOfAddress(router, "10.0.0.9")?.name).toBe("Gi0/1");
    expect(interfaceOfAddress(router, "172.16.0.1")).toBeNull();
  });
});

describe("i vincoli V1–V10", () => {
  test.each([
    ["V1 nome senza numero", [sub("Gi0/0.x", null)], "nome di sottointerfaccia non valido: Gi0/0.x"],
    ["V1 nome senza punto", [{ ...sub("Gi0/0.1"), name: "Gi0/01" }], "nome di sottointerfaccia non valido: Gi0/01"],
    ["V1 padre diverso dal nome", [{ ...sub("Gi0/0.1"), parent: "Gi0/1" }], "nome di sottointerfaccia non valido: Gi0/0.1"],
    ["V2 padre inesistente", [sub("Gi0/5.10")], "Gi0/5.10: non c'è un'interfaccia Gi0/5"],
    ["V3 numero zero", [sub("Gi0/0.0")], "il numero di una sottointerfaccia va da 1 a 4094"],
    ["V3 numero troppo alto", [sub("Gi0/0.4095")], "il numero di una sottointerfaccia va da 1 a 4094"],
    ["V4 nome ripetuto", [sub("Gi0/0.10"), sub("Gi0/0.10")], "sottointerfaccia ripetuta: Gi0/0.10"],
    ["V5 VLAN zero", [sub("Gi0/0.10", 0)], "Numero di VLAN non valido: 0"],
    ["V5 VLAN troppo alta", [sub("Gi0/0.10", 1002)], "Numero di VLAN non valido: 1002"],
    ["V6 stessa VLAN sullo stesso padre", [sub("Gi0/0.10", 10), sub("Gi0/0.11", 10)], "Gi0/0: la VLAN 10 è già di un'altra sottointerfaccia"],
    ["V7 due native sullo stesso padre", [sub("Gi0/0.10", 10, null, { native: true }), sub("Gi0/0.20", 20, null, { native: true })], "una sola sottointerfaccia può essere native"],
    ["V7 native senza VLAN", [sub("Gi0/0.10", null, null, { native: true })], "native richiede una VLAN"],
    ["V8 indirizzo senza maschera", [{ ...sub("Gi0/0.10", 10), ip: "192.168.10.1" }], "Gi0/0.10:"],
    ["V8 maschera senza indirizzo", [{ ...sub("Gi0/0.10", 10), mask: "255.255.255.0" }], "Gi0/0.10:"],
    ["V8 indirizzo senza VLAN", [sub("Gi0/0.10", null, "192.168.10.1")], "un indirizzo richiede prima la VLAN"],
    ["V8 indirizzo non valido", [sub("Gi0/0.10", 10, "192.168.10.0")], "Gi0/0.10:"],
    ["V9 reti sovrapposte tra sottointerfacce", [sub("Gi0/0.10", 10, "192.168.10.1"), sub("Gi0/1.10", 10, "192.168.10.2")], "si sovrappone"],
  ])("%s: rifiutato", (_what, subs, message) => {
    expect(checkSubinterfaces(routerWith(subs as Subinterface[]))).toContain(message);
  });

  test("V9 anche con una porta fisica, e V10: niente indirizzo sulla porta di una native", () => {
    const withPort = [port("Gi0/0", "192.168.10.254"), port("Gi0/1")];
    expect(checkSubinterfaces(routerWith([sub("Gi0/1.10", 10, "192.168.10.1")], withPort))).toContain("si sovrappone");
    expect(checkSubinterfaces(routerWith([sub("Gi0/0.10", 10, null, { native: true })], withPort))).toBe(
      "Gi0/0: ha un indirizzo, e la sua sottointerfaccia Gi0/0.10 è native",
    );
  });

  test("ammessi: router senza sottointerfacce, stati parziali, spenta, stessa VLAN su padri diversi, una native per padre", () => {
    expect(checkSubinterfaces(routerWith([]))).toBeNull();
    expect(
      checkSubinterfaces(
        routerWith([
          sub("Gi0/0.1"),
          sub("Gi0/0.10", 10),
          sub("Gi0/0.20", 20, "192.168.20.1", { enabled: false }),
          sub("Gi0/1.10", 10, "192.168.11.1", { native: true }),
          sub("Gi0/0.4094", 99, null, { native: true }),
        ]),
      ),
    ).toBeNull();
  });
});

describe("le azioni sulle sottointerfacce", () => {
  test("creare dà una sottointerfaccia vuota e accesa; togliere la toglie, e la porta e il cavo restano", () => {
    const { sim, r1 } = buildRouterOnAStick([]);

    const traces = sim.dispatch(addSubinterface("r1", "Gi0/0.10"));
    expect(r1.subinterfaces).toEqual([sub("Gi0/0.10")]);
    expect(traces.map((t) => t.kind)).toEqual(["subinterface-added"]);
    expect(r1.ports.map((p) => p.name)).toEqual(["Gi0/0", "Gi0/1"]);

    sim.dispatch(removeSubinterface("r1", "Gi0/0.10"));
    expect(r1.subinterfaces).toEqual([]);
    expect(r1.ports).toHaveLength(2);
    expect(sim.network.links.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);

    sim.dispatch(addSubinterface("r1", "Gi0/0.10"));
    expect(r1.subinterfaces).toEqual([sub("Gi0/0.10")]);
  });

  test("VLAN, native, indirizzo, stato: ognuno con la sua azione, e l'indirizzo resta quando cambia la VLAN", () => {
    const { sim, r1 } = buildRouterOnAStick([]);
    sim.dispatch(addSubinterface("r1", "Gi0/0.10"));

    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/0.10", 10));
    sim.dispatch(configureInterface("r1", "Gi0/0.10", "192.168.10.1", "255.255.255.0"));
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/0.10", 30));
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/0.10", 30, true));
    expect(r1.subinterfaces[0]).toEqual(sub("Gi0/0.10", 30, "192.168.10.1", { native: true }));

    sim.dispatch(disableInterface("r1", "Gi0/0.10"));
    expect(r1.subinterfaces[0].enabled).toBe(false);
    expect(r1.ports[0].enabled).toBe(true);
    sim.dispatch(enableInterface("r1", "Gi0/0.10"));
    expect(r1.subinterfaces[0].enabled).toBe(true);
  });

  test("spegnere la porta padre non cambia la configurazione delle sottointerfacce", () => {
    const { sim, r1 } = buildRouterOnAStick();
    const before = JSON.stringify(r1.subinterfaces);

    sim.dispatch(disableInterface("r1", "Gi0/0"));

    expect(JSON.stringify(r1.subinterfaces)).toBe(before);
    expect(r1.ports[0].enabled).toBe(false);
  });

  test("togliere la VLAN con un indirizzo si rifiuta; togliere prima l'indirizzo e poi la VLAN va bene", () => {
    const { sim, r1 } = buildRouterOnAStick();

    expectRefused(sim, setSubinterfaceEncapsulation("r1", "Gi0/0.10", null), "un indirizzo richiede prima la VLAN");
    sim.dispatch(configureInterface("r1", "Gi0/0.10", null, null));
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/0.10", null));
    expect(r1.subinterfaces[0]).toEqual(sub("Gi0/0.10"));
  });

  test("le modifiche rifiutate non cambiano nulla: né configurazione, né tracce", () => {
    const { sim } = buildRouterOnAStick();

    expectRefused(sim, addSubinterface("r1", "Gi0/0.10"), "sottointerfaccia ripetuta: Gi0/0.10");
    expectRefused(sim, addSubinterface("r1", "Gi0/7.10"), "non c'è un'interfaccia Gi0/7");
    expectRefused(sim, addSubinterface("r1", "Gi0/0.0"), "il numero di una sottointerfaccia va da 1 a 4094");
    expectRefused(sim, addSubinterface("r1", "Gi0/0"), "nome di sottointerfaccia non valido");
    expectRefused(sim, addSubinterface("s1", "Fa0/1.10"), "SW1 non è un router");
    expectRefused(sim, removeSubinterface("r1", "Gi0/0.30"), "R1 non ha una sottointerfaccia Gi0/0.30.");
    expectRefused(sim, setSubinterfaceEncapsulation("r1", "Gi0/0.20", 10), "la VLAN 10 è già di un'altra sottointerfaccia");
    expectRefused(sim, setSubinterfaceEncapsulation("r1", "Gi0/0.20", 2000), "Numero di VLAN non valido: 2000");
    expectRefused(sim, configureInterface("r1", "Gi0/0.20", "192.168.10.5", "255.255.255.0"), "si sovrappone");
    expectRefused(sim, configureInterface("r1", "Gi0/1", "192.168.20.9", "255.255.255.0"), "si sovrappone");
    expectRefused(sim, enableInterface("r1", "Gi0/0.99"), "R1 non ha un'interfaccia Gi0/0.99.");
  });

  test("V10 dai due lati: una native non va su una porta con indirizzo, e un indirizzo non va su una porta con una native", () => {
    const { sim } = buildRouterOnAStick();
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/0.10", 10, true));

    expectRefused(sim, configureInterface("r1", "Gi0/0", "10.0.0.1", "255.255.255.0"), "è native");
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/0.10", 10, false));
    sim.dispatch(configureInterface("r1", "Gi0/0", "10.0.0.1", "255.255.255.0"));
    expectRefused(sim, setSubinterfaceEncapsulation("r1", "Gi0/0.10", 10, true), "è native");
  });

  test("una modifica che non cambia nulla non lascia tracce", () => {
    const { sim } = buildRouterOnAStick();

    expect(sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/0.10", 10))).toEqual([]);
    expect(sim.dispatch(configureInterface("r1", "Gi0/0.10", "192.168.10.1", "255.255.255.0"))).toEqual([]);
    expect(sim.dispatch(enableInterface("r1", "Gi0/0.10"))).toEqual([]);
  });

  test("i frame con il tag diretti al router sono ancora scartati: le sottointerfacce non portano traffico (L3-1A)", () => {
    const { sim } = buildRouterOnAStick();
    sim.dispatch(ping("d1", "192.168.20.10", 1));
    while (sim.canStep()) sim.step();

    const drops = sim.traces.flatMap((t) => (t.kind === "frame-dropped" && t.at.deviceId === "r1" ? [t.reason] : []));
    expect(drops.length).toBeGreaterThan(0);
    expect(new Set(drops)).toEqual(new Set(["tagged-frame"]));
    expect(sim.traces.some((t) => t.kind === "ping-result" && t.outcome === "reply")).toBe(false);
  });
});

describe("lo stato di esecuzione del router quando cambiano le sottointerfacce (D-174)", () => {
  // R1 al lavoro: ARP imparato, un pacchetto in attesa con il suo timer, un
  // ping del router in corso. Una terza porta, Gi0/2, senza indirizzo e
  // senza cavo, ha la sottointerfaccia Gi0/2.30 (dot1Q 30, 10.30.0.1/24) da
  // cambiare: sulla porta senza indirizzo può anche diventare native (V10).
  function busyRouter() {
    const built = buildTwoLans();
    const { sim, r1 } = built;
    r1.ports.push({ name: "Gi0/2", mac: "02:00:00:00:03:03", ip: null, mask: null, enabled: true });
    sim.dispatch(addSubinterface("r1", "Gi0/2.30"));
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/2.30", 30));
    sim.dispatch(configureInterface("r1", "Gi0/2.30", "10.30.0.1", "255.255.255.0"));
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    while (r1Of(sim).pendingPackets.length === 0) sim.step();
    sim.dispatch(ping("r1", "192.168.1.10", 1));
    return built;
  }
  function runtimeOf(sim: Simulator) {
    const r1 = r1Of(sim);
    const timers = sim.queue.filter((event) => event.kind === "timer" && event.deviceId === "r1").length;
    return { arp: r1.arpTable.size, pending: r1.pendingPackets.length, echoes: r1.awaitedEchoes.length, timers };
  }

  test("il router al lavoro ha davvero qualcosa da perdere", () => {
    const { sim } = busyRouter();
    const runtime = runtimeOf(sim);

    expect(runtime.arp).toBeGreaterThan(0);
    expect(runtime.pending).toBeGreaterThan(0);
    expect(runtime.echoes).toBeGreaterThan(0);
    expect(runtime.timers).toBeGreaterThan(0);
  });

  test.each([
    ["creare una sottointerfaccia", addSubinterface("r1", "Gi0/2.40")],
    ["spegnerla", disableInterface("r1", "Gi0/2.30")],
  ])("%s non tocca ARP, attese, ping e timer", (_what, action) => {
    const { sim } = busyRouter();
    const before = runtimeOf(sim);

    sim.dispatch(action);

    expect(runtimeOf(sim)).toEqual(before);
  });

  test.each([
    ["cambiarne la VLAN", setSubinterfaceEncapsulation("r1", "Gi0/2.30", 31)],
    ["renderla native", setSubinterfaceEncapsulation("r1", "Gi0/2.30", 30, true)],
    ["cambiarne l'indirizzo", configureInterface("r1", "Gi0/2.30", "10.31.0.1", "255.255.255.0")],
    ["cambiarne la maschera", configureInterface("r1", "Gi0/2.30", "10.30.0.1", "255.255.0.0")],
    ["toglierla", removeSubinterface("r1", "Gi0/2.30")],
  ])("%s azzera ARP, attese, ping e timer del router", (_what, action) => {
    const { sim } = busyRouter();

    sim.dispatch(action);

    expect(runtimeOf(sim)).toEqual({ arp: 0, pending: 0, echoes: 0, timers: 0 });
  });

  test("una modifica rifiutata, o che non cambia nulla, non azzera nulla; gli altri dispositivi non sono toccati", () => {
    const { sim, pc1 } = busyRouter();
    const before = runtimeOf(sim);
    const pcArp = pc1.arpTable.size;

    expect(() => sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/2.30", 0))).toThrow();
    expect(() => sim.dispatch(configureInterface("r1", "Gi0/2.30", "192.168.1.5", "255.255.255.0"))).toThrow();
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/2.30", 30));
    sim.dispatch(configureInterface("r1", "Gi0/2.30", "10.30.0.1", "255.255.255.0"));

    expect(runtimeOf(sim)).toEqual(before);
    sim.dispatch(removeSubinterface("r1", "Gi0/2.30"));
    expect(pc1.arpTable.size).toBe(pcArp);
  });
});

describe("fotografia, annulla e ripristina", () => {
  // Porta la rete a una fotografia applicando i passi uno alla volta, e
  // controlla i vincoli del router dopo ciascuno.
  function restoreStepByStep(sim: Simulator, snapshot: Snapshot): void {
    for (const step of stepsToRestore(sim.network, snapshot)) {
      if (step.kind === "put-device" || step.kind === "put-link") {
        sim.dispatch(restoreConfiguration(snapshot));
        return;
      }
      sim.dispatch(step);
      const router = r1Of(sim);
      expect(checkSubinterfaces(router), `dopo ${step.kind}`).toBeNull();
    }
    expect(takeSnapshot(sim.network)).toEqual(snapshot);
  }

  test("la fotografia copia le sottointerfacce, senza condividerle", () => {
    const { sim, r1 } = buildRouterOnAStick();
    const snapshot = takeSnapshot(sim.network);
    const copied = (snapshot.devices[0] as Router).subinterfaces;

    expect(copied).toEqual(r1.subinterfaces);
    expect(copied[0]).not.toBe(r1.subinterfaces[0]);
    sim.dispatch(configureInterface("r1", "Gi0/0.10", null, null));
    expect(copied[0].ip).toBe("192.168.10.1");
  });

  test("ogni azione si annulla e si ripristina; la fotografia di un router senza sottointerfacce non ne ha", () => {
    const { sim, r1 } = buildTwoLans();
    expect((takeSnapshot(sim.network).devices[1] as Router).subinterfaces).toEqual([]);
    // Una terza porta senza indirizzo, su cui una sottointerfaccia può essere native.
    r1.ports.push({ name: "Gi0/2", mac: "02:00:00:00:03:03", ip: null, mask: null, enabled: true });
    const actions = [
      addSubinterface("r1", "Gi0/2.30"),
      setSubinterfaceEncapsulation("r1", "Gi0/2.30", 30),
      setSubinterfaceEncapsulation("r1", "Gi0/2.30", 30, true),
      configureInterface("r1", "Gi0/2.30", "10.30.0.1", "255.255.255.0"),
      disableInterface("r1", "Gi0/2.30"),
      removeSubinterface("r1", "Gi0/2.30"),
    ];
    const states = [takeSnapshot(sim.network)];
    for (const action of actions) {
      sim.dispatch(action);
      states.push(takeSnapshot(sim.network));
    }
    for (let i = states.length - 2; i >= 0; i--) restoreStepByStep(sim, states[i]);
    for (let i = 1; i < states.length; i++) restoreStepByStep(sim, states[i]);
  });

  test("scambiare le VLAN di due sottointerfacce non passa mai da due VLAN uguali sullo stesso padre", () => {
    const { sim } = buildRouterOnAStick();
    const before = takeSnapshot(sim.network);
    for (const action of [
      configureInterface("r1", "Gi0/0.10", null, null),
      configureInterface("r1", "Gi0/0.20", null, null),
      setSubinterfaceEncapsulation("r1", "Gi0/0.10", null),
      setSubinterfaceEncapsulation("r1", "Gi0/0.20", 10),
      setSubinterfaceEncapsulation("r1", "Gi0/0.10", 20),
      configureInterface("r1", "Gi0/0.10", "192.168.20.1", "255.255.255.0"),
      configureInterface("r1", "Gi0/0.20", "192.168.10.1", "255.255.255.0"),
    ]) {
      sim.dispatch(action);
    }
    const swapped = takeSnapshot(sim.network);

    restoreStepByStep(sim, before);
    restoreStepByStep(sim, swapped);
  });

  test("scambiare le reti di due porte fisiche, e di una porta con una sottointerfaccia", () => {
    const { sim } = buildTwoLans();
    sim.dispatch(addSubinterface("r1", "Gi0/1.30"));
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/1.30", 30));
    sim.dispatch(configureInterface("r1", "Gi0/1.30", "10.30.0.1", "255.255.255.0"));
    const before = takeSnapshot(sim.network);
    const target = structuredClone(before);
    const r = target.devices[1] as Router;
    [r.ports[0].ip, r.ports[1].ip] = [r.ports[1].ip, r.ports[0].ip];
    [r.ports[1].ip, r.subinterfaces[0].ip] = ["10.30.0.1", r.ports[1].ip];
    r.ports[1].mask = "255.255.255.0";

    restoreStepByStep(sim, target);
    restoreStepByStep(sim, before);
  });

  test("configurazioni parziali, native diverse, stati diversi: si torna a ciascuna senza stati non validi", () => {
    const { sim } = buildRouterOnAStick();
    const full = takeSnapshot(sim.network);
    for (const action of [
      configureInterface("r1", "Gi0/0.20", null, null),
      setSubinterfaceEncapsulation("r1", "Gi0/0.20", null),
      setSubinterfaceEncapsulation("r1", "Gi0/0.10", 10, true),
      addSubinterface("r1", "Gi0/0.99"),
      disableInterface("r1", "Gi0/0.10"),
    ]) {
      sim.dispatch(action);
    }
    const partial = takeSnapshot(sim.network);

    restoreStepByStep(sim, full);
    restoreStepByStep(sim, partial);
  });

  test("un router tolto torna con le sue sottointerfacce", () => {
    const { sim } = buildRouterOnAStick();
    const before = takeSnapshot(sim.network);

    sim.dispatch({ kind: "remove-device", deviceId: "r1" });
    sim.dispatch(restoreConfiguration(before));

    expect(takeSnapshot(sim.network)).toEqual(before);
  });

  test("annullare un cambio di indirizzo di un router senza sottointerfacce dà gli stessi passi di sempre: uno", () => {
    const { sim } = buildTwoLans();
    const before = takeSnapshot(sim.network);
    sim.dispatch(configureInterface("r1", "Gi0/0", "192.168.1.254", "255.255.255.0"));

    expect(stepsToRestore(sim.network, before)).toEqual([
      { kind: "configure-interface", deviceId: "r1", portName: "Gi0/0", ip: "192.168.1.1", mask: "255.255.255.0" },
    ]);
  });
});

describe("duplicare un router con sottointerfacce (D-169)", () => {
  test("la copia ha la stessa struttura, senza indirizzi, accese; le porte spente; nessuna rotta né stato", () => {
    const { sim, r1 } = buildRouterOnAStick();
    sim.dispatch(setSubinterfaceEncapsulation("r1", "Gi0/0.10", 10, true));
    sim.dispatch(disableInterface("r1", "Gi0/0.20"));
    r1.routes.push({ network: "10.0.0.0", mask: "255.0.0.0", nextHop: "192.168.10.254" });

    sim.dispatch(duplicateDevice("r1"));
    const copy = sim.network.devices.at(-1) as Router;

    expect(copy.subinterfaces).toEqual([
      { ...sub(`${copy.ports[0].name}.10`, 10), native: true },
      sub(`${copy.ports[0].name}.20`, 20),
    ]);
    expect(copy.ports.every((p) => !p.enabled && p.ip === null)).toBe(true);
    expect(copy.routes).toEqual([]);
    expect(copy.arpTable.size + copy.pendingPackets.length + copy.awaitedEchoes.length).toBe(0);
    expect(checkSubinterfaces(copy)).toBeNull();
    expect(copy.subinterfaces[0]).not.toBe(r1.subinterfaces[0]);
  });

  test("la porta della copia è quella nella stessa posizione, anche se i nomi sono diversi", () => {
    const { sim, r1 } = buildRouterOnAStick();
    r1.ports[0].name = "Fa0/0";
    r1.subinterfaces = r1.subinterfaces.map((s) => ({ ...s, name: s.name.replace("Gi0/0", "Fa0/0"), parent: "Fa0/0" }));
    sim.network.links[2].a.portName = "Fa0/0";

    sim.dispatch(duplicateDevice("r1"));
    const copy = sim.network.devices.at(-1) as Router;

    expect(copy.subinterfaces.map((s) => [s.name, s.parent])).toEqual([
      [`${copy.ports[0].name}.10`, copy.ports[0].name],
      [`${copy.ports[0].name}.20`, copy.ports[0].name],
    ]);
    expect(checkSubinterfaces(copy)).toBeNull();
  });

  test("un router senza sottointerfacce si copia come prima", () => {
    const { sim } = buildTwoLans();

    sim.dispatch(duplicateDevice("r1"));

    expect((sim.network.devices.at(-1) as Router).subinterfaces).toEqual([]);
  });
});
