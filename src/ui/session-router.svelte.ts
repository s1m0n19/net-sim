// Configurare un router o uno switch dal pannello laterale: accendere e
// spegnere le interfacce, impostarne gli indirizzi, aggiungere e togliere
// le rotte statiche; creare, rinominare ed eliminare le VLAN di uno switch,
// scegliere la VLAN di ogni porta, renderla trunk e sceglierne nativa e
// VLAN consentite.
//
// È il settimo strato di `session`. Come gli altri metodi che modificano la
// rete, anche questi passano da `attempt`, che registra la modifica nella
// cronologia.

import {
  addRoute,
  addVlan,
  configureInterface,
  disableInterface,
  enableInterface,
  removeRoute,
  removeVlan,
  renameVlan,
  setAllowedVlans,
  setNativeVlan,
  setPortMode,
  setPortVlan,
  type Action,
} from "../engine/actions";
import type { SwitchPort } from "../engine/model/network";
import { ALL_VLANS, normalizeVlanList, parseVlanList, sameAllowedVlans, type AllowedVlans } from "../engine/model/trunks";
import { DEFAULT_VLAN, MAX_VLAN_ID, defaultVlanName, vlanExists } from "../engine/model/vlans";
import { networksOverlap, prefixToMask } from "../engine/model/addresses";
import { defaultMaskFor } from "../engine/model/ip-config";
import { checkInterfaceAddress, checkRoute, nextHopIsOwnAddress } from "../engine/model/router-config";
import { SessionAnnotations } from "./session-annotations.svelte";
import { sentence } from "./session-editing.svelte";

export class SessionRouter extends SessionAnnotations {
  /**
   * Accende un'interfaccia spenta di un router, o ne spegne una accesa.
   * Vale anche per le porte di uno switch.
   */
  toggleInterface(deviceId: string, portName: string): void {
    const device = this.simulator?.network.devices.find((d) => d.id === deviceId);
    if (device === undefined || device.kind === "host") return;
    const port = device.ports.find((p) => p.name === portName);
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
    // Il prossimo salto è un vicino: non può essere il router stesso.
    const router = this.simulator?.network.devices.find((device) => device.id === deviceId);
    if (router?.kind === "router" && nextHopIsOwnAddress(route, router.ports)) {
      return `${route.nextHop} è un indirizzo di questo router: il prossimo salto deve essere un vicino.`;
    }
    const refused = this.attempt(addRoute(deviceId, route));
    // Il motore mette davanti "R1: ": nel pannello è di troppo.
    return refused === null ? null : sentence(refused.replace(/^[^:]+: /, "").replace(/\.$/, ""));
  }

  /** Toglie una rotta statica da un router. */
  removeRoute(deviceId: string, route: { network: string; mask: string; nextHop: string }): void {
    const problem = this.attempt(removeRoute(deviceId, route));
    if (problem !== null) this.notice = problem;
  }

  /**
   * Crea una VLAN su uno switch, come scritta nel pannello. Numero e nome
   * li controlla il motore, con le stesse regole della CLI e del file.
   *
   * @param deviceId - lo switch
   * @param idText - il numero scritto, da 1 a 1001
   * @param nameText - il nome scritto; vuoto, la VLAN prende il suo
   *   ("VLAN0010")
   * @returns null se la VLAN è stata creata, altrimenti il motivo del
   *   rifiuto, da scrivere sotto i campi
   */
  addVlan(deviceId: string, idText: string, nameText: string): string | null {
    const text = idText.trim();
    if (!/^\d+$/.test(text)) return `Scrivi il numero della VLAN, da 1 a ${MAX_VLAN_ID}.`;
    const id = Number(text);
    const sw = this.simulator?.network.devices.find((device) => device.id === deviceId);
    // Il motore lascerebbe la VLAN com'è senza dirlo: qui lo si dice.
    if (sw?.kind === "switch" && vlanExists(sw, id)) return `La VLAN ${id} c'è già.`;
    const name = nameText.trim() === "" ? null : nameText.trim();
    return this.attempt(addVlan(deviceId, id, name));
  }

  /**
   * Cambia il nome di una VLAN di uno switch. Un nome vuoto le ridà quello
   * che prende da sé, come `no name` nella CLI.
   *
   * @returns null se il nome è stato accettato, altrimenti il motivo del
   *   rifiuto, da scrivere sotto il campo
   */
  renameVlan(deviceId: string, id: number, text: string): string | null {
    const name = text.trim() === "" ? defaultVlanName(id) : text.trim();
    const sw = this.simulator?.network.devices.find((device) => device.id === deviceId);
    // Già così: nessun passo vuoto nella cronologia.
    if (sw?.kind === "switch" && sw.vlans.some((vlan) => vlan.id === id && vlan.name === name)) return null;
    return this.attempt(renameVlan(deviceId, id, name));
  }

