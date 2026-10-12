<svelte:options namespace="svg" />

<script lang="ts">
  // Le sagome dei dispositivi: essenziali, a tratto, centrate sull'origine.
  // Stanno tutte qui, così cambiarne lo stile è una modifica sola.
  let { kind }: { kind: "host" | "switch" | "router" | "server" | "cable" } = $props();
</script>

{#if kind === "host"}
  <rect x="-13" y="-11" width="26" height="17" rx="2.5" />
  <path d="M0 6V11M-7 11H7" />
{:else if kind === "switch"}
  <!-- Il simbolo degli schemi di rete: quattro frecce, a versi alternati. -->
  <rect x="-17" y="-11" width="34" height="22" rx="4" />
  <path d="M-3 -6.5H11M8.4 -9.1L11 -6.5L8.4 -3.9M3 -2.2H-11M-8.4 -4.8L-11 -2.2L-8.4 0.4" />
  <path d="M-3 2.2H11M8.4 -0.4L11 2.2L8.4 4.8M3 6.5H-11M-8.4 3.9L-11 6.5L-8.4 9.1" />
{:else if kind === "router"}
  <!-- Il simbolo degli schemi di rete: due frecce entrano, due escono. -->
  <circle r="13" />
  <path d="M-10 0H-3.5M-6.1 -2.6L-3.5 0L-6.1 2.6M10 0H3.5M6.1 -2.6L3.5 0L6.1 2.6" />
  <path d="M0 -3.5V-10M-2.6 -7.4L0 -10L2.6 -7.4M0 3.5V10M-2.6 7.4L0 10L2.6 7.4" />
{:else if kind === "server"}
  <rect x="-10" y="-13" width="20" height="11" rx="2.5" />
  <rect x="-10" y="2" width="20" height="11" rx="2.5" />
{:else}
  <path d="M-13 9C-4 9 4 -9 13 -9" />
  <circle cx="-13" cy="9" r="2.5" />
  <circle cx="13" cy="-9" r="2.5" />
{/if}

<style>
  rect,
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
