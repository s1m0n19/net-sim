<svelte:options namespace="svg" />

<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import type { LinkView } from "../view";
  import { addressLabelPoint, pointNear, portLabelPoint } from "./geometry";

  let { link }: { link: LinkView } = $props();

  const selected = $derived(session.selection?.kind === "link" && session.selection.id === link.id);

  // I pallini del segnale stanno sul cavo, poco fuori dal dispositivo.
  const signalFrom = $derived(pointNear(link.from, link.to, 42 * preferences.scale));
  const signalTo = $derived(pointNear(link.to, link.from, 42 * preferences.scale));

  const cableLength = $derived(Math.hypot(link.to.x - link.from.x, link.to.y - link.from.y));

  // Un cavo corto tra due router: i due indirizzi, uno di fila all'altro
  // sopra il cavo, non ci stanno. Allora quello del capo b va sotto.
  const crowded = $derived.by(() => {
    if (link.fromAddress === null || link.toAddress === null || !preferences.labels.ip) return false;
    const k = preferences.scale;
    const length = Math.hypot(link.to.x - link.from.x, link.to.y - link.from.y);
    // Circa 7,3 unità per carattere, più lo spazio lasciato accanto ai router.
    const needed = (link.fromAddress.length + link.toAddress.length) * 7.3 * k + 2 * 52 * k + 16 * k;
    return length < needed;
  });

  // Gli indirizzi delle interfacce di router, uno per capo: stanno accanto
  // al cavo, vicino al router, così si vede quale indirizzo guarda quale rete.
  const addresses = $derived(
    (["a", "b"] as const).flatMap((end) => {
      const text = end === "a" ? link.fromAddress : link.toAddress;
      if (text === null) return [];
      const below = end === "b" && crowded;
      // Da sola su un cavo corto, partendo dal router finirebbe sopra il
      // dispositivo all'altro capo: allora sta centrata a metà cavo.
      const k = preferences.scale;
      const alone = link.fromAddress === null || link.toAddress === null;
      const centred = alone && cableLength < text.length * 7.3 * k + 52 * k + 40 * k;
      return [{ end, text, at: addressLabelPoint(link.from, link.to, end, k, below, centred) }];
    }),
  );

  // Mezza larghezza del quadratino che segna un'interfaccia spenta.
  const shutHalf = $derived(4.5 * preferences.scale);

  // I nomi delle due porte. Si vedono se le etichette sono accese, e
  // comunque sul cavo selezionato: è da lì che si cambia porta.
  const ports = $derived(
    (["a", "b"] as const).map((end) => ({
      end,
      name: end === "a" ? link.fromPort : link.toPort,
      deviceName: end === "a" ? link.fromName : link.toName,
      // Dove il capo b ha l'indirizzo sotto il cavo, il nome della porta va sopra.
      at: portLabelPoint(link.from, link.to, end, preferences.scale, end === "b" && crowded),
      // Il capo è un'interfaccia di router spenta.
      off: end === "a" ? link.fromOff : link.toOff,
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

<!-- Un'interfaccia di router spenta: sul suo capo del cavo, al posto del
     pallino del segnale, un quadratino rosso vuoto. Colore e forma. -->
{#if link.fromOff}
  <rect class="shut" x={signalFrom.x - shutHalf} y={signalFrom.y - shutHalf} width={shutHalf * 2} height={shutHalf * 2} />
{/if}
{#if link.toOff}
  <rect class="shut" x={signalTo.x - shutHalf} y={signalTo.y - shutHalf} width={shutHalf * 2} height={shutHalf * 2} />
{/if}

{#if preferences.labels.ip}
  {#each addresses as address (address.end)}
    <text class="address" x={address.at.x} y={address.at.y} text-anchor={address.at.anchor}>{address.text}</text>
  {/each}
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
    >{port.name}{port.off ? " · spenta" : ""}</text>
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
  /* Come l'indirizzo sotto un PC. È solo una scritta: i clic passano al cavo. */
  .address {
    fill: var(--muted);
    font-family: var(--font-mono);
    font-size: calc(12px * var(--k, 1));
    pointer-events: none;
  }
  .shut {
    fill: var(--canvas);
    stroke: var(--down);
    stroke-width: calc(2px * var(--k, 1));
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
