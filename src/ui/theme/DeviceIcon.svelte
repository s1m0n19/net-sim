<svelte:options namespace="svg" />

<script lang="ts">
  // Le sagome dei dispositivi: essenziali, a tratto, centrate sull'origine.
  // Stanno tutte qui, così cambiarne lo stile è una modifica sola.
  // Riquadro e nota non sono dispositivi, ma sono strumenti della stessa
  // colonna: hanno qui la loro sagoma, nello stesso stile.
  let { kind }: { kind: "host" | "switch" | "router" | "server" | "cable" | "box" | "note" } = $props();
</script>

{#if kind === "host"}
  <!-- Un monitor sul suo piedistallo. -->
  <rect x="-13" y="-11" width="26" height="17" rx="2.5" />
  <path d="M0 6V10.5M-6.5 11H6.5" />
{:else if kind === "switch"}
  <!-- Una scatola larga e bassa con una fila di porte Ethernet: si
       riconosce senza conoscere i simboli degli schemi (D-130). -->
  <rect x="-17" y="-8" width="34" height="16" rx="3" />
  <path d="M-12 -1.5h4.2v4.5h-4.2zM-5.3 -1.5h4.2v4.5h-4.2zM1.4 -1.5h4.2v4.5h-4.2zM8.1 -1.5h4.2v4.5h-4.2z" />
{:else if kind === "router"}
  <!-- Il cerchio degli schemi di rete; dentro, una strada che si divide in
       due: il router sceglie dove mandare ciò che arriva (D-130). -->
  <circle r="13" />
  <path d="M-8 0H-2M-2 0L5.5 -5.5M-2 0L5.5 5.5M2 -5.8H5.8V-2M2 5.8H5.8V2" />
{:else if kind === "server"}
  <!-- Un armadio con tre unità: una fessura e una spia ciascuna. Più alto
       che largo, non si confonde con il monitor del PC (D-130). -->
  <rect x="-9.5" y="-13.5" width="19" height="27" rx="2.5" />
  <path d="M-9.5 -4.5H9.5M-9.5 4.5H9.5M-5.5 -9H1M-5.5 0H1M-5.5 9H1" />
  <circle cx="5" cy="-9" r="0.9" />
  <circle cx="5" cy="0" r="0.9" />
  <circle cx="5" cy="9" r="0.9" />
{:else if kind === "box"}
  <!-- Un rettangolo tratteggiato, con l'etichetta nell'angolo. -->
  <rect x="-14" y="-10" width="28" height="20" rx="3" stroke-dasharray="3.5 3" />
  <path d="M-9.5 -4.5H-1.5" />
{:else if kind === "note"}
  <!-- Un foglietto con tre righe di testo. -->
  <path d="M-11 -12H7L11 -8V12H-11Z" />
  <path d="M-6 -5H5M-6 0H5M-6 5H1" />
{:else}
  <!-- Un cavo con un connettore a ogni capo, come Collega sulla barretta. -->
  <path d="M-10.5 8.5C-1 8.5 1 -8.5 10.5 -8.5" />
  <rect x="-16" y="6" width="5.5" height="5" rx="1" />
  <rect x="10.5" y="-11" width="5.5" height="5" rx="1" />
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
