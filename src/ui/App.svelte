<script lang="ts">
  // L'ossatura della schermata: barra in alto, colonna dei dispositivi,
  // disegno, pannello laterale, fascia in basso. Qui si decide solo dove
  // sta ogni area: i componenti non sanno in quale posizione si trovano.
  import { untrack } from "svelte";
  import { followContent } from "./layout/auto-open";
  import Palette from "./layout/Palette.svelte";
  import TopBar from "./layout/TopBar.svelte";
  import { preferences } from "./preferences.svelte";
  import SidePanel from "./panels/SidePanel.svelte";
  import { session } from "./session.svelte";
  import BottomStrip from "./strip/BottomStrip.svelte";
  import Topology from "./topology/Topology.svelte";

  // La fascia in basso segue ciò che ha da mostrare, eventi e terminali:
  // si apre quando compare il primo, si chiude quando non resta nulla
  // (D-107). In presentazione non si apre da sola: lì la aprono T ed E.
  const stripHasContent = $derived(session.terminals.length > 0 || session.view.events.length > 0);
  let stripHad = false;
  $effect(() => {
    const has = stripHasContent;
    untrack(() => {
      const next = followContent(preferences.stripOpen, stripHad, has);
      stripHad = has;
      if (next && !preferences.stripOpen && preferences.presenting) return;
      preferences.stripOpen = next;
    });
  });

  // In presentazione il pannello laterale segue la selezione: si apre
  // quando si seleziona qualcosa e si chiude quando la si toglie.
  let selectedBefore = false;
  $effect(() => {
    const has = session.selection !== null;
    const presenting = preferences.presenting;
    untrack(() => {
      if (presenting) preferences.sideOpen = followContent(preferences.sideOpen, selectedBefore, has);
      selectedBefore = has;
    });
  });
</script>

<div class="shell" class:presenting={preferences.presenting} style="--ui-scale: {preferences.scale}">
  <div class="top"><TopBar /></div>
  {#if session.error !== null}
    <div class="error" role="alert">
      <span><strong>Il file non si può aprire.</strong> {session.error}</span>
      <button class="btn" onclick={() => (session.error = null)}>Chiudi</button>
    </div>
  {/if}
  <!-- In presentazione la colonna dei dispositivi non c'è. -->
  {#if preferences.presenting}
    <span></span>
  {:else}
    <Palette />
  {/if}
  <Topology />
  <SidePanel />
  <div class="bottom"><BottomStrip /></div>
</div>

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
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
  /* In presentazione barre, pannello e fascia si ingrandiscono. Il disegno
     no: lì crescono i singoli elementi, e lo decide Topology. */
  .presenting {
    grid-template-rows: calc(46px * var(--ui-scale)) auto minmax(0, 1fr) auto;
  }
  .presenting > span {
    grid-row: 3;
  }
  .presenting > .top,
  .presenting > .error,
  .presenting > .bottom,
  .presenting > :global(aside),
  .presenting :global(.canvas > .bar),
  .presenting :global(.canvas > .messages),
  .presenting :global(.canvas > .zoom) {
    zoom: var(--ui-scale);
  }
</style>
