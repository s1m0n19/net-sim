import { describe, expect, test } from "vitest";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import { removeDevice, restoreConfiguration } from "../../src/engine/actions";
import { networkAddress, networksOverlap } from "../../src/engine/model/addresses";
import {
  clearRuntimeState,
  createRouter,
  linkCarriesSignal,
  type Host,
  type Router,
  type RouterInterface,
} from "../../src/engine/model/network";
import {
  checkInterfaceAddress,
  checkInterfacesApart,
  checkRoute,
  sameRoute,
} from "../../src/engine/model/router-config";
import { Simulator } from "../../src/engine/simulator";
import { takeSnapshot } from "../../src/engine/snapshot";
import { loadNetworkFile } from "../../src/storage/load";

// Un'interfaccia accesa con un indirizzo, per i test sulle sovrapposizioni.
function port(name: string, ip: string | null, mask: string | null): RouterInterface {
  return { name, mac: "02:00:00:00:09:01", ip, mask, enabled: true };
}

// La rete di esempio: PC1 — SW1 — R1 — SW2 — PC2.
function twoLans() {
  const { network } = loadNetworkFile(routerFile);
  const sim = new Simulator(network);
  const router = network.devices.find((d) => d.id === "r1") as Router;
  const pc1 = network.devices.find((d) => d.id === "d1") as Host;
  return { sim, network, router, pc1 };
}

describe("indirizzo di rete", () => {
  test.each([
    ["192.168.1.10", "255.255.255.0", "192.168.1.0"],
    ["10.0.0.6", "255.255.255.252", "10.0.0.4"],
    ["172.16.200.1", "255.255.240.0", "172.16.192.0"],
    ["8.8.8.8", "0.0.0.0", "0.0.0.0"],
  ])("%s con %s sta nella rete %s", (ip, mask, network) => {
    expect(networkAddress(ip, mask)).toBe(network);
  });
});

describe("reti sovrapposte", () => {
  test("due reti uguali si sovrappongono", () => {
    expect(networksOverlap("192.168.1.1", "255.255.255.0", "192.168.1.200", "255.255.255.0")).toBe(true);
  });

  test("una rete piccola dentro una grande si sovrappone, in qualunque ordine", () => {
    expect(networksOverlap("192.168.1.1", "255.255.255.0", "192.168.1.129", "255.255.255.128")).toBe(true);
    expect(networksOverlap("192.168.1.129", "255.255.255.128", "192.168.1.1", "255.255.255.0")).toBe(true);
  });

  test("due sottoreti vicine con maschera lunga non si sovrappongono", () => {
    expect(networksOverlap("10.0.0.1", "255.255.255.252", "10.0.0.5", "255.255.255.252")).toBe(false);
    expect(networksOverlap("192.168.1.1", "255.255.255.128", "192.168.1.129", "255.255.255.128")).toBe(false);
  });

  test("la classe dell'indirizzo non conta: conta la maschera", () => {
    // Stessa classe A, ma con /24 sono due reti diverse.
    expect(networksOverlap("10.1.1.1", "255.255.255.0", "10.1.2.1", "255.255.255.0")).toBe(false);
    // Con la maschera della classe, invece, sarebbero la stessa rete.
    expect(networksOverlap("10.1.1.1", "255.0.0.0", "10.1.2.1", "255.255.255.0")).toBe(true);
  });
});

describe("indirizzo di un'interfaccia", () => {
  test("valgono le regole degli host", () => {
    expect(checkInterfaceAddress("192.168.1.1", "255.255.255.0")).toBeNull();
    expect(checkInterfaceAddress(null, null)).toBeNull();
    expect(checkInterfaceAddress("192.168.1.1", null)).toContain("vanno impostati insieme");
    expect(checkInterfaceAddress("192.168.1.255", "255.255.255.0")).toContain("broadcast");
    expect(checkInterfaceAddress("192.168.1.1", "255.0.255.0")).toContain("subnet mask non valida");
  });

  test("una maschera lunga è ammessa: 10.0.0.1/30", () => {
    expect(checkInterfaceAddress("10.0.0.1", "255.255.255.252")).toBeNull();
  });
});

describe("interfacce dello stesso router", () => {
  test("reti diverse vanno bene, anche con maschere di lunghezza diversa", () => {
    const interfaces = [
      port("Gi0/0", "192.168.1.1", "255.255.255.0"),
      port("Gi0/1", "10.0.0.1", "255.255.255.252"),
      port("Gi0/2", "10.0.0.5", "255.255.255.252"),
      port("Gi0/3", null, null),
    ];

    expect(checkInterfacesApart(interfaces)).toBeNull();
  });

  test("due reti sovrapposte vengono rifiutate, nominando le interfacce", () => {
    const interfaces = [
      port("Gi0/0", "192.168.1.1", "255.255.255.0"),
      port("Gi0/1", "192.168.1.129", "255.255.255.128"),
    ];

    expect(checkInterfacesApart(interfaces)).toBe(
      "la rete di Gi0/1 (192.168.1.129) si sovrappone a quella di Gi0/0 (192.168.1.1)",
    );
  });

  test("le interfacce senza indirizzo non contano", () => {
    expect(checkInterfacesApart([port("Gi0/0", null, null), port("Gi0/1", null, null)])).toBeNull();
  });
});

