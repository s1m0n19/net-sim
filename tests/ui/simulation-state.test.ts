// Lo stato scritto nella barra della simulazione (D-113): si ricava solo
// da ciò che si sa davvero, il tempo reale avviato e la sospensione.

import { beforeEach, describe, expect, test, vi } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import ringFile from "../../examples/anello-switch.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";
import { pause, start, stepOnce, TICK_SECONDS as T } from "../../src/ui/simulation/playback";
import { simulationState, STATE_TEXT } from "../../src/ui/simulation/simulation-state";

// Un orologio finto al posto di quello del browser, come in playback.test.ts.
let pending: ((now: number) => void)[] = [];
let now = 0;
vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
  pending.push(callback);
  return 0;
});
function elapse(seconds: number): void {
  for (let i = 0; i < Math.round((seconds * 1000) / 20); i++) {
    now += 20;
    const callbacks = pending;
    pending = [];
    for (const callback of callbacks) callback(now);
  }
}

const state = () => simulationState(session.running, session.view.suspended);

beforeEach(() => {
  pause();
  elapse(0.1);
  session.speed = 1;
  session.open("lan-switch.netsim.json", lanFile);
});

describe("lo stato della simulazione", () => {
  test("una rete appena aperta è ferma", () => {
    expect(state()).toBe("stopped");
    expect(STATE_TEXT[state()].label).toBe("Ferma");
  });

  test("Avvia la mette in esecuzione, Pausa la ferma", () => {
    session.ping("d1", "192.168.1.11", 1);
    start();
    elapse(T);
    expect(state()).toBe("running");
    pause();
    expect(state()).toBe("stopped");
  });

  test("avviata senza nulla in programma resta in esecuzione: è in ascolto, non in pausa", () => {
    start();
    elapse(3);
    expect(session.view.nextEvent).toBeNull();
    expect(state()).toBe("running");
    expect(STATE_TEXT[state()].label).toBe("In esecuzione");
  });

  test("dopo un ping concluso, senza altri eventi, non diventa né ferma né completata", () => {
    session.ping("d1", "192.168.1.11", 1);
    start();
    elapse(20 * T);
    expect(session.view.nextEvent).toBeNull();
    expect(state()).toBe("running");
  });

  test("un Passo avanza il tempo e la lascia ferma", () => {
    session.ping("d1", "192.168.1.11", 1);
    stepOnce();
    elapse(2);
    expect(session.view.time).toBeGreaterThan(0);
    expect(state()).toBe("stopped");
  });

  test("Ricomincia la riporta ferma, anche se era in esecuzione", () => {
    session.ping("d1", "192.168.1.11", 1);
    start();
    elapse(2 * T);
    session.restart();
    expect(state()).toBe("stopped");
  });

  test("una tempesta di broadcast la sospende, e Ricomincia la fa ripartire ferma", () => {
    session.open("anello-switch.netsim.json", ringFile);
    session.ping("d1", "192.168.1.11", 1);
    start();
    elapse(11 * T);
    expect(state()).toBe("suspended");
    expect(STATE_TEXT[state()].label).toBe("Sospesa");
    // Avvia non la rimette in esecuzione.
    start();
    expect(state()).toBe("suspended");
    session.restart();
    expect(state()).toBe("stopped");
  });

  test("le scritte non parlano della rete né dell'esito del traffico", () => {
    const words = Object.values(STATE_TEXT).flatMap((text) => [text.label, text.description]).join(" ");
    expect(words).not.toMatch(/completat|riuscit|fallit|errore|gateway|maschera|rotta/i);
  });
});
