<script lang="ts">
  // Il contenuto di un frame a strati annidati: ogni riquadro sta dentro
  // quello che lo trasporta, come nell'incapsulamento.
  import type { EthernetFrame } from "../../engine/model/frames";

  let { frame }: { frame: EthernetFrame } = $props();
</script>

<div class="layer">
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
    <div class="layer">
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
      <div class="layer icmp">
        <strong>ICMP</strong>
        <dl>
          <dt>Tipo</dt>
          <dd>{frame.payload.payload.type.replace("-", " ")}</dd>
          <dt>Identificativo</dt>
          <dd>{frame.payload.payload.identifier}</dd>
          <dt>Sequenza</dt>
          <dd>{frame.payload.payload.sequence}</dd>
        </dl>
      </div>
    </div>
  {/if}
</div>

<style>
  .layer {
    border: 1.5px solid var(--muted);
    border-radius: var(--radius);
    padding: 6px 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  /* Lo strato più interno ha il colore del suo protocollo. */
  .arp {
    border-color: var(--arp);
    background: color-mix(in srgb, var(--arp) 9%, transparent);
  }
  .icmp {
    border-color: var(--icmp);
    background: color-mix(in srgb, var(--icmp) 9%, transparent);
  }
  strong {
    font-weight: 600;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 1px 10px;
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
