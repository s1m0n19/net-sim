<script lang="ts">
  // Le porte di uno switch nel pannello laterale (D-145): una riga per
  // porta, con il dispositivo collegato, lo stato e un elenco per
  // sceglierne la VLAN.
  //
  // Tre stati diversi, e detti a parole oltre che con un segno: accesa
  // (cerchietto pieno), spenta (cerchietto vuoto e la parola «spenta»), e
  // inattiva perché la sua VLAN non esiste più («VLAN 30 · inattiva»). Una
  // porta inattiva tiene il suo numero, e nell'elenco resta scelto quello:
  // per farla tornare attiva si sceglie una VLAN che c'è. Le porte non si
  // accendono né si spengono da qui, ma dalla CLI (D-93).
  //
  // Con 24 porte l'elenco intero è lungo: si vedono le porte che contano,
  // cioè quelle con un cavo o con una configurazione diversa da quella di
  // partenza, e un pulsante mostra anche le altre.
  //
  // Lo stesso elenco sceglie anche il modo (D-156): le VLAN sotto «Access»,
  // e sotto «Trunk» la voce Trunk 802.1Q. Una porta trunk, o una porta
  // access che conserva nativa e VLAN consentite, ha sotto una riga che le
  // riassume e apre i dettagli (TrunkDetails), chiusi in partenza.
  import { formatVlanList } from "../../engine/model/trunks";
  import Chevron from "../theme/Chevron.svelte";
  import { session } from "../session.svelte";
  import type { DeviceView, SwitchPortView } from "../view";
  import TrunkDetails from "./TrunkDetails.svelte";

  let { device }: { device: DeviceView } = $props();

  // Mostrare tutte le porte o solo quelle che contano: è solo presentazione,
  // e cambiando switch si riparte dalle sole porte che contano.
  let showAll = $state(false);

  const matters = (port: SwitchPortView) =>
    port.linkedTo !== null || port.vlan !== 1 || !port.enabled || port.mode === "trunk" || port.trunkConfigKept;
  const important = $derived(device.switchPorts.filter(matters));
  // Se nessuna porta conta, o contano tutte, non c'è nulla da nascondere.
  const canHide = $derived(important.length > 0 && important.length < device.switchPorts.length);
  const shown = $derived(showAll || !canHide ? device.switchPorts : important);

  // Quali porte hanno i dettagli di trunk aperti: solo presentazione.
  let open = $state<Record<string, boolean>>({});

  // Una VLAN rende la porta access in quella VLAN (se era trunk, in un
  // passo solo); Trunk la rende trunk. Nativa e consentite restano.
  function choose(port: SwitchPortView, event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === "trunk") session.makeTrunk(device.id, port.name);
    else session.makeAccess(device.id, port.name, Number(value));
  }

  // Le VLAN consentite a parole: «tutte», «nessuna», o l'elenco compatto.
  const allowedText = (port: SwitchPortView) =>
    port.allowedVlans === "all" ? "tutte" : port.allowedVlans.length === 0 ? "nessuna" : formatVlanList(port.allowedVlans);
  const summaryOf = (port: SwitchPortView) =>
    port.mode === "trunk"
      ? `trunk · nativa ${port.nativeVlan} · VLAN ${allowedText(port)}`
      : `memorizzati per il trunk: nativa ${port.nativeVlan} · VLAN ${allowedText(port)}`;
  // Il riepilogo in due parti: il testo fino a «VLAN », e gli elementi
  // dell'elenco, che vanno a capo solo tra l'uno e l'altro.
  const summaryHead = (port: SwitchPortView) => summaryOf(port).slice(0, summaryOf(port).lastIndexOf("VLAN ") + 5);
  const summaryItems = (port: SwitchPortView) => summaryOf(port).slice(summaryHead(port).length).split(",");
  const detailsId = (port: SwitchPortView) => `trunk-${device.id}-${port.name}`.replace(/[^\w-]/g, "-");
</script>

