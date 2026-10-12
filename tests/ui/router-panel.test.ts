import { beforeEach, describe, expect, test } from "vitest";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import { prefixToMask } from "../../src/engine/model/addresses";
import { session } from "../../src/ui/session.svelte";

function router(id = "r1") {
  return session.view.devices.find((device) => device.id === id)!;
}

function port(name: string, id = "r1") {
  return router(id).interfaces.find((p) => p.name === name)!;
}

describe("dal prefisso alla maschera", () => {
  test.each([
    [0, "0.0.0.0"],
    [8, "255.0.0.0"],
    [24, "255.255.255.0"],
    [25, "255.255.255.128"],
    [30, "255.255.255.252"],
    [32, "255.255.255.255"],
  ])("/%i è %s", (prefix, mask) => {
    expect(prefixToMask(prefix)).toBe(mask);
  });

  test("un prefisso fuori da 0-32 viene rifiutato", () => {
    expect(() => prefixToMask(33)).toThrow("Prefisso non valido");
  });
});

describe("posare un router", () => {
  beforeEach(() => {
    session.clear();
  });

  test("le tre varianti hanno 2, 4 e 8 interfacce, tutte spente", () => {
    for (const interfaceCount of [2, 4, 8]) {
      session.addDevice({ kind: "router", interfaceCount }, { x: 100 * interfaceCount, y: 200 });
    }

    expect(session.view.devices.map((d) => [d.name, d.interfaces.length])).toEqual([
      ["R1", 2],
      ["R2", 4],
      ["R3", 8],
    ]);
    expect(session.view.devices.flatMap((d) => d.interfaces).every((p) => !p.enabled)).toBe(true);
  });

  test("un cavo verso un'interfaccia spenta lo dice, da quel capo", () => {
    session.addDevice({ kind: "host" }, { x: 100, y: 200 });
    session.addDevice({ kind: "router", interfaceCount: 2 }, { x: 400, y: 200 });
    const [pc, r] = session.view.devices.map((d) => d.id);

    session.connect(pc, r);

    expect(session.view.links[0]).toMatchObject({ fromOff: false, toOff: true, signal: false });
  });
});

describe("interfacce di un router, dal pannello", () => {
  beforeEach(() => {
    session.open("due-lan-router.netsim.json", routerFile);
  });

  test("l'interruttore spegne e riaccende, e il segnale sul cavo lo segue", () => {
    const cable = () => session.view.links.find((l) => l.id === "l3")!;
    expect(cable()).toMatchObject({ fromOff: false, signal: true });

    session.toggleInterface("r1", "Gi0/1");
    expect(port("Gi0/1").enabled).toBe(false);
    expect(cable()).toMatchObject({ fromOff: true, signal: false });

    session.toggleInterface("r1", "Gi0/1");
    expect(cable()).toMatchObject({ fromOff: false, signal: true });
  });

  test("spegnere un'interfaccia toglie la sua rete dalla tabella di routing", () => {
    session.toggleInterface("r1", "Gi0/1");

    expect(router().routingRows.map((row) => row.destination)).toEqual(["192.168.1.0/24"]);
  });

  test("accendere e spegnere si annullano", () => {
    session.toggleInterface("r1", "Gi0/1");

    session.undo();

    expect(port("Gi0/1").enabled).toBe(true);
  });

  test("un indirizzo nuovo viene accettato, e la tabella di routing si aggiorna", () => {
    expect(session.configureInterface("r1", "Gi0/0", "ip", "192.168.1.254")).toBeNull();

    expect(port("Gi0/0")).toMatchObject({ ip: "192.168.1.254", mask: "255.255.255.0", ipLabel: "192.168.1.254/24" });
  });

  test("un valore rifiutato restituisce il motivo, senza il nome del router, e nulla cambia", () => {
    expect(session.configureInterface("r1", "Gi0/0", "ip", "192.168.1.255")).toBe(
      "L'indirizzo 192.168.1.255 è l'indirizzo di broadcast della sottorete.",
    );
    expect(session.configureInterface("r1", "Gi0/0", "ip", "192.168.1.300")).toBe("Indirizzo IP non valido: 192.168.1.300.");
    expect(session.configureInterface("r1", "Gi0/0", "mask", "255.0.255.0")).toBe("Subnet mask non valida: 255.0.255.0.");
    expect(session.configureInterface("r1", "Gi0/1", "ip", "192.168.1.200")).toBe(
      "La rete di Gi0/1 (192.168.1.200) si sovrappone a quella di Gi0/0 (192.168.1.1).",
    );

    expect(port("Gi0/0").ip).toBe("192.168.1.1");
    expect(port("Gi0/1").ip).toBe("192.168.2.1");
    expect(session.notice).toBeNull();
  });

  test("svuotare l'indirizzo toglie anche la maschera; svuotare la sola maschera no", () => {
    expect(session.configureInterface("r1", "Gi0/0", "mask", "")).toBe(
      "Indirizzo IP e subnet mask vanno impostati insieme.",
    );

    expect(session.configureInterface("r1", "Gi0/0", "ip", "")).toBeNull();
    expect(port("Gi0/0")).toMatchObject({ ip: null, mask: null, ipLabel: null });
  });

  test("ciò che viene rifiutato non entra nella cronologia", () => {
    session.configureInterface("r1", "Gi0/0", "ip", "192.168.1.255");

    expect(session.canUndo).toBe(false);
  });
});

