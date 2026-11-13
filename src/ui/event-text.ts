// Come si racconta ciò che è successo: da una traccia del motore alla riga
// dell'elenco degli eventi, e da un frame alla sua descrizione a parole.

import type { EthernetFrame } from "../engine/model/frames";
import { maskToPrefix } from "../engine/model/addresses";
import { otherEndOf, type Network, type StaticRoute } from "../engine/model/network";
import type { Conversation, Trace } from "../engine/simulator";
import type { EventView, PacketDetails, Protocol } from "./view-types";

/**
 * Dice che cosa contiene un frame, con le parole che si usano a voce.
 *
 * @param frame - il frame da descrivere
 * @returns per esempio "ARP request" oppure "ICMP echo reply"
 */
export function describeFrame(frame: EthernetFrame): string {
  if (frame.etherType === "ARP") {
    return `ARP ${frame.payload.operation}`;
  }
  return `ICMP ${frame.payload.payload.type.replace("-", " ")}`;
}

// Il nome di un dispositivo. L'elenco degli eventi parla anche di
// dispositivi che nel frattempo sono stati tolti dalla rete: di quelli
// resta solo l'identificativo.
export function nameOf(network: Network, deviceId: string): string {
  return network.devices.find((device) => device.id === deviceId)?.name ?? `${deviceId} (eliminato)`;
}

// I due dispositivi collegati da un cavo, per nome: "PC1 e SW1".
function endsOf(network: Network, linkId: string): string {
  const link = network.links.find((l) => l.id === linkId);
  if (link === undefined) return "due dispositivi (cavo eliminato)";
  return `${nameOf(network, link.a.deviceId)} e ${nameOf(network, link.b.deviceId)}`;
}

export function detailsOf(id: number, frame: EthernetFrame, fromName: string, toName: string): PacketDetails {
  return { id, fromName, toName, frame, protocol: protocolOf(frame), description: describeFrame(frame) };
}

/**
 * Come si chiama una conversazione nel filtro: il suo numero e l'azione
 * che l'ha fatta nascere, "#3 · ping PC1 → 192.168.1.11". Il numero è
 * quello del simulatore: distingue due ping uguali uno dopo l'altro (U-2
 * del collaudo UX 5, D-136).
 *
 * @param network - la rete, per i nomi dei dispositivi
 * @param conversation - la conversazione
 */
export function labelOf(network: Network, conversation: Conversation): string {
  return `#${conversation.id} · ${whatOf(network, conversation)}`;
}

// L'azione che ha fatto nascere una conversazione, a parole.
function whatOf(network: Network, conversation: Conversation): string {
  const { action } = conversation;
  switch (action.kind) {
    case "ping":
      return `ping ${nameOf(network, action.deviceId)} → ${action.targetIp}`;
    case "tracert":
      return `tracert ${nameOf(network, action.deviceId)} → ${action.targetIp}`;
    case "resolve-address":
      return `ARP ${nameOf(network, action.deviceId)} → ${action.targetIp}`;
    default:
      return "conversazione";
  }
}

const OUTCOMES = {
  reply: (targetIp: string) => `ping: risposta da ${targetIp}`,
  timeout: () => "ping: richiesta scaduta",
  unreachable: () => "ping: host di destinazione non raggiungibile",
  "transmit-failed": () => "ping: trasmissione non riuscita",
  "net-unreachable": () => "ping: rete di destinazione non raggiungibile",
  "host-unreachable": () => "ping: host di destinazione non raggiungibile",
  "ttl-expired": () => "ping: TTL scaduto lungo la strada",
};

// Che cosa ha scoperto una sonda di tracert, a parole.
const HOPS = {
  hop: (hop: number, from: string) => `tracert: il salto ${hop} è ${from}`,
  reached: (hop: number, from: string) => `tracert: al salto ${hop} risponde la destinazione, ${from}`,
  timeout: (hop: number) => `tracert: il salto ${hop} non risponde`,
  "net-unreachable": (_hop: number, from: string) => `tracert: ${from} avvisa che la rete non è raggiungibile`,
  "host-unreachable": (_hop: number, from: string) => `tracert: ${from} avvisa che l'host non è raggiungibile`,
  unreachable: () => "tracert: host di destinazione non raggiungibile",
  "transmit-failed": () => "tracert: trasmissione non riuscita",
};

