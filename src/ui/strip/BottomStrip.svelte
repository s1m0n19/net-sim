<script lang="ts">
  // La fascia in basso: una scheda per ogni terminale aperto, più la
  // scheda Eventi, che c'è sempre.
  import { STRIP_HEIGHT, stripHeightWithin } from "../layout/auto-open";
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
  let drag: { y: number; height: number } | null = null;

  function startResize(event: PointerEvent) {
    drag = { y: event.clientY, height: preferences.stripHeight };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function resize(event: PointerEvent) {
    if (drag === null) return;
    const wanted = drag.height + (drag.y - event.clientY) / preferences.scale;
    preferences.stripHeight = stripHeightWithin(wanted, window.innerHeight / preferences.scale);
  }

  // Da tastiera: frecce su e giù, a scatti di 20 pixel.
  function resizeKey(event: KeyboardEvent) {
    const step = event.key === "ArrowUp" ? 20 : event.key === "ArrowDown" ? -20 : 0;
    if (step === 0) return;
    event.preventDefault();
    preferences.stripHeight = stripHeightWithin(preferences.stripHeight + step, window.innerHeight / preferences.scale);
  }

  // Scegliere una scheda riapre anche la fascia, se era chiusa.
  function show(tab: string) {
    session.activeTab = tab;
    preferences.stripOpen = true;
  }
</script>

<footer>
  {#if preferences.stripOpen}
    <!-- Un separatore che si mette a fuoco e si regola è un controllo, per
         ARIA; Svelte non lo sa e lo segnalerebbe come non interattivo. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Altezza della fascia: trascina, o usa le frecce"
      aria-valuenow={preferences.stripHeight}
      aria-valuemin={STRIP_HEIGHT.min}
      tabindex="0"
      onpointerdown={startResize}
      onpointermove={resize}
      onpointerup={() => (drag = null)}
      onpointercancel={() => (drag = null)}
      onkeydown={resizeKey}
    ></div>
  {/if}
  <div class="tabs" role="tablist">
    {#each session.terminals as terminal (terminal.deviceId)}
      <span class="tab" class:selected={session.activeTab === terminal.deviceId}>
        <button
          class="name"
          role="tab"
          aria-selected={session.activeTab === terminal.deviceId}
          onclick={() => show(terminal.deviceId)}
        >
          Terminale · {nameOf(terminal.deviceId)}
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

    <span class="tab" class:selected={session.activeTab === "events"}>
      <button class="name" role="tab" aria-selected={session.activeTab === "events"} onclick={() => show("events")}>
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
    <div class="body" style="height: {preferences.stripHeight}px">
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
  /* Una striscia sottile sul bordo superiore, da afferrare: si vede solo
     passandoci sopra o con il fuoco da tastiera. */
  .resize {
    position: absolute;
    top: -4px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
    z-index: 2;
    touch-action: none;
  }
  .resize:hover,
  .resize:focus-visible {
    background: var(--accent);
    opacity: 0.35;
    outline: none;
  }
  .body {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
