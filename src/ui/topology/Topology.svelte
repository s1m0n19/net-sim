<script lang="ts">
  import { session } from "../session.svelte";
  import SimulationBar from "../simulation/SimulationBar.svelte";
  import DeviceNode from "./DeviceNode.svelte";
  import LinkLine from "./LinkLine.svelte";
  import PacketEnvelope from "./PacketEnvelope.svelte";
  import WaitIndicator from "./WaitIndicator.svelte";

  const bounds = $derived(session.view.bounds);

  // I dispositivi che stanno aspettando una risposta, quando non viaggia nulla.
  const waiting = $derived(
    session.waitProgress === null
      ? []
      : session.view.devices.filter((device) => session.view.nextEvent?.waitingDeviceIds.includes(device.id)),
  );
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
      {#each session.view.packets as packet (`${session.generation}-${packet.id}`)}
        <PacketEnvelope {packet} />
      {/each}
      {#each waiting as device (device.id)}
        <WaitIndicator {device} progress={session.waitProgress ?? 0} />
      {/each}
    </svg>

    {#if session.view.suspended}
      <div class="storm" role="alert">
        <strong>Simulazione sospesa: tempesta di broadcast.</strong>
        Ci sono {session.view.packets.length} frame che continuano a girare senza fermarsi. La causa è
        un ciclo tra switch: senza spanning tree, un broadcast inoltrato in cerchio non si esaurisce
        mai. Premi "Ricomincia" per ripartire.
      </div>
    {/if}

    <SimulationBar />
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
  .storm {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, calc(100% - 28px));
    box-sizing: border-box;
    padding: 10px 14px;
    background: var(--surface);
    border: 2px solid var(--down);
    border-radius: var(--radius);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
  }
  .storm strong {
    display: block;
    color: var(--down);
  }
</style>
