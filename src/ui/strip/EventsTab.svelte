<script lang="ts">
  // L'elenco degli eventi: una riga per ogni fatto, nell'ordine in cui è
  // successo. In cima il filtro, che vale anche per il disegno.
  import { session } from "../session.svelte";
  import type { EventView, Protocol } from "../view";

  const PROTOCOLS: Protocol[] = ["ARP", "ICMP"];

  const rows = $derived(
    session.view.events.filter((event) => session.shows(event.conversationId, event.protocol)),
  );

  // Quando arriva un evento nuovo, l'elenco scorre fino in fondo.
  let list: HTMLDivElement | undefined = $state();
  $effect(() => {
    rows.length;
    list?.scrollTo({ top: list.scrollHeight });
  });

  function over(event: EventView) {
    session.highlight = { deviceId: event.deviceId, packetId: event.packet?.id ?? null };
  }

  // Un clic apre nel pannello laterale ciò di cui la riga parla: il
  // pacchetto, se c'è, altrimenti il dispositivo.
  function open(event: EventView) {
    if (event.packet !== null) {
      session.select({ kind: "packet", id: event.packet.id, packet: event.packet });
    } else if (event.deviceId !== null) {
      session.select({ kind: "device", id: event.deviceId });
    }
  }

  function onKey(keyboard: KeyboardEvent, event: EventView) {
    if (keyboard.key === "Enter" || keyboard.key === " ") {
      keyboard.preventDefault();
      open(event);
    }
  }
</script>

<div class="filter">
  <label>
    <span>Conversazione</span>
    <select id="events-conversation" bind:value={session.followed}>
      <option value={null}>tutte</option>
      {#each session.view.conversations as conversation (conversation.id)}
        <option value={conversation.id}>{conversation.label}</option>
      {/each}
    </select>
  </label>

  <span class="label">Protocolli</span>
  {#each PROTOCOLS as protocol}
    <button
      class="btn"
      class:on={session.protocols[protocol]}
      aria-pressed={session.protocols[protocol]}
      onclick={() => (session.protocols[protocol] = !session.protocols[protocol])}
    >
      {protocol}
    </button>
  {/each}

  <span class="count">{rows.length} di {session.view.events.length} eventi</span>
</div>

<div class="list" bind:this={list} onmouseleave={() => (session.highlight = null)} role="presentation">
  {#if session.view.events.length === 0}
    <p>Nessun evento: la simulazione non è ancora partita.</p>
  {:else if rows.length === 0}
    <p>Il filtro nasconde tutti gli eventi.</p>
  {:else}
    <table>
      <tbody>
        {#each rows as event (event.index)}
          <tr
            tabindex="0"
            onmouseenter={() => over(event)}
            onfocus={() => over(event)}
            onclick={() => open(event)}
            onkeydown={(keyboard) => onKey(keyboard, event)}
          >
            <td class="time">{event.time}</td>
            <td class="device">{event.deviceName}</td>
            <td class="tag">
              {#if event.protocol !== null}
                <span class:arp={event.protocol === "ARP"} class:icmp={event.protocol === "ICMP"}>{event.protocol}</span>
              {/if}
            </td>
            <td>{event.text}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .filter {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 10px;
  }
  label span,
  .label,
  .count {
    color: var(--muted);
  }
  .count {
    margin-left: auto;
  }
  select {
    font: inherit;
    color: inherit;
    padding: 3px 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    max-width: 260px;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--surface-2);
  }
  p {
    margin: 0;
    padding: 10px 12px;
    color: var(--muted);
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  tr {
    cursor: pointer;
    outline: none;
  }
  tr:hover td,
  tr:focus-visible td {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  td {
    padding: 3px 8px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  td:last-child {
    width: 100%;
    white-space: normal;
  }
  .time {
    text-align: right;
    font-family: var(--font-mono);
    color: var(--muted);
    padding-left: 12px;
  }
  .device {
    font-weight: 600;
  }
  /* La sigla accompagna il colore: due segni, non uno solo. */
  .tag span {
    font-family: var(--font-mono);
    font-size: 0.9em;
    padding: 0 5px;
    border-radius: 3px;
    color: var(--canvas);
  }
  .arp {
    background: var(--arp);
  }
  .icmp {
    background: var(--icmp);
  }
</style>
