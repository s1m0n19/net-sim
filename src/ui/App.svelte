<script lang="ts">
  import twoPcFile from "../../examples/due-pc.netsim.json?raw";
  import lanFile from "../../examples/lan-switch.netsim.json?raw";
  import ringFile from "../../examples/anello-switch.netsim.json?raw";
  import { ping } from "../engine/actions";
  import type { EthernetFrame } from "../engine/model/frames";
  import { findDevice, hostsOf, type PortRef } from "../engine/model/network";
  import { Simulator, type Trace } from "../engine/simulator";
  import { DEFAULT_PING_COUNT } from "../engine/protocols/icmp";
  import { loadNetworkFile } from "../storage/load";
  import Packet from "./Packet.svelte";

  const examples = [
    { name: "LAN con switch", text: lanFile },
    { name: "Due PC", text: twoPcFile },
    { name: "Tre switch ad anello", text: ringFile },
  ];

  let exampleIndex = $state(0);
  let loaded = loadNetworkFile(examples[0].text);
  let sim = new Simulator(loaded.network);
  // Cresce a ogni caricamento: distingue i frame di una simulazione
  // da quelli della precedente, che ripartono dallo stesso numero.
  let generation = 0;

  // L'azione disponibile: un host fa ping a un indirizzo IP.
  // L'indirizzo si può scegliere dall'elenco o scrivere a mano.
  const firstHosts = hostsOf(loaded.network);
  let sourceId = $state(firstHosts[0].id);
  let targetIp = $state(firstHosts[1].ip ?? "");
  // Quanti echo request manda il ping. Con 1 una dimostrazione passo-passo
  // è più breve; il valore iniziale è quello di Windows.
  let count = $state(DEFAULT_PING_COUNT);
  let inputError = $state("");

  // Il simulatore non sa nulla di Svelte: dopo ogni comando se ne legge
  // lo stato e lo si copia in `view`, che è tutto ciò che la pagina disegna.
  let view = $state.raw(readState());

  function readState() {
    return {
      time: sim.time,
      links: sim.network.links.map((link) => ({
        id: link.id,
        from: position(link.a.deviceId),
        to: position(link.b.deviceId),
      })),
      hosts: hostsOf(sim.network).map((host) => ({
        id: host.id,
        name: host.name,
        ip: host.ip,
        mac: host.ports[0].mac,
        at: position(host.id),
        arpRows: [...host.arpTable],
        pending: host.pendingPackets.map(
          (p) => `${p.packet.payload.type.replace("-", " ")} per ${p.packet.dstIp}, in attesa del MAC di ${p.nextHop}`,
        ),
      })),
      switches: sim.network.devices
        .filter((device) => device.kind === "switch")
        .map((sw) => ({
          id: sw.id,
          name: sw.name,
          at: position(sw.id),
          macRows: [...sw.macTable],
        })),
      // La coda contiene anche le attese: se non è vuota, c'è ancora un passo da fare.
      canStep: sim.canStep(),
      suspended: sim.suspended,
      framesInFlight: sim.queue.filter((event) => event.kind === "frame-arrival").length,
      inFlight: sim.queue
        .filter((event) => event.kind === "frame-arrival")
        .map((event) => ({
          key: `${generation}-${event.frameId}`,
          from: position(event.from.deviceId),
          to: position(event.to.deviceId),
          label: labelOf(event.frame),
        })),
      traces: sim.traces.map((trace) => ({
        time: trace.time,
        text: describe(trace),
        frame: "frame" in trace ? JSON.stringify(trace.frame) : null,
      })),
    };
  }

  function load(index: number) {
    exampleIndex = index;
    loaded = loadNetworkFile(examples[index].text);
    sim = new Simulator(loaded.network);
    generation += 1;
    view = readState();
  }

  function chooseExample(index: number) {
    load(index);
    sourceId = view.hosts[0].id;
    targetIp = view.hosts[1].ip ?? "";
    inputError = "";
  }

  function sendPing() {
    // Un testo che non è un indirizzo non è un errore di rete: è un errore
    // di battitura, e va detto subito.
    try {
      sim.dispatch(ping(sourceId, targetIp.trim(), count));
      inputError = "";
    } catch (error) {
      inputError = error instanceof Error ? error.message : String(error);
    }
    view = readState();
  }

  function step() {
    sim.step();
    view = readState();
  }

  // Dove sta un dispositivo sul disegno.
  function position(deviceId: string) {
    return loaded.positions.get(deviceId)!;
  }

  function nameOf(port: PortRef): string {
    return findDevice(sim.network, port.deviceId).name;
  }

  function labelOf(frame: EthernetFrame): string {
    if (frame.etherType === "ARP") {
      return `ARP ${frame.payload.operation}`;
    }
    return `ICMP ${frame.payload.payload.type.replace("-", " ")}`;
  }

  // Dice che cosa è successo, senza spiegare perché.
  function describe(trace: Trace): string {
    switch (trace.kind) {
      case "frame-sent":
        return `${nameOf(trace.from)} invia ${labelOf(trace.frame)} dalla porta ${trace.from.portName}, destinazione ${trace.frame.dstMac}`;
      case "frame-received":
        return `${nameOf(trace.at)} riceve ${labelOf(trace.frame)} sulla porta ${trace.at.portName}`;
      case "frame-dropped":
        return `${nameOf(trace.at)} scarta ${labelOf(trace.frame)}`;
      case "packet-dropped":
        return `${findDevice(sim.network, trace.deviceId).name} rinuncia a spedire ${trace.packet.payload.type.replace("-", " ")} per ${trace.packet.dstIp}`;
      case "ping-result": {
        const name = findDevice(sim.network, trace.deviceId).name;
        if (trace.outcome === "reply") return `${name}: risposta da ${trace.targetIp}`;
        if (trace.outcome === "timeout") return `${name}: richiesta scaduta`;
        if (trace.outcome === "unreachable") return `${name}: host di destinazione non raggiungibile`;
        return `${name}: trasmissione non riuscita`;
      }
      case "simulation-suspended":
        return `Simulazione sospesa: tempesta di broadcast, ${trace.framesInFlight} frame in viaggio`;
      case "table-changed":
        return `${findDevice(sim.network, trace.deviceId).name} aggiorna la tabella ${trace.table === "arp" ? "ARP" : "MAC"}`;
    }
  }
