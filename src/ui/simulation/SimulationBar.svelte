<script lang="ts">
  import { session } from "../session.svelte";
  import Icon from "../theme/Icon.svelte";
  import { pause, start, stepOnce } from "./playback";
  import { simulationState, STATE_TEXT } from "./simulation-state";

  const SPEEDS = [0.5, 1, 2];

  function nextSpeed() {
    session.speed = SPEEDS[(SPEEDS.indexOf(session.speed) + 1) % SPEEDS.length];
  }

  // "0,5×" con la virgola, come si scrive in italiano.
  const speedLabel = $derived(`${String(session.speed).replace(".", ",")}×`);
  const nothingToDo = $derived(session.view.nextEvent === null);
  // Ferma, in esecuzione o sospesa (D-113). Non è un annuncio per il
  // lettore di schermo: cambia solo perché lo si è chiesto con un pulsante,
  // o insieme all'avviso della tempesta, che si annuncia da sé.
  const state = $derived(simulationState(session.running, session.view.suspended));
</script>

<!-- Sul foglio vuoto non c'è nulla da far scorrere: la barra non c'è (D-107). -->
{#if !session.isEmpty()}
  <div class="bar" role="toolbar" aria-label="Comandi della simulazione">
    <!-- Ogni comando ha l'icona e la scritta; l'icona non si legge, il
         nome resta la scritta. -->
    <button class="btn command" onclick={() => session.restart()}><Icon name="restart" size={14} />Ricomincia</button>

    {#if session.running}
      <button class="btn primary command" onclick={pause}><Icon name="pause" size={14} />Pausa</button>
    {:else}
      <button class="btn primary command" onclick={start} disabled={session.view.suspended}><Icon name="play" size={14} />Avvia</button>
    {/if}

    <button class="btn command" onclick={stepOnce} disabled={session.running || nothingToDo}><Icon name="step" size={14} />Passo</button>

    <span class="separator"></span>

    <button class="btn" onclick={nextSpeed} aria-label="Velocità: {speedLabel}. Cambia velocità">{speedLabel}</button>
    <span class="time mono">tick {session.view.time}</span>

    <span class="state {state}" title={STATE_TEXT[state].description}>
      <span class="mark" aria-hidden="true"></span>
      {STATE_TEXT[state].label}
    </span>
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
    border-radius: var(--radius-float);
    box-shadow: var(--shadow-float);
    white-space: nowrap;
  }
  /* L'icona aggiunge larghezza: i comandi hanno un margine un po' più
     stretto degli altri pulsanti, così in presentazione, su uno schermo
     piccolo, la barra va a capo su due righe e non su tre (D-115). */
  .command {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-inline: 7px;
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
  /* Lo stato: una scritta con un segno che cambia anche di forma, non solo
     di colore. Ferma: un cerchio vuoto. In esecuzione: pieno. Sospesa: un
     punto esclamativo nel cerchio rosso. Nessuna animazione. */
  .state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 9px 2px 7px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    font-size: var(--text-small);
  }
  .mark {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: 11px;
    height: 11px;
    border: 2px solid var(--muted);
    border-radius: 50%;
  }
  .running {
    color: var(--ink);
    border-color: var(--accent);
  }
  .running .mark {
    border-color: var(--accent);
    background: var(--accent);
  }
  .suspended {
    color: var(--down);
    border-color: var(--down);
    font-weight: 600;
  }
  /* Il punto esclamativo è disegnato, non scritto: la scritta resta
     "Sospesa", anche per il lettore di schermo. */
  .suspended .mark::before {
    content: "!";
  }
  .suspended .mark {
    width: 14px;
    height: 14px;
    border: none;
    background: var(--down);
    color: var(--surface);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
  }
</style>
