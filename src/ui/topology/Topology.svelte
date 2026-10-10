<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import SimulationBar from "../simulation/SimulationBar.svelte";
  import ActionBar, { type BarAction } from "./ActionBar.svelte";
  import { panned, zoomed, ZOOM_STEP } from "./camera";
  import DeviceNode from "./DeviceNode.svelte";
  import LinkLine from "./LinkLine.svelte";
  import PinnedTable, { pinnedSize } from "./PinnedTable.svelte";
  import PortMenu from "./PortMenu.svelte";
  import PacketEnvelope from "./PacketEnvelope.svelte";
  import WaitIndicator from "./WaitIndicator.svelte";

  // Le tabelle appuntate, ciascuna con il suo dispositivo.
  const pinned = $derived(
    session.pins.flatMap((pin) => {
      const device = session.view.devices.find((d) => d.id === pin.deviceId);
      return device === undefined ? [] : [{ pin, device }];
    }),
  );

  // Dove sta ogni tabella appuntata, come rettangolo del disegno.
  const pinnedBoxes = $derived(
    pinned.map(({ pin, device }) => ({ x: device.x + pin.dx, y: device.y + pin.dy, ...pinnedSize(device) })),
  );

  // L'inquadratura. Se l'utente l'ha scelta, è quella. Altrimenti è
  // automatica: il foglio di base, allargato quanto serve per far stare
  // tutta la rete e le tabelle appuntate.
  const bounds = $derived.by(() => {
    if (session.camera !== null) return session.camera;
    // Mentre si trascina un dispositivo l'inquadratura non si muove.
    if (session.frozenBounds !== null) return session.frozenBounds;
    let { x, y, width, height } = session.view.bounds;
    let right = x + width;
    let bottom = y + height;
    for (const { pin, device } of pinned) {
      const size = pinnedSize(device);
      const left = device.x + pin.dx;
      const top = device.y + pin.dy;
      x = Math.min(x, left - 16);
      y = Math.min(y, top - 16);
      right = Math.max(right, left + size.width + 16);
      bottom = Math.max(bottom, top + size.height + 16);
    }
    return { x, y, width: right - x, height: bottom - y };
  });

  // I dispositivi che stanno aspettando una risposta, quando non viaggia nulla.
  const waiting = $derived(
    session.waitProgress === null
      ? []
      : session.view.devices.filter((device) => session.view.nextEvent?.waitingDeviceIds.includes(device.id)),
  );

  // La barretta delle azioni di ciò che è selezionato: dove sta e che cosa offre.
  const bar = $derived.by((): { x: number; y: number; actions: BarAction[] } | null => {
    const selection = session.selection;
    if (selection === null || session.view.suspended) return null;

    if (selection.kind === "device") {
      const device = session.view.devices.find((d) => d.id === selection.id);
      if (device === undefined) return null;
      const actions: BarAction[] = [
        {
          icon: "power",
          label: device.powered ? `Spegni ${device.name}` : `Accendi ${device.name}`,
          run: () => session.togglePower(device.id),
        },
      ];
      if (device.kind === "host" && device.powered) {
        actions.push({
          icon: "ping",
          label: `Ping da ${device.name}: poi fai clic sulla destinazione`,
          active: session.pingFrom === device.id,
          run: () => session.armPing(device.id),
        });
      }
      actions.push({
        icon: "link",
        label: `Collega ${device.name}: poi fai clic sull'altro dispositivo`,
        active: session.linkFrom === device.id,
        run: () => session.armLink(device.id),
      });
      if (device.kind === "host") {
        actions.push({
          icon: "terminal",
          label: `Apri il terminale di ${device.name}`,
          run: () => {
            session.openTerminal(device.id);
            preferences.stripOpen = true;
          },
        });
      }
      const removeDevice: BarAction = {
        icon: "remove",
        label: `Elimina ${device.name}, con i suoi cavi`,
        run: () => session.removeSelection(),
      };
      const table = device.kind === "host" ? "ARP" : "MAC";
      actions.push({
        icon: "pin",
        label: session.isPinned(device.id)
          ? `Togli la tabella ${table} di ${device.name} dal disegno`
          : `Appunta la tabella ${table} di ${device.name} sul disegno`,
        active: session.isPinned(device.id),
        run: () => session.togglePin(device.id),
      });
      actions.push(removeDevice);
      return { x: device.x, y: device.y - 42, actions };
    }

    if (selection.kind === "link") {
      const link = session.view.links.find((l) => l.id === selection.id);
      if (link === undefined) return null;
      return {
        x: (link.from.x + link.to.x) / 2,
        y: (link.from.y + link.to.y) / 2 - 16,
        actions: [
          {
            icon: link.connected ? "unplug" : "replug",
            label: link.connected ? "Stacca il cavo" : "Riattacca il cavo",
            run: () => session.toggleLink(link.id),
          },
          { icon: "remove", label: "Elimina il cavo", run: () => session.removeSelection() },
        ],
      };
    }
    return null;
  });

  // Le buste che il filtro lascia vedere.
  const packets = $derived(
    session.view.packets.filter((packet) => session.shows(packet.conversationId, packet.protocol)),
  );

  const pingSource = $derived(session.view.devices.find((device) => device.id === session.pingFrom));
  const linkSource = $derived(session.view.devices.find((device) => device.id === session.linkFrom));

  // Il cavo che si sta tirando con il mouse: dal dispositivo al puntatore.
  const rubber = $derived.by(() => {
    const from = session.view.devices.find((device) => device.id === session.rubber?.fromId);
    return from === undefined || session.rubber === null ? null : { from, to: session.rubber.to };
  });

  // Il cavo di cui è aperto l'elenco delle porte.
  const portMenuLink = $derived(session.view.links.find((link) => link.id === session.portMenu?.linkId));

  // Chi sta scrivendo in una casella di testo, o nel terminale, non vuole
  // che i tasti agiscano sul disegno.
  function isTyping(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    return target !== null && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  }

  function onKey(event: KeyboardEvent) {
    // Ctrl+Z annulla, Ctrl+Maiusc+Z o Ctrl+Y ripristina (Cmd su Mac). In
    // una casella di testo restano quelli del testo che si sta scrivendo.
    const letter = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !isTyping(event) && (letter === "z" || letter === "y")) {
      event.preventDefault();
      if (letter === "y" || event.shiftKey) session.redo();
      else session.undo();
      return;
    }
    if (event.key === "Escape") {
      // Esc lascia andare, nell'ordine: l'elenco delle porte, la voce
      // scelta nella colonna, il cavo cominciato, lo strumento Cavo, il
      // ping in attesa della destinazione, la selezione.
      if (session.portMenu !== null) {
        session.portMenu = null;
      } else if (session.placing !== null) {
        session.placing = null;
      } else if (session.linkFrom !== null) {
        session.linkFrom = null;
      } else if (session.cabling) {
        session.cabling = false;
      } else if (session.pingFrom !== null) {
        session.pingFrom = null;
      } else {
        session.select(null);
      }
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !isTyping(event)) {
      session.removeSelection();
    }
  }

  // --- Posare dispositivi --------------------------------------------------
  let drawing: SVGSVGElement | undefined = $state();

  // Trasforma un punto dello schermo in un punto del disegno.
  function toDrawing(clientX: number, clientY: number) {
    const matrix = drawing?.getScreenCTM();
    if (drawing === undefined || !matrix) return { x: 400, y: 250 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  // --- Muoversi sul disegno -------------------------------------------------
  // La rotella ingrandisce e rimpicciolisce attorno al puntatore.
  function onWheel(event: WheelEvent) {
    event.preventDefault();
    // Un trackpad manda molti scatti piccoli, una rotella pochi e grandi:
    // l'ingrandimento è proporzionale allo scatto, entro un limite.
    const delta = Math.max(-80, Math.min(80, event.deltaY));
    session.camera = zoomed(bounds, Math.exp(-delta * 0.004), toDrawing(event.clientX, event.clientY));
  }

  // La pagina non deve scorrere mentre si ingrandisce: per poterlo
  // impedire, l'ascolto della rotella va dichiarato "non passivo".
  $effect(() => {
    const element = drawing;
    if (element === undefined) return;
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  });

  // I pulsanti + e − ingrandiscono attorno al centro di ciò che si vede.
  function zoomButton(factor: number) {
    const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    session.camera = zoomed(bounds, factor, centre);
  }

  // Trascinando lo sfondo si sposta la vista. Come per i dispositivi, si
  // aspetta qualche pixel di movimento: un clic resta un clic.
  let grab: { clientX: number; clientY: number; box: typeof bounds; scale: number } | null = null;
  let panning = $state(false);
  let justPanned = false;

  function onBackgroundDown(event: PointerEvent) {
    if (event.button !== 0 || event.target !== drawing) return;
    const scale = drawing?.getScreenCTM()?.a ?? 1;
    grab = { clientX: event.clientX, clientY: event.clientY, box: bounds, scale };
  }

  function onBackgroundMove(event: PointerEvent) {
    if (grab === null) return;
    const dx = event.clientX - grab.clientX;
    const dy = event.clientY - grab.clientY;
    if (!panning) {
      if (Math.hypot(dx, dy) < 4) return;
      panning = true;
      drawing?.setPointerCapture?.(event.pointerId);
    }
    // Il disegno segue il mouse: l'inquadratura va dalla parte opposta.
    session.camera = panned(grab.box, -dx / grab.scale, -dy / grab.scale);
  }

  function onBackgroundUp() {
    if (panning) justPanned = true;
    grab = null;
    panning = false;
  }

  // Un clic sullo sfondo: posa il dispositivo scelto nella colonna, se ce
  // n'è uno; altrimenti toglie la selezione.
  function onBackgroundClick(event: MouseEvent) {
    // Dopo uno spostamento della vista il browser manda comunque un clic.
    if (justPanned) {
      justPanned = false;
      return;
    }
    if (session.placing !== null) {
      session.addDevice(session.placing, toDrawing(event.clientX, event.clientY));
    } else {
      session.select(null);
    }
  }

  const DRAG_TYPE = "application/x-net-sim-device";

  function onDragOver(event: DragEvent) {
    if (event.dataTransfer?.types.includes(DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  // Una voce della colonna lasciata cadere sul disegno.
  function onDrop(event: DragEvent) {
    const data = event.dataTransfer?.getData(DRAG_TYPE);
    if (!data) return;
    event.preventDefault();
    session.addDevice(JSON.parse(data), toDrawing(event.clientX, event.clientY));
  }
</script>

<svelte:window onkeydown={onKey} />

<div
  class="canvas"
  class:aiming={session.pingFrom !== null || session.cabling || session.linkFrom !== null}
  class:placing={session.placing !== null}
  class:panning
  ondragover={onDragOver}
  ondrop={onDrop}
  role="presentation"
>
  <!-- La rete viene sempre inquadrata per intero. Un clic sullo sfondo
       posa il dispositivo scelto nella colonna, oppure toglie la
       selezione; da tastiera la toglie il tasto Esc. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={drawing}
    viewBox="{bounds.x} {bounds.y} {bounds.width} {bounds.height}"
    role="group"
    aria-label="Topologia della rete"
    onclick={onBackgroundClick}
    onpointerdown={onBackgroundDown}
    onpointermove={onBackgroundMove}
    onpointerup={onBackgroundUp}
    onpointercancel={onBackgroundUp}
  >
      {#each session.view.links as link (link.id)}
        <LinkLine {link} />
      {/each}
      {#each session.view.devices as device (device.id)}
        <DeviceNode {device} />
      {/each}
      {#each pinned as { pin, device } (device.id)}
        <PinnedTable {pin} {device} />
      {/each}
      {#each packets as packet (`${session.generation}-${packet.id}`)}
        <PacketEnvelope {packet} />
      {/each}
      {#each waiting as device (device.id)}
        <WaitIndicator {device} progress={session.waitProgress ?? 0} />
      {/each}
      {#if rubber !== null}
        <line class="rubber" x1={rubber.from.x} y1={rubber.from.y} x2={rubber.to.x} y2={rubber.to.y} />
      {/if}
      {#if bar !== null && session.portMenu === null}
        <ActionBar x={bar.x} y={bar.y} actions={bar.actions} />
      {/if}
      {#if portMenuLink !== undefined && session.portMenu !== null}
        <PortMenu link={portMenuLink} end={session.portMenu.end} />
      {/if}
  </svg>

  {#if session.isEmpty()}
    <div class="hint">
      <strong>La rete è vuota</strong>
      <span>Trascina un dispositivo dalla colonna a sinistra, oppure apri un file.</span>
    </div>
  {/if}

  <div class="messages">
      {#if session.view.suspended}
        <div class="message storm" role="alert">
          <strong>Simulazione sospesa: tempesta di broadcast.</strong>
          Ci sono {session.view.packets.length} frame che continuano a girare senza fermarsi. La causa
          è un ciclo tra switch: senza spanning tree, un broadcast inoltrato in cerchio non si
          esaurisce mai. Premi "Ricomincia" per ripartire.
        </div>
      {/if}
      {#if session.placing !== null}
        <div class="message" role="status">
          <strong>{session.placing.kind === "host" ? "PC" : `Switch a ${session.placing.portCount} porte`}.</strong>
          Fai clic sul disegno per posarne uno; puoi posarne altri. Esc per finire.
        </div>
      {/if}
      {#if linkSource !== undefined}
        <div class="message" role="status">
          <strong>Cavo da {linkSource.name}.</strong> Fai clic sul dispositivo da collegare. Esc per
          annullare.
        </div>
      {:else if session.cabling}
        <div class="message" role="status">
          <strong>Cavo.</strong> Trascina da un dispositivo a un altro, oppure fai clic sul primo e poi
          sul secondo. Esc per finire.
        </div>
      {/if}
      {#if pingSource !== undefined}
        <div class="message" role="status">
          <strong>Ping da {pingSource.name}.</strong> Fai clic sul dispositivo di destinazione. Esc per
          annullare.
        </div>
      {/if}
      {#if session.notice !== null}
        <div class="message" role="alert">{session.notice}</div>
      {/if}
    </div>

  <div class="zoom" role="group" aria-label="Inquadratura">
    <button class="btn" title="Rimpicciolisci" aria-label="Rimpicciolisci" onclick={() => zoomButton(1 / ZOOM_STEP)}>−</button>
    <button class="btn" title="Ingrandisci" aria-label="Ingrandisci" onclick={() => zoomButton(ZOOM_STEP)}>+</button>
    <button class="btn" title="Inquadra tutta la rete" onclick={() => session.fitView(pinnedBoxes)}>Adatta</button>
  </div>

  <SimulationBar />
</div>

<style>
  .canvas {
    position: relative;
    background: var(--canvas);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
  }
  /* Il cavo che si sta tirando: tratteggiato, e trasparente ai clic, così
     si capisce su quale dispositivo viene lasciato. */
  .rubber {
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-dasharray: 6 5;
    pointer-events: none;
  }
  /* In attesa di un dispositivo, per un ping o per un cavo: il puntatore
     lo fa capire. */
  .aiming :global(svg),
  .aiming :global(.device) {
    cursor: crosshair;
  }
  /* Con un dispositivo scelto nella colonna, il puntatore dice "posa qui". */
  .placing :global(svg) {
    cursor: copy;
  }
  /* Mentre si sposta la vista il puntatore è una mano chiusa. */
  .panning :global(svg) {
    cursor: grabbing;
  }
  /* I pulsanti dell'inquadratura, nell'angolo in basso a destra. */
  .zoom {
    position: absolute;
    right: 14px;
    bottom: 14px;
    display: flex;
    gap: 4px;
  }
  .zoom .btn {
    min-width: 30px;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
  }
  .hint {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--muted);
    text-align: center;
    /* È solo una scritta: i clic passano al disegno che sta sotto. */
    pointer-events: none;
  }
  .hint strong {
    color: var(--ink);
    font-size: 1.25em;
    font-weight: 600;
  }
  .messages {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, calc(100% - 28px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .message {
    padding: 8px 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
  }
  .message[role="alert"] {
    border-left-color: var(--down);
  }
  .storm {
    border: 2px solid var(--down);
  }
  .storm strong {
    display: block;
    color: var(--down);
  }
</style>
