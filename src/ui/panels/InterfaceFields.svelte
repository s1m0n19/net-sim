<script lang="ts">
  // Un'interfaccia di un router nel pannello laterale: il nome, un
  // interruttore per accenderla o spegnerla, indirizzo e maschera.
  import { session } from "../session.svelte";
  import type { InterfaceView } from "../view";
  import ConfigField from "./ConfigField.svelte";

  let { deviceId, port }: { deviceId: string; port: InterfaceView } = $props();
</script>

<div class="interface">
  <div class="head">
    <strong>{port.name}</strong>
    <!-- La parola dice lo stato; il colore lo ripete. -->
    <button
      class="btn state"
      class:on={port.enabled}
      aria-pressed={port.enabled}
      aria-label="Interfaccia {port.name}: {port.enabled ? 'accesa, premi per spegnerla' : 'spenta, premi per accenderla'}"
      onclick={() => session.toggleInterface(deviceId, port.name)}
    >
      {port.enabled ? "accesa" : "spenta"}
    </button>
  </div>
  <div class="fields">
    <ConfigField
      label="Indirizzo IP"
      name="ip-{port.name}"
      value={port.ip}
      apply={(text) => session.configureInterface(deviceId, port.name, "ip", text)}
    />
    <ConfigField
      label="Subnet mask"
      name="mask-{port.name}"
      value={port.mask}
      apply={(text) => session.configureInterface(deviceId, port.name, "mask", text)}
    />
  </div>
</div>

<style>
  .interface {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  strong {
    font-family: var(--font-mono);
    font-weight: 500;
  }
  .state {
    padding: 1px 9px;
    min-width: 64px;
    color: var(--down);
    border-color: var(--down);
  }
  .state.on {
    color: var(--up);
    border-color: var(--up);
    background: none;
  }
  .fields {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px 12px;
  }
  /* Nel pannello stretto (in presentazione, su uno schermo piccolo) ogni
     etichetta va sopra il suo campo: gli indirizzi restano interi (D-112). */
  @container panel (max-width: 250px) {
    .fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
