<svelte:options namespace="svg" />

<script lang="ts">
  // La barretta delle azioni: compare accanto a ciò che è selezionato e
  // mostra, come icone, quello che ci si può fare. Tutto è visibile: non
  // esiste un menu nascosto.
  export type ActionIcon = "power" | "ping" | "pin" | "unplug" | "replug";

  export interface BarAction {
    icon: ActionIcon;
    label: string;
    // Il pulsante resta premuto: l'azione aspetta un secondo clic altrove.
    active?: boolean;
    run: () => void;
  }

  // `x` è il centro della barretta, `y` il suo bordo inferiore.
  let { x, y, actions }: { x: number; y: number; actions: BarAction[] } = $props();

  const SIZE = 32;
  const width = $derived(actions.length * SIZE);

  const paths: Record<ActionIcon, string> = {
    power: "M16 9V16M11 12a7 7 0 1 0 10 0",
    ping: "M10 22L22 10M15 10H22V17",
    pin: "M9 10H23V22H9ZM9 16H23M16 10V22",
    unplug: "M7 16H12M20 16H25M12 11V21M20 11V21",
    replug: "M7 16H25M14 11V21M18 11V21",
  };

  function onKey(event: KeyboardEvent, action: BarAction) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      action.run();
    }
  }
</script>

<g transform="translate({x - width / 2} {y - SIZE})">
  <rect class="frame" x="0" y="0" {width} height={SIZE} rx="6" />
  {#each actions as action, index (action.icon)}
    <g
      class="action"
      class:active={action.active}
      transform="translate({index * SIZE} 0)"
      role="button"
      tabindex="0"
      aria-label={action.label}
      aria-pressed={action.active ?? false}
      onclick={(event) => {
        event.stopPropagation();
        action.run();
      }}
      onkeydown={(event) => onKey(event, action)}
    >
      <title>{action.label}</title>
      <rect class="hit" x="2" y="2" width={SIZE - 4} height={SIZE - 4} rx="4" />
      <path d={paths[action.icon]} />
    </g>
  {/each}
</g>

<style>
  .frame {
    fill: var(--surface);
    stroke: var(--line);
    stroke-width: 1.2;
  }
  .action {
    cursor: pointer;
    outline: none;
  }
  .hit {
    fill: transparent;
  }
  .action:hover .hit,
  .action:focus-visible .hit {
    fill: var(--surface-2);
    stroke: var(--muted);
    stroke-width: 1;
  }
  .action.active .hit {
    fill: var(--accent);
  }
  path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .action.active path {
    stroke: var(--on-accent);
  }
</style>
