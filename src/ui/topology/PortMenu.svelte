<svelte:options namespace="svg" />

<script lang="ts">
  import { session } from "../session.svelte";
  import type { LinkView } from "../view";
  import { portLabelPoint } from "./geometry";

  // L'elenco delle porte su cui si può spostare un capo di un cavo: quella
  // attuale e quelle libere dello stesso dispositivo.
  let { link, end }: { link: LinkView; end: "a" | "b" } = $props();

  const ROWS = 6; // uno switch a 24 porte sta in quattro colonne
  const CELL = { width: 52, height: 22 };

  const choices = $derived(end === "a" ? link.fromChoices : link.toChoices);
  const current = $derived(end === "a" ? link.fromPort : link.toPort);
  const deviceName = $derived(end === "a" ? link.fromName : link.toName);
  const columns = $derived(Math.ceil(choices.length / ROWS));
  const rows = $derived(Math.min(choices.length, ROWS));
  // Il riquadro sta subito sotto il nome della porta; nella metà bassa
  // del disegno sta sopra, per non finire sotto la barra della simulazione.
  const origin = $derived.by(() => {
    const label = portLabelPoint(link.from, link.to, end);
    const bounds = session.view.bounds;
    const below = label.y < bounds.y + bounds.height / 2;
    return {
      x: label.x - (columns * CELL.width) / 2,
      y: below ? label.y + 10 : label.y - 18 - rows * CELL.height,
    };
  });

  function pick(portName: string) {
    if (portName !== current) session.changePort(link.id, end, portName);
    session.portMenu = null;
  }

  function onKey(event: KeyboardEvent, portName: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(portName);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<g
  class="menu"
  transform="translate({origin.x} {origin.y})"
  role="listbox"
  tabindex="-1"
  aria-label="Porta di {deviceName}"
  onclick={(event) => event.stopPropagation()}
>
  <rect class="panel" x="-4" y="-4" width={columns * CELL.width + 8} height={rows * CELL.height + 8} rx="6" />
  {#each choices as portName, index (portName)}
    <g
      class="choice"
      class:current={portName === current}
      transform="translate({Math.floor(index / ROWS) * CELL.width} {(index % ROWS) * CELL.height})"
      role="option"
      tabindex="0"
      aria-selected={portName === current}
      onclick={() => pick(portName)}
      onkeydown={(event) => onKey(event, portName)}
    >
      <rect width={CELL.width} height={CELL.height} rx="4" />
      <text x={CELL.width / 2} y="15">{portName}</text>
    </g>
  {/each}
</g>

<style>
  .menu {
    outline: none;
  }
  .panel {
    fill: var(--surface);
    stroke: var(--line);
    filter: drop-shadow(0 2px 6px rgb(0 0 0 / 0.18));
  }
  .choice {
    cursor: pointer;
    outline: none;
  }
  .choice rect {
    fill: transparent;
  }
  .choice:hover rect,
  .choice:focus-visible rect {
    fill: var(--surface-2);
  }
  .choice text {
    fill: var(--ink);
    font-family: var(--font-mono);
    font-size: 11px;
    text-anchor: middle;
  }
  /* La porta attuale: colore d'accento e grassetto. */
  .choice.current text {
    fill: var(--accent);
    font-weight: 500;
    text-decoration: underline;
  }
</style>
