<script lang="ts">
  // La barretta delle azioni: compare accanto a ciò che è selezionato e
  // mostra ciò che ci si può fare. Le azioni più usate si vedono sempre,
  // con l'icona e la scritta; le altre stanno nel menu "Altro" (D-111).
  //
  // Sta sopra il disegno, non dentro: ha sempre la stessa grandezza sullo
  // schermo, qualunque sia lo zoom (in presentazione cresce con
  // l'ingrandimento), e non esce mai dal disegno (bar-placement.ts).
  import Menu, { type MenuItem } from "../layout/Menu.svelte";
  import Icon from "../theme/Icon.svelte";
  import type { BarAction } from "./bar-actions";
  import { barFits, findNearbySpot, placeBar, type Rect, type ScreenAnchor, type Size } from "./bar-placement";

  let {
    actions,
    anchor,
    area,
    obstacles = [],
    neighbours = [],
    scale = 1,
    roomy = false,
    subject,
  }: {
    actions: BarAction[];
    // Ciò che è selezionato, in pixel del disegno sullo schermo.
    anchor: ScreenAnchor;
    // La grandezza del disegno sullo schermo.
    area: Size;
    // I comandi sul disegno da non coprire: zoom e barra della simulazione.
    obstacles?: Rect[];
    // Gli altri dispositivi: meglio non coprirli, se c'è un altro posto.
    neighbours?: Rect[];
    // L'ingrandimento della presentazione.
    scale?: number;
    // Pulsanti più grandi, quelli della presentazione (D-127); nell'editor
    // la barretta è compatta, perché non pesi più del dispositivo.
    roomy?: boolean;
    // Di che cosa sono le azioni, per il lettore di schermo: "PC1", "il cavo".
    subject: string;
  } = $props();

  let width = $state(0);
  let height = $state(0);
  let bar: HTMLDivElement | undefined = $state();

  const primary = $derived(actions.filter((action) => action.primary));
  const more = $derived(actions.filter((action) => !action.primary));
  const moreItems: MenuItem[] = $derived(
    more.map((action) => ({
      kind: "action",
      label: action.text,
      icon: action.icon,
      danger: action.danger,
      description: action.label,
      run: action.run,
    })),
  );
  // La forma compatta: sole icone, pulsanti più bassi, descrizione e
  // suggerimento uguali (D-112, D-135). La barretta la prende quando con
  // le scritte non trova spazio: troppo larga per il disegno, oppure, in
  // ogni posto vicino all'oggetto, sopra un comando (zoom, barra della
  // simulazione, messaggi). La grandezza con le scritte si misura una volta
  // per ogni insieme di azioni e ingrandimento, e si ricorda: la scelta si
  // fa sempre con quella, non con la grandezza di adesso, così la barretta
  // non oscilla tra le due forme.
  let full = $state<Size>({ width: 0, height: 0 });
  let measuredFor = $state("");
  const look = $derived(`${actions.map((action) => action.text).join("|")} ${scale} ${roomy}`);
  const compact = $derived.by(() => {
    if (measuredFor !== look) return false;
    if (!barFits(full.width, area.width)) return true;
    return findNearbySpot(anchor, full, area, obstacles, neighbours) === null;
  });
  $effect(() => {
    if (!compact && width > 0) {
      full = { width, height };
      measuredFor = look;
    }
  });

  const placement = $derived(placeBar(anchor, { width, height }, area, obstacles, neighbours));
  // Il menu "Altro" si apre dalla parte dove c'è più spazio.
  const opensUp = $derived(placement.top > area.height - placement.top - height);

  // Le frecce sinistra e destra si muovono tra i pulsanti, come in ogni
  // barra di strumenti; Invio e Spazio li premono.
  function onKey(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const buttons = [...(bar?.querySelectorAll<HTMLButtonElement>(":scope > button, :scope .trigger") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    buttons[(at + step + buttons.length) % buttons.length].focus();
  }
</script>

<!-- I clic sulla barretta non arrivano al disegno: niente selezione né
     spostamento della vista per sbaglio. -->
<div
  class="actions"
  class:measuring={width === 0}
  class:compact
  class:roomy
  bind:this={bar}
  bind:clientWidth={width}
  bind:clientHeight={height}
  role="toolbar"
  tabindex="-1"
  aria-label="Azioni su {subject}"
  style="left: {placement.left}px; top: {placement.top}px; --k: {scale}"
  onkeydown={onKey}
  onpointerdown={(event) => event.stopPropagation()}
>
  {#each primary as action (action.text)}
    <button
      class="action"
      class:active={action.active}
      class:danger={action.danger}
      aria-label={action.label}
      aria-pressed={action.active === undefined ? undefined : action.active}
      title={action.label}
      onclick={(event) => {
        event.stopPropagation();
        action.run();
      }}
    >
      <Icon name={action.icon} size={roomy ? 20 : 17} />
      <span class="text">{action.text}</span>
    </button>
  {/each}
  {#if more.length > 0}
    <span class="divider" aria-hidden="true"></span>
    <!-- Il menu resta dentro il disegno, che è il contenitore della
         barretta: sceglie da sé il lato dove ci sta (D-116). -->
    <Menu
      label="Altre azioni su {subject}"
      icon="more"
      iconOnly
      items={moreItems}
      up={opensUp}
      align="end"
      boundary={() => (bar?.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? null}
    />
  {/if}
</div>

<style>
  /* Non si chiama "bar": in presentazione App.svelte ingrandisce con zoom
     la barra della simulazione, che ha quel nome; qui l'ingrandimento lo fa
     --k, perché zoom sposterebbe anche la posizione. */
  /* Le misure dei pulsanti: compatte nell'editor, quelle di prima in
     presentazione (.roomy, D-127). Tutte crescono con --k. */
  .actions {
    --button-height: 40px;
    --button-width: 44px;
    --button-padding: 6px;
    --icon-size: 17px;
    --icon-gap: 2px;
    --more-width: 34px;
    position: absolute;
    z-index: 6;
    display: flex;
    align-items: stretch;
    gap: calc(2px * var(--k));
    padding: calc(3px * var(--k));
    border: 1px solid var(--line);
    border-radius: calc(var(--radius-float) * var(--k));
    background: var(--surface);
    box-shadow: var(--shadow-menu);
    font-size: calc(var(--text-small) * var(--k));
  }
  /* Finché non si conosce la sua grandezza, la barretta non si vede: così
     non compare per un istante nel punto sbagliato. */
  .actions.roomy {
    --button-height: 50px;
    --button-width: 56px;
    --button-padding: 8px;
    --icon-size: 20px;
    --icon-gap: 3px;
    --more-width: 40px;
    padding: calc(4px * var(--k));
  }
  .actions.measuring {
    visibility: hidden;
  }
  .actions:focus {
    outline: none;
  }
  .action {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--icon-gap) * var(--k));
    min-width: calc(var(--button-width) * var(--k));
    height: calc(var(--button-height) * var(--k));
    padding: 0 calc(var(--button-padding) * var(--k));
    border: 1px solid transparent;
    border-radius: calc(7px * var(--k));
    background: none;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.12s ease;
  }
  .action :global(svg) {
    width: calc(var(--icon-size) * var(--k));
    height: calc(var(--icon-size) * var(--k));
  }
  /* Con le sole icone: pulsanti più bassi e quasi quadrati, ma ancora
     grandi abbastanza da colpire con il dito (D-135). */
  .actions.compact {
    --button-height: 34px;
    --more-width: 30px;
  }
  .actions.roomy.compact {
    --button-height: 36px;
    --more-width: 34px;
  }
  .compact .action {
    min-width: calc(var(--button-height) * var(--k));
    padding: 0 calc(var(--button-padding) * var(--k) * 0.75);
  }
  .compact .text {
    display: none;
  }
  .action:hover {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .action:active {
    background: var(--line);
  }
  .action:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  /* Premuto: l'app aspetta il secondo clic, o la tabella è appuntata. */
  .action.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .action.danger {
    color: var(--down);
  }
  .action.danger:hover {
    border-color: var(--down);
  }
  .divider {
    width: 1px;
    margin: calc(6px * var(--k)) calc(2px * var(--k));
    background: var(--line);
  }
  /* Il pulsante "Altro": alto come gli altri. */
  .actions :global(.trigger) {
    height: calc(var(--button-height) * var(--k));
    width: calc(var(--more-width) * var(--k));
    border-radius: calc(7px * var(--k));
  }
  @media (prefers-reduced-motion: reduce) {
    .action {
      transition: none;
    }
  }
</style>
