<script lang="ts">
  // La freccia dei pulsanti che aprono e chiudono un pannello: disegnata,
  // così ha lo stesso aspetto ovunque e non dipende dal carattere.
  let { direction }: { direction: "left" | "right" | "up" | "down" } = $props();

  const paths = {
    left: "M9 3L5 7L9 11",
    right: "M5 3L9 7L5 11",
    up: "M3 9L7 5L11 9",
    down: "M3 5L7 9L11 5",
  };
</script>

<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
  <path d={paths[direction]} />
</svg>

<style>
  svg {
    display: block;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