describe("maschera proposta su un'interfaccia", () => {
  beforeEach(() => {
    session.clear();
    session.addDevice({ kind: "router", interfaceCount: 4 }, { x: 300, y: 200 });
  });

  test("senza altre interfacce è quella della classe", () => {
    session.configureInterface("r1", "Gi0/0", "ip", "10.0.0.1");

    expect(port("Gi0/0").mask).toBe("255.0.0.0");
  });

  test("con il prefisso scritto nel campo, indirizzo e maschera si impostano insieme", () => {
    expect(session.configureInterface("r1", "Gi0/0", "ip", "10.0.0.1/30")).toBeNull();

    expect(port("Gi0/0")).toMatchObject({ ip: "10.0.0.1", mask: "255.255.255.252" });
  });

  test("il prefisso vale anche su un'interfaccia che ha già una maschera", () => {
    session.configureInterface("r1", "Gi0/0", "ip", "192.168.1.1");

    session.configureInterface("r1", "Gi0/0", "ip", "192.168.1.1/25");

    expect(port("Gi0/0").mask).toBe("255.255.255.128");
  });

  test("se la maschera della classe si sovrapporrebbe a un'altra interfaccia, si propone quella dell'altra", () => {
    session.configureInterface("r1", "Gi0/0", "ip", "10.0.0.1/30");

    expect(session.configureInterface("r1", "Gi0/1", "ip", "10.0.0.5")).toBeNull();

    expect(port("Gi0/1")).toMatchObject({ ip: "10.0.0.5", mask: "255.255.255.252" });
  });

  test("se anche così le reti si sovrappongono, l'indirizzo viene rifiutato", () => {
    session.configureInterface("r1", "Gi0/0", "ip", "10.0.0.1/30");

    expect(session.configureInterface("r1", "Gi0/1", "ip", "10.0.0.2")).toContain("si sovrappone");
    expect(port("Gi0/1").ip).toBeNull();
  });

  test("un prefisso impossibile non viene interpretato", () => {
    expect(session.configureInterface("r1", "Gi0/0", "ip", "10.0.0.1/40")).not.toBeNull();
    expect(port("Gi0/0").ip).toBeNull();
  });
});

describe("una rete con un router costruita a mano", () => {
  test("due PC, un router, tutto configurato dal pannello: il ping passa", () => {
    session.clear();
    session.addDevice({ kind: "host" }, { x: 100, y: 200 });
    session.addDevice({ kind: "router", interfaceCount: 2 }, { x: 400, y: 200 });
    session.addDevice({ kind: "host" }, { x: 700, y: 200 });
    const [pc1, r, pc2] = session.view.devices.map((d) => d.id);
    session.connect(pc1, r);
    session.connect(pc2, r);
    session.toggleInterface(r, "Gi0/0");
    session.toggleInterface(r, "Gi0/1");
    session.configureInterface(r, "Gi0/0", "ip", "192.168.1.1");
    session.configureInterface(r, "Gi0/1", "ip", "192.168.2.1");
    session.configure(pc1, "ip", "192.168.1.10");
    session.configure(pc1, "gateway", "192.168.1.1");
    session.configure(pc2, "ip", "192.168.2.10");
    session.configure(pc2, "gateway", "192.168.2.1");

    session.ping(pc1, "192.168.2.10", 1);
    while (session.view.nextEvent !== null) session.step();

    expect(session.view.pingResults.at(-1)).toMatchObject({ outcome: "reply", ttl: 127 });
  });
});
