<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import Chevron from "../theme/Chevron.svelte";
</script>

<footer>
  <div class="tabs">
    <span class="tab selected">Eventi</span>
    <button
      class="fold"
      title={preferences.stripOpen ? "Chiudi la fascia" : "Apri la fascia"}
      aria-label={preferences.stripOpen ? "Chiudi la fascia in basso" : "Apri la fascia in basso"}
      aria-expanded={preferences.stripOpen}
      onclick={() => (preferences.stripOpen = !preferences.stripOpen)}
    >
      <Chevron direction={preferences.stripOpen ? "down" : "up"} />
    </button>
  </div>
  {#if preferences.stripOpen}
    <div class="body">Nessun evento: l'elenco degli eventi non è ancora disponibile in questa interfaccia.</div>
  {/if}
</footer>

<style>
  footer {
    background: var(--surface);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 6px 10px 0;
    border-bottom: 1px solid var(--line);
  }
  .tab {
    padding: 5px 12px;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--radius) var(--radius) 0 0;
    color: var(--muted);
  }
  .tab.selected {
    border-color: var(--line);
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 600;
  }
  /* La freccia sta in fondo alla riga delle schede, allineata a quella
     del pannello laterale. */
  .fold {
    margin-left: auto;
    margin-right: -8px;
    align-self: center;
  }
  .body {
    height: 132px;
    box-sizing: border-box;
    background: var(--surface-2);
    padding: 10px 12px;
    color: var(--muted);
    overflow: auto;
  }
</style>
