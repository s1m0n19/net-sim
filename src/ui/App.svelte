<script lang="ts">
  // L'ossatura della schermata: barra in alto, colonna dei dispositivi,
  // disegno, pannello laterale, fascia in basso. Qui si decide solo dove
  // sta ogni area: i componenti non sanno in quale posizione si trovano.
  import Palette from "./layout/Palette.svelte";
  import TopBar from "./layout/TopBar.svelte";
  import SidePanel from "./panels/SidePanel.svelte";
  import { session } from "./session.svelte";
  import BottomStrip from "./strip/BottomStrip.svelte";
  import Topology from "./topology/Topology.svelte";
</script>

<div class="shell">
  <div class="top"><TopBar /></div>
  {#if session.error !== null}
    <div class="error" role="alert">
      <span><strong>Il file non si può aprire.</strong> {session.error}</span>
      <button class="btn" onclick={() => (session.error = null)}>Chiudi</button>
    </div>
  {/if}
  <Palette />
  <Topology />
  <SidePanel />
  <div class="bottom"><BottomStrip /></div>
</div>

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 290px;
    grid-template-rows: 46px auto minmax(0, 1fr) auto;
  }
  .top,
  .error,
  .bottom {
    grid-column: 1 / -1;
  }
  .top {
    display: grid;
  }
  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: var(--surface);
    border-bottom: 2px solid var(--down);
  }
  /* La riga dell'errore esiste solo quando c'è un errore: senza, colonna,
     disegno e pannello vanno sulla riga che si allarga. */
  .shell > :global(aside),
  .shell > :global(.canvas) {
    grid-row: 3;
  }
  .bottom {
    grid-row: 4;
  }
</style>