<ul class="ports" aria-label="Porte">
  {#each shown as port (port.name)}
    {@const trunk = port.mode === "trunk"}
    {@const inactive = !trunk && port.vlanName === null}
    {@const details = trunk || port.trunkConfigKept}
    <li class:off={!port.enabled}>
      <span class="name">
        <span class="mark" class:on={port.enabled} aria-hidden="true"></span>{port.name}<span class="sr-only">, {port.enabled ? "accesa" : "spenta"}</span>
      </span>
      <span class="linked" class:free={port.linkedTo === null}>{port.linkedTo ?? "libera"}</span>
      <!-- L'elenco ha la stessa altezza in tutti i browser, anche in Safari,
           che altrimenti lo disegna basso: niente aspetto nativo, e una
           freccia disegnata a parte. -->
      <span class="choice">
      <!-- Il valore lo dice la rete, anche dopo Annulla o un comando della
           CLI: per questo sta sull'elenco, non sulle singole voci. -->
      <select
        aria-label="VLAN della porta {port.name}, o trunk"
        value={trunk ? "trunk" : String(port.vlan)}
        onchange={(event) => choose(port, event)}
      >
        <optgroup label="Access">
          {#if inactive}
            <option value={String(port.vlan)}>{port.vlan} · inattiva</option>
          {/if}
          {#each device.vlans as vlan (vlan.id)}
            <option value={String(vlan.id)}>{vlan.id} · {vlan.name}</option>
          {/each}
        </optgroup>
        <optgroup label="Trunk">
          <option value="trunk">Trunk 802.1Q</option>
        </optgroup>
      </select>
      </span>
      {#if !port.enabled || inactive}
        <span class="state">
          {#if !port.enabled}<span>spenta</span>{/if}
          {#if inactive}<span>VLAN {port.vlan} · inattiva</span>{/if}
        </span>
      {/if}
      {#if details}
        <!-- Il riepilogo è anche il pulsante che apre i dettagli: dice
             a parole se la porta è trunk, o che cosa conserva. -->
        <button
          class="summary"
          class:kept={!trunk}
          aria-expanded={open[port.name] ?? false}
          aria-controls={detailsId(port)}
          onclick={() => (open[port.name] = !(open[port.name] ?? false))}
        >
          <span class="chevron" aria-hidden="true"><Chevron direction={open[port.name] ? "down" : "right"} /></span>
          <!-- Un elenco lungo va a capo dopo una virgola, mai dentro un numero
               o un intervallo. -->
          <span>{summaryHead(port)}{#each summaryItems(port) as item, index (index)}{#if index > 0},<wbr />{/if}<span class="whole">{item}</span>{/each}</span>
        </button>
        <!-- Chiusi restano nella pagina, nascosti: ciò che si stava
             scrivendo non si perde, come nelle schede delle interfacce. -->
        <div class="details" id={detailsId(port)} hidden={!open[port.name]}>
          <TrunkDetails deviceId={device.id} {port} vlans={device.vlans} />
        </div>
      {/if}
    </li>
  {/each}
</ul>

{#if canHide}
  <button class="btn more" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
    {showAll ? "Mostra solo le porte collegate o configurate" : `Mostra tutte le porte (${device.switchPorts.length})`}
  </button>
{/if}

<style>
  /* Una griglia per tutte le porte: nome, dispositivo collegato, VLAN. */
  .ports {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) minmax(0, 10em);
    column-gap: 8px;
  }
  .ports li {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    row-gap: 1px;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-weight: 600;
  }
  /* Accesa: cerchietto pieno; spenta: vuoto. Come nell'intestazione. */
  .mark {
    box-sizing: border-box;
    width: 8px;
    height: 8px;
    border: 1.5px solid var(--muted);
    border-radius: 50%;
  }
  .mark.on {
    border-color: var(--up);
    background: var(--up);
  }
  .linked {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .linked.free {
    color: var(--muted);
    font-style: italic;
  }
  .choice {
    position: relative;
    min-width: 0;
  }
  .choice::after {
    content: "";
    position: absolute;
    right: 9px;
    top: 50%;
    width: 6px;
    height: 6px;
    margin-top: -5px;
    border-right: 1.5px solid var(--muted);
    border-bottom: 1.5px solid var(--muted);
    transform: rotate(45deg);
    pointer-events: none;
  }
  select {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    min-width: 0;
    height: 28px;
    padding: 2px 24px 2px 6px;
    font: inherit;
    color: var(--ink);
    background: var(--canvas);
    border: 1px solid var(--field-border);
    border-radius: var(--radius);
  }
  select:hover:not(:focus) {
    border-color: var(--muted);
  }
  select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  /* Spenta o inattiva: a parole, sotto il dispositivo collegato. */
  .state {
    grid-column: 2 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
    color: var(--muted);
    font-size: var(--text-small);
    font-weight: 600;
  }
  .off .name {
    color: var(--muted);
  }
  /* Il riepilogo del trunk, sotto il dispositivo collegato: testo, non un
     pulsante vistoso; si apre con un clic o con Invio. */
  .summary {
    grid-column: 2 / -1;
    justify-self: start;
    display: inline-flex;
    align-items: flex-start;
    gap: 4px;
    max-width: 100%;
    min-height: 24px;
    padding: 2px 4px 2px 0;
    border: none;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--text-small);
    font-weight: 600;
    text-align: left;
    overflow-wrap: break-word;
    cursor: pointer;
  }
  .whole {
    white-space: nowrap;
  }
  .summary.kept {
    color: var(--muted);
    font-weight: normal;
  }
  .summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    border-radius: var(--radius);
  }
  .chevron {
    display: inline-flex;
    padding-top: 2px;
  }
  .details {
    grid-column: 1 / -1;
    min-width: 0;
  }
  /* Il testo del pulsante va a capo: in presentazione, ingrandito, il
     pannello è stretto. */
  .more {
    margin-top: 8px;
    justify-self: start;
    max-width: 100%;
    white-space: normal;
    text-align: left;
  }
  /* Nel pannello stretto la VLAN va sotto il nome, larga quanto la riga. */
  @container panel (max-width: 250px) {
    .ports {
      grid-template-columns: max-content minmax(0, 1fr);
    }
    .choice,
    .summary {
      grid-column: 1 / -1;
    }
  }
</style>
