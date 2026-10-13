import { describe, expect, test } from "vitest";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import {
  addLink,
  addRoute,
  addRouter,
  configureInterface,
  disableInterface,
  enableInterface,
  ping,
  removeRoute,
  restoreConfiguration,
  type Action,
} from "../../src/engine/actions";
import { linkCarriesSignal, type Host, type Router } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { takeSnapshot } from "../../src/engine/snapshot";
import { loadNetworkFile } from "../../src/storage/load";

function emptyNetwork(): Simulator {
  return new Simulator({ devices: [], links: [] });
}

// La rete di esempio: PC1 — SW1 — R1 — SW2 — PC2.
function twoLans() {
  const { network } = loadNetworkFile(routerFile);
  const sim = new Simulator(network);
  const router = network.devices.find((d) => d.id === "r1") as Router;
  return { sim, network, router };
}

function routerOf(sim: Simulator, id = "r1"): Router {
  return sim.network.devices.find((d) => d.id === id) as Router;
}

// Fotografa la rete, fa una modifica, e torna alla fotografia.
function changeAndUndo(sim: Simulator, action: Action) {
  const before = takeSnapshot(sim.network);
  sim.dispatch(action);
  const traces = sim.dispatch(restoreConfiguration(before));
  return { before, traces };
}

const ROUTE = { network: "10.0.0.0", mask: "255.0.0.0", nextHop: "192.168.2.254" };

describe("aggiungere un router", () => {
  test("nasce con il numero di interfacce chiesto, spente e senza indirizzo", () => {
    const sim = emptyNetwork();

    sim.dispatch(addRouter(4));

    const router = routerOf(sim);
    expect(router.name).toBe("R1");
    expect(router.ports.map((p) => [p.name, p.ip, p.mask, p.enabled])).toEqual([
      ["Gi0/0", null, null, false],
      ["Gi0/1", null, null, false],
      ["Gi0/2", null, null, false],
      ["Gi0/3", null, null, false],
    ]);
    expect(router.routes).toEqual([]);
  });

  test("nomi, identificativi e MAC sono i primi liberi", () => {
    const sim = emptyNetwork();

    sim.dispatch(addRouter(2));
    sim.dispatch(addRouter(2));

    const [first, second] = sim.network.devices as Router[];
    expect([first.id, first.name, second.id, second.name]).toEqual(["r1", "R1", "r2", "R2"]);
    const macs = [...first.ports, ...second.ports].map((p) => p.mac);
    expect(new Set(macs).size).toBe(4);
  });

  test("meno di un'interfaccia viene rifiutato", () => {
    expect(() => emptyNetwork().dispatch(addRouter(0))).toThrow("Numero di interfacce non valido");
  });

  test("un cavo verso un'interfaccia spenta non porta segnale finché non la si accende", () => {
    const { sim, network } = twoLans();
    sim.dispatch(addRouter(2));
    sim.dispatch(addLink({ deviceId: "r2", portName: "Gi0/0" }, { deviceId: "s1", portName: "Fa0/2" }));
    const cable = network.links.at(-1)!;
    expect(linkCarriesSignal(network, cable)).toBe(false);

    sim.dispatch(enableInterface("r2", "Gi0/0"));

    expect(linkCarriesSignal(network, cable)).toBe(true);
  });
});

