// I nuovi esiti dei ping lanciati dalla barretta (U-1 del collaudo UX 5,
// D-136): la scheda Eventi dice quanti sono finché non la si guarda.
//
// La sessione conta i ping, per il numero della loro conversazione, e
// legge gli esiti dalla vista: qui si controlla che conti quelli giusti,
// una volta sola, e che li dimentichi quando non valgono più. Il gesto di
// "guardare la scheda" è markResultsSeen, che la fascia chiama quando la
// scheda Eventi è in vista.

import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";

function runToEnd(): void {
  while (session.view.nextEvent !== null) session.step();
}

function pingFromBar(from: string, to: string): void {
  session.armPing(from);
  session.pingTo(to);
}

beforeEach(() => {
  session.open("lan-switch.netsim.json", lanFile);
});

describe("un ping dalla barretta", () => {
  test("è nuovo solo quando la simulazione ne produce l'esito, non quando parte", () => {
    pingFromBar("d1", "d2");
    expect(session.newResults).toBe(0);
    // A metà strada, dopo la richiesta ARP e qualche frame: ancora nulla.
    session.step();
    session.step();
    expect(session.newResults).toBe(0);
    runToEnd();
    expect(session.view.pingResults.map((r) => r.outcome)).toEqual(["reply"]);
    expect(session.newResults).toBe(1);
  });

  test("conta un ping, non i frame ARP e ICMP né le risposte che lo compongono", () => {
    pingFromBar("d1", "d2");
    runToEnd();
    const frames = session.view.events.filter((event) => event.protocol !== null).length;
    expect(frames).toBeGreaterThan(3);
    expect(session.newResults).toBe(1);
  });

  test("anche una richiesta scaduta è un esito nuovo, come una risposta", () => {
    pingFromBar("d1", "d2");
    runToEnd();
    session.markResultsSeen();
    // PC2 spento, ma PC1 ne conosce già il MAC: l'echo parte e non torna.
    session.togglePower("d2");
    pingFromBar("d1", "d2");
    runToEnd();
    expect(session.view.pingResults.at(-1)?.outcome).toBe("timeout");
    expect(session.newResults).toBe(1);
  });

  test("in pausa resta in attesa; riprendendo, l'esito arriva e diventa nuovo", () => {
    pingFromBar("d1", "d2");
    session.step();
    // Il tempo è fermo: nessun esito, per quanto si aspetti.
    expect(session.newResults).toBe(0);
    expect(session.view.pingResults).toEqual([]);
    runToEnd();
    expect(session.newResults).toBe(1);
  });

  test("due ping distinti, con la scheda non in vista, sono due esiti nuovi", () => {
    pingFromBar("d1", "d2");
    session.step();
    pingFromBar("d1", "d2");
    runToEnd();
    expect(session.view.pingResults).toHaveLength(2);
    expect(session.newResults).toBe(2);
  });

  test("con i ping contemporanei di B-1 ciascun esito resta del suo ping", () => {
    pingFromBar("d1", "d2");
    session.step();
    pingFromBar("d1", "d3");
    runToEnd();
    expect(session.barPings).toEqual([1, 2]);
    expect(session.view.pingResults.map((r) => r.conversationId).sort()).toEqual([1, 2]);
    expect(session.newResults).toBe(2);
  });

  test("un ping verso chi non ha un indirizzo non parte, e non si conta", () => {
    session.open("due-lan-router.netsim.json", routerFile);
    const sw = session.view.devices.find((d) => d.kind === "switch")!;
    const pc = session.view.devices.find((d) => d.kind === "host")!;
    pingFromBar(pc.id, sw.id);
    expect(session.notice).not.toBeNull();
    expect(session.barPings).toEqual([]);
  });
});

describe("un ping dal terminale", () => {
  test("non si conta: il suo esito si legge già nel terminale", () => {
    session.openTerminal("d1");
    session.execute("d1", "ping -n 1 192.168.1.11");
    runToEnd();
    expect(session.view.pingResults).toHaveLength(1);
    expect(session.newResults).toBe(0);
  });

  test("insieme a uno dalla barretta, si conta solo quello della barretta", () => {
    session.openTerminal("d1");
    session.execute("d1", "ping -n 2 192.168.1.11");
    session.step();
    pingFromBar("d1", "d2");
    runToEnd();
    expect(session.view.pingResults).toHaveLength(3);
    expect(session.newResults).toBe(1);
  });
});

describe("gli esiti già visti", () => {
  test("guardando la scheda Eventi spariscono, e non tornano", () => {
    pingFromBar("d1", "d2");
    runToEnd();
    session.markResultsSeen();
    expect(session.newResults).toBe(0);
    // Altri passi, o un'altra occhiata, non li fanno tornare.
    session.step();
    session.markResultsSeen();
    expect(session.newResults).toBe(0);
  });

  test("guardare la scheda prima dell'esito non lo segna come visto", () => {
    pingFromBar("d1", "d2");
    session.step();
    session.markResultsSeen();
    runToEnd();
    expect(session.newResults).toBe(1);
  });

  test("dopo averli visti, un ping nuovo conta da uno", () => {
    pingFromBar("d1", "d2");
    runToEnd();
    session.markResultsSeen();
    pingFromBar("d1", "d3");
    runToEnd();
    expect(session.newResults).toBe(1);
  });

  test("cambiare il filtro per conversazione o per protocollo non li fa tornare", () => {
    pingFromBar("d1", "d2");
    runToEnd();
    session.markResultsSeen();
    session.followed = 1;
    session.protocols.ARP = false;
    session.protocols.ICMP = false;
    expect(session.newResults).toBe(0);
    session.followed = null;
    session.protocols.ARP = true;
    session.protocols.ICMP = true;
    expect(session.newResults).toBe(0);
  });

  test("Ricomincia li dimentica, visti o no", () => {
    pingFromBar("d1", "d2");
    runToEnd();
    session.restart();
    expect(session.newResults).toBe(0);
    expect(session.barPings).toEqual([]);
    // Un ping dal terminale dopo Ricomincia riprende il numero 1: non è un vecchio ping della barretta.
    session.openTerminal("d1");
    session.execute("d1", "ping -n 1 192.168.1.11");
    runToEnd();
    expect(session.newResults).toBe(0);
  });

  test("aprire un'altra rete li dimentica", () => {
    pingFromBar("d1", "d2");
    runToEnd();
    session.open("due-lan-router.netsim.json", routerFile);
    expect(session.newResults).toBe(0);
    expect(session.barPings).toEqual([]);
    expect(session.seenResults).toEqual([]);
  });
});
