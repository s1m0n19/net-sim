<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import Chevron from "../theme/Chevron.svelte";
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
    <button class="fold" title="Chiudi la colonna" aria-label="Chiudi la colonna dei dispositivi" onclick={() => (preferences.paletteOpen = false)}>
      <Chevron direction="left" />
    </button>
  </aside>
{:else}
  <aside class="closed">
    <button class="fold" title="Apri la colonna" aria-label="Apri la colonna dei dispositivi" onclick={() => (preferences.paletteOpen = true)}>
      <Chevron direction="right" />
    </button>
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
    width: 26px;
    padding: 10px 2px;
  }
  /* La freccia sta in fondo, nello stesso punto da aperta e da chiusa. */
  .fold {
    margin-top: auto;
    align-self: center;
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
</style>
