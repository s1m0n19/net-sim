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

// La pagina provvisoria resta raggiungibile all'indirizzo /#provvisoria
// finché la nuova interfaccia non sa fare tutto ciò che fa lei.
const provisional = location.hash === "#provvisoria";
document.body.classList.toggle("provisional", provisional);
// La pagina provvisoria ha colori fissi, pensati per lo sfondo chiaro.
if (provisional) document.documentElement.dataset.theme = "light";

mount(provisional ? ProvisionalPage : App, { target: document.getElementById("app")! });

// Solo durante lo sviluppo: l'indirizzo /?esempio=lan-switch apre subito
// un file della cartella examples/, senza passare dal pulsante "Apri".
// Nel sito pubblicato questo blocco non esiste.
if (import.meta.env.DEV && !provisional) {
  const example = new URLSearchParams(location.search).get("esempio");
  if (example !== null) {
    const fileName = `${example}.netsim.json`;
    fetch(`/examples/${fileName}`)
      .then((response) => response.text())
      .then((text) => session.open(fileName, text));
  }
}
