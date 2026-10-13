import { describe, expect, test } from "vitest";
import {
  addHost,
  addLink,
  addRouter,
  configureHost,
  disconnectLink,
  ping,
} from "../../src/engine/actions";
import type { Router, Switch } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { configure, describeDevice } from "../../src/shell/ios/configure";
import { interpret } from "../../src/shell/ios/interpreter";
import { INITIAL_STATE, promptOf, type CliState } from "../../src/shell/ios/modes";
import { buildLan, buildTwoLans } from "../engine/builders";

// Una sessione della CLI su un dispositivo: scrive una riga, esegue
// l'azione che ne esce, e restituisce ciò che viene stampato.
function cliOn(sim: Simulator, deviceId: string) {
  let state: CliState = INITIAL_STATE;
  const device = () => sim.network.devices.find((d) => d.id === deviceId) as Router | Switch;

  function type(line: string): string[] {
    const outcome = interpret(describeDevice(device()), state, line);
    state = outcome.state;
    if (outcome.command === null) return outcome.lines;
    const configured = configure(outcome.command, sim.network, deviceId, state.interfaceName);
    if (configured?.action != null) sim.dispatch(configured.action);
    return [...outcome.lines, ...(configured?.lines ?? [])];
  }

  return {
    type,
    // Scrive più righe, e restituisce tutto ciò che è stato stampato.
    script: (lines: string[]) => lines.flatMap(type),
    prompt: () => promptOf(device().name, state.mode),
  };
}

function run(sim: Simulator): void {
  while (sim.canStep()) sim.step();
}

describe("hostname", () => {
  test("cambia il nome del dispositivo, e con lui il prompt", () => {
    const { sim, r1 } = buildTwoLans();
    const cli = cliOn(sim, "r1");

    cli.script(["enable", "configure terminal", "hostname Aula-3"]);

    expect(r1.name).toBe("Aula-3");
    expect(cli.prompt()).toBe("Aula-3(config)#");
  });

  test("un nome già usato da un altro dispositivo viene rifiutato", () => {
    const { sim, r1 } = buildTwoLans();
    const cli = cliOn(sim, "r1");

    const printed = cli.script(["enable", "configure terminal", "hostname pc2"]).slice(1);

    expect(printed).toEqual(['% Hostname "pc2" is already in use']);
    expect(r1.name).toBe("R1");
  });

  test("un nome deve cominciare con una lettera e contenere solo lettere, cifre e trattini", () => {
    const { sim, r1 } = buildTwoLans();
    const cli = cliOn(sim, "r1");
    cli.script(["enable", "configure terminal"]);

    expect(cli.type("hostname 1piano")).toEqual(["% Hostname contains one or more illegal characters."]);
    expect(cli.type("hostname aula_3")).toEqual(["% Hostname contains one or more illegal characters."]);
    expect(r1.name).toBe("R1");
  });
});

describe("ip address", () => {
  function onInterface(name = "Gi0/0") {
    const built = buildTwoLans();
    const cli = cliOn(built.sim, "r1");
    cli.script(["enable", "configure terminal", `interface ${name}`]);
    return { ...built, cli };
  }

  test("imposta indirizzo e maschera dell'interfaccia selezionata", () => {
    const { cli, r1 } = onInterface("Gi0/1");

    expect(cli.type("ip address 172.16.0.1 255.255.0.0")).toEqual([]);

    expect(r1.ports.map((p) => [p.name, p.ip, p.mask])).toEqual([
      ["Gi0/0", "192.168.1.1", "255.255.255.0"],
      ["Gi0/1", "172.16.0.1", "255.255.0.0"],
    ]);
  });

  test("no ip address lo toglie", () => {
    const { cli, r1 } = onInterface();

    cli.type("no ip address");

    expect([r1.ports[0].ip, r1.ports[0].mask]).toEqual([null, null]);
  });

  test("una maschera con i bit non contigui viene rifiutata, in esadecimale", () => {
    const { cli, r1 } = onInterface();

    expect(cli.type("ip address 10.0.0.1 255.0.255.0")).toEqual(["Bad mask 0xFF00FF00 for address 10.0.0.1"]);
    expect(r1.ports[0].ip).toBe("192.168.1.1");
  });

  test("l'indirizzo di rete e quello di broadcast vengono rifiutati", () => {
    const { cli } = onInterface();

    expect(cli.type("ip address 10.0.0.0 255.255.255.0")).toEqual(["Bad mask /24 for address 10.0.0.0"]);
    expect(cli.type("ip address 10.0.0.255 255.255.255.0")).toEqual(["Bad mask /24 for address 10.0.0.255"]);
  });

  test("un indirizzo che non può essere di un dispositivo viene rifiutato", () => {
    const { cli } = onInterface();

    expect(cli.type("ip address 127.0.0.1 255.0.0.0")).toEqual(["Not a valid host address - 127.0.0.1"]);
    expect(cli.type("ip address 224.0.0.5 255.255.255.0")).toEqual(["Not a valid host address - 224.0.0.5"]);
  });

  test("una rete che si sovrappone a quella di un'altra interfaccia viene rifiutata", () => {
    const { cli, r1 } = onInterface("Gi0/1");

    expect(cli.type("ip address 192.168.1.129 255.255.255.128")).toEqual([
      "% 192.168.1.0 overlaps with GigabitEthernet0/0",
    ]);
    expect(r1.ports[1].ip).toBe("192.168.2.1");
  });

  test("due sottoreti piccole della stessa rete vanno bene", () => {
    const { cli, r1 } = onInterface("Gi0/0");
    cli.type("ip address 10.0.0.1 255.255.255.252");
    cli.type("interface Gi0/1");

    expect(cli.type("ip address 10.0.0.5 255.255.255.252")).toEqual([]);
    expect(r1.ports.map((p) => p.ip)).toEqual(["10.0.0.1", "10.0.0.5"]);
  });
});

