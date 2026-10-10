import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./ui/theme/tokens.css";

import { mount } from "svelte";
import App from "./ui/App.svelte";
import ProvisionalPage from "./ui/provisional/ProvisionalPage.svelte";
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
        if (params.has("avvia")) start();
      });
  }
}
