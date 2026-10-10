<svelte:options namespace="svg" />

<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import DeviceIcon from "../theme/DeviceIcon.svelte";
  import type { DeviceView } from "../view";

  let { device }: { device: DeviceView } = $props();

  // Lo switch è un po' più largo di un PC.
  const halfWidth = $derived(device.kind === "switch" ? 30 : 26);
  const selected = $derived(session.selection?.kind === "device" && session.selection.id === device.id);
  // Il mouse è su una riga dell'elenco degli eventi che parla di questo dispositivo.
  const highlighted = $derived(session.highlight?.deviceId === device.id);

  // Un clic seleziona. Se però è stato premuto Ping su un altro
  // dispositivo, il clic sceglie la destinazione del ping.
  function choose() {
    if (session.pingFrom !== null) {
      session.pingTo(device.id);
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
</script>

<g
  class="device"
  class:off={!device.powered}
  transform="translate({device.x} {device.y})"
  role="button"
  tabindex="0"
  aria-label="{device.name}{selected ? ', selezionato' : ''}"
  onclick={(event) => {
    event.stopPropagation();
    choose();
  }}
  onkeydown={onKey}
>
  {#if selected}
    <rect class="selection" x={-halfWidth - 6} y="-32" width={halfWidth * 2 + 12} height="64" rx="13" />
  {/if}
  {#if highlighted && !selected}
    <rect class="highlight" x={-halfWidth - 6} y="-32" width={halfWidth * 2 + 12} height="64" rx="13" />
  {/if}
  <rect class="box" x={-halfWidth} y="-26" width={halfWidth * 2} height="52" rx="10" />
  <g class="icon"><DeviceIcon kind={device.kind} /></g>

  <text class="name" y="46">{device.name}</text>

  {#if device.kind === "host"}
    {#if preferences.labels.ip}
      {#if device.ipLabel !== null}
        <text class="address" y="62">{device.ipLabel}</text>
      {:else}
        <text class="address none" y="62">non configurato</text>
      {/if}
    {/if}
    {#if preferences.labels.mac}
      <text class="address" y={preferences.labels.ip ? 78 : 62}>{device.mac}</text>
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
    font-size: 14px;
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
