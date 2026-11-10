<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import SimulationBar from "../simulation/SimulationBar.svelte";
  import ActionBar from "./ActionBar.svelte";
  import AnnotationBox from "./AnnotationBox.svelte";
  import AnnotationNote from "./AnnotationNote.svelte";
  import { annotationRect } from "./annotation-geometry";
  import { boxDrawing } from "./box-drawing";
  import { untrack } from "svelte";
  import { selectionBar } from "./bar-actions";
  import type { Rect } from "./bar-placement";
  import { EMPTY_VIEW } from "../view";
  import { atMostScale, AUTO_MAX_SCALE, enclosing, zoomed, ZOOM_STEP } from "./camera";
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

  // La grandezza del disegno sullo schermo: Adatta la usa per lasciare
  // libero lo spazio della barra della simulazione (D-107).
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  $effect(() => {
    session.viewport = canvasWidth > 0 && canvasHeight > 0 ? { width: canvasWidth, height: canvasHeight } : null;
  });

  // Dove stanno sul disegno lo zoom, la barra della simulazione e le righe
  // dei messaggi in alto: la barretta delle azioni evita di coprirli
  // (D-112, D-113). Si rimisurano quando può cambiare la loro grandezza o
  // la loro posizione, o quando compare o sparisce un messaggio.
  let canvas: HTMLDivElement | undefined = $state();
  let controls: Rect[] = $state([]);
  $effect(() => {
    const dependsOn = [
      canvasWidth,
      canvasHeight,
      preferences.scale,
      preferences.presenting,
      session.running,
      session.view.suspended,
      session.isEmpty(),
      session.notice,
      session.placing,
      session.cabling,
      session.linkFrom,
      session.pingFrom,
    ];
    if (canvas === undefined || dependsOn.length === 0) return;
    const origin = canvas.getBoundingClientRect();
    controls = [...canvas.querySelectorAll(":scope > .zoom, :scope > .bar, :scope > .messages .message")].map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left - origin.left, top: box.top - origin.top, right: box.right - origin.left, bottom: box.bottom - origin.top };
    });
  });

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
    // In presentazione l'inquadratura non ha il limite di scala dell'editor.
    if (!first && preferences.presenting) untrack(() => session.fitView(pinnedBoxes, scale, false));
  });

  // L'inquadratura. Se l'utente l'ha scelta, è quella. Altrimenti è
  // automatica: il foglio di base, allargato quanto serve per far stare
  // tutta la rete e le tabelle appuntate.
  //
  // Fuori dalla presentazione l'inquadratura automatica non ingrandisce
  // oltre AUTO_MAX_SCALE pixel per unità: su uno schermo grande una rete
  // piccola resta proporzionata, al centro (D-118). È il foglio di base a
  // essere allargato quanto serve, prima di aggiungere la rete: così,
  // finché la rete sta in ciò che si vede, posare o spostare un
  // dispositivo non fa saltare il disegno.
  const bounds = $derived.by(() => {
    if (session.camera !== null) return session.camera;
    // Mentre si trascina un dispositivo l'inquadratura non si muove.
    if (session.frozenBounds !== null) return session.frozenBounds;
    // Tabelle appuntate, riquadri e note restano dentro (D-117).
    const annotations = session.view.annotations.map((annotation) => annotationRect(annotation, preferences.scale));
    const extras = [...pinnedBoxes, ...annotations];
    if (preferences.presenting || canvasWidth === 0 || canvasHeight === 0) {
      return enclosing(session.view.bounds, extras, 16);
    }
    const sheet = atMostScale(EMPTY_VIEW.bounds, { width: canvasWidth, height: canvasHeight }, AUTO_MAX_SCALE);
    return enclosing(enclosing(sheet, [session.view.bounds], 0), extras, 16);
  });

  // Ciò che si vede davvero: un trascinamento tiene ferma proprio questa
  // inquadratura, e il disegno non salta quando comincia (D-118).
  $effect(() => {
    session.shownBounds = bounds;
  });

  // I dispositivi che stanno aspettando una risposta, quando non viaggia nulla.
  const waiting = $derived(
    session.waitProgress === null
      ? []
      : session.view.devices.filter((device) => session.view.nextEvent?.waitingDeviceIds.includes(device.id)),
  );

  // La barretta delle azioni di ciò che è selezionato: dove sta e che cosa offre.
  const bar = $derived(selectionBar());

  // Da coordinate del disegno a pixel del disegno sullo schermo: lo stesso
  // calcolo che fa l'SVG con viewBox e preserveAspectRatio (centrato, senza
  // deformare). Serve alla barretta, che sta sopra il disegno.
  const screen = $derived.by(() => {
    const k = Math.min(canvasWidth / bounds.width, canvasHeight / bounds.height);
    return { k, x: (canvasWidth - bounds.width * k) / 2, y: (canvasHeight - bounds.height * k) / 2 };
  });
  const barAnchor = $derived(
    bar === null
      ? null
      : {
          x: (bar.anchor.x - bounds.x) * screen.k + screen.x,
          top: (bar.anchor.top - bounds.y) * screen.k + screen.y,
          bottom: (bar.anchor.bottom - bounds.y) * screen.k + screen.y,
        },
  );
  // Gli altri dispositivi sullo schermo, con il nome e l'indirizzo sotto: la
  // barretta, se può, non li copre (D-129).
  const neighbours = $derived.by((): Rect[] => {
    const selection = session.selection;
    // Mentre si trascina un dispositivo la barretta non salta da sopra a
    // sotto passando vicino agli altri: vale la regola di sempre.
    if (bar === null || selection === null || session.frozenBounds !== null) return [];
    const shape = preferences.shape;
    const k = preferences.scale * screen.k;
    return session.view.devices
      .filter((device) => !(selection.kind === "device" && selection.id === device.id))
      .map((device) => {
        const half = device.kind === "host" ? shape.hostHalfWidth : shape.otherHalfWidth;
        const x = (device.x - bounds.x) * screen.k + screen.x;
        const y = (device.y - bounds.y) * screen.k + screen.y;
        return { left: x - half * k, right: x + half * k, top: y + shape.barTop * k, bottom: y + shape.barBottom * k };
      });
  });

  // Di che cosa sono le azioni della barretta, a parole.
  const barSubject = $derived.by(() => {
    const selection = session.selection;
    if (selection?.kind === "device") return session.view.devices.find((d) => d.id === selection.id)?.name ?? "";
    if (selection?.kind === "annotation") {
      return session.view.annotations.find((a) => a.id === selection.id)?.kind === "note" ? "la nota" : "il riquadro";
    }
    return "il cavo";
  });

  // Le annotazioni: i riquadri si disegnano sotto cavi e dispositivi, le
  // note sopra (D-117).
  const boxes = $derived(session.view.annotations.flatMap((a) => (a.kind === "box" ? [a] : [])));
  const notes = $derived(session.view.annotations.flatMap((a) => (a.kind === "note" ? [a] : [])));

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
    session.fitView(pinnedBoxes, preferences.scale, !preferences.presenting);
  }

  // Un clic sullo sfondo: posa il dispositivo scelto nella colonna, se ce
  // n'è uno, o una nota con lo strumento Nota; altrimenti toglie la
  // selezione.
  function onBackgroundClick(event: MouseEvent) {
    if (session.placing !== null) {
      session.addDevice(session.placing, toDrawing(event.clientX, event.clientY));
    } else if (session.annotating === "note" && !preferences.presenting) {
      const id = session.addNote(toDrawing(event.clientX, event.clientY));
      session.select({ kind: "annotation", id });
      session.focusAnnotationText = id;
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
  bind:this={canvas}
  bind:clientWidth={canvasWidth}
  bind:clientHeight={canvasHeight}
  class:aiming={session.pingFrom !== null || session.cabling || session.linkFrom !== null}
  class:placing={session.placing !== null || (session.annotating === "note" && !preferences.presenting)}
  class:sketching={session.annotating === "box" && !preferences.presenting}
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
    use:boxDrawing
  >
      {#each boxes as box (box.id)}
        <AnnotationBox {box} />
      {/each}
      {#each session.view.links as link (link.id)}
        <LinkLine {link} />
      {/each}
      {#each session.view.devices as device (device.id)}
        <DeviceNode {device} />
      {/each}
      {#each notes as note (note.id)}
        <AnnotationNote {note} />
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
      {#if session.sketch !== null}
        <rect class="sketch" x={session.sketch.x} y={session.sketch.y} width={session.sketch.width} height={session.sketch.height} rx="6" />
      {/if}
      {#if rubber !== null}
        <line class="rubber" x1={rubber.from.x} y1={rubber.from.y} x2={rubber.to.x} y2={rubber.to.y} />
      {/if}
      {#if portMenuLink !== undefined && session.portMenu !== null}
        <PortMenu link={portMenuLink} end={session.portMenu.end} />
      {/if}
  </svg>

  {#if bar !== null && barAnchor !== null && session.portMenu === null && canvasWidth > 0}
    <ActionBar
      actions={bar.actions}
      anchor={barAnchor}
      area={{ width: canvasWidth, height: canvasHeight }}
      obstacles={controls}
      {neighbours}
      scale={preferences.scale}
      roomy={preferences.presenting}
      subject={barSubject}
    />
  {/if}

  {#if session.isEmpty() && session.view.annotations.length === 0}
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
    /* Ciò che sta sopra il disegno si dispone secondo la sua larghezza. */
    container: drawing / inline-size;
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
  /* Con lo strumento Riquadro si disegna: una croce. */
  .sketching :global(svg) {
    cursor: crosshair;
  }
  /* Mentre si sceglie un dispositivo (ping, cavo) o si posa qualcosa, le
     annotazioni lasciano passare il clic: non sono una destinazione, e un
     clic dentro una nota o sul bordo di un riquadro arriva al disegno. */
  .aiming :global(.annotation),
  .placing :global(.annotation),
  .sketching :global(.annotation) {
    pointer-events: none;
  }
  /* L'anteprima del riquadro che si sta disegnando: tratteggiata. */
  .sketch {
    fill: color-mix(in srgb, var(--accent) 8%, transparent);
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
    pointer-events: none;
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
  /* Su un disegno stretto la barra della simulazione, centrata, arriverebbe
     sotto questi pulsanti: allora salgono sopra di lei (D-112). */
  @container drawing (max-width: 800px) {
    .canvas:not(.presenting) .zoom {
      bottom: 66px;
    }
  }
  /* In presentazione lo zoom sta in alto a destra: le righe dei messaggi
     partono sotto di lui, così una riga lunga, come l'avviso della tempesta,
     non lo copre. Messaggi e zoom crescono con lo stesso ingrandimento, e
     la misura vale a ogni ingrandimento (D-113). */
  .presenting :global(.messages) {
    top: 52px;
  }
  .zoom .btn {
    min-width: 30px;
    box-shadow: var(--shadow-float);
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
    font-size: var(--text-title);
    font-weight: 600;
  }
</style>
