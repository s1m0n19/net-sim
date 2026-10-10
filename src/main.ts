import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./ui/theme/tokens.css";

import { mount } from "svelte";
import App from "./ui/App.svelte";
import ProvisionalPage from "./ui/provisional/ProvisionalPage.svelte";
import { preferences } from "./ui/preferences.svelte";
import { session } from "./ui/session.svelte";
import { start } from "./ui/simulation/playback";

// La pagina provvisoria resta raggiungibile all'indirizzo /#provvisoria
// finché la nuova interfaccia non sa fare tutto ciò che fa lei.
const provisional = location.hash === "#provvisoria";
document.body.classList.toggle("provisional", provisional);
// La pagina provvisoria ha colori fissi, pensati per lo sfondo chiaro.
if (provisional) document.documentElement.dataset.theme = "light";

mount(provisional ? ProvisionalPage : App, { target: document.getElementById("app")! });

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
if (import.meta.env.DEV && !provisional) {
  const params = new URLSearchParams(location.search);
  const example = params.get("esempio");
  if (example !== null) {
    const fileName = `${example}.netsim.json`;
    fetch(`/examples/${fileName}`)
      .then((response) => response.text())
      .then((text) => {
        session.open(fileName, text);
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
      });
  }
}
