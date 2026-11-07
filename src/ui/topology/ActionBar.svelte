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
  import { barFits, placeBar, type Rect, type ScreenAnchor, type Size } from "./bar-placement";

  let {
    actions,
    anchor,
    area,
    obstacles = [],
    scale = 1,
    subject,
  }: {
    actions: BarAction[];
    // Ciò che è selezionato, in pixel del disegno sullo schermo.
    anchor: ScreenAnchor;
    // La grandezza del disegno sullo schermo.
    area: Size;
    // I comandi sul disegno da non coprire: zoom e barra della simulazione.
    obstacles?: Rect[];
    // L'ingrandimento della presentazione.
    scale?: number;
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
  // Se con le scritte non sta nel disegno (in presentazione, su uno schermo
  // stretto) la barretta resta con le sole icone; descrizione e suggerimento
  // non cambiano (D-112). La larghezza con le scritte si misura una volta
  // per ogni insieme di azioni e ingrandimento, e si ricorda: così la
  // barretta non oscilla tra le due forme.
  let fullWidth = $state(0);
  let measuredFor = $state("");
  const look = $derived(`${actions.map((action) => action.text).join("|")} ${scale}`);
  const compact = $derived(measuredFor === look && !barFits(fullWidth, area.width));
  $effect(() => {
    if (!compact && width > 0) {
      fullWidth = width;
      measuredFor = look;
    }
  });

  const placement = $derived(placeBar(anchor, { width, height }, area, obstacles));
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
      <Icon name={action.icon} size={20} />
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
  .actions {
    position: absolute;
    z-index: 6;
    display: flex;
    align-items: stretch;
    gap: calc(2px * var(--k));
    padding: calc(4px * var(--k));
    border: 1px solid var(--line);
    border-radius: calc(var(--radius-float) * var(--k));
    background: var(--surface);
    box-shadow: var(--shadow-menu);
    font-size: calc(var(--text-small) * var(--k));
  }
  /* Finché non si conosce la sua grandezza, la barretta non si vede: così
     non compare per un istante nel punto sbagliato. */
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
    gap: calc(3px * var(--k));
    min-width: calc(56px * var(--k));
    height: calc(50px * var(--k));
    padding: 0 calc(8px * var(--k));
    border: 1px solid transparent;
    border-radius: calc(7px * var(--k));
    background: none;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.12s ease;
  }
  .action :global(svg) {
    width: calc(20px * var(--k));
    height: calc(20px * var(--k));
  }
  /* Compatta: le sole icone, in pulsanti quadrati. */
  .compact .action {
    min-width: calc(44px * var(--k));
    padding: 0 calc(6px * var(--k));
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
    height: calc(50px * var(--k));
    width: calc(40px * var(--k));
    border-radius: calc(7px * var(--k));
  }
  @media (prefers-reduced-motion: reduce) {
    .action {
      transition: none;
    }
  }
</style>