// Trasforma una traccia del motore in una riga dell'elenco degli eventi.
// Dice che cosa è successo, non perché: l'app si comporta come una rete vera.
export function describeTrace(network: Network, trace: Trace, index: number): EventView {
  const row = (deviceId: string | null, text: string, extra: Partial<EventView> = {}): EventView => ({
    index,
    time: trace.time,
    // Una riga non può rimandare a un dispositivo che non c'è più.
    deviceId: network.devices.some((device) => device.id === deviceId) ? deviceId : null,
    deviceName: deviceId === null ? "" : nameOf(network, deviceId),
    text,
    protocol: null,
    packet: null,
    conversationId: "conversationId" in trace ? trace.conversationId : null,
    ...extra,
  });
  // Per un frame arrivato a una porta, chi lo ha mandato sta all'altro capo del cavo.
  const senderOf = (at: { deviceId: string; portName: string }): string => {
    const other = otherEndOf(network, at);
    return other === null ? "?" : nameOf(network, other.deviceId);
  };

  switch (trace.kind) {
    case "frame-sent": {
      const packet = detailsOf(trace.frameId, trace.frame, nameOf(network, trace.from.deviceId), nameOf(network, trace.to.deviceId));
      return row(trace.from.deviceId, `invia ${packet.description} dalla porta ${trace.from.portName}, destinazione ${trace.frame.dstMac}`, { protocol: packet.protocol, packet });
    }
    case "frame-received": {
      const packet = detailsOf(trace.frameId, trace.frame, senderOf(trace.at), nameOf(network, trace.at.deviceId));
      return row(trace.at.deviceId, `riceve ${packet.description} sulla porta ${trace.at.portName}`, { protocol: packet.protocol, packet });
    }
    case "frame-dropped": {
      const packet = detailsOf(trace.frameId, trace.frame, senderOf(trace.at), nameOf(network, trace.at.deviceId));
      return row(trace.at.deviceId, `scarta ${packet.description}`, { protocol: packet.protocol, packet });
    }
    case "frame-lost": {
      const packet = detailsOf(trace.frameId, trace.frame, nameOf(network, trace.from.deviceId), nameOf(network, trace.to.deviceId));
      return row(trace.from.deviceId, `${packet.description} verso ${packet.toName} va perso`, { protocol: packet.protocol, packet });
    }
    case "table-changed":
      return row(trace.deviceId, `aggiorna la tabella ${trace.table === "arp" ? "ARP" : "MAC"}`);
    case "packet-dropped":
      return row(trace.deviceId, `rinuncia a spedire ${trace.packet.payload.type.replace("-", " ")} per ${trace.packet.dstIp}`, { protocol: "ICMP" });
    case "ping-result":
      return row(trace.deviceId, OUTCOMES[trace.outcome](trace.targetIp), { protocol: "ICMP" });
    case "trace-hop":
      return row(trace.deviceId, HOPS[trace.outcome](trace.hop, trace.from ?? ""), { protocol: "ICMP" });
    case "power-changed":
      return row(trace.deviceId, trace.powered ? "viene acceso" : "viene spento");
    case "link-changed":
      return row(null, `cavo tra ${endsOf(network, trace.linkId)} ${trace.connected ? "riattaccato" : "staccato"}`);
    case "device-added":
      return row(trace.deviceId, "viene aggiunto alla rete");
    case "device-removed":
      return row(null, `${trace.name} viene tolto dalla rete`);
    case "link-added":
      return row(null, `nuovo cavo tra ${endsOf(network, trace.linkId)}`);
    case "link-removed":
      return row(null, `cavo tra ${trace.between[0]} e ${trace.between[1]} tolto`);
    case "device-renamed":
      return row(trace.deviceId, `cambia nome: prima era ${trace.from}`);
    case "host-configured":
      return row(trace.deviceId, "cambia configurazione IP");
    case "interface-configured":
      return row(trace.deviceId, `cambia l'indirizzo dell'interfaccia ${trace.portName}`);
    case "interface-changed": {
      // Su un router si chiamano interfacce, su uno switch porte.
      const isSwitch = network.devices.find((device) => device.id === trace.deviceId)?.kind === "switch";
      const what = isSwitch ? "la porta" : "l'interfaccia";
      return row(trace.deviceId, `${trace.enabled ? "accende" : "spegne"} ${what} ${trace.portName}`);
    }
    case "route-added":
      return row(trace.deviceId, `aggiunge la rotta verso ${routeText(trace.route)}`);
    case "route-removed":
      return row(trace.deviceId, `toglie la rotta verso ${routeText(trace.route)}`);
    case "vlan-changed": {
      const verb = { added: "crea", renamed: "rinomina", removed: "elimina" }[trace.change];
      return row(trace.deviceId, `${verb} la VLAN ${trace.vlan}`);
    }
    case "port-vlan-changed":
      return row(trace.deviceId, `sposta la porta ${trace.portName} dalla VLAN ${trace.from} alla VLAN ${trace.vlan}`);
    case "simulation-suspended":
      return row(null, "simulazione sospesa: tempesta di broadcast");
  }
}

// Una rotta a parole: "192.168.2.0/24 via 10.0.0.2".
function routeText(route: StaticRoute): string {
  return `${route.network}/${maskToPrefix(route.mask)} via ${route.nextHop}`;
}

// Il protocollo più interno: è quello che dà colore e sigla alla busta.
function protocolOf(frame: EthernetFrame): Protocol {
  return frame.etherType === "ARP" ? "ARP" : "ICMP";
}
