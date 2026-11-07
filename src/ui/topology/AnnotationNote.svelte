<svelte:options namespace="svg" />

<script lang="ts">
  // Una nota del disegno (ED-9, D-117): un testo su un fondo appena tinto,
  // con un segno del suo colore a sinistra. Le righe le dispone
  // annotation-geometry.ts, senza misurare lo schermo: così si potrà
  // disegnare la stessa nota nell'immagine esportata. Una nota vuota mostra
  // «Nota vuota», attenuato, per poterla ritrovare e selezionare.
  import type { NoteAnnotation } from "../../storage/annotations-file";
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import { noteLayout } from "./annotation-geometry";
  import { annotationName, chooseAnnotation, pressAnnotation } from "./annotation-interaction";

  let { note }: { note: NoteAnnotation } = $props();

  const selected = $derived(session.selection?.kind === "annotation" && session.selection.id === note.id);
  const layout = $derived(noteLayout(note.text, preferences.scale));

  let justDragged = false;

  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseAnnotation(note.id);
    }
  }
</script>

<g
  class="annotation note {note.color}"
  class:selected
  class:empty={layout.empty}
  data-annotation-id={note.id}
  transform="translate({note.x} {note.y})"
  role="button"
  tabindex="0"
  aria-label="{annotationName(note)}{selected ? ', selezionata' : ''}"
  onpointerdown={(event) => pressAnnotation(event, note, () => (justDragged = true))}
  onclick={(event) => {
    event.stopPropagation();
    if (justDragged) {
      justDragged = false;
      return;
    }
    chooseAnnotation(note.id);
  }}
  onkeydown={onKey}
>
  <rect class="paper" width={layout.width} height={layout.height} rx="4" />
  <rect class="mark" width={3 * preferences.scale} height={layout.height} rx="1.5" />
  <text class="text" style="font-size: {layout.fontSize}px">
    {#each layout.lines as line, index (index)}
      <tspan x={layout.paddingX} y={layout.paddingY + layout.fontSize * 0.95 + index * layout.lineHeight}>{line === "" ? " " : line}</tspan>
    {/each}
  </text>
  {#if selected}
    <rect class="selection" x="-4" y="-4" width={layout.width + 8} height={layout.height + 8} rx="7" />
  {/if}
</g>

<style>
  .annotation {
    outline: none;
    cursor: move;
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
  .paper {
    fill: color-mix(in srgb, var(--tint) var(--annotation-fill), var(--canvas));
    stroke: color-mix(in srgb, var(--tint) 40%, transparent);
    stroke-width: 1;
  }
  .mark {
    fill: var(--tint);
  }
  .text {
    fill: var(--ink);
    font-family: var(--font-ui);
    white-space: pre;
  }
  .empty .text {
    fill: var(--muted);
    font-style: italic;
  }
  .selection {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 6 4;
    pointer-events: none;
  }
  .annotation:focus-visible .paper {
    stroke: var(--accent);
    stroke-width: 2.5;
  }
</style>
