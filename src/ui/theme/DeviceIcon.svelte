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
  <rect x="-17" y="-9" width="34" height="18" rx="4" />
  <path d="M-8 -3H8M5 -6L8 -3L5 0M8 4H-8M-5 1L-8 4L-5 7" />
{:else if kind === "router"}
  <circle r="13" />
  <path d="M-7 0H7M0 -7V7" />
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
