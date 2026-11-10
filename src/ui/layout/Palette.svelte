<script lang="ts">
  // La colonna da cui si prendono i dispositivi da posare sul disegno.
  // Due modi: trascinare una voce sul disegno, per posarne uno; oppure un
  // clic sulla voce e poi un clic sul disegno per ogni dispositivo, finché
  // non si preme Esc.
  import { tick } from "svelte";
  import type { DeviceTemplate } from "../../engine/editing";
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import DeviceIcon from "../theme/DeviceIcon.svelte";

  const PC: DeviceTemplate = { kind: "host" };
  const SERVER: DeviceTemplate = { kind: "server" };
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
  const placingServer = $derived(session.placing?.kind === "server");

  // Un clic sulla voce già scelta la lascia andare.
  function choose(template: DeviceTemplate) {
    const same = JSON.stringify(session.placing) === JSON.stringify(template);
    // Uno strumento alla volta: anche un ping o un cavo a metà si lasciano.
    session.releaseTools();
    session.placing = same ? null : template;
    switchMenuOpen = false;
    routerMenuOpen = false;
  }

  // Il puntatore dell'ultimo gesto sulla voce: mouse, dito o penna.
  let pointerType = "mouse";

  // Con il mouse l'elenco si è già aperto passandoci sopra: il clic sulla
  // voce lo lascia aperto, invece di richiuderlo. Con il dito o la penna
  // (alla LIM) e da tastiera (un clic con detail 0) un tocco o Invio lo
  // aprono, e un altro lo richiude (D-129).
  function toggled(event: MouseEvent, open: boolean): boolean {
    if (event.detail === 0 || pointerType !== "mouse") return !open;
    return true;
  }

  // Passare sopra la voce apre l'elenco, ma solo con il mouse: con il dito
  // il passaggio e il tocco arrivano insieme, e l'elenco si aprirebbe e
  // richiuderebbe nello stesso istante.
  function hovered(event: PointerEvent, open: () => void) {
    pointerType = event.pointerType;
    if (event.pointerType === "mouse") open();
  }

  // Aperto da tastiera, il fuoco va sulla prima variante: l'elenco si usa
  // con le frecce, come ogni menu.
  function focusFirst(group: HTMLElement) {
    void tick().then(() => group.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
  }

  // Da tastiera l'elenco delle varianti si apre con Invio, Spazio o freccia
  // giù sulla voce; le frecce su e giù, Inizio e Fine si muovono tra le
  // varianti. Esc lo chiude e ridà il fuoco alla voce; si chiude anche
  // quando il fuoco va altrove, come quando il puntatore se ne va.
  function menuKey(event: KeyboardEvent, open: boolean, setOpen: (value: boolean) => void) {
    const group = event.currentTarget as HTMLElement;
    const tile = group.querySelector<HTMLButtonElement>(".tile");
    const items = [...group.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      tile?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!open) {
      if (event.key !== "ArrowDown" || document.activeElement !== tile) return;
      setOpen(true);
      focusFirst(group);
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const to =
      event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (at + 1) % items.length
      : (at - 1 + items.length) % items.length;
    items[to]?.focus();
  }

  // Un clic, un tocco o Invio sulla voce: apre o chiude l'elenco; aperto da
  // tastiera, porta il fuoco sulla prima variante.
  function tileClick(event: MouseEvent, open: boolean, setOpen: (value: boolean) => void) {
    const next = toggled(event, open);
    setOpen(next);
    if (next && !open && event.detail === 0) focusFirst((event.currentTarget as HTMLElement).parentElement!);
  }

  // Safari, su Mac, non dà il fuoco a un pulsante cliccato: aperto il
  // menu con il mouse, Esc arriva alla pagina e non al contenitore. Lo si
  // prende prima di tutti, così chiude il menu e nient'altro.
  function windowKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || !(switchMenuOpen || routerMenuOpen)) return;
    // Con il fuoco dentro il menu ci pensa menuKey, che ridà il fuoco alla voce.
    if (document.activeElement?.closest(".with-menu")) return;
    event.stopPropagation();
    switchMenuOpen = false;
    routerMenuOpen = false;
  }

  function menuFocusOut(event: FocusEvent, close: () => void) {
    const next = event.relatedTarget as Node | null;
    if (next === null || !(event.currentTarget as HTMLElement).contains(next)) close();
  }

  // Lo strumento Cavo resta attivo finché non lo si spegne, con un altro
  // clic o con Esc.
  function toggleCable() {
    const next = !session.cabling;
    session.releaseTools();
    session.cabling = next;
  }

  // Trascinando, il disegno legge da qui che cosa sta arrivando.
  function startDrag(event: DragEvent, template: DeviceTemplate) {
    session.placing = null;
    event.dataTransfer?.setData("application/x-net-sim-device", JSON.stringify(template));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  }
</script>

<svelte:window onkeydowncapture={windowKey} />

