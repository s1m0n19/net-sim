<script lang="ts">
  import { session } from "../session.svelte";
  import { pause, start, stepOnce } from "./playback";

  const SPEEDS = [0.5, 1, 2];

  function nextSpeed() {
    session.speed = SPEEDS[(SPEEDS.indexOf(session.speed) + 1) % SPEEDS.length];
  }

  // "0,5×" con la virgola, come si scrive in italiano.
  const speedLabel = $derived(`${String(session.speed).replace(".", ",")}×`);
  const nothingToDo = $derived(session.view.nextEvent === null);
</script>

<!-- Sul foglio vuoto non c'è nulla da far scorrere: la barra non c'è (D-107). -->
{#if !session.isEmpty()}
  <div class="bar" role="toolbar" aria-label="Comandi della simulazione">
    <button class="btn" onclick={() => session.restart()}>⟲ Ricomincia</button>

    {#if session.running}
      <button class="btn primary" onclick={pause}>❚❚ Pausa</button>
    {:else}
      <button class="btn primary" onclick={start} disabled={session.view.suspended}>▶ Avvia</button>
    {/if}

    <button class="btn" onclick={stepOnce} disabled={session.running || nothingToDo}>Passo ›</button>

    <span class="separator"></span>

    <button class="btn" onclick={nextSpeed} aria-label="Velocità: {speedLabel}. Cambia velocità">{speedLabel}</button>
    <span class="time mono">tick {session.view.time}</span>

    {#if session.view.suspended}
      <span class="suspended">sospesa</span>
    {/if}
  </div>
{/if}

<style>
  .bar {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    /* Su un disegno più stretto della barra (in presentazione, su uno
       schermo piccolo) i comandi vanno a capo invece di uscire dai bordi
       (D-112). */
    width: max-content;
    max-width: calc(100% - 28px);
    box-sizing: border-box;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
    white-space: nowrap;
  }
  .separator {
    width: 1px;
    align-self: stretch;
    background: var(--line);
    margin-inline: 4px;
  }
  .time {
    color: var(--muted);
    min-width: 5.5em;
  }
  .suspended {
    color: var(--down);
    font-weight: 600;
  }
</style>
