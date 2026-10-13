import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./ui/theme/tokens.css";

import { mount, tick } from "svelte";
import App from "./ui/App.svelte";
import { preferences } from "./ui/preferences.svelte";
import { session } from "./ui/session.svelte";
import { enterPresentation } from "./ui/presentation";
import { start } from "./ui/simulation/playback";

mount(App, { target: document.getElementById("app")! });

// Solo durante lo sviluppo: l'indirizzo può aprire un esempio e mettere la
// rete in una certa situazione, senza toccare il mouse. Serve a provare
// la pagina e a fotografarla. Nel sito pubblicato questo blocco non esiste.
//
//   /?esempio=lan-switch                      apre examples/lan-switch.netsim.json
//   &ping=PC1>192.168.1.11                    lancia un ping (con &richieste=4 ne manda quattro)
//   &passi=3                                  avanza subito di tre istanti
//   &avanti=0.5                               sposta le buste di mezzo tratto di cavo
//   &avvia                                    fa scorrere il tempo
//   &seleziona=PC1 | l2 | pacchetto            seleziona un dispositivo, un cavo o la prima busta
//   &stacca                                    stacca il cavo selezionato
//   &mira                                      preme Ping sul dispositivo selezionato
//   &appunta=SW1,PC1                           appunta le tabelle di quei dispositivi
//   &terminale=PC1&comando=arp -a              apre un terminale ed esegue un comando (ripetibile)
//   &poi=8                                     avanza di otto istanti dopo i comandi
//   &segui=1                                   segue solo la prima conversazione
//   &nascondi=ARP | ICMP                       spegne un protocollo nel filtro
//   &fascia-chiusa, &pannello-chiuso           chiude la fascia in basso o il pannello laterale
if (import.meta.env.DEV) {
  const params = new URLSearchParams(location.search);
  // &posa=PC@200,150;SW8@450,150;R4@700,150   posa dispositivi su un foglio vuoto
  for (const item of (params.get("posa") ?? "").split(";").filter((text) => text !== "")) {
    const [what, where] = item.split("@");
    const [x, y] = where.split(",").map(Number);
    const template =
      what === "PC"
        ? ({ kind: "host" } as const)
        : what === "SRV"
          ? ({ kind: "server" } as const)
        : what.startsWith("R")
          ? ({ kind: "router", interfaceCount: Number(what.slice(1)) } as const)
          : ({ kind: "switch", portCount: Number(what.slice(2)) } as const);
    session.addDevice(template, { x, y });
  }
  if (params.has("scegli")) session.placing = { kind: "host" };
  // &collega=PC1>SW1;PC2>SW1                  tira cavi tra i dispositivi posati
  const named = (name: string | null) => session.view.devices.find((device) => device.name === name);
  for (const pair of (params.get("collega") ?? "").split(";").filter((text) => text !== "")) {
    const [from, to] = pair.split(">").map(named);
    if (from !== undefined && to !== undefined) session.connect(from.id, to.id);
  }
  // &accendi=R1:Gi0/0;R1:Gi0/1                accende interfacce di router
  // &spegni=SW1:Fa0/1                         spegne porte di switch
  // Entrambi cambiano lo stato: accesa diventa spenta, e viceversa. Con
  // ?esempio= valgono sulla rete aperta, altrimenti su quella posata.
  const togglePorts = () => {
    const items = [params.get("accendi"), params.get("spegni")].join(";");
    for (const item of items.split(";").filter((text) => text !== "")) {
      const [name, portName] = item.split(":");
      const device = named(name);
      if (device !== undefined) session.toggleInterface(device.id, portName);
    }
  };
  if (params.get("esempio") === null) togglePorts();
  // &cavo, &da=PC1                            accende lo strumento Cavo; comincia un cavo da PC1
  if (params.has("cavo")) session.cabling = true;
  const cableFrom = named(params.get("da"));
  if (cableFrom !== undefined) session.armLink(cableFrom.id);
  // &vista=100,50,400,250                     inquadra quel rettangolo (x, y, larghezza, altezza)
  // &adatta                                   preme Adatta
  const [vx, vy, vw, vh] = (params.get("vista") ?? "").split(",").map(Number);
  if (params.has("vista")) session.camera = { x: vx, y: vy, width: vw, height: vh };
  if (params.has("adatta")) session.fitView();
  // &annulla=2, &ripristina=1                 annulla le ultime modifiche, poi ne rifà
  for (let i = 0; i < Number(params.get("annulla") ?? 0); i++) session.undo();
  for (let i = 0; i < Number(params.get("ripristina") ?? 0); i++) session.redo();
  // &seleziona=PC1                            (senza esempio) seleziona un dispositivo posato
  const picked = named(params.get("seleziona"));
  if (params.get("esempio") === null && picked !== undefined) session.select({ kind: "device", id: picked.id });
  // &scrivi=ip:192.168.1.10;gateway:10.0.0.1  scrive nei campi del pannello, e conferma con Invio
  void tick().then(async () => {
    for (const item of (params.get("scrivi") ?? "").split(";").filter((text) => text !== "")) {
      const [field, text] = item.split(":");
      const input = document.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
      if (input === null) continue;
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await tick();
    }
  });
  // &porta=2b                                 apre l'elenco delle porte: secondo cavo, capo b
  const portOf = /^(\d+)([ab])$/.exec(params.get("porta") ?? "");
  const cable = portOf === null ? undefined : session.view.links[Number(portOf[1]) - 1];
  if (portOf !== null && cable !== undefined) session.openPortMenu(cable.id, portOf[2] as "a" | "b");

  const example = params.get("esempio");
  if (example !== null) {
    const fileName = `${example}.netsim.json`;
    fetch(`/examples/${fileName}`)
      .then((response) => response.text())
      .then((text) => {
        session.open(fileName, text);
        togglePorts();
        const [from, to] = (params.get("ping") ?? "").split(">");
        const source = session.view.devices.find((device) => device.name === from);
        if (source !== undefined && to !== undefined) {
          session.ping(source.id, to, Number(params.get("richieste") ?? 1));
        }
        for (let i = 0; i < Number(params.get("passi") ?? 0); i++) session.step();
        session.displayTime += Number(params.get("avanti") ?? 0);
        const chosen = params.get("seleziona");
        const device = session.view.devices.find((d) => d.name === chosen);
        const link = session.view.links.find((l) => l.id === chosen);
        const packet = session.view.packets[0];
        if (device !== undefined) session.select({ kind: "device", id: device.id });
        if (link !== undefined) session.select({ kind: "link", id: link.id });
        if (chosen === "pacchetto" && packet !== undefined) {
          session.select({ kind: "packet", id: packet.id, packet });
        }
        if (params.has("stacca") && link !== undefined) session.toggleLink(link.id);
        if (params.has("mira") && device !== undefined) session.armPing(device.id);
        for (const name of (params.get("appunta") ?? "").split(",")) {
          const pinned = session.view.devices.find((d) => d.name === name);
          if (pinned !== undefined) session.togglePin(pinned.id);
        }
        const terminalHost = session.view.devices.find((d) => d.name === params.get("terminale"));
        if (terminalHost !== undefined) {
          session.openTerminal(terminalHost.id);
          for (const line of params.getAll("comando")) session.execute(terminalHost.id, line);
          for (let i = 0; i < Number(params.get("poi") ?? 0); i++) session.step();
        }
        if (params.has("fascia-chiusa")) preferences.stripOpen = false;
        if (params.has("segui")) session.followed = Number(params.get("segui"));
        if (params.get("nascondi") === "ARP") session.protocols.ARP = false;
        if (params.get("nascondi") === "ICMP") session.protocols.ICMP = false;
        if (params.has("pannello-chiuso")) preferences.sideOpen = false;
        if (params.has("avvia")) start();
        // &presenta, &ingrandimento=1.8             entra in modalità presentazione
        if (params.has("ingrandimento")) preferences.magnification = Number(params.get("ingrandimento"));
        if (params.has("presenta")) enterPresentation();
      });
  }
}
