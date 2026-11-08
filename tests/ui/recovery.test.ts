// La copia di recupero (D-120): l'ultima rete con modifiche non salvate,
// tenuta nel browser, proposta alla riapertura, cancellata salvando.

import { beforeAll, describe, expect, test, vi } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { clearRecovery, readRecovery, writeRecovery, type KeyValueStore } from "../../src/storage/recovery";

// Un localStorage in memoria.
function memoryStore(): KeyValueStore & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

describe("tenere la copia nel browser", () => {
  test("si scrive, si rilegge uguale e si cancella", () => {
    const store = memoryStore();
    const copy = { fileName: "lezione", text: "{}", savedAt: 1_700_000_000_000 };
    writeRecovery(store, copy);
    expect(readRecovery(store)).toEqual(copy);
    clearRecovery(store);
    expect(readRecovery(store)).toBeNull();
  });

  test("una copia guasta, o di un'altra forma, è come se non ci fosse", () => {
    const store = memoryStore();
    store.setItem("net-sim:copia-di-recupero", "{ non è json");
    expect(readRecovery(store)).toBeNull();
    store.setItem("net-sim:copia-di-recupero", JSON.stringify({ text: 3 }));
    expect(readRecovery(store)).toBeNull();
  });

  test("se il browser non accetta la copia, non succede nulla", () => {
    const full: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("vietato");
      },
    };
    expect(() => writeRecovery(full, { fileName: null, text: "{}", savedAt: 0 })).not.toThrow();
    expect(() => clearRecovery(full)).not.toThrow();
  });
});

describe("la copia di recupero nella sessione", () => {
  const store = memoryStore();
  const stored = () => readRecovery(store);
  // La sessione si crea dopo aver messo al suo posto il localStorage finto.
  let session: typeof import("../../src/ui/session.svelte").session;

  beforeAll(async () => {
    vi.stubGlobal("localStorage", store);
    session = (await import("../../src/ui/session.svelte")).session;
    session.checkRecovery();
  });

  test("c'è finché ci sono modifiche non salvate, con il nome del file", () => {
    session.open("lezione.netsim.json", lanFile);
    expect(stored()).toBeNull();
    const pc = session.view.devices.find((d) => d.name === "PC1")!;
    session.rename(pc.id, "Aula");
    expect(stored()).toMatchObject({ fileName: "lezione" });
    expect(stored()!.text).toContain('"Aula"');
  });

  test("annullare fino alla rete salvata la cancella", () => {
    session.undo();
    expect(session.dirty).toBe(false);
    expect(stored()).toBeNull();
  });

  test("un salvataggio riuscito la cancella", () => {
    session.addNote({ x: 10, y: 10 });
    expect(stored()).not.toBeNull();
    session.markSaved("lezione.netsim.json", session.draftSave());
    expect(stored()).toBeNull();
  });

  test("il traffico non la riscrive: contano solo le modifiche alla rete", () => {
    const pc = session.view.devices.find((d) => d.name === "PC1")!;
    session.rename(pc.id, "Laboratorio");
    const first = store.items.get("net-sim:copia-di-recupero");
    session.ping(pc.id, "192.168.1.11", 1);
    while (session.view.nextEvent !== null) session.step();
    expect(store.items.get("net-sim:copia-di-recupero")).toBe(first);
  });

  test("riprenderla riapre la rete con il suo nome, da salvare", () => {
    // Come se la pagina si riaprisse: c'è una copia, e l'app la propone.
    // (Il foglio nuovo, che non ha modifiche, cancella la copia: la si legge prima.)
    const text = stored()!.text;
    session.clear();
    session.recoveryOffer = { fileName: "lezione", text, savedAt: 0 };
    writeRecovery(store, session.recoveryOffer);
    session.restoreRecovery();
    expect(session.recoveryOffer).toBeNull();
    expect(session.fileName).toBe("lezione");
    expect(session.dirty).toBe(true);
    expect(session.view.devices.some((d) => d.name === "Laboratorio")).toBe(true);
  });

  test("scartarla la cancella; mentre è proposta, la copia non si tocca", () => {
    session.clear();
    const offer = { fileName: "vecchia", text: lanFile, savedAt: 0 };
    writeRecovery(store, offer);
    session.recoveryOffer = offer;
    // Una modifica fatta prima di scegliere non sovrascrive la copia proposta.
    session.addNote({ x: 1, y: 1 });
    expect(stored()).toMatchObject({ fileName: "vecchia" });
    session.discardRecovery();
    expect(session.recoveryOffer).toBeNull();
    // Da qui la copia è quella del lavoro nuovo.
    expect(stored()).toMatchObject({ fileName: null });
  });
});