</script>

<h1>net-sim: scheletro</h1>

<p>
  Rete:
  {#each examples as example, index}
    <label>
      <input
        type="radio"
        name="example"
        checked={exampleIndex === index}
        onchange={() => chooseExample(index)}
      />
      {example.name}
    </label>
  {/each}
</p>

<p>
  <select bind:value={sourceId} aria-label="Host che fa il ping">
    {#each view.hosts as host (host.id)}
      <option value={host.id}>{host.name}</option>
    {/each}
  </select>
  fa ping a
  <input bind:value={targetIp} list="known-addresses" size="15" aria-label="Indirizzo IP di destinazione" />
  <datalist id="known-addresses">
    {#each view.hosts as host (host.id)}
      <option value={host.ip}>{host.name}</option>
    {/each}
  </datalist>
  con
  <input type="number" bind:value={count} min="1" max="10" style="width: 3em" aria-label="Numero di echo request" />
  richieste
  <button onclick={sendPing} disabled={view.suspended}>Ping</button>
  {#if inputError !== ""}
    <strong role="alert">{inputError}</strong>
  {/if}
</p>

<p>
  <button onclick={step} disabled={!view.canStep}>Passo</button>
  <button onclick={() => load(exampleIndex)}>Ricomincia</button>
  Tempo: <strong>{view.time}</strong> tick
</p>

{#if view.suspended}
  <p role="alert" style="border: 2px solid crimson; padding: 0.5em; max-width: 680px">
    <strong>Simulazione sospesa: tempesta di broadcast.</strong>
    Ci sono {view.framesInFlight} frame che continuano a girare senza fermarsi. La causa è un ciclo
    tra switch: senza spanning tree, un broadcast inoltrato in cerchio non si esaurisce mai. Premi
    "Ricomincia" per ripartire.
  </p>
{/if}

<svg viewBox="0 0 700 340" width="700" height="340" style="border: 1px solid gray">
  {#each view.links as link (link.id)}
    <line x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} stroke="gray" stroke-width="3" />
  {/each}

  {#each view.switches as sw (sw.id)}
    <rect x={sw.at.x - 45} y={sw.at.y - 25} width="90" height="50" fill="white" stroke="black" stroke-width="2" />
    <text x={sw.at.x} y={sw.at.y + 5} text-anchor="middle">{sw.name}</text>
  {/each}

  {#each view.hosts as host (host.id)}
    <circle cx={host.at.x} cy={host.at.y} r="30" fill="white" stroke="black" stroke-width="2" />
    <text x={host.at.x} y={host.at.y + 5} text-anchor="middle">{host.name}</text>
    <text x={host.at.x} y={host.at.y + 50} text-anchor="middle">{host.ip}</text>
    <text x={host.at.x} y={host.at.y + 68} text-anchor="middle">{host.mac}</text>
    {#if host.pending.length > 0}
      <text x={host.at.x} y={host.at.y + 86} text-anchor="middle" fill="crimson">
        in attesa: {host.pending.length}
      </text>
    {/if}
  {/each}

  {#each view.inFlight as packet (packet.key)}
    <Packet from={packet.from} to={packet.to} label={packet.label} />
  {/each}
</svg>

{#if view.switches.length > 0}
  <h2>Tabelle MAC</h2>
  {#each view.switches as sw (sw.id)}
    <h3>{sw.name}</h3>
    {#if sw.macRows.length === 0}
      <p>(vuota)</p>
    {:else}
      <table border="1" cellpadding="4">
        <thead>
          <tr><th>Indirizzo MAC</th><th>Porta</th></tr>
        </thead>
        <tbody>
          {#each sw.macRows as [mac, port] (mac)}
            <tr><td>{mac}</td><td>{port}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/each}
{/if}

<h2>Tabelle ARP</h2>
{#each view.hosts as host (host.id)}
  <h3>{host.name}</h3>
  {#if host.arpRows.length === 0}
    <p>(vuota)</p>
  {:else}
    <table border="1" cellpadding="4">
      <thead>
        <tr><th>Indirizzo IP</th><th>Indirizzo MAC</th></tr>
      </thead>
      <tbody>
        {#each host.arpRows as [ip, mac] (ip)}
          <tr><td>{ip}</td><td>{mac}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#each host.pending as waiting}
    <p>In attesa: {waiting}</p>
  {/each}
{/each}

<h2>Eventi</h2>
{#if view.traces.length === 0}
  <p>(nessuno)</p>
{:else}
  <ol>
    {#each view.traces as trace}
      <li>
        t={trace.time}: {trace.text}
        {#if trace.frame !== null}
          <pre>{trace.frame}</pre>
        {/if}
      </li>
    {/each}
  </ol>
{/if}
