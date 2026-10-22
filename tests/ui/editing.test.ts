import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { configureHost } from "../../src/engine/actions";
import { session } from "../../src/ui/session.svelte";

const PC = { kind: "host" } as const;
const SWITCH_8 = { kind: "switch", portCount: 8 } as const;

function names(): string[] {
  return session.view.devices.map((device) => device.name);
}

beforeEach(() => {
  session.clear();
});

describe("foglio vuoto", () => {
  test("all'inizio la rete è vuota, e si può già posare", () => {
    expect(session.isEmpty()).toBe(true);

    session.addDevice(PC, { x: 120, y: 200 });

    expect(session.isEmpty()).toBe(false);
    expect(names()).toEqual(["PC1"]);
  });
});

describe("posare dispositivi", () => {
  test("il dispositivo nasce nel punto indicato, e viene selezionato", () => {
    session.addDevice(PC, { x: 120.4, y: 199.6 });

    const pc = session.view.devices[0];
    expect([pc.x, pc.y]).toEqual([120, 200]); // coordinate intere
    expect(session.selection).toEqual({ kind: "device", id: pc.id });
  });

  test("un PC nuovo non è configurato e non sente il segnale", () => {
    session.addDevice(PC, { x: 100, y: 100 });

    expect(session.view.devices[0]).toMatchObject({ kind: "host", ipLabel: null, linkUp: false, powered: true });
  });

  test("uno switch nuovo ha le porte della variante scelta", () => {
    session.addDevice(SWITCH_8, { x: 300, y: 200 });
    session.addDevice({ kind: "switch", portCount: 24 }, { x: 500, y: 200 });

    expect(session.view.devices.map((d) => [d.name, d.portCount])).toEqual([
      ["SW1", 8],
      ["SW2", 24],
    ]);
  });

  test("posarne molti di fila dà loro nomi in sequenza", () => {
    for (let i = 0; i < 4; i++) session.addDevice(PC, { x: 100 + i * 100, y: 100 });

    expect(names()).toEqual(["PC1", "PC2", "PC3", "PC4"]);
  });

  test("posare un dispositivo compare nell'elenco degli eventi", () => {
    session.addDevice(PC, { x: 100, y: 100 });

    expect(session.view.events.map((e) => [e.deviceName, e.text])).toEqual([["PC1", "viene aggiunto alla rete"]]);
  });
});

describe("inquadratura", () => {
  test("finché la rete sta nel foglio, posare un dispositivo non la cambia", () => {
    const before = session.view.bounds;

    session.addDevice(PC, { x: 300, y: 200 });

    expect(session.view.bounds).toEqual(before);
  });

  test("un dispositivo posato fuori dal foglio lo allarga", () => {
    const before = session.view.bounds;

    session.addDevice(PC, { x: 1200, y: 200 });

    expect(session.view.bounds.width).toBeGreaterThan(before.width);
  });

  test("durante un trascinamento resta ferma, poi si riadatta", () => {
    session.addDevice(PC, { x: 300, y: 200 });
    const id = session.view.devices[0].id;
    session.holdBounds(true);
    const held = session.frozenBounds;

    session.moveDevice(id, { x: 1500, y: 200 });
    expect(session.frozenBounds).toEqual(held);

    session.holdBounds(false);
    expect(session.frozenBounds).toBeNull();
    expect(session.view.bounds.width).toBeGreaterThan(held!.width);
  });
});

describe("spostare", () => {
  test("il dispositivo cambia posizione, e i suoi cavi lo seguono", () => {
    session.open("lan-switch.netsim.json", lanFile);

    session.moveDevice("d1", { x: 150, y: 300 });

    const pc1 = session.view.devices.find((d) => d.id === "d1")!;
    const cable = session.view.links.find((l) => l.id === "l1")!;
    expect([pc1.x, pc1.y]).toEqual([150, 300]);
    expect(cable.from).toEqual({ x: 150, y: 300 });
  });

  test("spostare non tocca la simulazione", () => {
    session.open("lan-switch.netsim.json", lanFile);
    session.ping("d1", "192.168.1.11", 1);
    const events = session.view.events.length;

    session.moveDevice("d1", { x: 150, y: 300 });

    expect(session.view.events.length).toBe(events);
    expect(session.view.packets).toHaveLength(1);
  });
});

