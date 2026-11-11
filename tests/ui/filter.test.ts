import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";

beforeEach(() => {
  session.open("lan-switch.netsim.json", lanFile);
  session.protocols.ARP = true;
  session.protocols.ICMP = true;
});

describe("filtro del traffico", () => {
  test("di base lascia vedere tutto", () => {
    expect(session.shows(1, "ARP")).toBe(true);
    expect(session.shows(2, "ICMP")).toBe(true);
    expect(session.shows(null, null)).toBe(true);
  });

  test("seguendo una conversazione, le altre spariscono", () => {
    session.followed = 1;

    expect(session.shows(1, "ARP")).toBe(true);
    expect(session.shows(2, "ARP")).toBe(false);
  });

  test("ciò che non appartiene a una conversazione, come un guasto, si vede sempre", () => {
    session.followed = 1;

    expect(session.shows(null, null)).toBe(true);
  });

  test("spegnendo un protocollo, spariscono i suoi frame e restano gli altri", () => {
    session.protocols.ARP = false;

    expect(session.shows(1, "ARP")).toBe(false);
    expect(session.shows(1, "ICMP")).toBe(true);
    expect(session.shows(1, null)).toBe(true); // un cambio di tabella non ha protocollo
  });

  test("i due filtri si sommano", () => {
    session.followed = 2;
    session.protocols.ICMP = false;

    expect(session.shows(2, "ARP")).toBe(true);
    expect(session.shows(2, "ICMP")).toBe(false);
    expect(session.shows(1, "ARP")).toBe(false);
  });

  test("ricominciando si torna a seguire tutte le conversazioni", () => {
    session.ping("d1", "192.168.1.11", 1);
    session.followed = 1;

    session.restart();

    expect(session.followed).toBeNull();
    expect(session.view.conversations).toEqual([]);
    expect(session.view.events).toEqual([]);
  });
});

describe("due ping uguali uno dopo l'altro (U-2, D-136)", () => {
  function runToEnd(): void {
    while (session.view.nextEvent !== null) session.step();
  }

  test("hanno nel filtro nomi diversi, con il numero della conversazione", () => {
    session.armPing("d1");
    session.pingTo("d2");
    runToEnd();
    session.armPing("d1");
    session.pingTo("d2");
    runToEnd();

    const labels = session.view.conversations.map((c) => c.label);
    expect(labels).toEqual(["#1 · ping PC1 → 192.168.1.11", "#2 · ping PC1 → 192.168.1.11"]);
    expect(new Set(labels).size).toBe(2);
  });

  test("scegliendo ciascuno si vedono solo i suoi eventi", () => {
    session.armPing("d1");
    session.pingTo("d2");
    runToEnd();
    session.armPing("d1");
    session.pingTo("d2");
    runToEnd();

    for (const id of [1, 2]) {
      session.followed = id;
      const shown = session.view.events.filter((e) => session.shows(e.conversationId, e.protocol));
      const ofConversations = new Set(shown.map((e) => e.conversationId).filter((c) => c !== null));
      expect(ofConversations).toEqual(new Set([id]));
      // Il primo ha chiesto l'ARP, il secondo no: il MAC era già noto.
      expect(shown.some((e) => e.protocol === "ARP")).toBe(id === 1);
      expect(shown.some((e) => e.protocol === "ICMP")).toBe(true);
    }
    session.followed = null;
  });
});
