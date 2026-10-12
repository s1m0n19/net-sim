<script lang="ts">
  // La tabella di routing di un router nel pannello laterale, e ciò che
  // serve a cambiarla: una crocetta su ogni rotta statica, e tre campi per
  // aggiungerne una.
  import { session } from "../session.svelte";
  import type { DeviceView } from "../view";

  let { device }: { device: DeviceView } = $props();

  let network = $state("");
  let mask = $state("");
  let nextHop = $state("");
  let problem = $state<string | null>(null);

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
     prossimo salto non sta su una rete collegata. -->
{#if device.routingRows.length === 0}
  <p>Vuota.</p>
{:else}
  <table>
    <thead><tr><th></th><th>Rete</th><th>Via</th><th>Esce da</th><th></th></tr></thead>
    <tbody>
      {#each device.routingRows as row (`${row.code} ${row.destination} ${row.nextHop}`)}
        <tr class:unused={row.portName === null}>
          <td>{row.code}</td>
          <td>{row.destination}</td>
          <td>{row.nextHop ?? "—"}</td>
          <td>{row.portName ?? "non usata"}</td>
          <td class="end">
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
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<form onsubmit={add} aria-label="Nuova rotta statica">
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
  table {
    border-collapse: collapse;
    width: 100%;
    font-family: var(--font-mono);
    font-size: 0.9em;
    font-variant-numeric: tabular-nums;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    font-family: var(--font-ui);
  }
  th,
  td {
    padding: 3px 5px 3px 0;
    border-bottom: 1px solid var(--line);
  }
  /* Una rotta che non viene usata: attenuata, e lo dice a parole. */
  .unused td {
    color: var(--muted);
    font-style: italic;
  }
  .end {
    padding-right: 0;
    text-align: right;
  }
  .remove {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
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
  form {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px 12px;
    align-items: center;
  }
  label {
    color: var(--muted);
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 3px 6px;
    font: inherit;
    font-family: var(--font-mono);
    color: var(--ink);
    background: var(--canvas);
    border: 1px solid var(--line);
    border-radius: 4px;
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
    font-size: 0.92em;
  }
</style>
