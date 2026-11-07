<script lang="ts">
  // Un'interfaccia di un router nel pannello laterale: il nome, un
  // interruttore per accenderla o spegnerla, indirizzo e maschera.
  import { session } from "../session.svelte";
  import type { InterfaceView } from "../view";
  import ConfigField from "./ConfigField.svelte";

  let { deviceId, port }: { deviceId: string; port: InterfaceView } = $props();
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
    <strong>{port.name}</strong>
    <button
      class="btn state"
      class:on={port.enabled}
      aria-pressed={port.enabled}
      aria-label="Interfaccia {port.name}: {port.enabled ? 'accesa, premi per spegnerla' : 'spenta, premi per accenderla'}"
      onclick={() => session.toggleInterface(deviceId, port.name)}
    >
      <span class="mark" aria-hidden="true"></span>{port.enabled ? "accesa" : "spenta"}
    </button>
  </div>
  <div class="fields">
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
  strong {
    font-family: var(--font-mono);
    font-weight: 600;
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
  .state.on {
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
  .state.on .mark {
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
  /* Nel pannello stretto (in presentazione, su uno schermo piccolo) ogni
     etichetta va sopra il suo campo: gli indirizzi restano interi (D-112). */
  @container panel (max-width: 250px) {
    .interface {
      padding-inline: 6px 4px;
    }
    .fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
