<svelte:options namespace="svg" />

<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import type { DeviceView } from "../view";

  // Un dispositivo che aspetta una risposta: un anello che si svuota.
  // `progress` va da 0 (attesa appena cominciata) a 1 (scaduta).
  let { device, progress }: { device: DeviceView; progress: number } = $props();

  const RADIUS = 9;
  const circumference = 2 * Math.PI * RADIUS;
</script>

<!-- Un'attesa non va nell'immagine esportata: è un istante della simulazione. -->
<g data-export-skip transform="translate({device.x + 34 * preferences.scale} {device.y - 30 * preferences.scale}) scale({preferences.scale})">
  <title>{device.name} sta aspettando una risposta</title>
  <circle class="track" r={RADIUS} />
  <circle
    class="remaining"
    r={RADIUS}
    transform="rotate(-90)"
    stroke-dasharray="{circumference * (1 - progress)} {circumference}"
  />
  <!-- La clessidra dice "attesa" anche a chi non legge il colore. -->
  <path class="glass" d="M-3 -4H3L-3 4H3Z" />
</g>

<style>
  .track {
    fill: var(--surface);
    stroke: var(--line);
    stroke-width: 3;
  }
  .remaining {
    fill: none;
    stroke: var(--accent);
    stroke-width: 3;
  }
  .glass {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.3;
    stroke-linejoin: round;
  }
</style>
