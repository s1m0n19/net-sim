<script lang="ts">
  // Il pannello laterale di un riquadro o di una nota (ED-9, D-117):
  // l'etichetta o il testo, il colore, Elimina. In presentazione si legge
  // soltanto.
  //
  // Il testo si scrive in una bozza e passa all'annotazione quando lo si
  // conferma: uscendo dal campo, con Invio per l'etichetta di un riquadro,
  // con Ctrl+Invio per una nota (lì Invio va a capo). Esc rimette il testo
  // di prima, senza togliere la selezione. Ogni conferma che cambia
  // qualcosa è un passo da annullare.
  import { ANNOTATION_COLORS, type Annotation, type AnnotationColor } from "../../storage/annotations-file";
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import Icon from "../theme/Icon.svelte";
  import PanelSection from "./PanelSection.svelte";

  let { annotation }: { annotation: Annotation } = $props();

  const COLOR_NAMES: Record<AnnotationColor, string> = {
    blue: "Blu",
    green: "Verde",
    yellow: "Giallo",
    red: "Rosso",
    purple: "Viola",
  };

  const isBox = $derived(annotation.kind === "box");
  const current = $derived(annotation.kind === "box" ? annotation.label : annotation.text);
  const fieldId = $derived(`annotation-text-${annotation.id}`);

  // La bozza segue il testo dell'annotazione solo quando questo cambia
  // davvero (per esempio con Annulla): gli aggiornamenti del disegno non
  // cancellano ciò che si sta scrivendo.
  let draft = $state("");
  $effect(() => {
    draft = current;
  });

  let field: HTMLInputElement | HTMLTextAreaElement | undefined = $state();
  // Una nota appena posata: il cursore va subito nel suo testo.
  $effect(() => {
    if (field !== undefined && session.focusAnnotationText === annotation.id) {
      field.focus();
      session.focusAnnotationText = null;
    }
  });

  function confirm() {
    if (draft !== current) session.setAnnotationText(annotation.id, draft);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      // Esc rimette il testo di prima, e non toglie la selezione.
      event.stopPropagation();
      draft = current;
      field?.blur();
    } else if (event.key === "Enter" && (isBox || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      confirm();
    }
  }

  const sizeText = $derived(annotation.kind === "box" ? `${annotation.width} × ${annotation.height}` : null);
</script>

<header>
  <h2>{isBox ? "Riquadro" : "Nota"}</h2>
  <p class="summary">
    <span class="swatch {annotation.color}" aria-hidden="true"></span>{COLOR_NAMES[annotation.color]}{#if sizeText !== null}{" · "}<span class="size">{sizeText}</span>{/if}
  </p>
</header>

<PanelSection title={isBox ? "Etichetta" : "Testo"}>
  {#if preferences.presenting}
    <!-- In presentazione si legge soltanto. -->
    {#if current === ""}
      <p class="empty">{isBox ? "Nessuna etichetta." : "Nota vuota."}</p>
    {:else}
      <p class="read">{current}</p>
    {/if}
  {:else if isBox}
    <label class="sr-only" for={fieldId}>Etichetta del riquadro</label>
    <input
      id={fieldId}
      data-field="annotation-label"
      bind:this={field}
      bind:value={draft}
      placeholder="nessuna etichetta"
      autocomplete="off"
      onkeydown={onKey}
      onblur={confirm}
    />
    <p class="help" id="{fieldId}-help">Si conferma con Invio o uscendo dal campo; Esc rimette quella di prima.</p>
  {:else}
    <label class="sr-only" for={fieldId}>Testo della nota</label>
    <textarea
      id={fieldId}
      data-field="annotation-text"
      bind:this={field}
      bind:value={draft}
      rows="5"
      placeholder="Scrivi qui la nota"
      aria-describedby="{fieldId}-help"
      onkeydown={onKey}
      onblur={confirm}
    ></textarea>
    <p class="help" id="{fieldId}-help">Invio va a capo. Si conferma uscendo dal campo o con Ctrl+Invio; Esc rimette il testo di prima.</p>
  {/if}
</PanelSection>

<PanelSection title="Colore">
  {#if preferences.presenting}
    <p class="read"><span class="swatch {annotation.color}" aria-hidden="true"></span>{COLOR_NAMES[annotation.color]}</p>
  {:else}
    <!-- Cinque colori, ciascuno con il suo nome: si scelgono anche senza
         distinguerli, e con le frecce da tastiera. -->
    <div class="colors" role="radiogroup" aria-label="Colore {isBox ? 'del riquadro' : 'della nota'}">
      {#each ANNOTATION_COLORS as color (color)}
        <label class="color" class:chosen={annotation.color === color}>
          <input
            type="radio"
            name="annotation-color-{annotation.id}"
            value={color}
            checked={annotation.color === color}
            onchange={() => session.recolorAnnotation(annotation.id, color)}
          />
          <span class="swatch {color}" aria-hidden="true"></span>
          <span class="name">{COLOR_NAMES[color]}</span>
        </label>
      {/each}
    </div>
  {/if}
</PanelSection>

{#if !preferences.presenting}
  <PanelSection title="Elimina">
    <button class="btn danger" onclick={() => session.removeSelection()}>
      <Icon name="trash" size={15} />{isBox ? "Elimina il riquadro" : "Elimina la nota"}
    </button>
  </PanelSection>
{/if}

<style>
  header {
    padding-right: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h2 {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--muted);
  }
  .summary,
  .read {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .read {
    color: var(--ink);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    align-items: flex-start;
  }
  .empty {
    font-style: italic;
  }
  .size {
    font-family: var(--font-mono);
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
  .swatch {
    flex: none;
    width: 14px;
    height: 14px;
    border: 2px solid var(--tint);
    border-radius: 3px;
    background: color-mix(in srgb, var(--tint) 30%, transparent);
  }
  input:not([type="radio"]),
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 7px;
    font: inherit;
    color: var(--ink);
    background: var(--canvas);
    border: 1px solid var(--field-border);
    border-radius: var(--radius);
  }
  textarea {
    resize: vertical;
    line-height: 1.4;
  }
  input:not([type="radio"]):focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  input::placeholder,
  textarea::placeholder {
    color: var(--muted);
    font-style: italic;
  }
  .help {
    font-size: var(--text-small);
    line-height: 1.35;
  }
  /* I colori: una griglia di campioni con il nome sotto. Quello scelto ha
     il bordo d'accento e il nome in grassetto, non solo il colore. */
  .colors {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
  }
  .color {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 5px 2px 4px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    font-size: var(--text-small);
    color: var(--muted);
    cursor: pointer;
  }
  .color .swatch {
    width: 20px;
    height: 20px;
  }
  .color:hover {
    background: var(--surface-2);
  }
  .color.chosen {
    border-color: var(--accent);
    color: var(--ink);
    font-weight: 600;
  }
  .color:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .color input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .danger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
  }
</style>
