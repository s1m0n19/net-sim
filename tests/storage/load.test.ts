import { describe, expect, test } from "vitest";
import exampleFile from "../../examples/due-pc.netsim.json?raw";
import lanFile from "../../examples/lan-switch.netsim.json?raw";
import ringFile from "../../examples/anello-switch.netsim.json?raw";
import { resolveAddress } from "../../src/engine/actions";
import { hostsOf } from "../../src/engine/model/network";
import { Simulator } from "../../src/engine/simulator";
import { loadNetworkFile } from "../../src/storage/load";

describe("lettura di un file di rete", () => {
  test("il file di esempio contiene due PC collegati, con le tabelle vuote", () => {
    const { network, positions } = loadNetworkFile(exampleFile);

    expect(network.devices.map((d) => d.name)).toEqual(["PC1", "PC2"]);
    expect(hostsOf(network)[0].ip).toBe("192.168.1.10");
    expect(hostsOf(network)[0].arpTable.size).toBe(0);
    expect(network.links).toHaveLength(1);
    expect(positions.get("d1")).toEqual({ x: 150, y: 130 });
  });

  test("il file della LAN contiene uno switch con la tabella MAC vuota e tre PC", () => {
    const { network, positions } = loadNetworkFile(lanFile);

    const sw = network.devices.find((d) => d.kind === "switch")!;
    expect(sw.name).toBe("SW1");
    expect(sw.ports.map((p) => p.name)).toEqual(["Fa0/1", "Fa0/2", "Fa0/3", "Fa0/4"]);
    expect(sw.macTable.size).toBe(0);
    expect(hostsOf(network).map((h) => h.name)).toEqual(["PC1", "PC2", "PC3"]);
    expect(network.links).toHaveLength(3);
    expect(positions.size).toBe(4);
  });

  test("il file dell'anello contiene tre switch collegati in cerchio e due PC", () => {
    const { network } = loadNetworkFile(ringFile);

    expect(network.devices.filter((d) => d.kind === "switch").map((d) => d.name)).toEqual(["SW1", "SW2", "SW3"]);
    expect(hostsOf(network).map((h) => h.name)).toEqual(["PC1", "PC2"]);
    expect(network.links).toHaveLength(5);
  });

  test("la LAN letta dal file funziona: lo scambio ARP si completa in quattro passi", () => {
    const { network } = loadNetworkFile(lanFile);
    const sim = new Simulator(network);
    const [pc1, pc2] = hostsOf(network);

    sim.dispatch(resolveAddress(pc1.id, pc2.ip!));
    while (sim.canStep()) sim.step();

    expect(sim.time).toBe(4);
    expect(pc1.arpTable.get(pc2.ip!)).toBe(pc2.ports[0].mac);
  });
});

// Prende un file di esempio, lo altera e lo restituisce come testo.
function altered(file: string, change: (data: any) => void): string {
  const data = JSON.parse(file);
  change(data);
  return JSON.stringify(data);
}

describe("file che non sono reti di net-sim", () => {
  test("rifiuta un file che non è JSON", () => {
    expect(() => loadNetworkFile("non sono JSON")).toThrow("non è JSON valido");
  });

  test("rifiuta un JSON che non è una rete di net-sim", () => {
    expect(() => loadNetworkFile('{"format":"altro"}')).toThrow("non è una rete di net-sim");
  });

  test("rifiuta una versione che non conosce", () => {
    expect(() => loadNetworkFile('{"format":"net-sim","version":99}')).toThrow("non supportata");
  });

  test("rifiuta un file senza l'elenco dei dispositivi o dei collegamenti", () => {
    expect(() => loadNetworkFile('{"format":"net-sim","version":1}')).toThrow("non contiene l'elenco");
    expect(() => loadNetworkFile(altered(exampleFile, (d) => delete d.network.links))).toThrow(
      "non contiene l'elenco",
    );
  });
});

describe("dispositivi scritti male", () => {
  test("rifiuta un tipo di dispositivo che non conosce", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[0].kind = "tostapane"));

    expect(() => loadNetworkFile(file)).toThrow("non supportato: tostapane");
  });

  test("rifiuta un dispositivo a cui manca un campo, dicendo quale", () => {
    const noName = altered(exampleFile, (d) => delete d.network.devices[1].name);
    const noPosition = altered(exampleFile, (d) => delete d.network.devices[0].position);
    const noGateway = altered(exampleFile, (d) => delete d.network.devices[0].gateway);

    expect(() => loadNetworkFile(noName)).toThrow('Dispositivo n. 2: il campo "name" manca');
    expect(() => loadNetworkFile(noPosition)).toThrow('PC1: la posizione "x" manca');
    expect(() => loadNetworkFile(noGateway)).toThrow('PC1: il campo "gateway" manca');
  });

  test("rifiuta un campo del tipo sbagliato", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[0].ip = 192));

    expect(() => loadNetworkFile(file)).toThrow('PC1: il campo "ip" manca o non è un testo');
  });

  test("rifiuta un dispositivo senza porte", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[0].ports = []));

    expect(() => loadNetworkFile(file)).toThrow("PC1: deve avere almeno una porta");
  });

  test("rifiuta un indirizzo MAC scritto male, o il broadcast", () => {
    const wrong = altered(exampleFile, (d) => (d.network.devices[0].ports[0].mac = "02:00:00:00:00"));
    const broadcast = altered(exampleFile, (d) => (d.network.devices[0].ports[0].mac = "FF:FF:FF:FF:FF:FF"));

    expect(() => loadNetworkFile(wrong)).toThrow("PC1 Fa0: indirizzo MAC non valido");
    expect(() => loadNetworkFile(broadcast)).toThrow("PC1 Fa0: indirizzo MAC non valido");
  });
});

