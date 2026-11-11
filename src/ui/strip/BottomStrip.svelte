<script lang="ts">
  // La fascia in basso: una scheda per ogni terminale aperto, più la
  // scheda Eventi, che c'è sempre.
  import { STRIP_HEIGHT, stripHeightLimit, stripHeightUpTo } from "../layout/auto-open";
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import EventsTab from "./EventsTab.svelte";
  import TerminalTab from "./TerminalTab.svelte";

  const active = $derived(session.terminals.find((terminal) => terminal.deviceId === session.activeTab));

  function nameOf(deviceId: string): string {
    return session.view.devices.find((device) => device.id === deviceId)?.name ?? "?";
  }

  // Il bordo superiore della fascia si trascina per cambiarne l'altezza.
  // In presentazione la fascia è ingrandita: lo spostamento del puntatore
  // va diviso per l'ingrandimento.
  let drag: { y: number; height: number } | null = $state(null);
  let windowHeight = $state(800);

  // Quanto occupano sullo schermo, sopra il corpo della fascia, la barra in
  // alto e la riga delle schede: in presentazione sono ingrandite, e
  // contano per quello che occupano davvero, non per le loro misure CSS.
  let tabsRow: HTMLDivElement | undefined = $state();
  let chrome = $state(0);
  $effect(() => {
    const dependsOn = [preferences.scale, preferences.presenting, windowHeight, session.terminals.length];
    if (tabsRow === undefined || dependsOn.length === 0) return;
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-height")) || 52;
    chrome = bar * preferences.scale + tabsRow.getBoundingClientRect().height;
  });

  // L'altezza voluta resta nelle preferenze; quella applicata è la più
  // piccola tra la voluta e il limite di adesso (D-134). In presentazione,
  // a ingrandimento alto, il limite lascia al disegno il suo spazio senza
  // toccare la scelta di chi usa l'app.
  const maxHeight = $derived(stripHeightLimit({ windowHeight, scale: preferences.scale, chrome, presenting: preferences.presenting }));
  const height = $derived(Math.min(preferences.stripHeight, maxHeight));

  function startResize(event: PointerEvent) {
    drag = { y: event.clientY, height };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function resize(event: PointerEvent) {
    if (drag === null) return;
    const wanted = drag.height + (drag.y - event.clientY) / preferences.scale;
    preferences.stripHeight = stripHeightUpTo(wanted, maxHeight);
  }

  // Da tastiera: frecce su e giù, a scatti di 20 pixel; Inizio e Fine
  // portano al minimo e al massimo.
  function resizeKey(event: KeyboardEvent) {
    const wanted =
      event.key === "ArrowUp" ? height + 20
      : event.key === "ArrowDown" ? height - 20
      : event.key === "Home" ? STRIP_HEIGHT.min
      : event.key === "End" ? Number.POSITIVE_INFINITY
      : null;
    if (wanted === null) return;
    event.preventDefault();
    preferences.stripHeight = stripHeightUpTo(wanted, maxHeight);
  }

  // Le schede, nell'ordine in cui si vedono: i terminali, poi Eventi.
  const tabOrder = $derived([...session.terminals.map((terminal) => terminal.deviceId), "events"]);
  const tabId = (tab: string) => `strip-tab-${tab.replace(/[^\w-]/g, "-")}`;

  // Da tastiera le schede sono una sola fermata di Tab: le frecce sinistra
  // e destra, Inizio e Fine passano da una all'altra e la aprono, come in
  // ogni riga di schede (D-132).
  function tabKey(event: KeyboardEvent) {
    const at = tabOrder.indexOf(session.activeTab);
    const to =
      event.key === "ArrowRight" ? (at + 1) % tabOrder.length
      : event.key === "ArrowLeft" ? (at - 1 + tabOrder.length) % tabOrder.length
      : event.key === "Home" ? 0
      : event.key === "End" ? tabOrder.length - 1
      : null;
    if (to === null) return;
    event.preventDefault();
    show(tabOrder[to]);
    void Promise.resolve().then(() => document.getElementById(tabId(tabOrder[to]))?.focus());
  }

  // Con molti terminali le loro schede scorrono di lato (D-112): quella
  // aperta si porta sempre in vista, anche quando l'ha aperta la barretta.
  let terminalTabs: HTMLDivElement | undefined = $state();
  $effect(() => {
    const tab = session.activeTab;
    const count = session.terminals.length;
    if (terminalTabs === undefined || tab === "events" || count === 0) return;
    terminalTabs.querySelector(".tab.selected")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  // Scegliere una scheda riapre anche la fascia, se era chiusa.
  function show(tab: string) {
    session.activeTab = tab;
    preferences.stripOpen = true;
  }
</script>

<svelte:window bind:innerHeight={windowHeight} />

<footer>
  {#if preferences.stripOpen}
    <!-- Un separatore che si mette a fuoco e si regola è un controllo, per
         ARIA; Svelte non lo sa e lo segnalerebbe come non interattivo. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <!-- Una tacca al centro del bordo dice che si afferra; la zona da
         afferrare è più alta della tacca, comoda anche con il dito. -->
    <div
      class="resize"
      class:dragging={drag !== null}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Altezza della fascia: trascina, o usa le frecce"
      aria-valuenow={height}
      aria-valuemin={Math.min(STRIP_HEIGHT.min, maxHeight)}
      aria-valuemax={maxHeight}
      aria-valuetext="{height} pixel"
      tabindex="0"
      onpointerdown={startResize}
      onpointermove={resize}
      onpointerup={() => (drag = null)}
      onpointercancel={() => (drag = null)}
      onkeydown={resizeKey}
    ><span class="grip" aria-hidden="true"></span></div>
  {/if}
  <div class="tabs" role="tablist" bind:this={tabsRow}>
    <div class="terminals" bind:this={terminalTabs}>
      {#each session.terminals as terminal (terminal.deviceId)}
        <span class="tab" class:selected={session.activeTab === terminal.deviceId}>
          <!-- Un nome molto lungo si accorcia con i puntini: intero sta nel
               suggerimento e nel nome per il lettore di schermo. -->
          <button
            class="name"
            role="tab"
            id={tabId(terminal.deviceId)}
            aria-selected={session.activeTab === terminal.deviceId}
            aria-controls={preferences.stripOpen ? "strip-panel" : undefined}
            tabindex={session.activeTab === terminal.deviceId ? 0 : -1}
            title="Terminale di {nameOf(terminal.deviceId)}"
            onclick={() => show(terminal.deviceId)}
            onkeydown={tabKey}
          >
            Terminale · <span class="device">{nameOf(terminal.deviceId)}</span>{#if session.isOff(terminal.deviceId)}<span class="off">{" · spento"}</span>{/if}
          </button>
          <button
            class="close"
            title="Chiudi il terminale"
            aria-label="Chiudi il terminale di {nameOf(terminal.deviceId)}"
            onclick={() => session.closeTerminal(terminal.deviceId)}
          >
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M4 4L10 10M10 4L4 10" /></svg>
          </button>
        </span>
      {/each}
    </div>

    <span class="tab" class:selected={session.activeTab === "events"}>
      <button
        class="name"
        role="tab"
        id={tabId("events")}
        aria-selected={session.activeTab === "events"}
        aria-controls={preferences.stripOpen ? "strip-panel" : undefined}
        tabindex={session.activeTab === "events" ? 0 : -1}
        onclick={() => show("events")}
        onkeydown={tabKey}
      >
        Eventi
      </button>
    </span>

    <button
      class="fold"
      title={preferences.stripOpen ? "Chiudi la fascia" : "Apri la fascia"}
      aria-label={preferences.stripOpen ? "Chiudi la fascia in basso" : "Apri la fascia in basso"}
      aria-expanded={preferences.stripOpen}
      onclick={() => (preferences.stripOpen = !preferences.stripOpen)}
    >
      <Chevron direction={preferences.stripOpen ? "down" : "up"} />
    </button>
  </div>

  {#if preferences.stripOpen}
    <div class="body" id="strip-panel" role="tabpanel" aria-labelledby={tabId(session.activeTab)} style="height: {height}px">
      {#if active !== undefined}
        {#key active.deviceId}
          <TerminalTab terminal={active} />
        {/key}
      {:else}
        <EventsTab />
      {/if}
    </div>
  {/if}
</footer>

<style>
  footer {
    position: relative;
    background: var(--surface);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 6px 10px 0;
    border-bottom: 1px solid var(--line);
  }
  /* Le schede dei terminali: se sono troppe per la larghezza scorrono di
     lato, e la scheda Eventi e la freccia restano sempre in vista (D-112). */
  .terminals {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .tab {
    flex: none;
  }
  .tab {
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--radius) var(--radius) 0 0;
    color: var(--muted);
  }
  .tab.selected {
    border-color: var(--line);
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 600;
  }
  .tab button {
    border: none;
    background: none;
    color: inherit;
    font-weight: inherit;
    cursor: pointer;
  }
  .name {
    padding: 5px 12px;
    white-space: nowrap;
  }
  /* Il nome del dispositivo: lungo, si accorcia con i puntini. */
  .name .device {
    display: inline-block;
    max-width: 14em;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }
  .name .off {
    color: var(--muted);
    font-weight: 400;
  }
  /* La crocetta sta dentro la scheda, subito dopo il nome. */
  .close {
    padding: 3px;
    margin: 0 6px 0 -6px;
    border-radius: var(--radius);
    display: grid;
    place-items: center;
  }
  .close:hover {
    background: var(--line);
  }
  .close path {
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    fill: none;
  }
  .tab button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .tab:hover {
    color: var(--ink);
  }
  /* La freccia sta in fondo alla riga delle schede, allineata a quella
     del pannello laterale. */
  .fold {
    margin-left: auto;
    margin-right: -8px;
    align-self: center;
  }
  /* Il bordo superiore, da afferrare: alto 12 pixel, comodo anche con il
     dito. Una tacca al centro lo dice sempre; passandoci sopra, con il
     fuoco o mentre lo si trascina, la striscia si colora (D-132). */
  .resize {
    position: absolute;
    top: -6px;
    left: 0;
    right: 0;
    height: 12px;
    cursor: ns-resize;
    z-index: 2;
    touch-action: none;
    display: grid;
    place-items: center;
  }
  .grip {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--line);
  }
  .resize:hover,
  .resize:focus-visible,
  .resize.dragging {
    background: color-mix(in srgb, var(--accent) 35%, transparent);
    outline: none;
  }
  .resize:hover .grip,
  .resize:focus-visible .grip,
  .resize.dragging .grip {
    background: var(--accent);
  }
  .body {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