describe("shutdown e no shutdown", () => {
  test("spegnere un'interfaccia collegata toglie il segnale, e IOS lo dice in due righe", () => {
    const { sim, r1, pc1 } = buildTwoLans();
    const cli = cliOn(sim, "r1");

    const printed = cli.script(["enable", "conf t", "int gi0/0", "shutdown"]).slice(1);

    expect(printed).toEqual([
      "%LINK-5-CHANGED: Interface GigabitEthernet0/0, changed state to administratively down",
      "%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/0, changed state to down",
    ]);
    expect(r1.ports[0].enabled).toBe(false);
    expect(pc1.linkUp).toBe(false);
  });

  test("riaccenderla riporta il segnale", () => {
    const { sim, pc1 } = buildTwoLans();
    const cli = cliOn(sim, "r1");
    cli.script(["enable", "conf t", "int gi0/0", "shutdown"]);

    expect(cli.type("no shutdown")).toEqual([
      "%LINK-5-CHANGED: Interface GigabitEthernet0/0, changed state to up",
      "%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/0, changed state to up",
    ]);
    expect(pc1.linkUp).toBe(true);
  });

  test("accesa un'interfaccia senza segnale dall'altra parte, il collegamento resta giù", () => {
    const { sim } = buildTwoLans();
    const cli = cliOn(sim, "r1");
    cli.script(["enable", "conf t", "int gi0/0", "shutdown"]);
    sim.dispatch(disconnectLink("l1"));

    expect(cli.type("no shutdown")).toEqual(["%LINK-5-CHANGED: Interface GigabitEthernet0/0, changed state to down"]);
  });

  test("ripetere il comando non fa e non dice nulla", () => {
    const { sim } = buildTwoLans();
    const cli = cliOn(sim, "r1");
    cli.script(["enable", "conf t", "int gi0/0"]);
    const before = sim.traces.length;

    expect(cli.type("no shutdown")).toEqual([]);
    expect(sim.traces.length).toBe(before);
  });

  test("sullo switch spegne una porta", () => {
    const { sim, sw, pc1, pc2 } = buildLan();
    const cli = cliOn(sim, "s1");

    const printed = cli.script(["enable", "conf t", "int fa0/1", "shut"]).slice(1);

    expect(printed[0]).toBe("%LINK-5-CHANGED: Interface FastEthernet0/1, changed state to administratively down");
    expect(sw.ports[0].enabled).toBe(false);
    expect([pc1.linkUp, pc2.linkUp]).toEqual([false, true]);
  });
});

