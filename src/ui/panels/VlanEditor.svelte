<script lang="ts">
  // Le VLAN di uno switch nel pannello laterale (D-145): una riga per VLAN,
  // con il numero, il nome da cambiare, le porte che ci stanno e una
  // crocetta per eliminarla; sotto, un modulo per crearne una.
  //
  // Le regole sono quelle del motore, le stesse della CLI: qui non si
  // decide nulla. Eliminare una VLAN non chiede conferma, perché si
  // annulla con Annulla; le sue porte restano assegnate al numero, inattive.
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import type { DeviceView } from "../view";
  import ConfigField from "./ConfigField.svelte";

  let { device }: { device: DeviceView } = $props();

  // Oltre questo numero di porte la riga dice solo quante sono: l'elenco
  // intero sta nella sezione Porte.
  const LISTED_PORTS = 6;

  let id = $state("");
  let name = $state("");
  let problem = $state<string | null>(null);
  // Il modulo si apre con un clic, come quello delle rotte (D-131): chiuso
  // resta nella pagina, nascosto, e ciò che si è scritto non si perde.
  let formOpen = $state(false);
  const formId = $derived(`vlan-form-${device.id}`);

  function add(event: SubmitEvent) {
    event.preventDefault();
    problem = session.addVlan(device.id, id, name);
    if (problem === null) {
      id = "";
      name = "";
    }
  }

  // Le porte trunk che consentono la VLAN, a parte: non ci stanno, la
  // lasciano passare.
  function trunksText(trunks: string[]): string {
    return trunks.length === 0 ? "" : ` · trunk: ${trunks.join(", ")}`;
  }

  function portsText(ports: string[]): string {
    if (ports.length === 0) return "nessuna porta";
    const count = ports.length === 1 ? "1 porta" : `${ports.length} porte`;
    return ports.length > LISTED_PORTS ? count : `${count}: ${ports.join(", ")}`;
  }
</script>

<ul class="vlans" aria-label="VLAN configurate">
  {#each device.vlans as vlan (vlan.id)}
    <li>
      {#if vlan.isDefault}
        <!-- La VLAN 1 c'è sempre e non si cambia: il nome non è un campo. -->
        <span class="id">{vlan.id}</span>
        <span class="fixed">{vlan.name} <span class="tag">predefinita</span></span>
      {:else}
        <ConfigField
          label={String(vlan.id)}
          ariaLabel="Nome della VLAN {vlan.id}"
          name="vlan-name-{vlan.id}"
          mono={false}
          value={vlan.name}
          apply={(text) => session.renameVlan(device.id, vlan.id, text)}
        />
        <button class="remove" title="Elimina questa VLAN" aria-label="Elimina la VLAN {vlan.id}" onclick={() => session.removeVlan(device.id, vlan.id)}>
          <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true"><path d="M3 3L11 11M11 3L3 11" /></svg>
        </button>
      {/if}
      <span class="ports">{portsText(vlan.ports)}{trunksText(vlan.trunks)}</span>
    </li>
  {/each}
</ul>

<button class="btn open-form" aria-expanded={formOpen} aria-controls={formId} onclick={() => (formOpen = !formOpen)}>
  <Chevron direction={formOpen ? "down" : "right"} />Nuova VLAN
</button>
<form id={formId} hidden={!formOpen} onsubmit={add} aria-labelledby="{formId}-title">
  <h4 id="{formId}-title">Crea una VLAN</h4>
  <label for="{formId}-id">Numero</label>
  <input id="{formId}-id" data-field="vlan-id" bind:value={id} placeholder="da 1 a 1001" inputmode="numeric" autocomplete="off" spellcheck="false" />
  <label for="{formId}-name">Nome</label>
  <input id="{formId}-name" data-field="vlan-name" class="text" bind:value={name} placeholder="facoltativo" autocomplete="off" spellcheck="false" />
  <button class="btn add" type="submit">Crea VLAN</button>
  {#if problem !== null}
    <p class="problem" role="alert"><span aria-hidden="true">✕</span> {problem}</p>
  {/if}
</form>

<style>
  /* Una griglia per tutte le VLAN: il numero nella colonna delle
     etichette, il nome nel campo, la crocetta a destra; sotto il nome, le
     porte. */
  .vlans {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: 3.2em minmax(0, 1fr) 22px;
    column-gap: 8px;
  }
  .vlans li {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: start;
    row-gap: 2px;
    padding: 4px 0;
    border-bottom: 1px solid var(--line);
  }
  /* Il numero della VLAN 1, nella stessa colonna dei numeri delle altre
     (che sono le etichette dei loro campi). */
  .id {
    color: var(--muted);
    padding-top: 5px;
  }
  /* Il nome che non si cambia, allineato al testo dei campi. */
  .fixed {
    grid-column: 2 / -1;
    padding: 5px 0 0 8px;
  }
  .tag {
    margin-left: 4px;
    color: var(--muted);
    font-size: var(--text-small);
    font-style: italic;
  }
  .ports {
    grid-column: 2 / -1;
    padding-left: 8px;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: var(--text-small);
    overflow-wrap: anywhere;
  }
  .remove {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-top: 3px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .remove:hover,
  .remove:focus-visible {
    color: var(--down);
    border-color: var(--down);
    outline: none;
  }
  .remove path {
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  /* Il modulo per crearne una: come quello delle rotte statiche. */
  .open-form {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding-left: 5px;
    justify-self: start;
  }
  form[hidden] {
    display: none;
  }
  form {
    display: grid;
    grid-template-columns: var(--label-width, 7em) minmax(0, 1fr);
    gap: 6px 10px;
    align-items: center;
    margin-top: 4px;
    padding: 8px 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  h4 {
    grid-column: 1 / -1;
    margin: 0 0 2px;
    font-size: var(--text-base);
    font-weight: 600;
  }
  label {
    color: var(--muted);
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 7px;
    font: inherit;
    font-family: var(--font-mono);
    color: var(--ink);
    background: var(--canvas);
    border: 1px solid var(--field-border);
    border-radius: var(--radius);
  }
  input.text {
    font-family: var(--font-ui);
  }
  input::placeholder {
    color: var(--muted);
    font-family: var(--font-ui);
    font-style: italic;
  }
  input:hover:not(:focus) {
    border-color: var(--muted);
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .add {
    grid-column: 2;
    justify-self: start;
  }
  .problem {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--down);
    font-size: var(--text-small);
    line-height: 1.35;
  }
  /* Nel pannello stretto ogni etichetta va sopra il suo campo (D-112). */
  @container panel (max-width: 250px) {
    form {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
    .add {
      grid-column: 1;
      margin-top: 6px;
    }
  }
</style>
