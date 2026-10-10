<svelte:options namespace="svg" />

<script lang="ts" module>
  import type { DeviceView } from "../view";

  // Misure del riquadro, in unità del disegno.
  const CHAR = 6.95; // larghezza di un carattere a larghezza fissa
  const ROW = 17;
  const HEAD = 24;

  function titleOf(device: DeviceView): string {
    return `Tabella ${device.kind === "switch" ? "MAC" : "ARP"} · ${device.name}`;
  }

  // Le righe da mostrare: due colonne di testo, e una chiave per riconoscerle.
  function rowsOf(device: DeviceView): { key: string; left: string; right: string }[] {
    const rows = device.kind === "switch" ? device.macRows : device.arpRows;
    return rows.map(([left, right]) => ({ key: left, left, right }));
  }

  /**
   * Quanto è grande il riquadro della tabella appuntata di un dispositivo.
   * Serve anche a chi deve fargli posto nell'inquadratura.
   */
  export function pinnedSize(device: DeviceView): { width: number; height: number } {
    const rows = rowsOf(device);
    const widest = Math.max(titleOf(device).length + 4, ...rows.map((row) => row.left.length + row.right.length + 3));
    return { width: widest * CHAR + 20, height: HEAD + Math.max(rows.length, 1) * ROW + 8 };
  }
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { session, type Pin } from "../session.svelte";

  // Una tabella tenuta in vista sul disegno, accanto al suo dispositivo.
  // Si trascina; la riga appena imparata o appena persa si fa notare.
  let { pin, device }: { pin: Pin; device: DeviceView } = $props();

  const rows = $derived(rowsOf(device));
  const size = $derived(pinnedSize(device));
  const x = $derived(device.x + pin.dx);
  const y = $derived(device.y + pin.dy);

  // La linea che lega il riquadro al dispositivo arriva al punto del bordo
  // più vicino.
  const anchor = $derived({
    x: Math.min(Math.max(device.x, x), x + size.width),
    y: Math.min(Math.max(device.y, y), y + size.height),
  });

  // Dalla parte del dispositivo la linea non parte dal centro: comincia
  // fuori dal riquadro e, se scende, sotto le etichette, per non coprirle.
  const start = $derived.by(() => {
    const dx = anchor.x - device.x;
    const dy = anchor.y - device.y;
    const length = Math.hypot(dx, dy);
    const goesDown = dy > 0 && Math.abs(dy) >= Math.abs(dx);
    const clearance = goesDown ? (device.kind === "host" ? 72 : 54) : 40;
    if (length <= clearance) return anchor; // il riquadro è già vicino: nessuna linea
    return { x: device.x + (dx / length) * clearance, y: device.y + (dy / length) * clearance };
  });

  // --- Righe nuove e righe perse ------------------------------------------
  // Le righe già presenti quando la tabella viene appuntata non lampeggiano.
  let mounted = false;
  onMount(() => {
    mounted = true;
  });
  function markIfNew(node: SVGElement) {
    if (mounted) node.classList.add("new");
  }

  // Una riga persa resta visibile, barrata, ancora per un momento.
  let lost = $state<{ key: string; left: string; right: string }[]>([]);
  let before: { key: string; left: string; right: string }[] = [];
  $effect(() => {
    const now = rows;
    const gone = before.filter((old) => !now.some((row) => row.key === old.key));
    before = now;
    if (gone.length === 0) return;
    untrack(() => {
      lost = [...lost, ...gone];
      setTimeout(() => {
        lost = lost.filter((row) => !gone.includes(row));
      }, 1600);
    });
  });

  // --- Trascinamento -------------------------------------------------------
  let drag: { startX: number; startY: number; dx: number; dy: number; scale: number } | null = null;

  function down(event: PointerEvent) {
    const group = event.currentTarget as SVGGElement;
    // Di quanti pixel dello schermo è fatta un'unità del disegno.
    const scale = group.ownerSVGElement?.getScreenCTM()?.a ?? 1;
    drag = { startX: event.clientX, startY: event.clientY, dx: pin.dx, dy: pin.dy, scale };
    group.setPointerCapture?.(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (drag === null) return;
    session.movePin(
      device.id,
      drag.dx + (event.clientX - drag.startX) / drag.scale,
      drag.dy + (event.clientY - drag.startY) / drag.scale,
    );
  }

  function up() {
    drag = null;
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      session.togglePin(device.id);
    }
  }
