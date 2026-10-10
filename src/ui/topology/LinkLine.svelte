<svelte:options namespace="svg" />

<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import type { LinkView } from "../view";

  let { link }: { link: LinkView } = $props();

  // Un punto del cavo a una certa distanza da un capo, spostato di lato:
  // serve a mettere pallini ed etichette vicino al dispositivo, senza
  // finirci sopra.
  function near(end: "from" | "to", distance: number, sideways = 0) {
    const start = end === "from" ? link.from : link.to;
    const other = end === "from" ? link.to : link.from;
    const length = Math.hypot(other.x - start.x, other.y - start.y) || 1;
    const ux = (other.x - start.x) / length;
    const uy = (other.y - start.y) / length;
    return { x: start.x + ux * distance - uy * sideways, y: start.y + uy * distance + ux * sideways };
  }

  const middle = $derived({ x: (link.from.x + link.to.x) / 2, y: (link.from.y + link.to.y) / 2 });
</script>

<line class="wire" class:down={!link.connected} x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} />

{#if !link.connected}
  <!-- Staccato: rosso e tratteggiato, più una croce. Colore e forma. -->
  <path class="cross" d="M{middle.x - 6} {middle.y - 6}l12 12M{middle.x + 6} {middle.y - 6}l-12 12" />
{/if}

{#if link.signal}
  <!-- Un pallino a ogni capo che sente il segnale. -->
  <circle class="signal" cx={near("from", 42).x} cy={near("from", 42).y} r="4" />
  <circle class="signal" cx={near("to", 42).x} cy={near("to", 42).y} r="4" />
{/if}

{#if preferences.labels.ports}
  <text class="port" x={near("from", 62, 13).x} y={near("from", 62, 13).y + 4}>{link.fromPort}</text>
  <text class="port" x={near("to", 62, -13).x} y={near("to", 62, -13).y + 4}>{link.toPort}</text>
{/if}

<style>
  .wire {
    stroke: var(--muted);
    stroke-width: 2.5;
  }
  .wire.down {
    stroke: var(--down);
    stroke-dasharray: 7 7;
  }
  .cross {
    stroke: var(--down);
    stroke-width: 2.5;
    stroke-linecap: round;
    fill: none;
  }
  .signal {
    fill: var(--up);
  }
  .port {
    fill: var(--muted);
    font-family: var(--font-mono);
    font-size: 11px;
    text-anchor: middle;
  }
</style>
