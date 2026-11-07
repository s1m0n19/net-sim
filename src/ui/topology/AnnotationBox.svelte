<svelte:options namespace="svg" />

<script lang="ts">
  // Un riquadro del disegno (ED-9, D-117): un rettangolo dalla tinta
  // leggerissima, dietro cavi e dispositivi, con un'etichetta nell'angolo.
  //
  // Si afferra dal bordo e dall'etichetta, non dall'interno: un clic dentro
  // il riquadro arriva al disegno, e i dispositivi e i cavi che contiene
  // restano tutti da cliccare (stanno anche sopra di lui). Selezionato, ha
  // quattro maniglie agli angoli per ridimensionarlo.
  import type { BoxAnnotation } from "../../storage/annotations-file";
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import type { Corner } from "./annotation-geometry";
  import { annotationName, chooseAnnotation, pressAnnotation, pressCorner } from "./annotation-interaction";

  let { box }: { box: BoxAnnotation } = $props();

  const selected = $derived(session.selection?.kind === "annotation" && session.selection.id === box.id);
  const k = $derived(preferences.scale);
  // Le maniglie degli angoli: dove stanno e quale angolo muovono.
  const corners = $derived<[Corner, number, number][]>([
    ["nw", box.x, box.y],
    ["ne", box.x + box.width, box.y],
    ["sw", box.x, box.y + box.height],
    ["se", box.x + box.width, box.y + box.height],
  ]);
  const HANDLE = 10;

  // Dopo un trascinamento il browser manda comunque un clic: va ignorato.
  let justDragged = false;

  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseAnnotation(box.id);
    }
  }
</script>

<g
  class="annotation box {box.color}"
  class:selected
  data-annotation-id={box.id}
  role="button"
  tabindex="0"
  aria-label="{annotationName(box)}{selected ? ', selezionato' : ''}"
  onpointerdown={(event) => pressAnnotation(event, box, () => (justDragged = true))}
  onclick={(event) => {
    event.stopPropagation();
    if (justDragged) {
      justDragged = false;
      return;
    }
    chooseAnnotation(box.id);
  }}
  onkeydown={onKey}
>
  <rect class="area" x={box.x} y={box.y} width={box.width} height={box.height} rx="6" />
  <!-- Il bordo che si vede, e una fascia più larga e invisibile per afferrarlo. -->
  <rect class="edge" x={box.x} y={box.y} width={box.width} height={box.height} rx="6" />
  <rect class="grip" x={box.x} y={box.y} width={box.width} height={box.height} rx="6" />
  {#if box.label !== ""}
    <text class="label" x={box.x + 10 * k} y={box.y + 20 * k} style="font-size: {13 * k}px">{box.label}</text>
  {/if}
  {#if selected}
    <rect class="selection" x={box.x - 4} y={box.y - 4} width={box.width + 8} height={box.height + 8} rx="9" />
    {#if !preferences.presenting}
      {#each corners as [corner, cx, cy] (corner)}
        <!-- Le maniglie si usano con il puntatore: ridimensionare da
             tastiera non è previsto (D-117), e per il lettore di schermo
             non sono controlli. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect
          aria-hidden="true"
          class="handle {corner}"
          data-corner={corner}
          x={cx - (HANDLE * k) / 2}
          y={cy - (HANDLE * k) / 2}
          width={HANDLE * k}
          height={HANDLE * k}
          rx="2"
          onpointerdown={(event) => pressCorner(event, box, corner)}
        />
      {/each}
    {/if}
  {/if}
</g>

<style>
  .annotation {
    outline: none;
  }
  .blue {
    --tint: var(--annotation-blue);
  }
  .green {
    --tint: var(--annotation-green);
  }
  .yellow {
    --tint: var(--annotation-yellow);
  }
  .red {
    --tint: var(--annotation-red);
  }
  .purple {
    --tint: var(--annotation-purple);
  }
  /* L'interno non riceve i clic: arrivano al disegno e a ciò che contiene. */
  .area {
    fill: color-mix(in srgb, var(--tint) var(--annotation-fill), transparent);
    stroke: none;
    pointer-events: none;
  }
  .edge {
    fill: none;
    stroke: var(--tint);
    stroke-width: 1.5;
    pointer-events: none;
  }
  .grip {
    fill: none;
    stroke: transparent;
    stroke-width: 12;
    pointer-events: stroke;
    cursor: move;
  }
  /* Il testo nel colore del testo, con un alone del colore del disegno: si
     legge anche sopra un cavo. */
  .label {
    fill: var(--ink);
    font-family: var(--font-ui);
    font-weight: 600;
    paint-order: stroke;
    stroke: var(--canvas);
    stroke-width: 3px;
    stroke-linejoin: round;
    cursor: move;
  }
  .selected .edge {
    stroke-width: 2.5;
  }
  /* Selezionato: lo stesso contorno nel colore d'accento dei dispositivi. */
  .selection {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 6 4;
    pointer-events: none;
  }
  .annotation:focus-visible .edge {
    stroke: var(--accent);
    stroke-width: 3;
  }
  .handle {
    fill: var(--surface);
    stroke: var(--accent);
    stroke-width: 1.5;
  }
  .handle.nw,
  .handle.se {
    cursor: nwse-resize;
  }
  .handle.ne,
  .handle.sw {
    cursor: nesw-resize;
  }
</style>
