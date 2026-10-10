<script lang="ts">
  import { session } from "../session.svelte";
  import SimulationBar from "../simulation/SimulationBar.svelte";
  import ActionBar, { type BarAction } from "./ActionBar.svelte";
  import DeviceNode from "./DeviceNode.svelte";
  import LinkLine from "./LinkLine.svelte";
  import PacketEnvelope from "./PacketEnvelope.svelte";
  import WaitIndicator from "./WaitIndicator.svelte";

  const bounds = $derived(session.view.bounds);

  // I dispositivi che stanno aspettando una risposta, quando non viaggia nulla.
  const waiting = $derived(
    session.waitProgress === null
      ? []
      : session.view.devices.filter((device) => session.view.nextEvent?.waitingDeviceIds.includes(device.id)),
  );

  // La barretta delle azioni di ciò che è selezionato: dove sta e che cosa offre.
  const bar = $derived.by((): { x: number; y: number; actions: BarAction[] } | null => {
    const selection = session.selection;
    if (selection === null || session.view.suspended) return null;

    if (selection.kind === "device") {
      const device = session.view.devices.find((d) => d.id === selection.id);
      if (device === undefined) return null;
      const actions: BarAction[] = [
        {
          icon: "power",
          label: device.powered ? `Spegni ${device.name}` : `Accendi ${device.name}`,
          run: () => session.togglePower(device.id),
        },
      ];
      if (device.kind === "host" && device.powered) {
        actions.push({
          icon: "ping",
          label: `Ping da ${device.name}: poi fai clic sulla destinazione`,
          active: session.pingFrom === device.id,
          run: () => session.armPing(device.id),
        });
      }
      return { x: device.x, y: device.y - 42, actions };
    }

    if (selection.kind === "link") {
      const link = session.view.links.find((l) => l.id === selection.id);
      if (link === undefined) return null;
      return {
        x: (link.from.x + link.to.x) / 2,
        y: (link.from.y + link.to.y) / 2 - 16,
        actions: [
          {
            icon: link.connected ? "unplug" : "replug",
            label: link.connected ? "Stacca il cavo" : "Riattacca il cavo",
            run: () => session.toggleLink(link.id),
          },
        ],
      };
    }
    return null;
  });

  const pingSource = $derived(session.view.devices.find((device) => device.id === session.pingFrom));

  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (session.pingFrom !== null) {
      session.pingFrom = null; // rinuncia al ping, la selezione resta
    } else {
      session.select(null);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="canvas" class:aiming={session.pingFrom !== null}>
  {#if session.isEmpty()}
    <div class="hint">
      <strong>La rete è vuota</strong>
      <span>Apri un file con il pulsante "Apri", in alto a sinistra.</span>
    </div>
  {:else}
    <!-- La rete viene sempre inquadrata per intero. Un clic sullo sfondo
         toglie la selezione; da tastiera lo fa il tasto Esc. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <svg
      viewBox="{bounds.x} {bounds.y} {bounds.width} {bounds.height}"
      role="group"
      aria-label="Topologia della rete"
      onclick={() => session.select(null)}
    >
      {#each session.view.links as link (link.id)}
        <LinkLine {link} />
      {/each}
      {#each session.view.devices as device (device.id)}
        <DeviceNode {device} />
      {/each}
      {#each session.view.packets as packet (`${session.generation}-${packet.id}`)}
        <PacketEnvelope {packet} />
      {/each}
      {#each waiting as device (device.id)}
        <WaitIndicator {device} progress={session.waitProgress ?? 0} />
      {/each}
      {#if bar !== null}
        <ActionBar x={bar.x} y={bar.y} actions={bar.actions} />
      {/if}
    </svg>

    <div class="messages">
      {#if session.view.suspended}
        <div class="message storm" role="alert">
          <strong>Simulazione sospesa: tempesta di broadcast.</strong>
          Ci sono {session.view.packets.length} frame che continuano a girare senza fermarsi. La causa
          è un ciclo tra switch: senza spanning tree, un broadcast inoltrato in cerchio non si
          esaurisce mai. Premi "Ricomincia" per ripartire.
        </div>
      {/if}
      {#if pingSource !== undefined}
        <div class="message" role="status">
          <strong>Ping da {pingSource.name}.</strong> Fai clic sul dispositivo di destinazione. Esc per
          annullare.
        </div>
      {/if}
      {#if session.notice !== null}
        <div class="message" role="alert">{session.notice}</div>
      {/if}
    </div>

    <SimulationBar />
  {/if}
</div>

<style>
  .canvas {
    position: relative;
    background: var(--canvas);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
  }
  /* In attesa della destinazione di un ping: il puntatore lo fa capire. */
  .aiming :global(svg),
  .aiming :global(.device) {
    cursor: crosshair;
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
  }
  .hint strong {
    color: var(--ink);
    font-size: 1.25em;
    font-weight: 600;
  }
  .messages {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, calc(100% - 28px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .message {
    padding: 8px 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
  }
  .message[role="alert"] {
    border-left-color: var(--down);
  }
  .storm {
    border: 2px solid var(--down);
  }
  .storm strong {
    display: block;
    color: var(--down);
  }
</style>