{#if preferences.paletteOpen}
  <aside class="open">
    <div class="column">
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
        <span class="name">PC</span>
      </button>

      <div
        class="with-menu"
        role="presentation"
        onmouseleave={() => (switchMenuOpen = false)}
        onkeydown={(event) => menuKey(event, switchMenuOpen, (value) => (switchMenuOpen = value))}
        onfocusout={(event) => menuFocusOut(event, () => (switchMenuOpen = false))}
      >
        <button
          class="tile"
          class:active={placingSwitch}
          aria-pressed={placingSwitch}
          aria-haspopup="menu"
          aria-expanded={switchMenuOpen}
          title="Switch: scegli quante porte"
          onpointerenter={(event) => hovered(event, () => (switchMenuOpen = true))}
          onpointerdown={(event) => (pointerType = event.pointerType)}
          onclick={(event) => tileClick(event, switchMenuOpen, (value) => (switchMenuOpen = value))}
        >
          <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="switch" /></svg>
          <span class="name">Switch ›</span>
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

      <div
        class="with-menu"
        role="presentation"
        onmouseleave={() => (routerMenuOpen = false)}
        onkeydown={(event) => menuKey(event, routerMenuOpen, (value) => (routerMenuOpen = value))}
        onfocusout={(event) => menuFocusOut(event, () => (routerMenuOpen = false))}
      >
        <button
          class="tile"
          class:active={placingRouter}
          aria-pressed={placingRouter}
          aria-haspopup="menu"
          aria-expanded={routerMenuOpen}
          title="Router: scegli quante interfacce"
          onpointerenter={(event) => hovered(event, () => (routerMenuOpen = true))}
          onpointerdown={(event) => (pointerType = event.pointerType)}
          onclick={(event) => tileClick(event, routerMenuOpen, (value) => (routerMenuOpen = value))}
        >
          <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="router" /></svg>
          <span class="name">Router ›</span>
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
      <button
        class="tile"
        class:active={placingServer}
        aria-pressed={placingServer}
        title="Server: trascinalo sul disegno, oppure fai clic qui e poi sul disegno"
        draggable="true"
        ondragstart={(event) => startDrag(event, SERVER)}
        onclick={() => choose(SERVER)}
      >
        <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="server" /></svg>
        <span class="name">Server</span>
      </button>

      <!-- Tra dispositivi e strumenti una riga: resta anche nella colonna
           stretta, dove le scritte non ci stanno (D-129). -->
      <div class="caption tools">Strumenti</div>
      <button
        class="tile tool"
        class:active={session.cabling}
        aria-pressed={session.cabling}
        title="Cavo: trascina da un dispositivo a un altro"
        onclick={toggleCable}
      >
        <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="cable" /></svg>
        <span class="name">Cavo</span>
      </button>

      <!-- Le annotazioni (ED-9, D-117): non sono dispositivi, ma si scelgono
           e si lasciano come il Cavo. -->
      <button
        class="tile tool"
        class:active={session.annotating === "box"}
        aria-pressed={session.annotating === "box"}
        title="Riquadro: trascina sul disegno per evidenziare un'area"
        onclick={() => session.chooseAnnotationTool("box")}
      >
        <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="box" /></svg>
        <span class="name">Riquadro</span>
      </button>
      <button
        class="tile tool"
        class:active={session.annotating === "note"}
        aria-pressed={session.annotating === "note"}
        title="Nota: fai clic sul disegno per scrivere una nota"
        onclick={() => session.chooseAnnotationTool("note")}
      >
        <svg viewBox="-20 -16 40 32" aria-hidden="true"><DeviceIcon kind="note" /></svg>
        <span class="name">Nota</span>
      </button>

      <button class="fold" title="Chiudi la colonna" aria-label="Chiudi la colonna dei dispositivi" onclick={() => (preferences.paletteOpen = false)}>
        <Chevron direction="left" />
      </button>
    </div>
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
  /* Aperta, la colonna guarda quanto è alta: se la fascia in basso le
     lascia poco spazio, le voci si stringono invece di uscire dallo
     schermo (D-112); con Riquadro e Nota le voci sono sette (D-117). */
  aside.open {
    padding: 0;
    container: palette / size;
  }
  .column {
    height: 100%;
    box-sizing: border-box;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  @container palette (max-height: 560px) {
    .column {
      gap: 4px;
      padding-block: 6px;
    }
    .caption,
    .tile svg {
      display: none;
    }
    /* Della scritta «Strumenti» resta la riga che separa. */
    .caption.tools {
      display: block;
      height: 0;
      padding: 0;
      margin: 2px 6px;
      font-size: 0;
    }
    .tile {
      padding: 6px 2px;
    }
  }
  /* Bassissima (la fascia alzata al massimo su uno schermo piccolo): le
     sole icone, su due colonne. Il nome resta per il lettore di schermo e
     nel suggerimento (D-117). */
  @container palette (max-height: 300px) {
    .column {
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-content: start;
      gap: 3px;
      padding: 3px 4px;
    }
    .tile {
      padding: 1px 0;
    }
    .caption.tools {
      grid-column: 1 / -1;
      margin: 1px 4px;
    }
    .tile svg {
      display: block;
      width: 26px;
      height: 22px;
    }
    .tile .name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    /* Le voci sono sette: la freccia prende il posto libero accanto a Nota. */
    .fold {
      margin-top: 0;
      align-self: center;
      justify-self: center;
    }
  }
  /* La freccia sta in fondo, nello stesso punto da aperta e da chiusa. */
  .fold {
    margin-top: auto;
    align-self: center;
  }
  .caption {
    color: var(--muted);
    font-size: var(--text-small);
    text-align: center;
  }
  /* Gli strumenti non si posano: li separa dai dispositivi una riga. */
  .caption.tools {
    padding-top: 6px;
    border-top: 1px solid var(--line);
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
    font-size: var(--text-small);
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
  /* La voce scelta: il prossimo clic sul disegno ne posa uno. Come ogni
     cosa accesa che resta accesa (.btn.on, D-115), oltre al colore ha un
     fondo tinto e un segno: il bordo doppio e una spunta nell'angolo
     (D-128). */
  .tile.active {
    position: relative;
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    font-weight: 600;
  }
  .tile.active:hover {
    border-color: var(--accent);
  }
  /* La spunta: due tratti del bordo, ruotati, in alto a destra. */
  .tile.active::after {
    content: "";
    position: absolute;
    top: 4px;
    right: 5px;
    width: 4px;
    height: 7px;
    border: solid var(--accent);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
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
    border-radius: var(--radius-float);
    box-shadow: var(--shadow-menu);
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
