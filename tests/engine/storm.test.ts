import { describe, expect, test } from "vitest";
import { ping, resolveAddress } from "../../src/engine/actions";
import { STORM_FRAME_LIMIT, STORM_LAPS, type Simulator } from "../../src/engine/simulator";
import { PC2_IP, buildLan, buildRing, buildTripleLink } from "./builders";

const NOBODY = "192.168.1.99";

// Fa avanzare la rete finché c'è qualcosa da fare. Si ferma anche se la
// simulazione si sospende; `limit` protegge il test da un ciclo senza fine.
function run(sim: Simulator, limit = 1000): void {
  let steps = 0;
  while (sim.canStep()) {
    sim.step();
    steps += 1;
    if (steps > limit) throw new Error("La simulazione non si ferma.");
  }
}

function framesInFlight(sim: Simulator): number {
  return sim.queue.filter((event) => event.kind === "frame-arrival").length;
}

describe("una rete senza cicli non si sospende mai", () => {
  test("un ping completo in una LAN arriva in fondo", () => {
    const { sim } = buildLan();

    sim.dispatch(ping("d1", PC2_IP));
    run(sim);

    expect(sim.suspended).toBe(false);
    expect(sim.queue).toHaveLength(0);
  });

  test("nemmeno un broadcast senza risposta", () => {
    const { sim } = buildLan();

    sim.dispatch(ping("d1", NOBODY));
    run(sim);

    expect(sim.suspended).toBe(false);
  });
});

describe("tre switch ad anello: il broadcast gira in tondo", () => {
  test("un broadcast non si esaurisce: dopo molti passi è ancora in viaggio", () => {
    const { sim } = buildRing();
    sim.dispatch(resolveAddress("d1", NOBODY));

    for (let i = 0; i < 8; i++) sim.step();

    expect(sim.suspended).toBe(false);
    expect(framesInFlight(sim)).toBeGreaterThan(0);
  });

  test("gira nei due versi senza moltiplicarsi", () => {
    const { sim } = buildRing();
    sim.dispatch(resolveAddress("d1", NOBODY));

    for (let i = 0; i < 8; i++) {
      sim.step();
      expect(framesInFlight(sim)).toBeLessThanOrEqual(4); // due lungo l'anello, più le copie verso i PC
    }
  });

  test("quando un frame è stato inoltrato troppe volte, la simulazione si sospende", () => {
    const { sim } = buildRing();
    sim.dispatch(resolveAddress("d1", NOBODY));

    run(sim);

    const switches = 3;
    expect(sim.suspended).toBe(true);
    expect(sim.time).toBe(switches * STORM_LAPS + 1); // un tick per arrivare al primo switch
    expect(sim.traces.at(-1)).toMatchObject({ kind: "simulation-suspended", cause: "switch-loop" });
  });

  test("la sospensione viene segnalata una volta sola", () => {
    const { sim } = buildRing();
    sim.dispatch(resolveAddress("d1", NOBODY));
    run(sim);

    expect(sim.traces.filter((t) => t.kind === "simulation-suspended")).toHaveLength(1);
  });

  test("da sospesa non avanza: i frame restano dove sono", () => {
    const { sim } = buildRing();
    sim.dispatch(resolveAddress("d1", NOBODY));
    run(sim);
    const time = sim.time;
    const inFlight = framesInFlight(sim);

    expect(sim.canStep()).toBe(false);
    expect(sim.step()).toEqual([]);
    expect(sim.time).toBe(time);
    expect(framesInFlight(sim)).toBe(inFlight);
    expect(inFlight).toBeGreaterThan(0);
  });

  test("da sospesa non accetta altre azioni", () => {
    const { sim } = buildRing();
    sim.dispatch(resolveAddress("d1", NOBODY));
    run(sim);

    expect(() => sim.dispatch(ping("d1", PC2_IP))).toThrow("La simulazione è sospesa");
  });

  test("anche un normale ping tra due PC dell'anello finisce in tempesta", () => {
    const { sim } = buildRing();

    sim.dispatch(ping("d1", PC2_IP, 1));
    run(sim);

    expect(sim.suspended).toBe(true);
  });
});

describe("due switch uniti da tre cavi: il broadcast si moltiplica", () => {
  test("i frame in viaggio aumentano a ogni passo", () => {
    const { sim } = buildTripleLink();
    sim.dispatch(resolveAddress("d1", NOBODY));
    sim.step(); // la richiesta arriva a SW1, che la inoltra sui tre cavi

    const counts = [];
    for (let i = 0; i < 4; i++) {
      counts.push(framesInFlight(sim));
      sim.step();
    }

    expect(counts[0]).toBe(3);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[2]);
  });

  test("oltre il limite di frame in viaggio la simulazione si sospende", () => {
    const { sim } = buildTripleLink();
    sim.dispatch(resolveAddress("d1", NOBODY));

    run(sim);

    expect(sim.suspended).toBe(true);
    expect(sim.traces.at(-1)).toMatchObject({ kind: "simulation-suspended", cause: "switch-loop" });
    expect(framesInFlight(sim)).toBeGreaterThan(STORM_FRAME_LIMIT);
  });
});
