<svelte:options namespace="svg" />

<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import DeviceIcon from "../theme/DeviceIcon.svelte";
  import type { DeviceView } from "../view";

  let { device }: { device: DeviceView } = $props();

  // Le misure vengono da device-shape.ts: compatte nell'editor, più grandi
  // in presentazione. Switch e router sono un po' più larghi di un PC.
  const shape = $derived(preferences.shape);
  const halfWidth = $derived(device.kind === "host" ? shape.hostHalfWidth : shape.otherHalfWidth);
  const halfHeight = $derived(shape.halfHeight);
  const ring = $derived(shape.selectionMargin);
  const selected = $derived(session.selection?.kind === "device" && session.selection.id === device.id);
  // Il mouse è su una riga dell'elenco degli eventi che parla di questo dispositivo.
  const highlighted = $derived(session.highlight?.deviceId === device.id);

  // Da qui sta per partire un cavo.
  const linking = $derived(session.linkFrom === device.id);

  // Un clic seleziona. Se però è stato premuto Ping su un altro
  // dispositivo, il clic sceglie la destinazione del ping; e se si sta
  // tirando un cavo, ne sceglie un capo.
  function choose() {
    if (session.pingFrom !== null) {
      session.pingTo(device.id);
    } else if (session.linkFrom !== null) {
      session.connectTo(device.id);
    } else if (session.cabling) {
      session.armLink(device.id);
    } else {
      session.select({ kind: "device", id: device.id });
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose();
    }
  }

  // --- Trascinamento -------------------------------------------------------
  // Tenendo premuto e muovendo il mouse il dispositivo si sposta; con lo
  // strumento Cavo attivo, invece, si tira un cavo fino a un altro
  // dispositivo. Un clic senza movimento resta un clic: per distinguerli
  // si aspetta che il mouse si sia mosso di qualche pixel.
  const THRESHOLD = 4;
  let press: { clientX: number; clientY: number; x: number; y: number; scale: number; cable: boolean } | null =
    null;
  let dragging = false;
  // Dopo un trascinamento il browser manda comunque un clic: va ignorato.
  let justDragged = false;

  function down(event: PointerEvent) {
    if (event.button !== 0 || session.pingFrom !== null) return;
    const group = event.currentTarget as SVGGElement;
    // Di quanti pixel dello schermo è fatta un'unità del disegno.
    const scale = group.ownerSVGElement?.getScreenCTM()?.a ?? 1;
    press = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: device.x,
      y: device.y,
      scale,
      cable: session.cabling,
    };
    group.setPointerCapture?.(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (press === null) return;
    const dx = event.clientX - press.clientX;
    const dy = event.clientY - press.clientY;
    if (!dragging) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      dragging = true;
      if (!press.cable) session.holdBounds(true);
    }
    if (press.cable) {
      // Il cavo parte dal centro del dispositivo e segue il mouse.
      const group = event.currentTarget as SVGGElement;
      const matrix = group.ownerSVGElement?.getScreenCTM();
      if (!matrix) return;
      const to = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      session.rubber = { fromId: device.id, to: { x: to.x, y: to.y } };
    } else {
      session.moveDevice(device.id, { x: press.x + dx / press.scale, y: press.y + dy / press.scale });
    }
  }

  function up(event: PointerEvent) {
    if (dragging && press?.cable) {
      session.rubber = null;
      // Il dispositivo su cui il mouse è stato lasciato, se ce n'è uno.
      const under = document.elementFromPoint?.(event.clientX, event.clientY);
      const targetId = under?.closest("[data-device-id]")?.getAttribute("data-device-id");
      if (event.type === "pointerup" && targetId && targetId !== device.id) {
        session.connect(device.id, targetId);
      }
      justDragged = true;
    } else if (dragging) {
      session.holdBounds(false);
      justDragged = true;
    }
    press = null;
    dragging = false;
  }
</script>

<g
  class="device"
  class:off={!device.powered}
  data-device-id={device.id}
  transform="translate({device.x} {device.y}) scale({preferences.scale})"
  role="button"
  tabindex="0"
  aria-label="{device.name}{selected ? ', selezionato' : ''}"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onclick={(event) => {
    event.stopPropagation();
    if (justDragged) {
      justDragged = false;
      return;
    }
    choose();
  }}
  onkeydown={onKey}
>
  {#if selected}
    <rect class="selection" x={-halfWidth - ring} y={-halfHeight - ring} width={(halfWidth + ring) * 2} height={(halfHeight + ring) * 2} rx={shape.cornerRadius + ring - 3} />
  {/if}
  {#if (highlighted && !selected) || linking}
    <rect class="highlight" x={-halfWidth - ring} y={-halfHeight - ring} width={(halfWidth + ring) * 2} height={(halfHeight + ring) * 2} rx={shape.cornerRadius + ring - 3} />
  {/if}
  <rect class="box" x={-halfWidth} y={-halfHeight} width={halfWidth * 2} height={halfHeight * 2} rx={shape.cornerRadius} />
  <!-- L'icona è disegnata per il riquadro grande: nel riquadro compatto si
       riduce tutta, senza deformarsi. -->
  <g class="icon" transform="scale({shape.iconScale})"><DeviceIcon kind={device.role === "server" ? "server" : device.kind} /></g>

  <text class="name" y={shape.nameY} style="font-size: {shape.nameSize}px">{device.name}</text>

  {#if device.kind === "host"}
    {#if preferences.labels.ip}
      {#if device.ipLabel !== null}
        <text class="address" y={shape.firstLineY}>{device.ipLabel}</text>
      {:else}
        <text class="address none" y={shape.firstLineY}>non configurato</text>
      {/if}
    {/if}
    {#if preferences.labels.mac}
      <text class="address" y={preferences.labels.ip ? shape.firstLineY + shape.lineStep : shape.firstLineY}>{device.mac}</text>
    {/if}
  {/if}

  {#if !device.powered}
    <text class="state" x={halfWidth + 8} y="4">spento</text>
  {/if}
</g>

<style>
  .device {
    cursor: pointer;
    outline: none;
  }
  .box {
    fill: var(--surface);
    stroke: var(--ink);
    stroke-width: 1.8;
  }
  .device:focus-visible .box {
    stroke: var(--accent);
    stroke-width: 3;
  }
  /* Selezionato: un contorno nel colore d'accento, più spesso del bordo. */
  .selection {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
  }
  /* Evidenziato dall'elenco degli eventi: stesso contorno, ma tratteggiato. */
  .highlight {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 4 4;
  }
  .icon {
    color: var(--ink);
  }
  .name {
    fill: var(--ink);
    font-family: var(--font-ui);
    font-weight: 600;
    text-anchor: middle;
  }
  .address {
    fill: var(--muted);
    font-family: var(--font-mono);
    font-size: 12px;
    text-anchor: middle;
  }
  .address.none {
    font-family: var(--font-ui);
    font-style: italic;
  }
  .state {
    fill: var(--down);
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
  }
  /* Spento: grigio, oltre alla scritta. */
  .off .box {
    fill: var(--surface-2);
    stroke: var(--muted);
    stroke-dasharray: 4 3;
  }
  .off .icon,
  .off .name {
    color: var(--muted);
    fill: var(--muted);
  }
</style>
