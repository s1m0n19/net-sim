<script lang="ts">
  // La fascia in basso: una scheda per ogni terminale aperto, più la
  // scheda Eventi, che c'è sempre.
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import EventsTab from "./EventsTab.svelte";
  import TerminalTab from "./TerminalTab.svelte";

  const active = $derived(session.terminals.find((terminal) => terminal.deviceId === session.activeTab));

  function nameOf(deviceId: string): string {
    return session.view.devices.find((device) => device.id === deviceId)?.name ?? "?";
  }

  // Scegliere una scheda riapre anche la fascia, se era chiusa.
  function show(tab: string) {
    session.activeTab = tab;
    preferences.stripOpen = true;
  }
</script>

<footer>
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
    <div class="body">
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
  .body {
    height: 190px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
