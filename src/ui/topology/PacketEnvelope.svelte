<svelte:options namespace="svg" />

<script lang="ts">
  import { preferences } from "../preferences.svelte";
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
    // Con i dispositivi ingranditi, anche i loro bordi sono più lontani.
    const edge = EDGE * preferences.scale;
    const travel = Math.max(0, length - 2 * edge);
    const distance = edge + travel * progress;
    return { x: packet.from.x + (dx / length) * distance, y: packet.from.y + (dy / length) * distance };
  });

  const selected = $derived(session.selection?.kind === "packet" && session.selection.id === packet.id);

  const highlighted = $derived(session.highlight?.packetId === packet.id);

  function choose() {
    session.select({ kind: "packet", id: packet.id, packet });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose();
    }
  }
</script>

<!-- Colore e sigla dicono il protocollo: due segni, non uno solo. -->
<g
  class="packet"
  class:arp={packet.protocol === "ARP"}
  class:icmp={packet.protocol === "ICMP"}
  transform="translate({position.x} {position.y}) scale({preferences.scale})"
  role="button"
  tabindex="0"
  aria-label="{packet.description}, da {packet.fromName} a {packet.toName}{selected ? ', selezionato' : ''}"
  onclick={(event) => {
    event.stopPropagation();
    choose();
  }}
  onkeydown={onKey}
>
  <title>{packet.description}</title>
  <!-- Un riquadro invisibile sotto sigla e busta: così un clic vale su
       tutta la sagoma, anche tra le lettere della sigla. -->
  <rect class="hit" x="-20" y="-28" width="40" height="44" />
  {#if selected}
    <rect class="selection" x="-20" y="-28" width="40" height="44" rx="6" />
  {:else if highlighted}
    <rect class="selection dashed" x="-20" y="-28" width="40" height="44" rx="6" />
  {/if}
  <text y="-14">{packet.protocol}</text>
  <rect x="-13" y="-9" width="26" height="18" rx="3" />
  <path d="M-10 -5L0 2L10 -5" />
</g>

<style>
  .packet {
    cursor: pointer;
    outline: none;
  }
  .selection {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
  }
  .selection.dashed {
    stroke-width: 2;
    stroke-dasharray: 4 4;
  }
  .hit {
    fill: transparent;
  }
  .packet:focus-visible rect:not(.selection):not(.hit) {
    stroke: var(--accent);
    stroke-width: 3;
  }
  .arp {
    --protocol: var(--arp);
  }
  .icmp {
    --protocol: var(--icmp);
  }
  rect:not(.selection):not(.hit) {
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
