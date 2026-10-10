import { beforeEach, describe, expect, test, vi } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import ringFile from "../../examples/anello-switch.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";
import { pause, start, stepOnce, TICK_SECONDS as T } from "../../src/ui/simulation/playback";

// Un orologio finto al posto di quello del browser: il test decide quanto
// tempo passa, e i fotogrammi arrivano uno ogni 20 millisecondi.
let pending: ((now: number) => void)[] = [];
let now = 0;

vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
  pending.push(callback);
  return 0;
});

// `T` è la durata a schermo di un tick a velocità 1×: `elapse(3 * T)` fa
// passare il tempo di tre tratti di cavo.
function elapse(seconds: number): void {
  const frames = Math.round((seconds * 1000) / 20);
  for (let i = 0; i < frames; i++) {
    now += 20;
    const callbacks = pending;
    pending = [];
    for (const callback of callbacks) callback(now);
  }
}

function results(): string[] {
  // Gli esiti si leggono dal simulatore attraverso la sessione: qui basta
  // contare quanti echo si sono conclusi guardando il tempo e i pacchetti.
  return session.view.packets.map((packet) => packet.description);
}

beforeEach(() => {
  pause();
  elapse(0.1); // lascia spegnere l'orologio del test precedente
  session.speed = 1;
  session.open("lan-switch.netsim.json", lanFile);
});

describe("tempo reale", () => {
  test("a 1× un pacchetto percorre un cavo nel tempo previsto", () => {
    expect(T).toBe(1.4);
    session.ping("d1", "192.168.1.11", 1);
    start();

    elapse(0.5 * T);
    expect(session.view.time).toBe(0);
    expect(session.displayTime).toBeGreaterThan(0.4);
    expect(session.displayTime).toBeLessThan(0.6);

    elapse(0.6 * T);
    expect(session.view.time).toBe(1); // la richiesta ARP è arrivata allo switch
    expect(results()).toEqual(["ARP request", "ARP request"]);
  });

  test("un ping a freddo nella LAN dura otto tratti di cavo", () => {
    session.ping("d1", "192.168.1.11", 1);
    start();

    elapse(8.3 * T);

    expect(session.view.time).toBe(8);
    expect(session.view.packets).toEqual([]);
    expect(session.view.nextEvent).toBeNull();
  });

  test("a 2× va al doppio della velocità", () => {
    session.ping("d1", "192.168.1.11", 1);
    session.speed = 2;
    start();

    elapse(1.1 * T);

    expect(session.view.time).toBe(2);
  });

  test("in pausa il tempo si ferma, e riparte da dov'era", () => {
    session.ping("d1", "192.168.1.11", 1);
    start();
    elapse(0.5 * T);

    pause();
    const stopped = session.displayTime;
    elapse(2);
    expect(session.displayTime).toBe(stopped);

    start();
    elapse(0.6 * T);
    expect(session.view.time).toBe(1);
  });

  test("resta in ascolto: un ping lanciato dopo parte da solo", () => {
    start();
    elapse(1);
    expect(session.running).toBe(true);

    session.ping("d1", "192.168.1.11", 1);
    elapse(1.1 * T);

    expect(session.view.time).toBe(1);
  });
});

describe("attese", () => {
  test("un'attesa di molti tick dura a schermo due o tre secondi, non venti", () => {
    session.ping("d1", "192.168.1.99", 1); // nessuno risponderà
    start();
    elapse(2.1 * T); // la richiesta ARP ha raggiunto tutti: ora si aspetta soltanto
    expect(session.view.time).toBe(2);
    expect(session.view.nextEvent).toEqual({ time: 20, waitingDeviceIds: ["d1"] });

    elapse(1.2);
    expect(session.waitProgress).toBeGreaterThan(0.3);
    expect(session.waitProgress).toBeLessThan(0.7);
    expect(session.view.time).toBe(2);

    elapse(1.5);
    expect(session.view.time).toBe(20); // scaduta
    expect(session.waitProgress).toBeNull();
  });
});

describe("pausa tra gli echo", () => {
  test("in tempo reale il secondo echo parte con un piccolo ritardo", () => {
    session.ping("d1", "192.168.1.11", 2);
    start();
    // Si avanza un fotogramma alla volta fino all'istante in cui il primo
    // echo si conclude e il secondo viene preparato.
    for (let i = 0; i < 1000 && session.view.time < 8; i++) elapse(0.02);
    expect(session.view.time).toBe(8);
    const afterFirst = session.displayTime;

    elapse(0.4); // siamo dentro la pausa
    expect(session.displayTime).toBe(afterFirst);

    elapse(0.5 + 4 * T); // pausa finita, più i quattro tratti del secondo echo
    expect(session.view.time).toBe(12);
  });
});

describe("passo a mano", () => {
  test("fa arrivare i pacchetti in viaggio e si ferma", () => {
    session.ping("d1", "192.168.1.11", 1);

    stepOnce();
    elapse(0.3);
    expect(session.view.time).toBe(0); // la busta sta ancora viaggiando
    expect(session.displayTime).toBeGreaterThan(0);

    elapse(0.6);
    expect(session.view.time).toBe(1);
    expect(session.running).toBe(false);

    elapse(3);
    expect(session.view.time).toBe(1); // senza un altro clic non succede altro
  });

  test("quando resta solo un'attesa, salta subito alla scadenza", () => {
    session.ping("d1", "192.168.1.99", 1);
    for (let i = 0; i < 2; i++) {
      stepOnce();
      elapse(1);
    }
    expect(session.view.time).toBe(2);

    stepOnce();
    elapse(0.1);

    expect(session.view.time).toBe(20);
  });

  test("non fa nulla mentre il tempo scorre da solo", () => {
    session.ping("d1", "192.168.1.11", 1);
    start();

    stepOnce();
    elapse(0.3);

    expect(session.view.time).toBe(0);
  });

  test("tra un echo e il successivo non c'è pausa", () => {
    session.ping("d1", "192.168.1.11", 2);
    for (let i = 0; i < 8; i++) {
      stepOnce();
      elapse(1);
    }
    const afterFirst = session.displayTime;

    stepOnce();
    elapse(0.2);

    expect(session.displayTime).toBeGreaterThan(afterFirst); // la busta si muove subito
  });
});

describe("cambio di rete e sospensione", () => {
  test("ricominciare riporta il tempo a zero e ferma l'orologio", () => {
    session.ping("d1", "192.168.1.11", 1);
    start();
    elapse(2.5 * T);

    session.restart();

    expect(session.displayTime).toBe(0);
    expect(session.view.time).toBe(0);
    expect(session.running).toBe(false);
    expect(session.view.packets).toEqual([]);
    elapse(1);
    expect(session.displayTime).toBe(0);
  });

  test("una tempesta di broadcast ferma l'orologio", () => {
    session.open("anello-switch.netsim.json", ringFile);
    session.ping("d1", "192.168.1.11", 1);
    start();

    elapse(11 * T);

    expect(session.view.suspended).toBe(true);
    expect(session.running).toBe(false);
    expect(session.view.time).toBe(10);
  });
});