describe("ip route", () => {
  const ROUTE = { network: "10.1.0.0", mask: "255.255.0.0", nextHop: "192.168.2.2" };

  function inConfig() {
    const built = buildTwoLans();
    const cli = cliOn(built.sim, "r1");
    cli.script(["enable", "configure terminal"]);
    return { ...built, cli };
  }

  test("aggiunge una rotta statica, e no ip route la toglie", () => {
    const { cli, r1 } = inConfig();

    expect(cli.type("ip route 10.1.0.0 255.255.0.0 192.168.2.2")).toEqual([]);
    expect(r1.routes).toEqual([ROUTE]);

    expect(cli.type("no ip route 10.1.0.0 255.255.0.0 192.168.2.2")).toEqual([]);
    expect(r1.routes).toEqual([]);
  });

  test("riscrivere una rotta che c'è già non cambia nulla e non è un errore", () => {
    const { cli, r1 } = inConfig();
    cli.type("ip route 10.1.0.0 255.255.0.0 192.168.2.2");

    expect(cli.type("ip route 10.1.0.0 255.255.0.0 192.168.2.2")).toEqual([]);
    expect(r1.routes).toEqual([ROUTE]);
  });

  test("una rete che non torna con la maschera viene rifiutata", () => {
    const { cli, r1 } = inConfig();

    expect(cli.type("ip route 10.1.0.5 255.255.0.0 192.168.2.2")).toEqual(["%Inconsistent address and mask"]);
    expect(cli.type("ip route 10.1.0.0 255.0.255.0 192.168.2.2")).toEqual(["%Inconsistent address and mask"]);
    expect(r1.routes).toEqual([]);
  });

  test("il prossimo salto non può essere un indirizzo del router stesso", () => {
    const { cli, r1 } = inConfig();

    expect(cli.type("ip route 10.1.0.0 255.255.0.0 192.168.2.1")).toEqual([
      "%Invalid next hop address (it's this router)",
    ]);
    expect(r1.routes).toEqual([]);
  });

  test("togliere una rotta che non c'è viene segnalato", () => {
    const { cli } = inConfig();

    expect(cli.type("no ip route 10.1.0.0 255.255.0.0 192.168.2.2")).toEqual(["%No matching route to delete"]);
  });
});

describe("i comandi che non configurano", () => {
  test("show e ping non sono affare di questo passaggio", () => {
    const { sim } = buildTwoLans();

    expect(configure({ kind: "show", topic: "ip-route" }, sim.network, "r1", null)).toBeNull();
    expect(configure({ kind: "ping", target: "192.168.2.10" }, sim.network, "r1", null)).toBeNull();
  });
});

describe("la lezione sul routing statico, tutta da CLI", () => {
  // PC1 192.168.1.10 ── [R1] 10.0.0.1 ── 10.0.0.2 [R2] ── PC2 192.168.2.10
  function emptyRouters() {
    const sim = new Simulator({ devices: [], links: [] });
    sim.dispatch(addHost()); // d1, PC1
    sim.dispatch(addHost()); // d2, PC2
    sim.dispatch(addRouter(2)); // r1
    sim.dispatch(addRouter(2)); // r2
    sim.dispatch(addLink({ deviceId: "d1", portName: "Fa0" }, { deviceId: "r1", portName: "Gi0/0" }));
    sim.dispatch(addLink({ deviceId: "r1", portName: "Gi0/1" }, { deviceId: "r2", portName: "Gi0/0" }));
    sim.dispatch(addLink({ deviceId: "r2", portName: "Gi0/1" }, { deviceId: "d2", portName: "Fa0" }));
    sim.dispatch(configureHost("d1", { ip: "192.168.1.10", mask: "255.255.255.0", gateway: "192.168.1.1" }));
    sim.dispatch(configureHost("d2", { ip: "192.168.2.10", mask: "255.255.255.0", gateway: "192.168.2.1" }));
    return sim;
  }

  function pingOutcomes(sim: Simulator): string[] {
    const from = sim.traces.length;
    sim.dispatch(ping("d1", "192.168.2.10", 1));
    run(sim);
    return sim.traces.slice(from).filter((t) => t.kind === "ping-result").map((t) => t.outcome);
  }

  test("configurati i due router dal terminale, il ping tra i PC passa", () => {
    const sim = emptyRouters();

    cliOn(sim, "r1").script([
      "en",
      "conf t",
      "int gi0/0",
      "ip add 192.168.1.1 255.255.255.0",
      "no shut",
      "int gi0/1",
      "ip add 10.0.0.1 255.255.255.252",
      "no shut",
    ]);
    cliOn(sim, "r2").script([
      "en",
      "conf t",
      "int gi0/0",
      "ip add 10.0.0.2 255.255.255.252",
      "no shut",
      "int gi0/1",
      "ip add 192.168.2.1 255.255.255.0",
      "no shut",
    ]);
    // Senza rotte R1 non conosce la rete di PC2.
    expect(pingOutcomes(sim)).toEqual(["net-unreachable"]);

    cliOn(sim, "r1").script(["en", "conf t", "ip route 192.168.2.0 255.255.255.0 10.0.0.2"]);
    cliOn(sim, "r2").script(["en", "conf t", "ip route 192.168.1.0 255.255.255.0 10.0.0.1"]);

    expect(pingOutcomes(sim)).toEqual(["reply"]);
  });
});
