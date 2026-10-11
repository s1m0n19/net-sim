import { describe, expect, test } from "vitest";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import type { Router } from "../../src/engine/model/network";
import { loadNetworkFile } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";

// Il file di esempio con una modifica al router, per provare i rifiuti.
function withRouter(change: (router: any) => void): string {
  const file = JSON.parse(routerFile);
  change(file.network.devices.find((d: any) => d.kind === "router"));
  return JSON.stringify(file);
}

function routerOf(text: string): Router {
  return loadNetworkFile(text).network.devices.find((d) => d.kind === "router") as Router;
}

describe("un router in un file di rete", () => {
  test("si apre con le sue interfacce, accese e con indirizzo", () => {
    const router = routerOf(routerFile);

    expect(router.name).toBe("R1");
    expect(router.ports.map((p) => [p.name, p.ip, p.mask, p.enabled])).toEqual([
      ["Gi0/0", "192.168.1.1", "255.255.255.0", true],
      ["Gi0/1", "192.168.2.1", "255.255.255.0", true],
    ]);
    expect(router.routes).toEqual([]);
    expect(router.arpTable.size).toBe(0);
  });

  test("salvato e riaperto è lo stesso, rotte comprese", () => {
    const original = loadNetworkFile(
      withRouter((r) => {
        r.routes = [{ network: "10.0.0.0", mask: "255.0.0.0", nextHop: "192.168.2.254" }];
        r.ports[1].enabled = false;
      }),
    );

    const reopened = loadNetworkFile(serializeNetwork(original.network, original.positions));

    expect(reopened.network).toEqual(original.network);
    expect(reopened.positions).toEqual(original.positions);
  });

  test("un'interfaccia senza il campo enabled è spenta, come nasce su un router", () => {
    const router = routerOf(withRouter((r) => delete r.ports[0].enabled));

    expect(router.ports[0].enabled).toBe(false);
  });

  test("un'interfaccia può non avere un indirizzo", () => {
    const router = routerOf(
      withRouter((r) => {
        delete r.ports[1].ip;
        r.ports[1].mask = null;
      }),
    );

    expect(router.ports[1]).toMatchObject({ ip: null, mask: null });
  });

  test("il campo routes è facoltativo", () => {
    expect(routerOf(withRouter((r) => delete r.routes)).routes).toEqual([]);
  });
});

describe("router rifiutati all'apertura", () => {
  test("un indirizzo di interfaccia non accettabile", () => {
    const text = withRouter((r) => (r.ports[0].ip = "192.168.1.255"));

    expect(() => loadNetworkFile(text)).toThrow("R1 Gi0/0: l'indirizzo 192.168.1.255");
  });

  test("due interfacce con reti sovrapposte, anche con maschere diverse", () => {
    const text = withRouter((r) => {
      r.ports[1].ip = "192.168.1.129";
      r.ports[1].mask = "255.255.255.128";
    });

    expect(() => loadNetworkFile(text)).toThrow("R1: la rete di Gi0/1 (192.168.1.129) si sovrappone a quella di Gi0/0");
  });

  test("due sottoreti vicine con maschera /30 non sono sovrapposte, e vengono accettate", () => {
    const router = routerOf(
      withRouter((r) => {
        r.ports[0].ip = "10.0.0.1";
        r.ports[0].mask = "255.255.255.252";
        r.ports[1].ip = "10.0.0.5";
        r.ports[1].mask = "255.255.255.252";
      }),
    );

    expect(router.ports.map((p) => p.ip)).toEqual(["10.0.0.1", "10.0.0.5"]);
  });

  test("un campo enabled che non è sì o no", () => {
    const text = withRouter((r) => (r.ports[0].enabled = "sì"));

    expect(() => loadNetworkFile(text)).toThrow('R1 Gi0/0: il campo "enabled" deve essere true o false.');
  });

  test("una rotta con rete e maschera che non vanno d'accordo", () => {
    const text = withRouter((r) => (r.routes = [{ network: "10.0.0.7", mask: "255.255.255.0", nextHop: "192.168.2.2" }]));

    expect(() => loadNetworkFile(text)).toThrow("R1, rotta n. 1: 10.0.0.7 non è un indirizzo di rete");
  });

  test("una rotta a cui manca un campo, e una rotta ripetuta", () => {
    const route = { network: "10.0.0.0", mask: "255.0.0.0", nextHop: "192.168.2.2" };

    expect(() => loadNetworkFile(withRouter((r) => (r.routes = [{ network: "10.0.0.0", mask: "255.0.0.0" }])))).toThrow(
      'R1, rotta n. 1: il campo "nextHop" manca',
    );
    expect(() => loadNetworkFile(withRouter((r) => (r.routes = [route, { ...route }])))).toThrow(
      "R1, rotta n. 2: rotta duplicata.",
    );
  });
});
