<script lang="ts">
  // Il pannello laterale mostra l'ultima cosa selezionata: un dispositivo,
  // un cavo o un pacchetto. Di un dispositivo si cambiano da qui il nome e
  // la configurazione IP.
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";
  import Chevron from "../theme/Chevron.svelte";
  import ConfigField from "./ConfigField.svelte";
  import InterfaceFields from "./InterfaceFields.svelte";
  import PairTable from "./PairTable.svelte";
  import PanelSection from "./PanelSection.svelte";
  import RouteEditor from "./RouteEditor.svelte";
  import PacketLayers from "./PacketLayers.svelte";
  import AnnotationPanel from "./AnnotationPanel.svelte";

  const selection = $derived(session.selection);

  const device = $derived(
    selection?.kind === "device" ? session.view.devices.find((d) => d.id === selection.id) : undefined,
  );
  const link = $derived(
    selection?.kind === "link" ? session.view.links.find((l) => l.id === selection.id) : undefined,
  );
  // Del pacchetto si mostra la copia presa al momento della selezione:
  // resta leggibile anche dopo che è arrivato.
  const packet = $derived(selection?.kind === "packet" ? selection.packet : undefined);
  // Un riquadro o una nota: si legge dalla vista, così dopo Annulla o
  // un'eliminazione il pannello non mostra un'annotazione che non c'è più.
  const annotation = $derived(
    selection?.kind === "annotation" ? session.view.annotations.find((a) => a.id === selection.id) : undefined,
  );
  const stillTravelling = $derived(
    packet !== undefined && session.view.packets.some((p) => p.id === packet.id),
  );

  // Sotto il nome: il tipo, poi gli stati già noti, ciascuno con un segno
  // che cambia di forma oltre che di colore (pieno se acceso o presente,
  // vuoto se no). Gli stati dicono com'è il dispositivo, non perché
  // (D-114): "senza segnale" resta una constatazione, non una diagnosi.
  const deviceKind = $derived.by(() => {
    if (device === undefined) return "";
    const kinds = { host: "PC", switch: "Switch", router: "Router" };
    return device.role === "server" ? "Server" : kinds[device.kind];
  });
</script>

