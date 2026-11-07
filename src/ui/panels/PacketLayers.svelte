<script lang="ts">
  // Il contenuto di un frame a strati annidati: ogni riquadro sta dentro
  // quello che lo trasporta, come nell'incapsulamento.
  import type { EthernetFrame } from "../../engine/model/frames";

  let { frame }: { frame: EthernetFrame } = $props();

  // Il messaggio ICMP dentro il pacchetto IP, se il frame ne porta uno.
  const icmp = $derived(frame.etherType === "IPv4" ? frame.payload.payload : null);
</script>

<div class="layer ethernet">
  <strong>Ethernet</strong>
  <dl>
    <dt>MAC destinazione</dt>
    <dd>{frame.dstMac}</dd>
    <dt>MAC sorgente</dt>
    <dd>{frame.srcMac}</dd>
    <dt>EtherType</dt>
    <dd>{frame.etherType}</dd>
  </dl>

  {#if frame.etherType === "ARP"}
    <div class="layer arp">
      <strong>ARP</strong>
      <dl>
        <dt>Operazione</dt>
        <dd>{frame.payload.operation}</dd>
        <dt>MAC mittente</dt>
        <dd>{frame.payload.senderMac}</dd>
        <dt>IP mittente</dt>
        <dd>{frame.payload.senderIp}</dd>
        <dt>MAC cercato</dt>
        <dd>{frame.payload.targetMac ?? "?"}</dd>
        <dt>IP cercato</dt>
        <dd>{frame.payload.targetIp}</dd>
      </dl>
    </div>
  {:else}
    <div class="layer ipv4">
      <strong>IPv4</strong>
      <dl>
        <dt>IP sorgente</dt>
        <dd>{frame.payload.srcIp}</dd>
        <dt>IP destinazione</dt>
        <dd>{frame.payload.dstIp}</dd>
        <dt>TTL</dt>
        <dd>{frame.payload.ttl}</dd>
        <dt>Protocollo</dt>
        <dd>{frame.payload.protocol}</dd>
      </dl>
      {#if icmp !== null}
      <div class="layer icmp">
        <strong>ICMP</strong>
        <dl>
          <dt>Tipo</dt>
          <dd>{icmp.type.replace("-", " ")}</dd>
          {#if !("original" in icmp)}
            <dt>Identificativo</dt>
            <dd>{icmp.identifier}</dd>
            <dt>Sequenza</dt>
            <dd>{icmp.sequence}</dd>
          {:else}
            <!-- Un avviso: dice quale pacchetto non è arrivato. -->
            {#if icmp.type === "destination-unreachable"}
              <dt>Codice</dt>
              <dd>{icmp.code} unreachable</dd>
            {/if}
            <dt>Scartato</dt>
            <dd>{icmp.original.type.replace("-", " ")} n. {icmp.original.sequence}</dd>
            <dt>Da</dt>
            <dd>{icmp.original.srcIp}</dd>
            <dt>Per</dt>
            <dd>{icmp.original.dstIp}</dd>
          {/if}
        </dl>
      </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Ogni strato sta dentro quello che lo trasporta (D-114): un bordo
     sottile, il nome in testa con un segno nel colore del protocollo, e i
     campi su righe separate da una linea punteggiata, che porta l'occhio
     dall'etichetta al valore. */
  .layer {
    border: 1px solid var(--muted);
    border-radius: var(--radius);
    padding: 6px 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    background: var(--surface);
  }
  .ipv4 {
    background: var(--surface-2);
  }
  /* Lo strato più interno ha il colore del suo protocollo. */
  .arp {
    border-color: var(--arp);
    background: color-mix(in srgb, var(--arp) 9%, var(--surface));
  }
  .icmp {
    border-color: var(--icmp);
    background: color-mix(in srgb, var(--icmp) 9%, var(--surface));
  }
  strong {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  strong::before {
    content: "";
    width: 4px;
    height: 0.95em;
    border-radius: 2px;
    background: var(--muted);
  }
  .arp > strong::before {
    background: var(--arp);
  }
  .icmp > strong::before {
    background: var(--icmp);
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 10px;
  }
  dt,
  dd {
    padding: 2px 0;
    border-bottom: 1px dotted color-mix(in srgb, var(--muted) 45%, transparent);
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-family: var(--font-mono);
    text-align: right;
    overflow-wrap: anywhere;
  }
</style>
