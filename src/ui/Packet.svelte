<svelte:options namespace="svg" />

<script lang="ts">
  import { onMount } from "svelte";
  import { Tween } from "svelte/motion";
  import type { Position } from "../storage/load";

  let { from, to, label }: { from: Position; to: Position; label: string } = $props();

  // Il frame parte vicino al mittente e si ferma vicino al destinatario,
  // dove resta finché il passo successivo non lo consegna.
  const progress = new Tween(0.15, { duration: 700 });
  onMount(() => {
    progress.target = 0.85;
  });

  const x = $derived(from.x + (to.x - from.x) * progress.current);
  const y = $derived(from.y + (to.y - from.y) * progress.current);
</script>

<circle cx={x} cy={y} r="10" fill="crimson" />
<text {x} y={y - 18} text-anchor="middle" fill="crimson">{label}</text>
