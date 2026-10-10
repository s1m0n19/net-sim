<svelte:options namespace="svg" />

<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import type { LinkView } from "../view";
  import { pointNear, portLabelPoint } from "./geometry";

  let { link }: { link: LinkView } = $props();

  const selected = $derived(session.selection?.kind === "link" && session.selection.id === link.id);

  // I pallini del segnale stanno sul cavo, poco fuori dal dispositivo.
  const signalFrom = $derived(pointNear(link.from, link.to, 42 * preferences.scale));
  const signalTo = $derived(pointNear(link.to, link.from, 42 * preferences.scale));

  // I nomi delle due porte. Si vedono se le etichette sono accese, e
  // comunque sul cavo selezionato: è da lì che si cambia porta.
  const ports = $derived(
    (["a", "b"] as const).map((end) => ({
      end,
      name: end === "a" ? link.fromPort : link.toPort,
      deviceName: end === "a" ? link.fromName : link.toName,
      at: portLabelPoint(link.from, link.to, end, preferences.scale),
      open: session.portMenu?.linkId === link.id && session.portMenu.end === end,
    })),
  );

  const middle = $derived({ x: (link.from.x + link.to.x) / 2, y: (link.from.y + link.to.y) / 2 });

  function choose() {
    session.select({ kind: "link", id: link.id });
  }

  function onKey(event: KeyboardEvent, action: () => void = choose) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }
</script>

{#if selected}
  <line class="selection" x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} />
{/if}

<line class="wire" class:down={!link.connected} x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} />

{#if !link.connected}
  <!-- Staccato: rosso e tratteggiato, più una croce. Colore e forma. -->
  <path class="cross" d="M{middle.x - 6} {middle.y - 6}l12 12M{middle.x + 6} {middle.y - 6}l-12 12" />
{/if}

{#if link.signal}
  <!-- Un pallino a ogni capo che sente il segnale. -->
  <circle class="signal" cx={signalFrom.x} cy={signalFrom.y} r={4 * preferences.scale} />
  <circle class="signal" cx={signalTo.x} cy={signalTo.y} r={4 * preferences.scale} />
{/if}

<!-- Una riga larga e invisibile sopra il cavo: lo rende facile da cliccare. -->
<line
  class="hit"
  x1={link.from.x}
  y1={link.from.y}
  x2={link.to.x}
  y2={link.to.y}
  role="button"
  tabindex="0"
  aria-label="Cavo tra {link.fromName} e {link.toName}{selected ? ', selezionato' : ''}"
  onclick={(event) => {
    event.stopPropagation();
    choose();
  }}
  onkeydown={(event) => onKey(event)}
/>

<!-- Un clic sul nome di una porta apre l'elenco delle porte libere. -->
{#if preferences.labels.ports || selected}
  {#each ports as port (port.end)}
    <text
      class="port"
      class:open={port.open}
      x={port.at.x}
      y={port.at.y}
      role="button"
      tabindex="0"
      aria-label="Porta {port.name} di {port.deviceName}: cambia porta"
      aria-expanded={port.open}
      onclick={(event) => {
        event.stopPropagation();
        session.openPortMenu(link.id, port.end);
      }}
      onkeydown={(event) => onKey(event, () => session.openPortMenu(link.id, port.end))}
    >{port.name}</text>
  {/each}
{/if}

<style>
  .wire {
    stroke: var(--muted);
    stroke-width: calc(2.5px * var(--k, 1));
  }
  .wire.down {
    stroke: var(--down);
    stroke-dasharray: 7 7;
  }
  .selection {
    stroke: var(--accent);
    stroke-width: calc(9px * var(--k, 1));
    stroke-linecap: round;
    opacity: 0.45;
  }
  .hit {
    stroke: transparent;
    stroke-width: calc(18px * var(--k, 1));
    cursor: pointer;
    outline: none;
  }
  .hit:focus-visible {
    stroke: var(--accent);
    opacity: 0.3;
  }
  .cross {
    stroke: var(--down);
    stroke-width: calc(2.5px * var(--k, 1));
    stroke-linecap: round;
    fill: none;
  }
  .signal {
    fill: var(--up);
  }
  .port {
    fill: var(--muted);
    font-family: var(--font-mono);
    font-size: calc(11px * var(--k, 1));
    text-anchor: middle;
    cursor: pointer;
    outline: none;
  }
  .port:hover,
  .port:focus-visible,
  .port.open {
    fill: var(--accent);
    text-decoration: underline;
  }
</style>
