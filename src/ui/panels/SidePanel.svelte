<script lang="ts">
  // Il pannello laterale mostra l'ultima cosa selezionata: un dispositivo,
  // un cavo o un pacchetto. Per ora è in sola lettura.
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import PacketLayers from "./PacketLayers.svelte";

  const selection = $derived(session.selection);

  const device = $derived(
    selection?.kind === "device" ? session.view.devices.find((d) => d.id === selection.id) : undefined,
  );
  const link = $derived(
    selection?.kind === "link" ? session.view.links.find((l) => l.id === selection.id) : undefined,
  );
  // Del pacchetto si mostra la copia presa al momento della selezione:
  // resta leggibile anche dopo che è arrivato.
  const packet = $derived(selection?.kind === "packet" ? selection.packet : undefined);
  const stillTravelling = $derived(
    packet !== undefined && session.view.packets.some((p) => p.id === packet.id),
  );

  // La riga sotto il nome: tipo e stato, separati da un punto a mezza altezza.
  const deviceSummary = $derived.by(() => {
    if (device === undefined) return "";
    const parts = [device.kind === "host" ? "PC" : "Switch", device.powered ? "acceso" : "spento"];
    if (device.kind === "host" && device.powered) {
      parts.push(device.linkUp ? "segnale presente" : "senza segnale");
    }
    return parts.join(" · ");
  });
  const linkSummary = $derived.by(() => {
    if (link === undefined) return "";
    if (!link.connected) return "Staccato";
    return `Collegato · ${link.signal ? "segnale presente" : "senza segnale"}`;
  });
</script>

{#if !preferences.sideOpen}
  <aside class="closed">
    <button class="fold" title="Apri il pannello" aria-label="Apri il pannello laterale" onclick={() => (preferences.sideOpen = true)}>
      <Chevron direction="left" />
    </button>
  </aside>
{:else}
<aside>
  <button class="fold corner" title="Chiudi il pannello" aria-label="Chiudi il pannello laterale" onclick={() => (preferences.sideOpen = false)}>
    <Chevron direction="right" />
  </button>
  {#if device !== undefined}
    <header>
      <h2>{device.name}</h2>
      <p>{deviceSummary}</p>
    </header>

    {#if device.kind === "host"}
      <dl class="fields">
        <dt>Indirizzo IP</dt>
        <dd>{device.ip ?? "—"}</dd>
        <dt>Subnet mask</dt>
        <dd>{device.mask ?? "—"}</dd>
        <dt>Gateway</dt>
        <dd>{device.gateway ?? "—"}</dd>
        <dt>MAC</dt>
        <dd>{device.mac}</dd>
      </dl>

      <h3>
        Tabella ARP
        <button class="btn pin" class:on={session.isPinned(device.id)} aria-pressed={session.isPinned(device.id)} onclick={() => session.togglePin(device.id)}>
          {session.isPinned(device.id) ? "appuntata" : "appunta"}
        </button>
      </h3>
      {#if device.arpRows.length === 0}
        <p>Vuota.</p>
      {:else}
        <table>
          <thead><tr><th>Indirizzo IP</th><th>Indirizzo MAC</th></tr></thead>
          <tbody>
            {#each device.arpRows as [ip, mac] (ip)}
              <tr><td>{ip}</td><td>{mac}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}

      {#if device.pending.length > 0}
        <h3>In attesa del MAC</h3>
        <ul>
          {#each device.pending as waiting}
            <li>{waiting}</li>
          {/each}
        </ul>
      {/if}
    {:else}
      <dl class="fields">
        <dt>Porte</dt>
        <dd>{device.portCount}</dd>
      </dl>

      <h3>
        Tabella MAC
        <button class="btn pin" class:on={session.isPinned(device.id)} aria-pressed={session.isPinned(device.id)} onclick={() => session.togglePin(device.id)}>
          {session.isPinned(device.id) ? "appuntata" : "appunta"}
        </button>
      </h3>
      {#if device.macRows.length === 0}
        <p>Vuota.</p>
      {:else}
        <table>
          <thead><tr><th>Indirizzo MAC</th><th>Porta</th></tr></thead>
          <tbody>
            {#each device.macRows as [mac, port] (mac)}
              <tr><td>{mac}</td><td>{port}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  {:else if link !== undefined}
    <header>
      <h2>Cavo</h2>
      <p>{linkSummary}</p>
    </header>
    <dl class="fields">
      <dt>Da</dt>
      <dd>{link.fromName} · {link.fromPort}</dd>
      <dt>A</dt>
      <dd>{link.toName} · {link.toPort}</dd>
    </dl>
  {:else if packet !== undefined}
    <header>
      <h2>{packet.description}</h2>
      <p>{stillTravelling ? "In viaggio" : "Arrivato"} · da {packet.fromName} a {packet.toName}</p>
    </header>
    <PacketLayers frame={packet.frame} />
  {:else}
    <header>
      <h2>Nessuna selezione</h2>
      <p>Fai clic su un dispositivo, un cavo o un pacchetto per vederne i dettagli qui.</p>
    </header>
  {/if}
</aside>
{/if}

<style>
  aside {
    position: relative;
    width: 290px;
    box-sizing: border-box;
    background: var(--surface);
    border-left: 1px solid var(--line);
    padding: 12px;
    min-width: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-size: 1.15em;
    font-weight: 600;
  }
  h3 {
    margin: 6px 0 0;
    font-size: 0.9em;
    font-weight: 500;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  h3:has(.pin) {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pin {
    font-size: 1em;
    padding: 1px 7px;
    text-transform: none;
    letter-spacing: 0;
  }
  p {
    margin: 0;
    color: var(--muted);
  }
  .fields {
    margin: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px 12px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-family: var(--font-mono);
    font-size: 0.95em;
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
    padding: 3px 6px 3px 0;
    border-bottom: 1px solid var(--line);
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  /* Chiuso: una striscia sottile, come la colonna dei dispositivi. */
  aside.closed {
    width: 26px;
    padding: 10px 2px;
    align-items: center;
  }
  /* La freccia sta nell'angolo in alto, accanto al titolo: nello stesso
     punto da aperto e da chiuso. */
  .corner {
    position: absolute;
    top: 10px;
    right: 2px;
  }
  header {
    padding-right: 20px;
  }
</style>