describe("duplicati", () => {
  test("rifiuta due dispositivi con lo stesso identificativo", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[1].id = "d1"));

    expect(() => loadNetworkFile(file)).toThrow("Identificativo di dispositivo duplicato: d1");
  });

  test("rifiuta due porte con lo stesso indirizzo MAC, anche scritto con maiuscole diverse", () => {
    const file = altered(lanFile, (d) => (d.network.devices[2].ports[0].mac = "02:00:00:00:00:01".toUpperCase()));

    expect(() => loadNetworkFile(file)).toThrow("Indirizzo MAC duplicato: 02:00:00:00:00:01");
  });

  test("rifiuta due porte con lo stesso nome sullo stesso dispositivo", () => {
    const file = altered(lanFile, (d) => (d.network.devices[0].ports[1].name = "Fa0/1"));

    expect(() => loadNetworkFile(file)).toThrow("SW1: nome di porta duplicato: Fa0/1");
  });

  test("ammette lo stesso nome di porta su dispositivi diversi", () => {
    expect(() => loadNetworkFile(exampleFile)).not.toThrow(); // PC1 e PC2 hanno entrambi Fa0
  });

  test("rifiuta due collegamenti con lo stesso identificativo", () => {
    const file = altered(lanFile, (d) => (d.network.links[1].id = "l1"));

    expect(() => loadNetworkFile(file)).toThrow("Identificativo di collegamento duplicato: l1");
  });
});

describe("collegamenti scritti male", () => {
  test("rifiuta un collegamento verso una porta che non esiste", () => {
    const file = altered(exampleFile, (d) => (d.network.links[0].b.portName = "Fa9"));

    expect(() => loadNetworkFile(file)).toThrow("Collegamento l1: indica una porta inesistente: d2 Fa9");
  });

  test("rifiuta un collegamento a cui manca un capo", () => {
    const file = altered(exampleFile, (d) => delete d.network.links[0].b);

    expect(() => loadNetworkFile(file)).toThrow('Collegamento l1: il campo "deviceId" manca');
  });

  test("rifiuta una porta con due cavi", () => {
    const file = altered(lanFile, (d) => (d.network.links[1].b.portName = "Fa0/1"));

    expect(() => loadNetworkFile(file)).toThrow("La porta Fa0/1 di SW1 ha più di un collegamento");
  });

  test("rifiuta un cavo che unisce una porta a se stessa", () => {
    const file = altered(exampleFile, (d) => (d.network.links[0].b = d.network.links[0].a));

    expect(() => loadNetworkFile(file)).toThrow("unisce una porta a se stessa");
  });

  test("ammette un cavo tra due porte dello stesso switch", () => {
    const file = altered(lanFile, (d) =>
      d.network.links.push({
        id: "l4",
        a: { deviceId: "s1", portName: "Fa0/4" },
        b: { deviceId: "s1", portName: "Fa0/4b" },
      }),
    );
    const withPort = altered(file, (d) =>
      d.network.devices[0].ports.push({ name: "Fa0/4b", mac: "02:00:00:00:01:05" }),
    );

    expect(() => loadNetworkFile(withPort)).not.toThrow(); // è un ciclo, ma è una rete possibile
  });
});

describe("configurazione IP degli host", () => {
  test("rifiuta una subnet mask non valida, nominando l'host", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[0].mask = "255.0.255.0"));

    expect(() => loadNetworkFile(file)).toThrow("PC1: subnet mask non valida: 255.0.255.0.");
  });

  test("rifiuta un indirizzo scritto male", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[1].ip = "192.168.1.256"));

    expect(() => loadNetworkFile(file)).toThrow("PC2: indirizzo IP non valido: 192.168.1.256.");
  });

  test("rifiuta un indirizzo senza maschera", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[0].mask = null));

    expect(() => loadNetworkFile(file)).toThrow("PC1: indirizzo IP e subnet mask vanno impostati insieme.");
  });

  test("rifiuta l'indirizzo di broadcast della sottorete", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[0].ip = "192.168.1.255"));

    expect(() => loadNetworkFile(file)).toThrow("PC1: l'indirizzo 192.168.1.255 è l'indirizzo di broadcast");
  });

  test("ammette un host senza configurazione IP", () => {
    const file = altered(exampleFile, (d) => {
      d.network.devices[0].ip = null;
      d.network.devices[0].mask = null;
    });

    expect(hostsOf(loadNetworkFile(file).network)[0].ip).toBeNull();
  });

  test("ammette due host con lo stesso indirizzo IP: è un errore da diagnosticare, non da impedire", () => {
    const file = altered(exampleFile, (d) => (d.network.devices[1].ip = "192.168.1.10"));

    expect(() => loadNetworkFile(file)).not.toThrow();
  });
});
