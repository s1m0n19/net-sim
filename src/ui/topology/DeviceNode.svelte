<svelte:options namespace="svg" />

<script lang="ts">
  import { preferences } from "../preferences.svelte";
  import DeviceIcon from "../theme/DeviceIcon.svelte";
  import type { DeviceView } from "../view";

  let { device }: { device: DeviceView } = $props();

  // Lo switch è un po' più largo di un PC.
  const halfWidth = $derived(device.kind === "switch" ? 30 : 26);
</script>

<g transform="translate({device.x} {device.y})" class:off={!device.powered}>
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
    <text class="state" y="-34">spento</text>
  {/if}
</g>

<style>
  .box {
    fill: var(--surface);
    stroke: var(--ink);
    stroke-width: 1.8;
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
    text-anchor: middle;
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
