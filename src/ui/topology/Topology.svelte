<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import SimulationBar from "../simulation/SimulationBar.svelte";
  import ActionBar from "./ActionBar.svelte";
  import { untrack } from "svelte";
  import { selectionBar } from "./bar-actions";
  import { zoomed, ZOOM_STEP } from "./camera";
  import { drawingKey } from "./keyboard";
  import Messages from "./Messages.svelte";
  import { viewGestures } from "./view-gestures";
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
    pinned.map(({ pin, device }) => {
      const size = pinnedSize(device, pin.table);
      const k = preferences.scale;
      return { x: device.x + pin.dx * k, y: device.y + pin.dy * k, width: size.width * k, height: size.height * k };
    }),
  );

  // In presentazione dispositivi e scritte si ingrandiscono: quando
  // l'ingrandimento cambia, la rete viene inquadrata di nuovo per intero.
  // Lo stesso vale entrando in presentazione, anche a ingrandimento 1.
  let lastLook = "";
  $effect(() => {
    const scale = preferences.scale;
    const look = `${preferences.presenting} ${scale}`;
    if (look === lastLook) return;
    const first = lastLook === "";
    lastLook = look;
    if (!first && preferences.presenting) untrack(() => session.fitView(pinnedBoxes, scale));
  });

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
      const size = pinnedSize(device, pin.table);
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
  const bar = $derived(selectionBar());

  // Le buste che il filtro lascia vedere.
  const packets = $derived(
    session.view.packets.filter((packet) => session.shows(packet.conversationId, packet.protocol)),
  );

  // Il cavo che si sta tirando con il mouse: dal dispositivo al puntatore.
  const rubber = $derived.by(() => {
    const from = session.view.devices.find((device) => device.id === session.rubber?.fromId);
    return from === undefined || session.rubber === null ? null : { from, to: session.rubber.to };
  });

  // Il cavo di cui è aperto l'elenco delle porte.
  const portMenuLink = $derived(session.view.links.find((link) => link.id === session.portMenu?.linkId));

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
  // Rotella e trascinamento dello sfondo stanno in view-gestures.ts.

  // I pulsanti + e − ingrandiscono attorno al centro di ciò che si vede.
  function zoomButton(factor: number) {
    const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    session.camera = zoomed(bounds, factor, centre);
  }

  function fit() {
    session.fitView(pinnedBoxes, preferences.scale);
  }

  // Un clic sullo sfondo: posa il dispositivo scelto nella colonna, se ce
  // n'è uno; altrimenti toglie la selezione.
  function onBackgroundClick(event: MouseEvent) {
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

<svelte:window onkeydown={drawingKey} />

<div
  class="canvas"
  class:aiming={session.pingFrom !== null || session.cabling || session.linkFrom !== null}
  class:placing={session.placing !== null}
  class:presenting={preferences.presenting}
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
    style="--k: {preferences.scale}"
    role="group"
    aria-label="Topologia della rete"
    onclick={onBackgroundClick}
    use:viewGestures={() => bounds}
  >
      {#each session.view.links as link (link.id)}
        <LinkLine {link} />
      {/each}
      {#each session.view.devices as device (device.id)}
        <DeviceNode {device} />
      {/each}
      {#each pinned as { pin, device } (`${device.id} ${pin.table}`)}
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

  <Messages />

  <div class="zoom" role="group" aria-label="Inquadratura">
    <button class="btn" title="Rimpicciolisci" aria-label="Rimpicciolisci" onclick={() => zoomButton(1 / ZOOM_STEP)}>−</button>
    <button class="btn" title="Ingrandisci" aria-label="Ingrandisci" onclick={() => zoomButton(ZOOM_STEP)}>+</button>
    <button class="btn" title="Inquadra tutta la rete" onclick={fit}>Adatta</button>
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
  /* Mentre si sposta la vista il puntatore è una mano chiusa: la classe
     la mette view-gestures.ts. */
  .canvas :global(svg.panning) {
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
  /* In presentazione la barra della simulazione è più larga: i pulsanti
     salgono nell'angolo in alto, dove non la incontrano. */
  .presenting .zoom {
    bottom: auto;
    top: 14px;
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
</style>
