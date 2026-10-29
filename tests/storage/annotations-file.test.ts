import { describe, expect, test } from "vitest";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import type { Annotation } from "../../src/storage/annotations-file";
import { loadNetworkFile } from "../../src/storage/load";
import { serializeNetwork } from "../../src/storage/save";

const BOX: Annotation = { kind: "box", id: "a1", x: 40, y: 60, width: 500, height: 300, color: "green", label: "LAN 192.168.1.0/24" };
const NOTE: Annotation = { kind: "note", id: "a2", x: 600, y: 80, color: "yellow", text: "Consegna:\nfai ping da PC1 a PC3" };

// Il file della LAN di esempio con un campo "annotations" scritto a mano:
// le annotazioni richiedono la versione 2 del formato.
function lanWith(annotations: unknown): string {
  return JSON.stringify({ ...JSON.parse(lanFile), version: 2, annotations });
}

describe("annotazioni nel file", () => {
  test("un file senza annotazioni si apre con l'elenco vuoto", () => {
    expect(loadNetworkFile(lanFile).annotations).toEqual([]);
  });

  test("riquadri e note salvati si riaprono uguali, testo su più righe compreso", () => {
    const { network, positions } = loadNetworkFile(lanFile);

    const reopened = loadNetworkFile(serializeNetwork(network, positions, { annotations: [BOX, NOTE] }));

    expect(reopened.annotations).toEqual([BOX, NOTE]);
  });

  test("senza annotazioni il campo non si scrive: il file resta com'era", () => {
    const { network, positions } = loadNetworkFile(lanFile);

    const file = JSON.parse(serializeNetwork(network, positions, { annotations: [] }));

    expect("annotations" in file).toBe(false);
  });

  test("le annotazioni stanno accanto alla rete, non dentro, con i campi in ordine", () => {
    const { network, positions } = loadNetworkFile(lanFile);

    const file = JSON.parse(serializeNetwork(network, positions, { annotations: [BOX] }));

    expect(Object.keys(file)).toEqual(["format", "version", "network", "annotations"]);
    expect(Object.keys(file.annotations[0])).toEqual(["kind", "id", "x", "y", "width", "height", "color", "label"]);
  });

  test("etichetta e testo possono essere vuoti", () => {
    const empty = [
      { ...BOX, label: "" },
      { ...NOTE, text: "" },
    ];

    expect(loadNetworkFile(lanWith(empty)).annotations).toEqual(empty);
  });

  test.each([
    ["un elenco che non è un elenco", {}, 'Il campo "annotations" deve essere un elenco.'],
    ["un tipo sconosciuto", [{ ...BOX, kind: "freccia" }], "Annotazione a1: tipo sconosciuto: freccia."],
    ["un colore che non esiste", [{ ...BOX, color: "fucsia" }], "Annotazione a1: colore sconosciuto: fucsia."],
    ["una larghezza nulla", [{ ...BOX, width: 0 }], 'Annotazione a1: il campo "width" deve essere maggiore di zero.'],
    ["una coordinata mancante", [{ ...NOTE, y: undefined }], 'Annotazione a2: il campo "y" manca o non è un numero.'],
    ["un testo che non è un testo", [{ ...NOTE, text: 42 }], 'Annotazione a2: il campo "text" manca o non è un testo.'],
    ["un identificativo mancante", [{ ...NOTE, id: "" }], 'Annotazione n. 1: il campo "id" manca o non è un testo.'],
    ["un identificativo ripetuto", [BOX, { ...NOTE, id: "a1" }], "Identificativo di annotazione duplicato: a1."],
  ])("un file con %s viene rifiutato", (_case, annotations, message) => {
    expect(() => loadNetworkFile(lanWith(annotations))).toThrow(message);
  });
});