{#snippet state(on: boolean, text: string)}
  <span class="state" class:on><span class="mark" aria-hidden="true"></span>{text}</span>
{/snippet}

{#if !preferences.sideOpen}
  <aside class="closed">
    <button class="fold" title="Apri il pannello" aria-label="Apri il pannello laterale" onclick={() => (preferences.sideOpen = true)}>
      <Chevron direction="left" />
    </button>
  </aside>
{:else}
<aside>
  <button class="fold corner" title="Chiudi il pannello" aria-label="Chiudi il pannello laterale" onclick={() => (preferences.sideOpen = false)}>
    <Chevron direction="right" />
  </button>
  {#if device !== undefined}
    <header>
      <h2>{device.name}</h2>
      <p class="summary">
        <span class="kind">{deviceKind}</span>{" · "}{@render state(device.powered, device.powered ? "acceso" : "spento")}
        {#if device.kind === "host" && device.powered}{" · "}{@render state(device.linkUp, device.linkUp ? "segnale presente" : "senza segnale")}{/if}
      </p>
    </header>

    {#if device.kind === "host"}
      <!-- I campi si ricreano quando cambia il dispositivo selezionato:
           ciò che si stava scrivendo su uno non passa all'altro. -->
      {#key device.id}
        <PanelSection title="Identità">
          <div class="fields">
            <ConfigField label="Nome" name="name" mono={false} value={device.name} apply={(text) => session.rename(device.id, text)} />
            <span class="label">MAC</span>
            <span class="value" title="Non si cambia: è scritto nella scheda di rete">{device.mac}</span>
          </div>
        </PanelSection>
        <PanelSection title="Configurazione IPv4">
          <div class="fields">
            <ConfigField label="Indirizzo IP" name="ip" value={device.ip} apply={(text) => session.configure(device.id, "ip", text)} />
            <ConfigField label="Subnet mask" name="mask" value={device.mask} apply={(text) => session.configure(device.id, "mask", text)} />
            <ConfigField label="Gateway" name="gateway" value={device.gateway} apply={(text) => session.configure(device.id, "gateway", text)} />
          </div>
        </PanelSection>
      {/key}

      <PanelSection title="Tabella ARP" pin={{ pinned: session.isPinned(device.id), toggle: () => session.togglePin(device.id) }}>
        <PairTable columns={["Indirizzo IP", "Indirizzo MAC"]} rows={device.arpRows} />
      </PanelSection>

      {#if device.pending.length > 0}
        <PanelSection title="In attesa del MAC">
          <ul>
            {#each device.pending as waiting}
              <li>{waiting}</li>
            {/each}
          </ul>
        </PanelSection>
      {/if}
    {:else if device.kind === "router"}
      {#key device.id}
        <PanelSection title="Identità">
          <div class="fields">
            <ConfigField label="Nome" name="name" mono={false} value={device.name} apply={(text) => session.rename(device.id, text)} />
          </div>
        </PanelSection>

        <PanelSection title="Interfacce">
          <div class="interfaces">
            {#each device.interfaces as port (port.name)}
              <InterfaceFields deviceId={device.id} {port} />
            {/each}
          </div>
        </PanelSection>
      {/key}

      <PanelSection title="Tabella di routing" pin={{ pinned: session.isPinned(device.id, "routing"), toggle: () => session.togglePin(device.id, "routing") }}>
        {#key device.id}
          <RouteEditor {device} />
        {/key}
      </PanelSection>

      <PanelSection title="Tabella ARP" pin={{ pinned: session.isPinned(device.id, "arp"), toggle: () => session.togglePin(device.id, "arp") }}>
        <PairTable columns={["Indirizzo IP", "Indirizzo MAC"]} rows={device.arpRows} />
      </PanelSection>

      {#if device.pending.length > 0}
        <PanelSection title="In attesa del MAC">
          <ul>
            {#each device.pending as waiting}
              <li>{waiting}</li>
            {/each}
          </ul>
        </PanelSection>
      {/if}
    {:else}
      {#key device.id}
        <PanelSection title="Identità">
          <div class="fields">
            <ConfigField label="Nome" name="name" mono={false} value={device.name} apply={(text) => session.rename(device.id, text)} />
            <span class="label">Porte</span>
            <span class="value">{device.portCount}</span>
          </div>
        </PanelSection>
      {/key}

      <PanelSection title="Tabella MAC" pin={{ pinned: session.isPinned(device.id), toggle: () => session.togglePin(device.id) }}>
        <PairTable columns={["Indirizzo MAC", "Porta"]} rows={device.macRows} />
      </PanelSection>
    {/if}
  {:else if link !== undefined}
    <header>
      <h2>Cavo tra {link.fromName} e {link.toName}</h2>
      <p class="summary">
        {#if link.connected}
          {@render state(true, "Collegato")}{" · "}{@render state(link.signal, link.signal ? "segnale presente" : "senza segnale")}
        {:else}
          {@render state(false, "Staccato")}
        {/if}
      </p>
    </header>
    <PanelSection title="Capi del cavo">
      <dl class="fields">
        <dt>Da</dt>
        <dd>{link.fromName} · {link.fromPort}</dd>
        <dt>A</dt>
        <dd>{link.toName} · {link.toPort}</dd>
      </dl>
    </PanelSection>
  {:else if annotation !== undefined}
    <!-- Ricreato per ogni annotazione: la bozza di una non passa all'altra. -->
    {#key annotation.id}
      <AnnotationPanel {annotation} />
    {/key}
  {:else if packet !== undefined}
    <header>
      <h2>{packet.description}</h2>
      <p class="summary">
        {@render state(stillTravelling, stillTravelling ? "In viaggio" : "Arrivato")}{" · "}da {packet.fromName} a {packet.toName}
      </p>
    </header>
    <PanelSection title="Contenuto del frame">
      <PacketLayers frame={packet.frame} />
    </PanelSection>
  {:else}
    <header>
      <h2>Nessuna selezione</h2>
      <p>Fai clic su un dispositivo, un cavo o un pacchetto per vederne i dettagli qui.</p>
    </header>
  {/if}
</aside>
{/if}

<style>
  aside {
    position: relative;
    width: 290px;
    box-sizing: border-box;
    /* I campi dentro guardano quanto è largo il pannello (D-112). */
    container: panel / inline-size;
    /* La colonna delle etichette: uguale in tutte le sezioni, così i campi
       cominciano tutti nello stesso punto (D-114). */
    --label-width: 7em;
    background: var(--surface);
    border-left: 1px solid var(--line);
    padding: 12px;
    min-width: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* L'intestazione: il nome grande, sotto il tipo e gli stati. */
  header {
    padding-right: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h2 {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
    color: var(--muted);
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 5px;
    row-gap: 2px;
  }
  .kind {
    color: var(--ink);
    font-weight: 500;
  }
  /* Uno stato: un cerchietto pieno se acceso, collegato, presente o in
     viaggio; vuoto se no. La parola dice lo stesso: il colore non è il
     solo segno. */
  .state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .mark {
    box-sizing: border-box;
    width: 9px;
    height: 9px;
    border: 1.5px solid var(--muted);
    border-radius: 50%;
  }
  .state.on {
    color: var(--ink);
  }
  .state.on .mark {
    border-color: var(--up);
    background: var(--up);
  }
  .fields {
    margin: 0;
    display: grid;
    grid-template-columns: var(--label-width) minmax(0, 1fr);
    align-items: baseline;
    gap: 6px 10px;
  }
  dt,
  .label {
    color: var(--muted);
  }
  dd,
  .value {
    margin: 0;
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
  /* I valori che non si cambiano stanno allineati al testo dei campi, e
     non hanno il bordo: si vede che non sono da scrivere. */
  .value {
    padding-left: 7px;
  }
  .interfaces {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    font-family: var(--font-mono);
  }
  /* Chiuso: una striscia sottile, come la colonna dei dispositivi. */
  aside.closed {
    width: 26px;
    padding: 10px 2px;
    align-items: center;
  }
  /* La freccia sta nell'angolo in alto, accanto al titolo: nello stesso
     punto da aperto e da chiuso. */
  .corner {
    position: absolute;
    top: 10px;
    right: 2px;
  }
  /* Nel pannello stretto (in presentazione, su uno schermo piccolo) ogni
     etichetta va sopra il suo campo: gli indirizzi restano interi (D-112). */
  @container panel (max-width: 250px) {
    .fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
    dd,
    .value {
      margin-bottom: 6px;
    }
  }
</style>
