import { describe, expect, test } from "vitest";
import routerFile from "../../examples/due-lan-router.netsim.json?raw";
import twoRoutersFile from "../../examples/tre-reti-due-router.netsim.json?raw";
import { session } from "../../src/ui/session.svelte";
import { addressLabelPoint, portLabelPoint } from "../../src/ui/topology/geometry";

const ROUTER = { x: 400, y: 300 };

describe("indirizzi delle interfacce accanto ai cavi", () => {
  test("ogni capo che è un'interfaccia di router porta il suo indirizzo", () => {
    session.open("tre-reti-due-router.netsim.json", twoRoutersFile);

    expect(session.view.links.map((l) => [l.fromAddress, l.toAddress])).toEqual([
      [null, "192.168.1.1/24"], // PC1 — R1
      ["10.0.0.1/30", "10.0.0.2/30"], // R1 — R2
      ["192.168.2.1/24", null], // R2 — PC2
    ]);
  });

  test("i capi su PC e switch non ne hanno: l'indirizzo del PC sta sotto il PC", () => {
    session.open("due-lan-router.netsim.json", routerFile);

    const pcToSwitch = session.view.links.find((l) => l.id === "l1")!;
    expect([pcToSwitch.fromAddress, pcToSwitch.toAddress]).toEqual([null, null]);
  });

  test("un'interfaccia senza indirizzo non ha un'etichetta, e la prende appena configurata", () => {
    session.open("due-lan-router.netsim.json", routerFile);
    session.configureInterface("r1", "Gi0/0", "ip", "");
    expect(session.view.links.find((l) => l.id === "l2")!.toAddress).toBeNull();

    session.configureInterface("r1", "Gi0/0", "ip", "10.1.1.1/16");
    expect(session.view.links.find((l) => l.id === "l2")!.toAddress).toBe("10.1.1.1/16");
  });
});

describe("dove sta la scritta dell'indirizzo", () => {
  test("su un cavo orizzontale sta sopra, e parte dal router allontanandosi", () => {
    const right = addressLabelPoint(ROUTER, { x: 700, y: 300 }, "a");
    const left = addressLabelPoint(ROUTER, { x: 100, y: 300 }, "a");

    expect(right).toMatchObject({ x: 452, anchor: "start" });
    expect(left).toMatchObject({ x: 348, anchor: "end" });
    expect(right.y).toBeLessThan(300);
    expect(left.y).toBeLessThan(300);
  });

  test("vale per tutti e due i capi: ciascuno misura dal suo dispositivo", () => {
    const atB = addressLabelPoint({ x: 100, y: 300 }, ROUTER, "b");

    expect(atB).toMatchObject({ x: 348, anchor: "end" });
  });

  test("se il cavo sale la scritta sta sotto, se scende sta sopra: non lo attraversa mai", () => {
    const up = addressLabelPoint(ROUTER, { x: 700, y: 100 }, "a");
    const down = addressLabelPoint(ROUTER, { x: 700, y: 500 }, "a");
    // Il punto del cavo alla stessa distanza dal router.
    const onCable = (target: { x: number; y: number }) => {
      const length = Math.hypot(target.x - ROUTER.x, target.y - ROUTER.y);
      return ROUTER.y + ((target.y - ROUTER.y) / length) * 52;
    };

    expect(up.y).toBeGreaterThan(onCable({ x: 700, y: 100 }));
    expect(down.y).toBeLessThan(onCable({ x: 700, y: 500 }));
  });

  test("accanto a un cavo verticale sta alla sua destra", () => {
    const label = addressLabelPoint(ROUTER, { x: 400, y: 600 }, "a");

    expect(label.x).toBeGreaterThan(400);
    expect(label.anchor).toBe("start");
  });

  test("su richiesta va sotto un cavo orizzontale: serve quando sopra c'è l'altro capo", () => {
    const below = addressLabelPoint({ x: 100, y: 300 }, ROUTER, "b", 1, true);

    expect(below.y).toBeGreaterThan(300);
  });

  test("in presentazione si allontana dal router quanto lui cresce", () => {
    const normal = addressLabelPoint(ROUTER, { x: 700, y: 300 }, "a", 1);
    const large = addressLabelPoint(ROUTER, { x: 700, y: 300 }, "a", 2);

    expect(large.x - ROUTER.x).toBe(2 * (normal.x - ROUTER.x));
  });
});

describe("dove sta il nome della porta", () => {
  test("di norma i due nomi stanno dalla stessa parte del cavo", () => {
    const a = portLabelPoint({ x: 100, y: 300 }, { x: 700, y: 300 }, "a");
    const b = portLabelPoint({ x: 100, y: 300 }, { x: 700, y: 300 }, "b");

    expect(a.y).toBe(b.y);
    expect(a.y).toBeGreaterThan(300); // sotto
  });

  test("ribaltato va dall'altra parte, per lasciare il posto a un indirizzo", () => {
    const b = portLabelPoint({ x: 100, y: 300 }, { x: 700, y: 300 }, "b", 1, true);

    expect(b.y).toBeLessThan(300);
  });
});

describe("su un cavo troppo corto", () => {
  test("la scritta sta centrata a metà del cavo, invece di partire dal router", () => {
    const label = addressLabelPoint(ROUTER, { x: 600, y: 300 }, "a", 1, false, true);

    expect(label).toMatchObject({ x: 500, anchor: "middle" });
    expect(label.y).toBeLessThan(300);
  });
});