describe("eliminare", () => {
  beforeEach(() => {
    session.open("lan-switch.netsim.json", lanFile);
  });

  test("senza selezione non succede nulla", () => {
    session.removeSelection();

    expect(names()).toEqual(["SW1", "PC1", "PC2", "PC3"]);
  });

  test("un dispositivo sparisce con i suoi cavi, e la selezione si toglie", () => {
    session.select({ kind: "device", id: "d2" });

    session.removeSelection();

    expect(names()).toEqual(["SW1", "PC1", "PC3"]);
    expect(session.view.links.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(session.selection).toBeNull();
  });

  test("con lui spariscono la sua tabella appuntata e il suo terminale", () => {
    session.togglePin("d2");
    session.openTerminal("d2");
    session.select({ kind: "device", id: "d2" });

    session.removeSelection();

    expect(session.pins).toEqual([]);
    expect(session.terminals).toEqual([]);
    expect(session.activeTab).toBe("events");
  });

  test("un cavo sparisce, e i dispositivi restano", () => {
    session.select({ kind: "link", id: "l2" });

    session.removeSelection();

    expect(session.view.links.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(names()).toEqual(["SW1", "PC1", "PC2", "PC3"]);
    expect(session.view.devices.find((d) => d.id === "d2")!.linkUp).toBe(false);
  });

  test("l'elenco degli eventi continua a funzionare dopo un'eliminazione", () => {
    session.ping("d1", "192.168.1.11", 1);
    while (session.view.nextEvent !== null) session.step();
    session.select({ kind: "device", id: "d2" });

    session.removeSelection();

    const texts = session.view.events.map((e) => e.text);
    expect(texts).toContain("PC2 viene tolto dalla rete");
    expect(texts).toContain("cavo tra PC2 e SW1 tolto");
    // Le righe vecchie che parlavano di PC2 non rimandano più a un dispositivo.
    expect(session.view.events.every((e) => e.deviceId !== "d2")).toBe(true);
  });

  test("a simulazione sospesa l'eliminazione viene rifiutata, e lo dice", () => {
    session.select({ kind: "device", id: "d2" });
    session.togglePin("d2");
    // Si sospende la simulazione dall'interno, come farebbe una tempesta.
    (session as any).simulator.suspended = true;

    session.removeSelection();

    expect(session.notice).toContain("La simulazione è sospesa");
    expect(names()).toContain("PC2");
    expect(session.selection).toEqual({ kind: "device", id: "d2" });
    expect(session.isPinned("d2")).toBe(true);
    expect(session.view.devices.find((d) => d.id === "d2")).toMatchObject({ x: 600, y: 60 });
  });
});

describe("cavi", () => {
  // Due PC e uno switch a 8 porte, non ancora collegati.
  function threeDevices(): { pc1: string; pc2: string; sw: string } {
    session.addDevice(PC, { x: 150, y: 250 });
    session.addDevice(PC, { x: 650, y: 250 });
    session.addDevice(SWITCH_8, { x: 400, y: 250 });
    const [pc1, pc2, sw] = session.view.devices.map((device) => device.id);
    return { pc1, pc2, sw };
  }

  test("collegare due dispositivi usa la prima porta libera di ciascuno", () => {
    const { pc1, pc2, sw } = threeDevices();

    session.connect(pc1, sw);
    session.connect(pc2, sw);

    expect(session.view.links.map((l) => [l.fromName, l.fromPort, l.toName, l.toPort])).toEqual([
      ["PC1", "Fa0", "SW1", "Fa0/1"],
      ["PC2", "Fa0", "SW1", "Fa0/2"],
    ]);
  });

  test("il cavo nuovo viene selezionato, e i due capi sentono il segnale", () => {
    const { pc1, sw } = threeDevices();

    session.connect(pc1, sw);

    const cable = session.view.links[0];
    expect(session.selection).toEqual({ kind: "link", id: cable.id });
    expect(cable.signal).toBe(true);
    expect(session.view.devices.find((d) => d.id === pc1)!.linkUp).toBe(true);
  });

  test("un dispositivo senza porte libere non si può collegare, e lo dice", () => {
    const { pc1, pc2, sw } = threeDevices();
    session.connect(pc1, sw);

    session.connect(pc1, pc2);

    expect(session.notice).toBe("PC1 non ha porte libere.");
    expect(session.view.links).toHaveLength(1);
  });

  test("un dispositivo non si collega a sé stesso", () => {
    const { sw } = threeDevices();

    session.connect(sw, sw);

    expect(session.notice).toBe("Un cavo unisce due dispositivi diversi.");
    expect(session.view.links).toHaveLength(0);
  });

  test("Collega: si sceglie il primo dispositivo, poi il secondo", () => {
    const { pc1, sw } = threeDevices();

    session.armLink(pc1);
    expect(session.linkFrom).toBe(pc1);
    session.connectTo(sw);

    expect(session.linkFrom).toBeNull();
    expect(session.view.links).toHaveLength(1);
  });

  test("indicare di nuovo il dispositivo di partenza annulla", () => {
    const { pc1 } = threeDevices();
    session.armLink(pc1);

    session.connectTo(pc1);

    expect(session.linkFrom).toBeNull();
    expect(session.notice).toBeNull();
    expect(session.view.links).toHaveLength(0);
  });

  test("premere Ping lascia andare il cavo cominciato, e viceversa", () => {
    const { pc1 } = threeDevices();

    session.armLink(pc1);
    session.armPing(pc1);
    expect(session.linkFrom).toBeNull();

    session.armLink(pc1);
    expect(session.pingFrom).toBeNull();
  });

  test("a ogni capo si può scegliere tra la porta attuale e quelle libere", () => {
    const { pc1, pc2, sw } = threeDevices();
    session.connect(pc1, sw);
    session.connect(pc2, sw);

    const [first, second] = session.view.links;

    expect(first.fromChoices).toEqual(["Fa0"]);
    expect(first.toChoices).toEqual(["Fa0/1", "Fa0/3", "Fa0/4", "Fa0/5", "Fa0/6", "Fa0/7", "Fa0/8"]);
    expect(second.toChoices).toEqual(["Fa0/2", "Fa0/3", "Fa0/4", "Fa0/5", "Fa0/6", "Fa0/7", "Fa0/8"]);
  });

  test("cambiare porta sposta quel capo e libera la porta di prima", () => {
    const { pc1, sw } = threeDevices();
    session.connect(pc1, sw);
    const id = session.view.links[0].id;

    session.changePort(id, "b", "Fa0/5");

    const cable = session.view.links[0];
    expect(cable.toPort).toBe("Fa0/5");
    expect(cable.toChoices).toContain("Fa0/1");
    expect(session.selection).toEqual({ kind: "link", id });
  });

  test("una porta occupata viene rifiutata, e lo dice", () => {
    const { pc1, pc2, sw } = threeDevices();
    session.connect(pc1, sw);
    session.connect(pc2, sw);

    session.changePort(session.view.links[1].id, "b", "Fa0/1");

    expect(session.notice).not.toBeNull();
    expect(session.view.links[1].toPort).toBe("Fa0/2");
  });

  test("l'elenco delle porte si apre su un capo, seleziona il cavo, e si richiude", () => {
    const { pc1, sw } = threeDevices();
    session.connect(pc1, sw);
    const id = session.view.links[0].id;
    session.select(null);

    session.openPortMenu(id, "b");
    expect(session.portMenu).toEqual({ linkId: id, end: "b" });
    expect(session.selection).toEqual({ kind: "link", id });

    session.openPortMenu(id, "b");
    expect(session.portMenu).toBeNull();
  });

  test("su una rete costruita a mano il ping arriva", () => {
    const { pc1, pc2, sw } = threeDevices();
    session.connect(pc1, sw);
    session.connect(pc2, sw);
    // La configurazione dal pannello non c'è ancora: si passa dal motore.
    const simulator = (session as any).simulator;
    simulator.dispatch(configureHost(pc1, { ip: "192.168.1.10", mask: "255.255.255.0", gateway: null }));
    simulator.dispatch(configureHost(pc2, { ip: "192.168.1.11", mask: "255.255.255.0", gateway: null }));

    session.ping(pc1, "192.168.1.11", 1);
    while (session.view.nextEvent !== null) session.step();

    expect(session.view.pingResults.map((r) => r.outcome)).toEqual(["reply"]);
  });
});

describe("configurare dal pannello", () => {
  let pc: string;

  function host() {
    return session.view.devices.find((device) => device.id === pc)!;
  }

  beforeEach(() => {
    session.addDevice(PC, { x: 200, y: 200 });
    pc = session.view.devices[0].id;
  });

  test("scritto l'indirizzo, la maschera proposta è quella della sua classe", () => {
    expect(session.configure(pc, "ip", "192.168.1.10")).toBeNull();

    expect(host()).toMatchObject({ ip: "192.168.1.10", mask: "255.255.255.0", ipLabel: "192.168.1.10/24" });
  });

  test("la maschera proposta si può cambiare, e poi non viene più toccata", () => {
    session.configure(pc, "ip", "10.0.0.5");
    session.configure(pc, "mask", "255.255.255.0");

    session.configure(pc, "ip", "172.16.0.9");

    expect(host()).toMatchObject({ ip: "172.16.0.9", mask: "255.255.255.0" });
  });

  test("un valore rifiutato restituisce il motivo, e la rete tiene quello di prima", () => {
    session.configure(pc, "ip", "192.168.1.10");

    expect(session.configure(pc, "ip", "192.168.1.255")).toBe(
      "L'indirizzo 192.168.1.255 è l'indirizzo di broadcast della sottorete.",
    );
    expect(session.configure(pc, "mask", "255.0.255.0")).toBe("Subnet mask non valida: 255.0.255.0.");
    expect(session.configure(pc, "gateway", "192.168.1")).toBe("Gateway non valido: 192.168.1.");

    expect(host()).toMatchObject({ ip: "192.168.1.10", mask: "255.255.255.0", gateway: null });
    expect(session.notice).toBeNull(); // il motivo sta sotto il campo, non in alto
  });

  test("un indirizzo senza maschera da proporre viene rifiutato per il suo vero difetto", () => {
    expect(session.configure(pc, "ip", "192.168.1.300")).toBe("Indirizzo IP non valido: 192.168.1.300.");
    expect(session.configure(pc, "ip", "224.0.0.1")).toContain("L'indirizzo 224.0.0.1");
    expect(session.configure(pc, "ip", "127.0.0.1")).toContain("L'indirizzo 127.0.0.1");
    expect(host().ip).toBeNull();
  });

  test("il gateway si imposta e si toglie", () => {
    session.configure(pc, "ip", "192.168.1.10");

    expect(session.configure(pc, "gateway", " 192.168.1.1 ")).toBeNull();
    expect(host().gateway).toBe("192.168.1.1");

    expect(session.configure(pc, "gateway", "")).toBeNull();
    expect(host().gateway).toBeNull();
  });

  test("svuotare l'indirizzo toglie tutta la configurazione", () => {
    session.configure(pc, "ip", "192.168.1.10");
    session.configure(pc, "gateway", "192.168.1.1");

    expect(session.configure(pc, "ip", "")).toBeNull();

    expect(host()).toMatchObject({ ip: null, mask: null, gateway: null, ipLabel: null });
  });

  test("svuotare la sola maschera viene rifiutato", () => {
    session.configure(pc, "ip", "192.168.1.10");

    expect(session.configure(pc, "mask", "")).toBe("Indirizzo IP e subnet mask vanno impostati insieme.");
    expect(host().mask).toBe("255.255.255.0");
  });

  test("uno switch non ha una configurazione IP", () => {
    session.addDevice(SWITCH_8, { x: 400, y: 200 });

    expect(session.configure(session.view.devices[1].id, "ip", "192.168.1.1")).not.toBeNull();
  });

  test("due PC posati, collegati e configurati a mano si rispondono", () => {
    session.addDevice(PC, { x: 500, y: 200 });
    const other = session.view.devices[1].id;
    session.connect(pc, other);
    session.configure(pc, "ip", "192.168.1.10");
    session.configure(other, "ip", "192.168.1.11");

    session.ping(pc, "192.168.1.11", 1);
    while (session.view.nextEvent !== null) session.step();

    expect(session.view.pingResults.map((r) => r.outcome)).toEqual(["reply"]);
  });
});

describe("rinominare dal pannello", () => {
  beforeEach(() => {
    session.addDevice(PC, { x: 200, y: 200 });
    session.addDevice(PC, { x: 400, y: 200 });
  });

  test("il nome nuovo compare sul disegno e nella scheda del terminale", () => {
    const id = session.view.devices[0].id;
    session.openTerminal(id);

    expect(session.rename(id, "  Segreteria ")).toBeNull();

    expect(names()).toEqual(["Segreteria", "PC2"]);
  });

  test("un nome vuoto o già usato viene rifiutato, con il motivo", () => {
    const id = session.view.devices[0].id;

    expect(session.rename(id, "   ")).toBe("Il nome non può essere vuoto.");
    expect(session.rename(id, "pc2")).toBe("Esiste già un dispositivo di nome pc2.");

    expect(names()).toEqual(["PC1", "PC2"]);
  });
});

describe("server", () => {
  test("si posa come un PC, con il suo nome e il suo terminale", () => {
    session.clear();
    session.addDevice({ kind: "server" }, { x: 300, y: 200 });
    const server = session.view.devices[0];
    expect(server).toMatchObject({ kind: "host", role: "server", name: "SRV1" });

    session.configure(server.id, "ip", "192.168.1.100");
    session.openTerminal(server.id);
    session.execute(server.id, "ping -n 1 127.0.0.1");

    expect(session.view.devices[0].ipLabel).toBe("192.168.1.100/24");
    const [entry] = session.terminals[0].entries;
    expect(session.outputOf(server.id, entry).join("\n")).toContain("Reply from 127.0.0.1");
  });

  test("un PC resta un PC", () => {
    session.clear();
    session.addDevice(PC, { x: 100, y: 100 });

    expect(session.view.devices[0].role).toBe("pc");
  });
});

describe("griglia magnetica", () => {
  test("spenta, un dispositivo resta dove lo si posa e dove lo si porta", () => {
    session.addDevice(PC, { x: 127, y: 193 });
    const id = session.view.devices[0].id;
    session.moveDevice(id, { x: 251, y: 309 });

    const pc = session.view.devices[0];
    expect([pc.x, pc.y]).toEqual([251, 309]);
  });

  test("accesa, posare e trascinare portano al punto della griglia più vicino", () => {
    session.grid = true;

    session.addDevice(PC, { x: 127, y: 193 });
    const id = session.view.devices[0].id;
    expect([session.view.devices[0].x, session.view.devices[0].y]).toEqual([120, 200]);

    session.moveDevice(id, { x: 251, y: 309 });
    expect([session.view.devices[0].x, session.view.devices[0].y]).toEqual([260, 300]);
    session.grid = false;
  });

  test("accenderla non sposta i dispositivi già posati", () => {
    session.addDevice(PC, { x: 127, y: 193 });

    session.grid = true;

    expect([session.view.devices[0].x, session.view.devices[0].y]).toEqual([127, 193]);
    session.grid = false;
  });

  test("è una scelta di chi disegna: Nuova e Apri non la cambiano", () => {
    session.grid = true;

    session.clear();
    session.open("lan-switch.netsim.json", lanFile);

    expect(session.grid).toBe(true);
    session.grid = false;
  });
});

describe("duplicare", () => {
  function device(name: string) {
    return session.view.devices.find((d) => d.name === name)!;
  }

  test("la copia nasce a destra dell'originale, selezionata, con l'indirizzo successivo", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.configure(device("PC1").id, "ip", "192.168.1.10");

    session.duplicate(device("PC1").id);

    const copy = device("PC2");
    expect([copy.x, copy.y]).toEqual([240, 100]);
    expect(copy.ipLabel).toBe("192.168.1.11/24");
    expect(session.selection).toEqual({ kind: "device", id: copy.id });
  });

  test("duplicando ancora la copia selezionata, le copie si mettono in fila", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.configure(device("PC1").id, "ip", "192.168.1.10");

    for (let i = 0; i < 3; i++) {
      const selected = session.selection as { kind: "device"; id: string };
      session.duplicate(selected.id);
    }

    expect(["PC2", "PC3", "PC4"].map((n) => [device(n).x, device(n).ipLabel])).toEqual([
      [240, "192.168.1.11/24"],
      [380, "192.168.1.12/24"],
      [520, "192.168.1.13/24"],
    ]);
  });

  test("la copia salta i posti già occupati", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.addDevice(SWITCH_8, { x: 250, y: 95 });

    session.duplicate(device("PC1").id);

    expect([device("PC2").x, device("PC2").y]).toEqual([380, 100]);
  });

  test("un solo Annulla toglie la copia", () => {
    session.addDevice(PC, { x: 100, y: 100 });
    session.duplicate(device("PC1").id);

    session.undo();

    expect(names()).toEqual(["PC1"]);
  });
});
