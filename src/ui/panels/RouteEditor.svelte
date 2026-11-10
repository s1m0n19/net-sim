<script lang="ts">
  // La tabella di routing di un router nel pannello laterale, e ciò che
  // serve a cambiarla: una crocetta su ogni rotta statica, e tre campi per
  // aggiungerne una.
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import type { DeviceView } from "../view";

  let { device }: { device: DeviceView } = $props();

  let network = $state("");
  let mask = $state("");
  let nextHop = $state("");
  let problem = $state<string | null>(null);
  // Il modulo si apre con un clic (D-131): la tabella, che si consulta,
  // resta in vista; il modulo, che serve solo per aggiungere, non la
  // allontana. Chiuso resta nella pagina, nascosto: ciò che si è scritto
  // non si perde.
  let formOpen = $state(false);
  const formId = $derived(`route-form-${device.id}`);

  function add(event: SubmitEvent) {
    event.preventDefault();
    problem = session.addRoute(device.id, network, mask, nextHop);
    if (problem === null) {
      network = "";
      mask = "";
      nextHop = "";
    }
  }
</script>

<!-- C = rete collegata, S = rotta statica, come su un Cisco. Una rotta
     statica senza interfaccia di uscita non viene mai usata: il suo
     prossimo salto non sta su una rete collegata.

     Ogni rotta sta su due righe, con le colonne allineate tra una rotta e
     l'altra: sopra la sigla e la rete di destinazione, sotto il prossimo
     salto e l'interfaccia di uscita. Così ci sta anche nel pannello da 290
     px, con gli indirizzi più lunghi (D-114). -->
{#if device.routingRows.length === 0}
  <p class="empty">Vuota.</p>
{:else}
  <p class="legend"><abbr title="rete collegata">C</abbr> rete collegata · <abbr title="rotta statica">S</abbr> rotta statica</p>
  <ul class="routes" aria-label="Rotte">
    <li class="heading" aria-hidden="true">
      <span class="destination">Rete di destinazione</span>
      <span class="hop">Prossimo salto</span>
      <span class="exit">Uscita</span>
    </li>
    {#each device.routingRows as row (`${row.code} ${row.destination} ${row.nextHop}`)}
      <li class:unused={row.portName === null}>
        <span class="code" title={row.code === "C" ? "rete collegata" : "rotta statica"}>{row.code}<span class="sr-only">{row.code === "C" ? ", rete collegata" : ", rotta statica"},</span></span>
        <span class="destination">{row.destination}</span>
        <span class="hop"><span class="sr-only">prossimo salto </span>{row.nextHop ?? "—"}</span>
        <span class="exit"><span class="sr-only">uscita </span>{row.portName ?? "non usata"}</span>
        <span class="end">
          {#if row.code === "S" && row.nextHop !== null}
            {@const route = { network: row.network, mask: row.mask, nextHop: row.nextHop }}
            <button
              class="remove"
              title="Togli questa rotta"
              aria-label="Togli la rotta verso {row.destination} via {row.nextHop}"
              onclick={() => session.removeRoute(device.id, route)}
            >
              <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true"><path d="M3 3L11 11M11 3L3 11" /></svg>
            </button>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<!-- Consultare la tabella e aggiungere una rotta sono due cose diverse:
     il modulo sta in un riquadro a sé, con il suo titolo, e si apre con
     il pulsante qui sotto. -->
<button class="btn open-form" aria-expanded={formOpen} aria-controls={formId} onclick={() => (formOpen = !formOpen)}>
  <Chevron direction={formOpen ? "down" : "right"} />Nuova rotta statica
</button>
<form id={formId} hidden={!formOpen} onsubmit={add} aria-labelledby="route-form-title">
  <h4 id="route-form-title">Aggiungi rotta statica</h4>
  <label for="route-network">Rete</label>
  <input id="route-network" data-field="route-network" bind:value={network} placeholder="192.168.2.0" autocomplete="off" spellcheck="false" />
  <label for="route-mask">Maschera</label>
  <input id="route-mask" data-field="route-mask" bind:value={mask} placeholder="255.255.255.0 o /24" autocomplete="off" spellcheck="false" />
  <label for="route-next-hop">Prossimo salto</label>
  <input id="route-next-hop" data-field="route-next-hop" bind:value={nextHop} placeholder="10.0.0.2" autocomplete="off" spellcheck="false" />
  <button class="btn add" type="submit">Aggiungi rotta</button>
  {#if problem !== null}
    <p class="problem" role="alert"><span aria-hidden="true">✕</span> {problem}</p>
  {/if}
</form>

<style>
  p {
    margin: 0;
    color: var(--muted);
  }
  .empty {
    font-style: italic;
  }
  .legend {
    font-size: var(--text-small);
  }
  abbr {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--ink);
    text-decoration: none;
  }
  /* Un'unica griglia per tutte le rotte: ogni rotta la usa con subgrid,
     così le colonne restano allineate da una rotta all'altra. */
  .routes {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: 1.4em minmax(0, 1fr) auto 22px;
    column-gap: 8px;
    font-family: var(--font-mono);
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
  }
  .routes li {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    grid-template-areas:
      "code destination destination end"
      ".    hop         exit        end";
    row-gap: 0;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .code {
    grid-area: code;
    align-self: start;
    font-weight: 600;
    text-align: center;
  }
  .destination {
    grid-area: destination;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .hop {
    grid-area: hop;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .exit {
    grid-area: exit;
    color: var(--muted);
    white-space: nowrap;
  }
  .end {
    grid-area: end;
    align-self: center;
    justify-self: end;
  }
  /* Le intestazioni hanno la stessa forma delle rotte: due righe. */
  .routes .heading {
    padding: 0 0 4px;
    border-bottom: 1px solid var(--muted);
    font-family: var(--font-ui);
    font-size: var(--text-small);
    color: var(--muted);
  }
  .routes .heading .destination {
    font-weight: 500;
  }
  /* Una rotta che non viene usata: attenuata e in corsivo, e lo dice a
     parole al posto dell'interfaccia. */
  .unused .code,
  .unused .destination,
  .unused .hop,
  .unused .exit {
    color: var(--muted);
    font-style: italic;
    font-weight: 400;
  }
  .remove {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
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
  /* Il modulo per aggiungere una rotta: un riquadro leggero, separato
     dalla tabella che si consulta. */
  .open-form {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding-left: 5px;
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
  input::placeholder {
    color: var(--muted);
    font-family: var(--font-ui);
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
    color: var(--down);
    font-size: var(--text-small);
    line-height: 1.35;
  }
  /* Nel pannello stretto (in presentazione, su uno schermo piccolo) ogni
     etichetta va sopra il suo campo: gli indirizzi restano interi (D-112). */
  @container panel (max-width: 250px) {
    form {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
    .add {
      grid-column: 1;
      margin-top: 6px;
    }
    .routes {
      grid-template-columns: 1em minmax(0, 1fr) 0 22px;
      column-gap: 4px;
    }
    .routes li {
      grid-template-areas:
        "code destination destination end"
        ".    hop         hop         end"
        ".    exit        exit        end";
    }
  }
</style>
