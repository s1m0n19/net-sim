<script lang="ts">
  // Un'interfaccia di un router nel pannello laterale: il nome, un
  // interruttore per accenderla o spegnerla, indirizzo e maschera.
  //
  // È una scheda che si apre e si chiude (D-131): chiusa mostra nome,
  // indirizzo (o «nessun indirizzo») e l'interruttore; aperta anche i
  // campi. Se ne possono aprire quante si vuole. Aperta o chiusa è solo
  // presentazione: sta qui, non nel motore, e una modifica o un passo
  // della simulazione non la cambia. I campi chiusi restano nella pagina,
  // nascosti: ciò che si stava scrivendo non si perde.
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import type { InterfaceView } from "../view";
  import ConfigField from "./ConfigField.svelte";

  let { deviceId, port }: { deviceId: string; port: InterfaceView } = $props();

  // Si comincia chiusi: si vede l'elenco intero, e si apre ciò che serve.
  let open = $state(false);
  const bodyId = $derived(`interface-${deviceId}-${port.name}`.replace(/[^\w-]/g, "-"));

</script>

<!-- Accesa o spenta si legge tre volte: la parola sul pulsante, il
     cerchietto pieno o vuoto, e la barra a sinistra, piena e verde o
     tratteggiata e grigia. Il rosso resta sul solo pulsante, come il
     quadratino sul capo del cavo: con otto interfacce spente il pannello
     non si riempie di rosso. Un
     campo vuoto dice "nessun indirizzo": un'interfaccia senza indirizzo
     non si confonde con una spenta (D-114). -->
<div class="interface" class:on={port.enabled} role="group" aria-label="Interfaccia {port.name}">
  <div class="head">
    <!-- Il nome e l'indirizzo aprono e chiudono la scheda; la freccia dice
         da che parte è, oltre ai campi che compaiono. -->
    <button class="disclosure" aria-expanded={open} aria-controls={bodyId} onclick={() => (open = !open)}>
      <span class="chevron" aria-hidden="true"><Chevron direction={open ? "down" : "right"} /></span>
      <strong>{port.name}</strong>
      <span class="address" class:none={port.ipLabel === null}>{port.ipLabel ?? "nessun indirizzo"}</span>
    </button>
    <button
      class="btn state"
      class:enabled={port.enabled}
      aria-pressed={port.enabled}
      aria-label="Interfaccia {port.name}: {port.enabled ? 'accesa, premi per spegnerla' : 'spenta, premi per accenderla'}"
      onclick={() => session.toggleInterface(deviceId, port.name)}
    >
      <span class="mark" aria-hidden="true"></span>{port.enabled ? "accesa" : "spenta"}
    </button>
  </div>
  <div class="fields" id={bodyId} hidden={!open}>
    <ConfigField
      label="Indirizzo IP"
      name="ip-{port.name}"
      value={port.ip}
      placeholder="nessun indirizzo"
      apply={(text) => session.configureInterface(deviceId, port.name, "ip", text)}
    />
    <ConfigField
      label="Subnet mask"
      name="mask-{port.name}"
      value={port.mask}
      placeholder="nessuna"
      apply={(text) => session.configureInterface(deviceId, port.name, "mask", text)}
    />
  </div>
</div>

<style>
  .interface {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px 6px 7px 8px;
    border-left: 3px dashed var(--muted);
    border-radius: 0 var(--radius) var(--radius) 0;
    background: var(--surface-2);
    /* I campi dentro guardano lo spazio che resta nel riquadro, non solo il
       pannello: con l'ingrandimento della presentazione, o una barra di
       scorrimento che occupa posto (Firefox su Linux), il pannello può
       essere largo abbastanza e il riquadro no (D-112, D-123). */
    container: interface / inline-size;
  }
  .interface.on {
    border-left-style: solid;
    border-left-color: var(--up);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  /* Tutta la riga, tranne l'interruttore, apre e chiude: un bersaglio
     grande, senza l'aspetto di un pulsante. */
  .disclosure {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 6px;
    padding: 2px 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .disclosure:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius);
  }
  .chevron {
    align-self: center;
    display: inline-flex;
    color: var(--muted);
  }
  strong {
    font-family: var(--font-mono);
    font-weight: 600;
  }
  /* L'indirizzo con il prefisso, come accanto al cavo; senza, lo si dice. */
  /* Se accanto al nome non ci sta, l'indirizzo va a capo sotto di lui,
     intero: un indirizzo tagliato non si legge. */
  .address {
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: var(--text-small);
    color: var(--muted);
  }
  .address.none {
    font-family: var(--font-ui);
    font-style: italic;
  }
  .disclosure:hover strong {
    color: var(--accent);
  }
  .state {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 1px 9px;
    min-width: 72px;
    color: var(--down);
    border-color: var(--down);
  }
  /* Non è il "premuto" dei pulsanti (.btn.on, nel colore d'accento):
     accesa e spenta hanno il verde e il rosso del quadratino sul cavo. */
  .state:not(.enabled):hover {
    border-color: var(--down);
  }
  .state.enabled,
  .state.enabled:hover {
    color: var(--up);
    border-color: var(--up);
  }
  .mark {
    box-sizing: border-box;
    width: 8px;
    height: 8px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
  }
  .state.enabled .mark {
    background: currentColor;
  }
  /* Le etichette qui sono solo "Indirizzo IP" e "Subnet mask": una colonna
     un po' più stretta lascia ai campi lo spazio per l'indirizzo più lungo,
     255.255.255.255, anche dentro il riquadro dell'interfaccia. */
  .fields {
    display: grid;
    grid-template-columns: 6.2em minmax(0, 1fr);
    gap: 5px 8px;
  }
  .fields[hidden] {
    display: none;
  }
  /* Nel pannello stretto (in presentazione, su uno schermo piccolo) ogni
     etichetta va sopra il suo campo: gli indirizzi restano interi (D-112). */
  @container panel (max-width: 250px) {
    .interface {
      padding-inline: 6px 4px;
    }
  }
  /* Accanto all'etichetta (6.2em, 81 pixel, più 8 di spazio) un indirizzo
     intero, 255.255.255.255, chiede 117 pixel di testo e 16 di margini e
     bordo del campo: sotto i 228 pixel, qualcuno di scorta compreso, ogni
     etichetta va sopra il suo campo. Il carattere dei campi resta di 13
     pixel anche ingrandendo, perciò la soglia è in pixel. */
  @container interface (max-width: 228px) {
    .fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
