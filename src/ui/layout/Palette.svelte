<script lang="ts">
  // La colonna da cui si prendono i dispositivi da posare sul disegno.
  // Due modi: trascinare una voce sul disegno, per posarne uno; oppure un
  // clic sulla voce e poi un clic sul disegno per ogni dispositivo, finché
  // non si preme Esc.
  import type { DeviceTemplate } from "../../engine/editing";
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import DeviceIcon from "../theme/DeviceIcon.svelte";

  const PC: DeviceTemplate = { kind: "host" };
  // Le varianti pronte dello switch, tra cui scegliere prima di posarlo.
  const SWITCHES = [
    { label: "Switch a 8 porte", template: { kind: "switch", portCount: 8 } as DeviceTemplate },
    { label: "Switch a 24 porte", template: { kind: "switch", portCount: 24 } as DeviceTemplate },
  ];

  // Le varianti pronte del router: nasce con le interfacce spente.
  const ROUTERS = [2, 4, 8].map((interfaceCount) => ({
    label: `Router a ${interfaceCount} interfacce`,
    template: { kind: "router", interfaceCount } as DeviceTemplate,
  }));

  let switchMenuOpen = $state(false);
  let routerMenuOpen = $state(false);

  const placingHost = $derived(session.placing?.kind === "host");
  const placingSwitch = $derived(session.placing?.kind === "switch");
  const placingRouter = $derived(session.placing?.kind === "router");

  // Un clic sulla voce già scelta la lascia andare.
  function choose(template: DeviceTemplate) {
    const same = JSON.stringify(session.placing) === JSON.stringify(template);
    session.placing = same ? null : template;
    session.cabling = false;
    session.linkFrom = null;
    switchMenuOpen = false;
    routerMenuOpen = false;
  }

  // Lo strumento Cavo resta attivo finché non lo si spegne, con un altro
  // clic o con Esc.
  function toggleCable() {
    session.cabling = !session.cabling;
    session.placing = null;
    session.linkFrom = null;
  }

  // Trascinando, il disegno legge da qui che cosa sta arrivando.
  function startDrag(event: DragEvent, template: DeviceTemplate) {
    session.placing = null;
    event.dataTransfer?.setData("application/x-net-sim-device", JSON.stringify(template));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  }
</script>

{#if preferences.paletteOpen}
  <aside>
    <div class="caption">Dispositivi</div>

    <button
      class="tile"
      class:active={placingHost}
      aria-pressed={placingHost}
      title="PC: trascinalo sul disegno, oppure fai clic qui e poi sul disegno"
      draggable="true"
      ondragstart={(event) => startDrag(event, PC)}
      onclick={() => choose(PC)}
    >
      <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="host" /></svg>
      PC
    </button>

    <div class="with-menu" onmouseleave={() => (switchMenuOpen = false)} role="presentation">
      <button
        class="tile"
        class:active={placingSwitch}
        aria-pressed={placingSwitch}
        aria-haspopup="menu"
        aria-expanded={switchMenuOpen}
        title="Switch: scegli quante porte"
        onmouseenter={() => (switchMenuOpen = true)}
        onclick={() => (switchMenuOpen = !switchMenuOpen)}
      >
        <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="switch" /></svg>
        Switch ›
      </button>
      {#if switchMenuOpen}
        <div class="menu" role="menu">
          {#each SWITCHES as variant}
            <button
              role="menuitem"
              draggable="true"
              ondragstart={(event) => startDrag(event, variant.template)}
              onclick={() => choose(variant.template)}
            >
              {variant.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="with-menu" onmouseleave={() => (routerMenuOpen = false)} role="presentation">
      <button
        class="tile"
        class:active={placingRouter}
        aria-pressed={placingRouter}
        aria-haspopup="menu"
        aria-expanded={routerMenuOpen}
        title="Router: scegli quante interfacce"
        onmouseenter={() => (routerMenuOpen = true)}
        onclick={() => (routerMenuOpen = !routerMenuOpen)}
      >
        <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="router" /></svg>
        Router ›
      </button>
      {#if routerMenuOpen}
        <div class="menu" role="menu">
          {#each ROUTERS as variant}
            <button
              role="menuitem"
              draggable="true"
              ondragstart={(event) => startDrag(event, variant.template)}
              onclick={() => choose(variant.template)}
            >
              {variant.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="tile soon" title="Non ancora disponibile">
      <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="server" /></svg>
      Server
    </div>

    <div class="caption">Strumenti</div>
    <button
      class="tile tool"
      class:active={session.cabling}
      aria-pressed={session.cabling}
      title="Cavo: trascina da un dispositivo a un altro"
      onclick={toggleCable}
    >
      <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="cable" /></svg>
      Cavo
    </button>

    <button class="fold" title="Chiudi la colonna" aria-label="Chiudi la colonna dei dispositivi" onclick={() => (preferences.paletteOpen = false)}>
      <Chevron direction="left" />
    </button>
  </aside>
{:else}
  <aside class="closed">
    <button class="fold" title="Apri la colonna" aria-label="Apri la colonna dei dispositivi" onclick={() => (preferences.paletteOpen = true)}>
      <Chevron direction="right" />
    </button>
  </aside>
{/if}

<style>
  aside {
    width: 84px;
    box-sizing: border-box;
    background: var(--surface);
    border-right: 1px solid var(--line);
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  aside.closed {
    width: 26px;
    padding: 10px 2px;
  }
  /* La freccia sta in fondo, nello stesso punto da aperta e da chiusa. */
  .fold {
    margin-top: auto;
    align-self: center;
  }
  .caption {
    color: var(--muted);
    font-size: 0.85em;
    text-align: center;
  }
  .tile {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--ink);
    padding: 6px 2px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    font-size: 0.85em;
  }
  button.tile {
    cursor: grab;
  }
  button.tool {
    cursor: pointer;
  }
  button.tile:hover {
    border-color: var(--muted);
  }
  button.tile:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  /* La voce scelta: il prossimo clic sul disegno ne posa uno. */
  .tile.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    color: var(--accent);
  }
  .tile.soon {
    opacity: 0.45;
  }
  .tile svg {
    width: 34px;
    height: 28px;
  }
  .with-menu {
    position: relative;
  }
  /* L'elenco delle varianti si apre a fianco della voce, sopra il disegno. */
  .menu {
    position: absolute;
    left: 100%;
    top: 0;
    z-index: 5;
    padding: 4px 4px 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .menu::before {
    content: "";
    position: absolute;
    inset: 0 0 0 4px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.14);
  }
  .menu button {
    position: relative;
    padding: 5px 10px;
    border: none;
    border-radius: var(--radius);
    background: none;
    white-space: nowrap;
    text-align: left;
    cursor: grab;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--surface-2);
    color: var(--accent);
    outline: none;
  }
</style>