  /**
   * Elimina una VLAN di uno switch. Le sue porte restano assegnate al
   * numero, inattive, come nella CLI: nessuna torna da sola nella VLAN 1.
   */
  removeVlan(deviceId: string, id: number): void {
    const problem = this.attempt(removeVlan(deviceId, id));
    if (problem !== null) this.notice = problem;
  }

  /** Mette una porta di uno switch in una VLAN. */
  setPortVlan(deviceId: string, portName: string, id: number): void {
    const problem = this.attempt(setPortVlan(deviceId, portName, id));
    if (problem !== null) this.notice = problem;
  }

  /**
   * Rende access una porta di uno switch, nella VLAN data: se era trunk,
   * cambiare modo e VLAN è una modifica sola, che si annulla con un passo.
   * Nativa e VLAN consentite restano memorizzate.
   *
   * @param deviceId - lo switch
   * @param portName - la porta
   * @param id - la VLAN access, anche se lo switch non ce l'ha
   */
  makeAccess(deviceId: string, portName: string, id: number): void {
    const port = this.switchPortOf(deviceId, portName);
    if (port === undefined) return;
    const actions: Action[] = [];
    if (port.mode !== "access") actions.push(setPortMode(deviceId, portName, "access"));
    if (port.vlan !== id) actions.push(setPortVlan(deviceId, portName, id));
    const problem = this.attemptTogether(actions);
    if (problem !== null) this.notice = problem;
  }

  /**
   * Rende trunk una porta di uno switch. VLAN access, nativa e VLAN
   * consentite restano come sono, e tornano a valere.
   */
  makeTrunk(deviceId: string, portName: string): void {
    if (this.switchPortOf(deviceId, portName)?.mode === "trunk") return;
    const problem = this.attempt(setPortMode(deviceId, portName, "trunk"));
    if (problem !== null) this.notice = problem;
  }

  /**
   * Sceglie la VLAN nativa di una porta di uno switch, scritta come numero.
   * Vuoto torna alla 1, come `no switchport trunk native vlan`. Un numero
   * che lo switch non ha va bene: la VLAN non si crea.
   *
   * @returns null se la nativa è stata accettata (o era già quella),
   *   altrimenti il motivo del rifiuto, da scrivere sotto il campo
   */
  setNativeVlan(deviceId: string, portName: string, text: string): string | null {
    const typed = text.trim();
    if (typed !== "" && !/^\d+$/.test(typed)) return `Scrivi il numero della VLAN, da 1 a ${MAX_VLAN_ID}.`;
    const id = typed === "" ? DEFAULT_VLAN : Number(typed);
    if (this.switchPortOf(deviceId, portName)?.nativeVlan === id) return null;
    return this.attempt(setNativeVlan(deviceId, portName, id));
  }

  /**
   * Sceglie le VLAN consentite di una porta di uno switch: "all", oppure un
   * elenco, anche vuoto. Ogni scelta è un passo della cronologia; una che
   * non cambia nulla non ne aggiunge.
   *
   * @returns null se è andata bene, altrimenti il motivo del rifiuto
   */
  setAllowedVlans(deviceId: string, portName: string, vlans: AllowedVlans): string | null {
    const port = this.switchPortOf(deviceId, portName);
    if (port === undefined) return null;
    let wanted: AllowedVlans;
    try {
      wanted = vlans === ALL_VLANS ? ALL_VLANS : normalizeVlanList(vlans);
    } catch (thrown) {
      return thrown instanceof Error ? thrown.message : String(thrown);
    }
    if (sameAllowedVlans(port.allowedVlans, wanted)) return null;
    return this.attempt(setAllowedVlans(deviceId, portName, wanted));
  }

  /**
   * Aggiunge alle VLAN consentite di una porta quelle scritte, come
   * `switchport trunk allowed vlan add`: numeri e intervalli, anche di VLAN
   * che lo switch non ha ("30,40-45"). Con tutte le VLAN consentite non
   * cambia nulla.
   *
   * @returns null se è andata bene, altrimenti il motivo del rifiuto, da
   *   scrivere sotto il campo
   */
  addAllowedVlans(deviceId: string, portName: string, text: string): string | null {
    const port = this.switchPortOf(deviceId, portName);
    if (port === undefined || port.allowedVlans === ALL_VLANS) return null;
    let added: readonly number[];
    try {
      added = parseVlanList(text.trim());
    } catch (thrown) {
      return thrown instanceof Error ? thrown.message : String(thrown);
    }
    return this.setAllowedVlans(deviceId, portName, [...port.allowedVlans, ...added]);
  }

  // Una porta di uno switch, com'è nella rete adesso.
  private switchPortOf(deviceId: string, portName: string): SwitchPort | undefined {
    const sw = this.simulator?.network.devices.find((device) => device.id === deviceId);
    return sw?.kind === "switch" ? sw.ports.find((port) => port.name === portName) : undefined;
  }

  private interfaceOf(deviceId: string, portName: string) {
    return this.view.devices.find((device) => device.id === deviceId)?.interfaces.find((p) => p.name === portName);
  }
}
