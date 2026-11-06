<script module lang="ts">
  import type { IconName } from "../theme/Icon.svelte";

  /**
   * Una voce di un menu: un comando, una casella da spuntare, una riga di
   * separazione, oppure un'intestazione che si legge ma non si sceglie. La casella resta aperta dopo il clic, così se ne
   * possono cambiare diverse di seguito; un comando chiude il menu.
   */
  export type MenuItem =
    | {
        kind: "action";
        label: string;
        icon?: IconName;
        shortcut?: string;
        disabled?: boolean;
        // Un'azione che toglie qualcosa: si distingue dalle altre.
        danger?: boolean;
        // La descrizione completa, se la scritta da sola non basta.
        description?: string;
        run: () => void;
      }
    | { kind: "check"; label: string; description?: string; checked: boolean; toggle: () => void }
    | { kind: "separator" }
    | { kind: "heading"; label: string; detail?: string };
</script>

<script lang="ts">
  // Un menu a tendina, usabile con il mouse e con la tastiera, secondo lo
  // schema "menu button" di WAI-ARIA: il pulsante apre l'elenco e porta il
  // fuoco sulla prima voce; le frecce si muovono tra le voci, Home e Fine
  // vanno agli estremi, Esc chiude e riporta il fuoco sul pulsante, Tab o
  // un clic fuori chiudono.
  import Icon from "../theme/Icon.svelte";

  let {
    label,
    icon,
    items,
    align = "start",
    iconOnly = false,
    up = false,
  }: {
    label: string;
    icon?: IconName;
    items: MenuItem[];
    align?: "start" | "end";
    // Il pulsante mostra solo l'icona; l'etichetta resta per chi legge con
    // il lettore di schermo e nel suggerimento.
    iconOnly?: boolean;
    // L'elenco si apre sopra il pulsante, quando sotto non c'è posto.
    up?: boolean;
  } = $props();

  // Un identificativo stabile, ricavato dall'etichetta, che lega pulsante ed elenco.
  const id = $derived(`menu-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();

  // Le voci che possono avere il fuoco, nell'ordine in cui compaiono.
  function focusable(): HTMLButtonElement[] {
    return [...(list?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
  }

  function show(focusLast = false) {
    open = true;
    // Il fuoco va sull'elenco appena è disegnato.
    queueMicrotask(() => {
      const entries = focusable();
      (focusLast ? entries.at(-1) : entries[0])?.focus();
    });
  }

  function hide(returnFocus: boolean) {
    open = false;
    if (returnFocus) trigger?.focus();
  }

  function onTriggerKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowUp");
    }
  }

  function onListKey(event: KeyboardEvent) {
    const entries = focusable();
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      entries[(to + entries.length) % entries.length]?.focus();
    };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(entries.length - 1);
    else if (event.key === "Escape") {
      // Esc chiude il menu, e non arriva ad altri (per esempio alla
      // presentazione o alla selezione del disegno).
      event.preventDefault();
      event.stopPropagation();
      hide(true);
    } else if (event.key === "Tab") hide(false);
  }

  // Un clic fuori dal menu lo chiude.
  function onWindowPointer(event: PointerEvent) {
    if (open && root !== undefined && !root.contains(event.target as Node)) hide(false);
  }

  function choose(item: MenuItem) {
    if (item.kind === "action") {
      hide(true);
      item.run();
    } else if (item.kind === "check") {
      item.toggle();
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="menu" bind:this={root}>
  <button
    bind:this={trigger}
    class="trigger"
    class:open
    class:icon-only={iconOnly}
    aria-label={iconOnly ? label : undefined}
    title={iconOnly ? label : undefined}
    id="{id}-button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls="{id}-list"
    onclick={() => (open ? hide(false) : show())}
    onkeydown={onTriggerKey}
  >
    {#if icon}<Icon name={icon} />{/if}
    {#if !iconOnly}
      <span>{label}</span>
      <span class="caret"><Icon name="chevron" size={14} /></span>
    {/if}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="list" class:end={align === "end"} class:up id="{id}-list" role="menu" aria-labelledby="{id}-button" bind:this={list} onkeydown={onListKey}>
      {#each items as item, index (index)}
        {#if item.kind === "separator"}
          <div class="separator" role="separator"></div>
        {:else if item.kind === "heading"}
          <!-- Un'intestazione si legge e basta: le frecce la saltano. -->
          <div class="heading" role="presentation">
            <span class="heading-label">{item.label}</span>
            {#if item.detail}<span class="heading-detail">{item.detail}</span>{/if}
          </div>
        {:else if item.kind === "action"}
          <button
            class="item"
            class:danger={item.danger}
            role="menuitem"
            tabindex="-1"
            disabled={item.disabled}
            title={item.description}
            onclick={() => choose(item)}
          >
            <span class="lead">{#if item.icon}<Icon name={item.icon} />{/if}</span>
            <span class="text">{item.label}</span>
            {#if item.shortcut}<span class="shortcut">{item.shortcut}</span>{/if}
          </button>
        {:else}
          <button class="item" role="menuitemcheckbox" aria-checked={item.checked} tabindex="-1" onclick={() => choose(item)}>
            <!-- La casella dice lo stato con il segno di spunta, non solo con il colore. -->
            <span class="lead"><span class="box" class:checked={item.checked}>{#if item.checked}<Icon name="check" size={14} />{/if}</span></span>
            <span class="text">
              {item.label}
              {#if item.description}<span class="description">{item.description}</span>{/if}
            </span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--bar-control);
    padding: 0 8px 0 10px;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    background: none;
    white-space: nowrap;
    cursor: pointer;
  }
  .trigger:hover,
  .trigger.open {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .trigger:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .caret {
    display: inline-flex;
    color: var(--muted);
    transition: transform 0.15s ease;
  }
  .trigger.open .caret {
    transform: rotate(180deg);
  }
  .list {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 20;
    min-width: 250px;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow-menu);
    animation: appear 0.12s ease-out;
  }
  .list.end {
    left: auto;
    right: 0;
  }
  .list.up {
    top: auto;
    bottom: calc(100% + 6px);
  }
  .trigger.icon-only {
    padding: 0;
    width: var(--bar-control);
    justify-content: center;
  }
  .item.danger,
  .item.danger .lead {
    color: var(--down);
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .list,
    .caret {
      animation: none;
      transition: none;
    }
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 5px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .item:hover:not(:disabled),
  .item:focus-visible {
    background: var(--surface-2);
    outline: none;
  }
  .item:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .item:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .lead {
    display: inline-flex;
    width: 18px;
    justify-content: center;
    padding-top: 1px;
    color: var(--muted);
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .description {
    color: var(--muted);
    font-size: 0.92em;
    line-height: 1.35;
    max-width: 30ch;
  }
  .shortcut {
    color: var(--muted);
    font-size: 0.9em;
    white-space: nowrap;
    padding-top: 1px;
  }
  .box {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--muted);
    border-radius: 4px;
    color: var(--on-accent);
  }
  .box.checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .heading {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 10px 8px;
    max-width: 320px;
  }
  .heading-label {
    font-family: var(--font-mono);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .heading-detail {
    color: var(--muted);
    font-size: 0.92em;
  }
  .separator {
    height: 1px;
    margin: 5px 4px;
    background: var(--line);
  }
</style>
