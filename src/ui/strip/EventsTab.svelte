<script lang="ts">
  // L'elenco degli eventi: una riga per ogni fatto, nell'ordine in cui è
  // successo. In cima il filtro, che vale anche per il disegno.
  import { session } from "../session.svelte";
  import type { EventView, Protocol } from "../view";
  import { atBottom } from "./follow-list";

  const PROTOCOLS: Protocol[] = ["ARP", "ICMP"];

  const rows = $derived(
    session.view.events.filter((event) => session.shows(event.conversationId, event.protocol)),
  );

  // Quando arriva un evento nuovo l'elenco scorre fino in fondo, ma solo se
  // lo si stava già guardando in fondo. Chi è risalito a leggere gli eventi
  // di prima resta dov'è; un pulsante lo riporta agli ultimi (D-113).
  let list: HTMLDivElement | undefined = $state();
  let following = $state(true);
  $effect(() => {
    const count = rows.length;
    if (list === undefined || count === 0) {
      following = true;
      return;
    }
    if (following) list.scrollTo({ top: list.scrollHeight });
  });

  function onScroll() {
    if (list !== undefined) following = atBottom(list.scrollTop, list.clientHeight, list.scrollHeight);
  }

  function toLatest() {
    following = true;
    list?.scrollTo({ top: list.scrollHeight });
  }

  // Le righe del pacchetto selezionato si riconoscono: il pannello mostra
  // quello.
  const selectedPacket = $derived(session.selection?.kind === "packet" ? session.selection.id : null);

  // Una riga apre qualcosa solo se parla di un pacchetto o di un dispositivo.
  const opens = (event: EventView) => event.packet !== null || event.deviceId !== null;

  // Con la tastiera l'elenco è una sola fermata di Tab: si entra sulla riga
  // scelta l'ultima volta (o sull'ultima), e le frecce si muovono tra le
  // righe. Così centinaia di eventi non diventano centinaia di Tab.
  let current: number | null = $state(null);
  const tabStop = $derived(
    rows.some((event) => event.index === current) ? current : (rows.at(-1)?.index ?? null),
  );

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
      return;
    }
    const at = rows.indexOf(event);
    const target =
      keyboard.key === "ArrowDown" ? at + 1
      : keyboard.key === "ArrowUp" ? at - 1
      : keyboard.key === "Home" ? 0
      : keyboard.key === "End" ? rows.length - 1
      : null;
    if (target === null) return;
    keyboard.preventDefault();
    const next = rows[Math.max(0, Math.min(target, rows.length - 1))];
    current = next.index;
    list?.querySelector<HTMLElement>(`tr[data-index="${next.index}"]`)?.focus();
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
      <!-- Acceso si vede anche dalla spunta, non solo dal colore (D-115). -->
      {#if session.protocols[protocol]}<span class="tick" aria-hidden="true">✓</span>{/if}{protocol}
    </button>
  {/each}

  <span class="count">{rows.length} di {session.view.events.length} eventi</span>
</div>

<div class="list" bind:this={list} onscroll={onScroll} onmouseleave={() => (session.highlight = null)} role="presentation">
  {#if session.view.events.length === 0}
    <p>Nessun evento: la simulazione non è ancora partita.</p>
  {:else if rows.length === 0}
    <p>Il filtro nasconde tutti gli eventi.</p>
  {:else}
    <table>
      <!-- Le intestazioni restano in cima mentre l'elenco scorre. -->
      <thead>
        <tr>
          <th class="time" scope="col">Tick</th>
          <th scope="col">Dispositivo</th>
          <th scope="col">Protocollo</th>
          <th scope="col">Evento</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as event (event.index)}
          <tr
            data-index={event.index}
            class:opens={opens(event)}
            class:current={event.packet !== null && event.packet.id === selectedPacket}
            aria-current={event.packet !== null && event.packet.id === selectedPacket ? "true" : undefined}
            title={event.packet !== null ? "Mostra il pacchetto nel pannello" : event.deviceId !== null ? "Mostra il dispositivo nel pannello" : undefined}
            tabindex={event.index === tabStop ? 0 : -1}
            onmouseenter={() => over(event)}
            onfocus={() => {
              current = event.index;
              over(event);
            }}
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
  {#if !following}
    <!-- Si è risaliti a leggere: gli eventi nuovi arrivano in fondo, e da
         qui si torna a seguirli. -->
    <button class="btn latest" onclick={toLatest}>↓ Ultimi eventi</button>
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
  .tick {
    margin-right: 4px;
  }
  select {
    font: inherit;
    color: inherit;
    padding: 3px 6px;
    border: 1px solid var(--field-border);
    border-radius: var(--radius);
    background: var(--surface);
    max-width: 260px;
  }
  .list {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--surface-2);
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 3px 8px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    font-weight: 500;
    font-size: var(--text-small);
    text-align: left;
    white-space: nowrap;
  }
  thead th.time {
    text-align: right;
    padding-left: 12px;
  }
  /* Il pulsante per tornare agli ultimi eventi, fermo in basso a destra. */
  .latest {
    position: sticky;
    bottom: 8px;
    float: right;
    margin: 0 12px 8px 0;
    box-shadow: var(--shadow-float);
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
  tbody tr {
    outline: none;
  }
  /* La mano solo dove il clic apre qualcosa nel pannello. */
  tbody tr.opens {
    cursor: pointer;
  }
  tbody tr:hover td {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  /* Il fuoco da tastiera: un contorno, oltre al fondo. */
  tbody tr:focus-visible td {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 0 2px 0 var(--accent), inset 0 -2px 0 var(--accent);
  }
  /* Le righe del pacchetto mostrato nel pannello: una barra a sinistra e il
     testo in grassetto, non il solo colore. */
  tbody tr.current td {
    font-weight: 600;
  }
  tbody tr.current td:first-child {
    box-shadow: inset 4px 0 0 var(--accent);
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
  /* Le colonne si separano anche con una riga sottile, non solo con lo
     spazio: nelle reti molto attive l'occhio non salta di colonna. */
  td + td {
    border-left: 1px solid color-mix(in srgb, var(--line) 50%, transparent);
  }
  /* La sigla accompagna il colore: due segni, non uno solo. */
  .tag span {
    font-family: var(--font-mono);
    font-size: var(--text-small);
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