describe("accendere e spegnere un'interfaccia", () => {
  test("spegnerla toglie il segnale: il PC dietro lo switch no, lo switch dimentica quella porta", () => {
    const { sim, network } = twoLans();
    const pc2 = network.devices.find((d) => d.id === "d2") as Host;

    const traces = sim.dispatch(disableInterface("r1", "Gi0/1"));

    expect(traces.map((t) => t.kind)).toEqual(["interface-changed"]);
    expect(linkCarriesSignal(network, network.links.find((l) => l.id === "l3")!)).toBe(false);
    expect(pc2.linkUp).toBe(true); // il suo cavo va allo switch, che è acceso
  });

  test("ciò che viaggiava verso un'interfaccia che si spegne va perso", () => {
    const { sim } = twoLans();
    sim.dispatch(ping("d2", "192.168.1.10", 1)); // PC2 chiede con ARP il MAC del gateway
    sim.step(); // la richiesta arriva a SW2, che la manda anche verso il router

    const traces = sim.dispatch(disableInterface("r1", "Gi0/1"));

    expect(traces.map((t) => t.kind)).toEqual(["frame-lost", "interface-changed"]);
  });

  test("accendere un'interfaccia già accesa non fa nulla", () => {
    const { sim } = twoLans();

    expect(sim.dispatch(enableInterface("r1", "Gi0/0"))).toEqual([]);
  });

  test("un'interfaccia che non esiste, o la scheda di un PC, vengono rifiutate", () => {
    const { sim } = twoLans();

    expect(() => sim.dispatch(enableInterface("r1", "Gi0/9"))).toThrow("R1 non ha un'interfaccia Gi0/9.");
    expect(() => sim.dispatch(enableInterface("d1", "Fa0"))).toThrow("PC1 non ha porte che si possano spegnere.");
  });
});

describe("indirizzo di un'interfaccia", () => {
  test("un indirizzo valido viene impostato, e si può togliere", () => {
    const { sim, router } = twoLans();

    sim.dispatch(configureInterface("r1", "Gi0/0", "172.16.0.1", "255.255.0.0"));
    expect(router.ports[0]).toMatchObject({ ip: "172.16.0.1", mask: "255.255.0.0" });

    sim.dispatch(configureInterface("r1", "Gi0/0", null, null));
    expect(router.ports[0]).toMatchObject({ ip: null, mask: null });
  });

  test("un indirizzo non accettabile viene rifiutato, e l'interfaccia resta com'era", () => {
    const { sim, router } = twoLans();

    expect(() => sim.dispatch(configureInterface("r1", "Gi0/0", "192.168.1.255", "255.255.255.0"))).toThrow(
      "R1 Gi0/0: l'indirizzo 192.168.1.255",
    );
    expect(router.ports[0].ip).toBe("192.168.1.1");
  });

  test("una rete che si sovrappone a quella di un'altra interfaccia viene rifiutata", () => {
    const { sim, router } = twoLans();

    expect(() => sim.dispatch(configureInterface("r1", "Gi0/1", "192.168.1.129", "255.255.255.128"))).toThrow(
      "R1 Gi0/1: la rete di Gi0/1 (192.168.1.129) si sovrappone a quella di Gi0/0 (192.168.1.1).",
    );
    expect(router.ports[1].ip).toBe("192.168.2.1");
  });

  test("due sottoreti /30 vicine vanno bene", () => {
    const sim = emptyNetwork();
    sim.dispatch(addRouter(2));

    sim.dispatch(configureInterface("r1", "Gi0/0", "10.0.0.1", "255.255.255.252"));
    sim.dispatch(configureInterface("r1", "Gi0/1", "10.0.0.5", "255.255.255.252"));

    expect(routerOf(sim).ports.map((p) => p.ip)).toEqual(["10.0.0.1", "10.0.0.5"]);
  });

  test("cambiare l'indirizzo della stessa interfaccia non è una sovrapposizione con se stessa", () => {
    const { sim, router } = twoLans();

    sim.dispatch(configureInterface("r1", "Gi0/0", "192.168.1.254", "255.255.255.0"));

    expect(router.ports[0].ip).toBe("192.168.1.254");
  });

  test("con un indirizzo nuovo il router dimentica la tabella ARP", () => {
    const { sim, router } = twoLans();
    router.arpTable.set("192.168.1.10", "02:00:00:00:00:01");

    sim.dispatch(configureInterface("r1", "Gi0/0", "192.168.1.254", "255.255.255.0"));

    expect(router.arpTable.size).toBe(0);
  });
});

