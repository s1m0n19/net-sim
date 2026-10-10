<svelte:options namespace="svg" />

<script lang="ts">
  import { session } from "../session.svelte";
  import type { PacketView } from "../view";

  let { packet }: { packet: PacketView } = $props();

  // La busta non parte dal centro di un dispositivo e non arriva al centro
  // dell'altro: viaggia tra i due bordi, così non copre le icone.
  const EDGE = 46;

  // Quanta strada ha fatto, da 0 a 1: dipende dal tempo che si sta mostrando.
  const progress = $derived(
    Math.min(1, Math.max(0, (session.displayTime - packet.departure) / (packet.arrival - packet.departure))),
  );

  const position = $derived.by(() => {
    const dx = packet.to.x - packet.from.x;
    const dy = packet.to.y - packet.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const travel = Math.max(0, length - 2 * EDGE);
    const distance = EDGE + travel * progress;
    return { x: packet.from.x + (dx / length) * distance, y: packet.from.y + (dy / length) * distance };
  });
</script>

<!-- Colore e sigla dicono il protocollo: due segni, non uno solo. -->
<g class="packet" class:arp={packet.protocol === "ARP"} class:icmp={packet.protocol === "ICMP"} transform="translate({position.x} {position.y})">
  <title>{packet.description}</title>
  <text y="-14">{packet.protocol}</text>
  <rect x="-13" y="-9" width="26" height="18" rx="3" />
  <path d="M-10 -5L0 2L10 -5" />
</g>

<style>
  .arp {
    --protocol: var(--arp);
  }
  .icmp {
    --protocol: var(--icmp);
  }
  rect {
    fill: var(--protocol);
    stroke: var(--canvas);
    stroke-width: 1.5;
  }
  path {
    fill: none;
    stroke: var(--canvas);
    stroke-width: 1.6;
    stroke-linejoin: round;
  }
  text {
    fill: var(--protocol);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 12px;
    text-anchor: middle;
    /* Un alone del colore dello sfondo tiene leggibile la sigla sopra un cavo. */
    paint-order: stroke;
    stroke: var(--canvas);
    stroke-width: 3px;
  }
</style>
