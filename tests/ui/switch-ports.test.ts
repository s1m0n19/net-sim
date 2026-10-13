import { beforeEach, describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";

// Il cavo l1 va da PC1 (capo a) alla porta Fa0/1 di SW1 (capo b).
function cable() {
  return session.view.links.find((link) => link.id === "l1")!;
}

describe("porta di switch spenta, sul disegno", () => {
  beforeEach(() => {
    session.open("lan-switch.netsim.json", lanFile);
  });

  test("il cavo lo dice dal capo dello switch, e non porta segnale", () => {
    session.toggleInterface("s1", "Fa0/1");

    expect(cable()).toMatchObject({ fromOff: false, toOff: true, signal: false });
  });

  test("la scheda Eventi parla di porta, non di interfaccia", () => {
    session.toggleInterface("s1", "Fa0/1");
    session.toggleInterface("s1", "Fa0/1");

    expect(session.view.events.map((e) => [e.deviceName, e.text])).toEqual([
      ["SW1", "spegne la porta Fa0/1"],
      ["SW1", "accende la porta Fa0/1"],
    ]);
  });

  test("annullare riaccende la porta, ripristinare la rispegne", () => {
    session.toggleInterface("s1", "Fa0/1");

    session.undo();
    expect(cable()).toMatchObject({ toOff: false, signal: true });

    session.redo();
    expect(cable()).toMatchObject({ toOff: true, signal: false });
  });

  test("la scheda di un PC non si spegne", () => {
    session.toggleInterface("d1", "Fa0");

    expect(cable()).toMatchObject({ fromOff: false, signal: true });
    expect(session.canUndo).toBe(false);
  });
});
