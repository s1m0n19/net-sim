import { beforeEach, describe, expect, test, vi } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { preferences } from "../../src/ui/preferences.svelte";
import { enterPresentation, exitPresentation, presentationKey } from "../../src/ui/presentation";
import { session } from "../../src/ui/session.svelte";

// L'orologio del browser non c'è: i fotogrammi chiesti restano in sospeso,
// e qui basta sapere se il tempo è stato avviato.
vi.stubGlobal("requestAnimationFrame", () => 0);

// Un tasto premuto, come lo vedrebbe la pagina. `tag` è l'elemento che ha
// il fuoco: "BODY" quando non si sta scrivendo da nessuna parte.
function press(key: string, tag = "BODY", extra: Partial<KeyboardEvent> = {}) {
  let prevented = false;
  const event = {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: { tagName: tag, getAttribute: () => null },
    preventDefault: () => {
      prevented = true;
    },
    ...extra,
  } as unknown as KeyboardEvent;
  const used = presentationKey(event);
  return { used, prevented };
}

beforeEach(() => {
  exitPresentation();
  preferences.stripOpen = true;
  preferences.magnification = 1.4;
  session.open("lan-switch.netsim.json", lanFile);
});

describe("entrare e uscire", () => {
  test("entrando la fascia si chiude e tutto si ingrandisce", () => {
    expect(preferences.scale).toBe(1);

    enterPresentation();

    expect(preferences.presenting).toBe(true);
    expect(preferences.stripOpen).toBe(false);
    expect(preferences.scale).toBe(1.4);
  });

  test("entrando si posano gli strumenti per costruire", () => {
    session.placing = { kind: "host" };
    session.cabling = true;

    enterPresentation();

    expect(session.placing).toBeNull();
    expect(session.cabling).toBe(false);
  });

  test("uscendo fascia e inquadratura tornano com'erano", () => {
    const chosen = { x: 10, y: 20, width: 400, height: 250 };
    session.camera = chosen;
    enterPresentation();
    session.camera = { x: 0, y: 0, width: 900, height: 600 };
    preferences.stripOpen = true;

    exitPresentation();

    expect(preferences.presenting).toBe(false);
    expect(preferences.scale).toBe(1);
    expect(preferences.stripOpen).toBe(true);
    expect(session.camera).toEqual(chosen);
  });

  test("entrare non tocca la rete né la simulazione", () => {
    session.ping("d1", "192.168.1.11", 1);

    enterPresentation();

    expect(session.view.packets).toHaveLength(1);
    expect(session.dirty).toBe(false);
  });

  test("l'ingrandimento si regola a scatti, tra 100% e 200%", () => {
    preferences.magnify(1);
    expect(preferences.magnification).toBe(1.6);

    preferences.magnify(10);
    expect(preferences.magnification).toBe(2);

    preferences.magnify(-10);
    expect(preferences.magnification).toBe(1);
  });
});

describe("scorciatoie", () => {
  test("fuori dalla presentazione i tasti non fanno nulla", () => {
    expect(press(" ").used).toBe(false);
    expect(press("e").used).toBe(false);
    expect(session.running).toBe(false);
  });

  test("lo spazio avvia e mette in pausa", () => {
    enterPresentation();

    expect(press(" ")).toEqual({ used: true, prevented: true });
    expect(session.running).toBe(true);

    press(" ");
    expect(session.running).toBe(false);
  });

  test("su un pulsante lo spazio resta un clic sul pulsante", () => {
    enterPresentation();

    expect(press(" ", "BUTTON").used).toBe(false);
    expect(session.running).toBe(false);
  });

  test("chi scrive nel terminale non fa scattare le scorciatoie", () => {
    enterPresentation();

    expect(press("e", "INPUT").used).toBe(false);
    expect(press(" ", "INPUT").used).toBe(false);
    expect(preferences.stripOpen).toBe(false);
  });

  test("con Ctrl o Cmd premuti il tasto non è una scorciatoia", () => {
    enterPresentation();

    expect(press("e", "BODY", { ctrlKey: true }).used).toBe(false);
  });

  test("E apre la fascia sugli eventi, e la richiude", () => {
    enterPresentation();

    press("e");
    expect([preferences.stripOpen, session.activeTab]).toEqual([true, "events"]);

    press("E");
    expect(preferences.stripOpen).toBe(false);
  });

  test("T apre il terminale del PC selezionato, se non ce ne sono di aperti", () => {
    enterPresentation();
    press("t");
    expect(preferences.stripOpen).toBe(false); // nessun PC selezionato: niente da aprire

    session.select({ kind: "device", id: "d1" });
    press("t");

    expect(session.terminals.map((t) => t.deviceId)).toEqual(["d1"]);
    expect([preferences.stripOpen, session.activeTab]).toEqual([true, "d1"]);
  });

  test("T ed E passano da una scheda all'altra, poi chiudono", () => {
    session.openTerminal("d1");
    enterPresentation();

    press("t");
    expect([preferences.stripOpen, session.activeTab]).toEqual([true, "d1"]);
    press("e");
    expect([preferences.stripOpen, session.activeTab]).toEqual([true, "events"]);
    press("e");
    expect(preferences.stripOpen).toBe(false);
  });

  test("Esc esce dalla presentazione", () => {
    enterPresentation();

    expect(press("Escape").used).toBe(true);
    expect(preferences.presenting).toBe(false);
  });

  test("con un ping da puntare, Esc prima lascia andare quello", () => {
    enterPresentation();
    session.armPing("d1");

    expect(press("Escape").used).toBe(false);
    expect(preferences.presenting).toBe(true);
  });
});
