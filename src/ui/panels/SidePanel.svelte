<script lang="ts">
  // Il pannello laterale mostrerà ciò che è selezionato. Per ora nulla si
  // può selezionare, quindi dice solo che cosa comparirà qui.
  //
  // Finché non esiste la barretta delle azioni, ospita anche un modo
  // provvisorio per lanciare un ping, altrimenti non ci sarebbe nulla da
  // guardare scorrere.
  import { session } from "../session.svelte";

  const hosts = $derived(session.view.devices.filter((device) => device.kind === "host"));

  let sourceId = $state("");
  let targetIp = $state("");
  let count = $state(1);
  let problem = $state<string | null>(null);

  // A ogni rete aperta, si riparte dal primo host verso il secondo.
  $effect(() => {
    session.generation;
    sourceId = hosts[0]?.id ?? "";
    targetIp = hosts[1]?.ip ?? "";
    problem = null;
  });

  function sendPing(event: SubmitEvent) {
    event.preventDefault();
    problem = session.ping(sourceId, targetIp.trim(), count);
  }
</script>

<aside>
  <h2>Nessuna selezione</h2>
  <p>Qui comparirà ciò che selezioni: un dispositivo, un cavo o un pacchetto.</p>

  {#if hosts.length > 0}
    <form onsubmit={sendPing}>
      <h3>Ping di prova</h3>
      <p>Provvisorio: sarà sostituito dal pulsante Ping sulla barretta del dispositivo.</p>
      <label>
        <span>Da</span>
        <select id="ping-source" bind:value={sourceId}>
          {#each hosts as host (host.id)}
            <option value={host.id}>{host.name}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>A</span>
        <input id="ping-target" class="mono" bind:value={targetIp} list="ping-known" />
        <datalist id="ping-known">
          {#each hosts as host (host.id)}
            {#if host.ip !== null}<option value={host.ip}>{host.name}</option>{/if}
          {/each}
        </datalist>
      </label>
      <label>
        <span>Richieste</span>
        <input id="ping-count" type="number" min="1" max="10" bind:value={count} />
      </label>
      <button class="btn" disabled={session.view.suspended}>Ping</button>
      {#if problem !== null}
        <p class="problem" role="alert">{problem}</p>
      {/if}
    </form>
  {/if}
</aside>

<style>
  aside {
    background: var(--surface);
    border-left: 1px solid var(--line);
    padding: 12px;
    min-width: 0;
    overflow: auto;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.1em;
    font-weight: 600;
  }
  h3 {
    margin: 0;
    font-size: 1em;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--muted);
  }
  form {
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px dashed var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  label {
    display: grid;
    grid-template-columns: 70px 1fr;
    align-items: center;
    gap: 6px;
    width: 100%;
  }
  label span {
    color: var(--muted);
  }
  select,
  input {
    font: inherit;
    color: inherit;
    min-width: 0;
    padding: 3px 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  input.mono {
    font-family: var(--font-mono);
  }
  .problem {
    color: var(--down);
  }
</style>