describe("rotta statica", () => {
  test("rete, maschera e prossimo salto validi vengono accettati", () => {
    expect(checkRoute({ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" })).toBeNull();
    expect(checkRoute({ network: "10.0.0.4", mask: "255.255.255.252", nextHop: "10.0.0.2" })).toBeNull();
  });

  test("la rotta di default è 0.0.0.0 con maschera 0.0.0.0", () => {
    expect(checkRoute({ network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" })).toBeNull();
  });

  test("una rete che non va d'accordo con la maschera viene rifiutata", () => {
    expect(checkRoute({ network: "192.168.2.5", mask: "255.255.255.0", nextHop: "10.0.0.2" })).toBe(
      "192.168.2.5 non è un indirizzo di rete con la maschera 255.255.255.0",
    );
  });

  test("indirizzi e maschere scritti male vengono rifiutati", () => {
    expect(checkRoute({ network: "192.168.2", mask: "255.255.255.0", nextHop: "10.0.0.2" })).toContain("rete non valida");
    expect(checkRoute({ network: "192.168.2.0", mask: "255.0.255.0", nextHop: "10.0.0.2" })).toContain("subnet mask");
    expect(checkRoute({ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "ciao" })).toContain("prossimo salto");
  });

  test("un prossimo salto irraggiungibile è ammesso: è un errore da diagnosticare", () => {
    expect(checkRoute({ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "172.31.0.1" })).toBeNull();
  });

  test("due rotte sono la stessa se coincidono rete, maschera e prossimo salto", () => {
    const route = { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" };

    expect(sameRoute(route, { ...route })).toBe(true);
    expect(sameRoute(route, { ...route, nextHop: "10.0.0.6" })).toBe(false);
  });
});

describe("il router nella rete", () => {
  test("un router appena creato è acceso, con tabella ARP vuota e nulla in attesa", () => {
    const router = createRouter({ id: "r9", name: "R9", ports: [port("Gi0/0", null, null)], routes: [] });

    expect(router).toMatchObject({ kind: "router", powered: true, pendingPackets: [] });
    expect(router.arpTable.size).toBe(0);
  });

  test("con le interfacce accese il segnale passa, e il PC lo sente", () => {
    const { network, pc1 } = twoLans();

    expect(network.links.every((link) => linkCarriesSignal(network, link))).toBe(true);
    expect(pc1.linkUp).toBe(true);
  });

  test("un'interfaccia spenta toglie il segnale al suo cavo, e solo a quello", () => {
    const { network, router } = twoLans();

    router.ports[0].enabled = false;

    const signal = Object.fromEntries(network.links.map((l) => [l.id, linkCarriesSignal(network, l)]));
    expect(signal).toEqual({ l1: true, l2: false, l3: true, l4: true });
  });

  test("spegnere il router toglie il segnale a tutti i suoi cavi", () => {
    const { network, router } = twoLans();

    router.powered = false;

    expect(network.links.filter((l) => linkCarriesSignal(network, l)).map((l) => l.id)).toEqual(["l1", "l4"]);
  });

  test("azzerare lo stato di esecuzione svuota la tabella ARP ma non tocca la configurazione", () => {
    const { router } = twoLans();
    router.arpTable.set("192.168.1.10", "02:00:00:00:00:01");

    clearRuntimeState(router);

    expect(router.arpTable.size).toBe(0);
    expect(router.ports[0]).toMatchObject({ ip: "192.168.1.1", enabled: true });
  });
});

describe("il router nella fotografia della configurazione", () => {
  test("la fotografia contiene interfacce e rotte, ed è una copia", () => {
    const { network, router } = twoLans();
    router.routes.push({ network: "10.9.0.0", mask: "255.255.0.0", nextHop: "192.168.2.254" });

    const snapshot = takeSnapshot(network);
    router.ports[0].ip = "192.168.1.99";
    router.routes.length = 0;

    const saved = snapshot.devices.find((d) => d.id === "r1")!;
    expect(saved.kind === "router" && saved.ports[0].ip).toBe("192.168.1.1");
    expect(saved.kind === "router" && saved.routes).toHaveLength(1);
  });

  test("un router tolto torna con interfacce, rotte e cavi, e la tabella ARP vuota", () => {
    const { sim, network, router } = twoLans();
    router.routes.push({ network: "10.9.0.0", mask: "255.255.0.0", nextHop: "192.168.2.254" });
    router.arpTable.set("192.168.1.10", "02:00:00:00:00:01");
    const before = takeSnapshot(network);

    sim.dispatch(removeDevice("r1"));
    sim.dispatch(restoreConfiguration(before));

    expect(takeSnapshot(network)).toEqual(before);
    const back = network.devices.find((d) => d.id === "r1") as Router;
    expect(back.arpTable.size).toBe(0);
    expect(network.links.every((link) => linkCarriesSignal(network, link))).toBe(true);
  });
});
