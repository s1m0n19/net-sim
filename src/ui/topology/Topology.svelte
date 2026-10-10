<script lang="ts">
  import { session } from "../session.svelte";
  import DeviceNode from "./DeviceNode.svelte";
  import LinkLine from "./LinkLine.svelte";

  const bounds = $derived(session.view.bounds);
</script>

<div class="canvas">
  {#if session.isEmpty()}
    <div class="hint">
      <strong>La rete è vuota</strong>
      <span>Apri un file con il pulsante "Apri", in alto a sinistra.</span>
    </div>
  {:else}
    <!-- La rete viene sempre inquadrata per intero. -->
    <svg
      viewBox="{bounds.x} {bounds.y} {bounds.width} {bounds.height}"
      role="img"
      aria-label="Topologia della rete"
    >
      {#each session.view.links as link (link.id)}
        <LinkLine {link} />
      {/each}
      {#each session.view.devices as device (device.id)}
        <DeviceNode {device} />
      {/each}
    </svg>
  {/if}
</div>

<style>
  .canvas {
    position: relative;
    background: var(--canvas);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .hint {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--muted);
    text-align: center;
  }
  .hint strong {
    color: var(--ink);
    font-size: 1.25em;
    font-weight: 600;
  }
</style>
