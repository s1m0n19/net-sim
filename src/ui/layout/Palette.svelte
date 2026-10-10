<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import DeviceIcon from "../theme/DeviceIcon.svelte";

  // Le voci della colonna. Per ora sono tutte spente: posare dispositivi
  // e tirare cavi arriva con l'editor.
  const devices = [
    { kind: "host", label: "PC" },
    { kind: "switch", label: "Switch" },
    { kind: "router", label: "Router" },
    { kind: "server", label: "Server" },
  ] as const;
</script>

{#if preferences.paletteOpen}
  <aside>
    <div class="caption">Dispositivi</div>
    {#each devices as device}
      <div class="tile" title="Non ancora disponibile">
        <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind={device.kind} /></svg>
        {device.label}
      </div>
    {/each}
    <div class="caption">Strumenti</div>
    <div class="tile" title="Non ancora disponibile">
      <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="cable" /></svg>
      Cavo
    </div>
    <button class="toggle" onclick={() => (preferences.paletteOpen = false)}>‹ chiudi</button>
  </aside>
{:else}
  <aside class="closed">
    <button class="toggle" aria-label="Apri la colonna dei dispositivi" onclick={() => (preferences.paletteOpen = true)}>›</button>
  </aside>
{/if}

<style>
  aside {
    width: 84px;
    box-sizing: border-box;
    background: var(--surface);
    border-right: 1px solid var(--line);
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  aside.closed {
    width: 22px;
    padding: 6px 0;
  }
  .caption {
    color: var(--muted);
    font-size: 0.85em;
    text-align: center;
  }
  .tile {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-2);
    padding: 6px 2px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    font-size: 0.85em;
    opacity: 0.45;
  }
  .tile svg {
    width: 34px;
    height: 28px;
  }
  .toggle {
    margin-top: auto;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 0.85em;
    cursor: pointer;
    padding: 4px 0;
  }
  .toggle:hover {
    color: var(--ink);
  }
  .toggle:focus-visible {
    outline: 2px solid var(--accent);
  }
</style>
