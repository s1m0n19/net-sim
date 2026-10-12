// Configurare un router dal pannello laterale: accendere e spegnere le
// interfacce, impostarne gli indirizzi, aggiungere e togliere le rotte
// statiche.
//
// È il quarto strato di `session`. Come gli altri metodi che modificano la
// rete, anche questi passano da `attempt`, che registra la modifica nella
// cronologia.

import {
  addRoute,
  configureInterface,
  disableInterface,
  enableInterface,
  removeRoute,
} from "../engine/actions";
import { networksOverlap, prefixToMask } from "../engine/model/addresses";
import { defaultMaskFor } from "../engine/model/ip-config";
import { checkInterfaceAddress, checkRoute } from "../engine/model/router-config";
import { sentence, SessionEditing } from "./session-editing.svelte";

export class SessionRouter extends SessionEditing {
  /** Accende un'interfaccia spenta di un router, o ne spegne una accesa. */
  toggleInterface(deviceId: string, portName: string): void {
    const port = this.interfaceOf(deviceId, portName);
    if (port === undefined) return;
    const problem = this.attempt(port.enabled ? disableInterface(deviceId, portName) : enableInterface(deviceId, portName));
    if (problem !== null) this.notice = problem;
  }

  /**
   * Cambia l'indirizzo o la maschera di un'interfaccia di un router, come
   * scritto nel pannello laterale. Un testo vuoto toglie il valore.
   *
   * Valgono gli stessi due aiuti dei PC: scritto l'indirizzo su
   * un'interfaccia senza maschera, la maschera diventa quella della classe
   * dell'indirizzo; svuotato l'indirizzo, si svuota anche la maschera.
   *
   * In più, perché su un router le maschere lunghe sono la norma:
   * - nel campo dell'indirizzo si può scrivere anche il prefisso
   *   ("10.0.0.5/30"), e la maschera si imposta di conseguenza;
   * - se la maschera della classe farebbe sovrapporre la rete a quella di
   *   un'altra interfaccia, viene proposta la maschera di quell'altra.
   *   Così, dopo 10.0.0.1/30 su un'interfaccia, 10.0.0.5 sull'altra diventa
   *   /30 anche lei, invece di essere rifiutata come /8.
   *
   * @returns null se il valore è stato accettato, altrimenti il motivo del
   *   rifiuto, da scrivere sotto il campo; in quel caso la rete non cambia
   */
  configureInterface(deviceId: string, portName: string, field: "ip" | "mask", text: string): string | null {
    const port = this.interfaceOf(deviceId, portName);
    if (port === undefined) return "Questa interfaccia non esiste.";

    let value = text.trim() === "" ? null : text.trim();
    let mask = field === "mask" ? value : port.mask;
    // "10.0.0.5/30" nel campo dell'indirizzo: indirizzo e prefisso insieme.
    const withPrefix = field === "ip" && value !== null ? /^(.+)\/(\d{1,2})$/.exec(value) : null;
    if (withPrefix !== null && Number(withPrefix[2]) <= 32) {
      value = withPrefix[1];
      mask = prefixToMask(Number(withPrefix[2]));
    }
    const ip = field === "ip" ? value : port.ip;
    if (field === "ip" && value === null) {
      mask = null;
    } else if (field === "ip" && value !== null && mask === null) {
      mask = this.proposedMask(deviceId, portName, value);
    }

    // Il motivo si dice senza il nome del router: sta già scritto sopra.
    let problem = checkInterfaceAddress(ip, mask);
    if (problem !== null && ip !== null && mask === null) {
      problem = checkInterfaceAddress(ip, "255.255.255.0") ?? problem;
    }
    if (problem !== null) return sentence(problem);
    const refused = this.attempt(configureInterface(deviceId, portName, ip, mask));
    // Il motore mette davanti "R1 Gi0/0: ": nel pannello è di troppo.
    return refused === null ? null : sentence(refused.replace(/^[^:]+: /, "").replace(/\.$/, ""));
  }

  // La maschera da proporre per un indirizzo scritto su un'interfaccia che
  // non ne ha una: quella della classe, a meno che non faccia sovrapporre
  // la rete a quella di un'altra interfaccia; in quel caso, la maschera di
  // quell'altra.
  private proposedMask(deviceId: string, portName: string, ip: string): string | null {
    const byClass = defaultMaskFor(ip);
    if (byClass === null) return null;
    const others = this.view.devices.find((device) => device.id === deviceId)?.interfaces ?? [];
    for (const other of others) {
      if (other.name === portName || other.ip === null || other.mask === null) continue;
      if (networksOverlap(ip, byClass, other.ip, other.mask)) return other.mask;
    }
    return byClass;
  }

  /**
   * Aggiunge una rotta statica a un router, come scritta nel pannello.
   *
   * La maschera si può scrivere per esteso (255.255.255.0) oppure come
   * prefisso (/24, o 24); il prefisso può stare anche in coda alla rete
   * (192.168.2.0/24), e allora il campo della maschera può restare vuoto.
   *
   * @returns null se la rotta è stata aggiunta, altrimenti il motivo del
   *   rifiuto, da scrivere sotto i campi
   */
  addRoute(deviceId: string, network: string, mask: string, nextHop: string): string | null {
    let net = network.trim();
    let maskText = mask.trim();
    const withPrefix = /^(.+)\/(\d{1,2})$/.exec(net);
    if (withPrefix !== null && maskText === "") {
      net = withPrefix[1];
      maskText = `/${withPrefix[2]}`;
    }
    if (net === "" || maskText === "" || nextHop.trim() === "") {
      return "Servono la rete, la maschera e il prossimo salto.";
    }
    const prefix = /^\/?(\d{1,2})$/.exec(maskText);
    if (prefix !== null && Number(prefix[1]) > 32) return `Subnet mask non valida: ${maskText}.`;
    const route = {
      network: net,
      mask: prefix === null ? maskText : prefixToMask(Number(prefix[1])),
      nextHop: nextHop.trim(),
    };
    const problem = checkRoute(route);
    if (problem !== null) return sentence(problem);
    const refused = this.attempt(addRoute(deviceId, route));
    // Il motore mette davanti "R1: ": nel pannello è di troppo.
    return refused === null ? null : sentence(refused.replace(/^[^:]+: /, "").replace(/\.$/, ""));
  }

  /** Toglie una rotta statica da un router. */
  removeRoute(deviceId: string, route: { network: string; mask: string; nextHop: string }): void {
    const problem = this.attempt(removeRoute(deviceId, route));
    if (problem !== null) this.notice = problem;
  }

  private interfaceOf(deviceId: string, portName: string) {
    return this.view.devices.find((device) => device.id === deviceId)?.interfaces.find((p) => p.name === portName);
  }
}
