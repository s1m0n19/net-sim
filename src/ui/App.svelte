<script lang="ts">
  import exampleFile from "../../examples/due-pc.netsim.json?raw";
  import { resolveAddress } from "../engine/actions";
  import type { EthernetFrame } from "../engine/model/frames";
  import { findDevice, type PortRef } from "../engine/model/network";
  import { Simulator, type Trace } from "../engine/simulator";
  import { loadNetworkFile, type Position } from "../storage/load";
  import Packet from "./Packet.svelte";

  let loaded = loadNetworkFile(exampleFile);
  let sim = new Simulator(loaded.network);

  // Il simulatore non sa nulla di Svelte: dopo ogni comando se ne legge
  // lo stato e lo si copia in `view`, che è ciò che la pagina disegna.
  let view = $state.raw(readState());

  function readState() {
    return {
      time: sim.time,
      inFlight: [...sim.queue],
      traces: [...sim.traces],
      links: sim.network.links,
      devices: sim.network.devices.map((d) => ({
        id: d.id,
        name: d.name,
        ip: d.ip,
        mac: d.ports[0].mac,
        arpRows: [...d.arpTable],
      })),
    };
  }

  // Lo scheletro ha una sola azione: il primo PC cerca il MAC del secondo.
  const source = loaded.network.devices[0];
  const target = loaded.network.devices[1];

  function resolve() {
    sim.dispatch(resolveAddress(source.id, target.ip!));
    view = readState();
  }

  function step() {
    sim.step();
    view = readState();
  }

  function restart() {
    loaded = loadNetworkFile(exampleFile);
    sim = new Simulator(loaded.network);
    view = readState();
  }

  function position(deviceId: string): Position {
    return loaded.positions.get(deviceId)!;
  }

  function nameOf(port: PortRef): string {
    return findDevice(sim.network, port.deviceId).name;
  }

  function labelOf(frame: EthernetFrame): string {
    return `ARP ${frame.payload.operation}`;
  }

  // Dice che cosa è successo, senza spiegare perché.
  function describe(trace: Trace): string {
    switch (trace.kind) {
      case "frame-sent":
        return `${nameOf(trace.from)} invia ${labelOf(trace.frame)} a ${trace.frame.dstMac}`;
      case "frame-received":
        return `${nameOf(trace.at)} riceve ${labelOf(trace.frame)}`;
      case "frame-dropped":
        return `${nameOf(trace.at)} scarta ${labelOf(trace.frame)}`;
      case "table-changed":
        return `${findDevice(sim.network, trace.deviceId).name} aggiorna la tabella ARP`;
    }
  }
</script>

<h1>net-sim: scheletro</h1>

<p>
  <button onclick={resolve}>{source.name} cerca il MAC di {target.ip}</button>
  <button onclick={step} disabled={view.inFlight.length === 0}>Passo</button>
  <button onclick={restart}>Ricomincia</button>
  Tempo: <strong>{view.time}</strong> tick
</p>

<svg viewBox="0 0 700 260" width="700" height="260" style="border: 1px solid gray">
  {#each view.links as link (link.id)}
    <line
      x1={position(link.a.deviceId).x}
      y1={position(link.a.deviceId).y}
      x2={position(link.b.deviceId).x}
      y2={position(link.b.deviceId).y}
      stroke="gray"
      stroke-width="3"
    />
  {/each}

  {#each view.devices as device (device.id)}
    <circle cx={position(device.id).x} cy={position(device.id).y} r="30" fill="white" stroke="black" stroke-width="2" />
    <text x={position(device.id).x} y={position(device.id).y + 5} text-anchor="middle">{device.name}</text>
    <text x={position(device.id).x} y={position(device.id).y + 55} text-anchor="middle">{device.ip}</text>
    <text x={position(device.id).x} y={position(device.id).y + 75} text-anchor="middle">{device.mac}</text>
  {/each}

  {#each view.inFlight as event (event.frameId)}
    <Packet from={position(event.from.deviceId)} to={position(event.to.deviceId)} label={labelOf(event.frame)} />
  {/each}
</svg>

<h2>Tabelle ARP</h2>
{#each view.devices as device (device.id)}
  <h3>{device.name}</h3>
  {#if device.arpRows.length === 0}
    <p>(vuota)</p>
  {:else}
    <table border="1" cellpadding="4">
      <thead>
        <tr><th>Indirizzo IP</th><th>Indirizzo MAC</th></tr>
      </thead>
      <tbody>
        {#each device.arpRows as [ip, mac] (ip)}
          <tr><td>{ip}</td><td>{mac}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/each}

<h2>Eventi</h2>
{#if view.traces.length === 0}
  <p>(nessuno)</p>
{:else}
  <ol>
    {#each view.traces as trace}
      <li>
        t={trace.time}: {describe(trace)}
        {#if trace.kind !== "table-changed"}
          <pre>{JSON.stringify(trace.frame)}</pre>
        {/if}
      </li>
    {/each}
  </ol>
{/if}