describe("rotte statiche", () => {
  test("una rotta si aggiunge in fondo, e si toglie", () => {
    const { sim, router } = twoLans();

    sim.dispatch(addRoute("r1", ROUTE));
    sim.dispatch(addRoute("r1", { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "192.168.2.254" }));
    expect(router.routes.map((r) => r.network)).toEqual(["10.0.0.0", "0.0.0.0"]);

    const traces = sim.dispatch(removeRoute("r1", ROUTE));
    expect(traces.map((t) => t.kind)).toEqual(["route-removed"]);
    expect(router.routes.map((r) => r.network)).toEqual(["0.0.0.0"]);
  });

  test("la rotta aggiunta è una copia: cambiare l'originale non la tocca", () => {
    const { sim, router } = twoLans();
    const route = { ...ROUTE };

    sim.dispatch(addRoute("r1", route));
    route.nextHop = "1.2.3.4";

    expect(router.routes[0].nextHop).toBe("192.168.2.254");
  });

  test("una rotta incoerente, una ripetuta e una che non c'è vengono rifiutate", () => {
    const { sim, router } = twoLans();
    sim.dispatch(addRoute("r1", ROUTE));

    expect(() => sim.dispatch(addRoute("r1", { ...ROUTE, network: "10.0.0.7" }))).toThrow(
      "R1: 10.0.0.7 non è un indirizzo di rete con la maschera 255.0.0.0.",
    );
    expect(() => sim.dispatch(addRoute("r1", { ...ROUTE }))).toThrow("R1 ha già questa rotta.");
    expect(() => sim.dispatch(removeRoute("r1", { ...ROUTE, nextHop: "192.168.2.2" }))).toThrow(
      "R1 non ha questa rotta.",
    );
    expect(router.routes).toHaveLength(1);
  });

  test("due rotte verso la stessa rete con prossimi salti diversi sono ammesse", () => {
    const { sim, router } = twoLans();

    sim.dispatch(addRoute("r1", ROUTE));
    sim.dispatch(addRoute("r1", { ...ROUTE, nextHop: "192.168.1.254" }));

    expect(router.routes).toHaveLength(2);
  });

  test("a un PC o a uno switch non si aggiungono rotte", () => {
    const { sim } = twoLans();

    expect(() => sim.dispatch(addRoute("d1", ROUTE))).toThrow("PC1 non è un router.");
  });
});

describe("annullare le modifiche a un router", () => {
  test("un router aggiunto viene tolto", () => {
    const { sim } = twoLans();

    const { before } = changeAndUndo(sim, addRouter(8));

    expect(takeSnapshot(sim.network)).toEqual(before);
  });

  test("indirizzo e stato di un'interfaccia tornano quelli di prima", () => {
    const { sim } = twoLans();
    const original = takeSnapshot(sim.network);

    changeAndUndo(sim, configureInterface("r1", "Gi0/0", "172.16.0.1", "255.255.0.0"));
    const { traces } = changeAndUndo(sim, disableInterface("r1", "Gi0/1"));

    expect(takeSnapshot(sim.network)).toEqual(original);
    expect(traces.map((t) => t.kind)).toEqual(["interface-changed"]);
  });

  test("una rotta aggiunta sparisce, una tolta torna al suo posto nell'elenco", () => {
    const { sim } = twoLans();
    sim.dispatch(addRoute("r1", ROUTE));
    sim.dispatch(addRoute("r1", { network: "172.16.0.0", mask: "255.255.0.0", nextHop: "192.168.2.254" }));
    const original = takeSnapshot(sim.network);

    changeAndUndo(sim, addRoute("r1", { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "192.168.2.254" }));
    expect(takeSnapshot(sim.network)).toEqual(original);

    changeAndUndo(sim, removeRoute("r1", ROUTE));
    expect(takeSnapshot(sim.network)).toEqual(original); // di nuovo la prima dell'elenco
  });

  test("lo stato di un'interfaccia è configurazione: annullare lo rimette, diversamente da un guasto", () => {
    const { sim, router } = twoLans();
    const before = takeSnapshot(sim.network);
    sim.dispatch(disableInterface("r1", "Gi0/0"));
    sim.dispatch(addRouter(2));

    sim.dispatch(restoreConfiguration(before));

    expect(router.ports[0].enabled).toBe(true);
  });
});