</script>

<line class="leader" x1={start.x} y1={start.y} x2={anchor.x} y2={anchor.y} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<g
  class="table"
  transform="translate({x} {y})"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onclick={(event) => event.stopPropagation()}
>
  <title>{titleOf(device)}: trascina per spostarla</title>
  <rect class="frame" width={size.width} height={size.height} rx="3" />
  <text class="head" x="10" y="16">{titleOf(device)}</text>

  <g
    class="close"
    transform="translate({size.width - 18} 5)"
    role="button"
    tabindex="0"
    aria-label="Togli la {titleOf(device)} dal disegno"
    onpointerdown={(event) => event.stopPropagation()}
    onclick={(event) => {
      event.stopPropagation();
      session.togglePin(device.id);
    }}
    onkeydown={onKey}
  >
    <rect width="14" height="14" rx="3" />
    <path d="M4 4L10 10M10 4L4 10" />
  </g>

  {#if rows.length === 0 && lost.length === 0}
    <text class="empty" x="10" y={HEAD + 12}>vuota</text>
  {/if}

  {#each rows as row, index (row.key)}
    <g transform="translate(0 {HEAD + index * ROW})" use:markIfNew>
      <rect class="flash" x="2" y="0" width={size.width - 4} height={ROW} />
      <text class="cell" x="10" y="12">{row.left}</text>
      <text class="cell right" x={size.width - 10} y="12">{row.right}</text>
    </g>
  {/each}

  {#each lost as row, index (row.key)}
    <g class="lost" transform="translate(0 {HEAD + (rows.length + index) * ROW})">
      <text class="cell" x="10" y="12">{row.left}</text>
      <text class="cell right" x={size.width - 10} y="12">{row.right}</text>
    </g>
  {/each}
</g>

<style>
  .leader {
    stroke: var(--muted);
    stroke-width: 1.2;
    stroke-dasharray: 3 3;
  }
  .table {
    cursor: grab;
  }
  .table:active {
    cursor: grabbing;
  }
  .frame {
    fill: var(--surface);
    stroke: var(--line);
    stroke-width: 1.2;
  }
  .head {
    fill: var(--ink);
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: 11.5px;
  }
  .cell {
    fill: var(--ink);
    font-family: var(--font-mono);
    font-size: 11.5px;
  }
  .right {
    text-anchor: end;
  }
  .empty {
    fill: var(--muted);
    font-family: var(--font-ui);
    font-style: italic;
    font-size: 11.5px;
  }
  .close {
    cursor: pointer;
    outline: none;
  }
  .close rect {
    fill: transparent;
  }
  .close:hover rect,
  .close:focus-visible rect {
    fill: var(--surface-2);
    stroke: var(--muted);
    stroke-width: 1;
  }
  .close path {
    stroke: var(--muted);
    stroke-width: 1.4;
    stroke-linecap: round;
    fill: none;
  }

  /* Una riga appena imparata si accende e poi torna normale. */
  .flash {
    fill: transparent;
  }
  /* La classe "new" la mette il codice, alla nascita della riga: per
     questo la regola va dichiarata globale. */
  :global(g.new > rect.flash) {
    animation: learned 1.6s ease-out;
  }
  @keyframes -global-learned {
    from {
      fill: var(--accent);
      fill-opacity: 0.45;
    }
    to {
      fill: var(--accent);
      fill-opacity: 0;
    }
  }

  /* Una riga appena persa resta un momento, barrata, e svanisce. */
  .lost .cell {
    fill: var(--down);
    text-decoration: line-through;
  }
  .lost {
    animation: forgotten 1.6s ease-in forwards;
  }
  @keyframes forgotten {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(g.new > rect.flash) {
      animation-duration: 0.01s;
    }
    .lost {
      animation-duration: 0.01s;
    }
  }
</style>
