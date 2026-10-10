<script lang="ts">
  import { preferences } from "../preferences.svelte";
</script>

<footer>
  <div class="tabs">
    <span class="tab selected">Eventi</span>
    <button
      class="toggle"
      aria-expanded={preferences.stripOpen}
      onclick={() => (preferences.stripOpen = !preferences.stripOpen)}
    >
      {preferences.stripOpen ? "chiudi ⌄" : "apri ⌃"}
    </button>
  </div>
  {#if preferences.stripOpen}
    <div class="body">Nessun evento: la simulazione non è ancora disponibile in questa interfaccia.</div>
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
  .toggle {
    margin-left: auto;
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
    padding: 5px 0;
  }
  .toggle:hover {
    color: var(--ink);
  }
  .toggle:focus-visible {
    outline: 2px solid var(--accent);
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
