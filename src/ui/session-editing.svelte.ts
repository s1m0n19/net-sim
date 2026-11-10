// Costruire la rete: posare, spostare, collegare, rinominare, configurare,
// eliminare.
//
// È il quinto strato di `session`. Ogni metodo che modifica la rete
// fotografa prima com'era (`capture`) e, se la modifica riesce, lo
// registra (`remember`): la cronologia sta nello strato sotto,
// session-history.svelte.ts.

import {
  addHost,
  addLink,
  addRouter,
  addServer,
  addSwitch,
  configureHost,
  duplicateDevice,
  moveLinkEnd,
  removeDevice,
  removeLink,
  renameDevice,
  type Action,
} from "../engine/actions";
import { freePortsOf, type DeviceTemplate } from "../engine/editing";
import { checkIpConfig, defaultMaskFor, type IpConfig } from "../engine/model/ip-config";
import type { Position } from "../storage/load";
import { messageOf } from "./session-core.svelte";
import { SessionHistory } from "./session-history.svelte";
import type { HistoryEntry } from "./session-types";
import { snapToGrid } from "./topology/grid";
import { besideFree } from "./topology/placement";

/** Una frase del motore, pronta per essere mostrata: maiuscola e punto. */
export function sentence(text: string): string {
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

export class SessionEditing extends SessionHistory {
  // Com'era la rete quando è cominciato il trascinamento in corso.
  private beforeDrag: HistoryEntry | null = null;

  /**
   * La griglia magnetica è accesa: i dispositivi posati o trascinati cadono
   * sul punto più vicino di una griglia invisibile (D-102). È una scelta di
   * chi disegna, non della rete: aprire un file o un foglio nuovo non la
   * cambia.
   */
  grid = $state(false);

  /**
   * Posa un dispositivo nuovo sul disegno e lo seleziona.
   *
   * @param template - che cosa posare: un PC, o uno switch con le sue porte
   * @param position - dove, in coordinate del disegno
   */
  addDevice(template: DeviceTemplate, position: Position): void {
    if (this.simulator === null) return;
    const action =
      template.kind === "host"
        ? addHost()
        : template.kind === "server"
          ? addServer()
          : template.kind === "switch"
          ? addSwitch(template.portCount)
          : addRouter(template.interfaceCount);
    this.addAt(action, position);
  }

  /**
   * Aggiunge una copia di un dispositivo (D-101) e la seleziona. La copia
   * nasce scollegata, al primo posto libero a destra dell'originale: così,
   * premendo ancora Duplica, le copie si mettono in fila.
   *
   * @param deviceId - il dispositivo da copiare
   */
  duplicate(deviceId: string): void {
    const origin = this.positions.get(deviceId);
    if (origin === undefined) return;
    this.addAt(duplicateDevice(deviceId), besideFree(origin, [...this.positions.values()]));
  }

  // Esegue un'azione che aggiunge un dispositivo, lo mette in un punto del
  // disegno e lo seleziona: un solo passo da annullare.
  private addAt(action: Action, position: Position): void {
    if (this.simulator === null) return;
    const before = this.capture();
    try {
      const traces = this.simulator.dispatch(action);
      const added = traces.find((trace) => trace.kind === "device-added");
      if (added !== undefined) {
        this.remember(before);
        this.positions.set(added.deviceId, this.placed(position));
        this.selection = { kind: "device", id: added.deviceId };
      }
      this.notice = null;
    } catch (problem) {
      this.notice = messageOf(problem);
    }
    this.refresh();
  }

  /**
   * Sposta un dispositivo in un altro punto del disegno; con la griglia
   * accesa, sul punto della griglia più vicino.
   */
  moveDevice(deviceId: string, position: Position): void {
    if (!this.positions.has(deviceId)) return;
    this.positions.set(deviceId, this.placed(position));
    this.refresh();
  }

  // Dove finisce davvero un dispositivo messo in un punto: sulla griglia,
  // se è accesa, e comunque a coordinate intere.
  private placed(position: Position): Position {
    const where = this.grid ? snapToGrid(position) : position;
    return { x: Math.round(where.x), y: Math.round(where.y) };
  }

  /**
   * Da chiamare quando comincia e quando finisce il trascinamento di un
   * dispositivo. Tiene ferma l'inquadratura per la durata, e alla fine
   * registra lo spostamento come una sola modifica da annullare.
   */
  holdBounds(hold: boolean): void {
    // Si tiene ferma l'inquadratura che si vede, che può essere più larga
    // del foglio dei soli dispositivi (tabelle, annotazioni, limite di
    // scala: D-118).
    this.frozenBounds = hold ? (this.shownBounds ?? this.view.bounds) : null;
    if (hold) {
      this.beforeDrag = this.capture();
    } else if (this.beforeDrag !== null) {
      this.remember(this.beforeDrag);
      this.beforeDrag = null;
    }
  }

  /**
   * Elimina ciò che è selezionato: un dispositivo, con i suoi cavi, oppure
   * un cavo. Un pacchetto non si può eliminare.
   */
  removeSelection(): void {
    const selection = this.selection;
    // Le annotazioni le toglie lo strato sopra (session-annotations).
    if (selection === null || selection.kind === "packet" || selection.kind === "annotation") return;

    const before = this.capture();
    this.run(selection.kind === "device" ? removeDevice(selection.id) : removeLink(selection.id));
    // Se l'eliminazione è stata rifiutata, tutto resta com'era.
    if (this.notice !== null) return;
    this.remember(before);

    if (selection.kind === "device") {
      // Con il dispositivo spariscono la sua posizione, la sua tabella
      // appuntata e il suo terminale.
      this.positions.delete(selection.id);
      this.pins = this.pins.filter((pin) => pin.deviceId !== selection.id);
      this.closeTerminal(selection.id);
    }
    this.selection = null;
  }

  /** Apre l'elenco delle porte di un capo di un cavo, e seleziona il cavo. */
  openPortMenu(linkId: string, end: "a" | "b"): void {
    const same = this.portMenu?.linkId === linkId && this.portMenu.end === end;
    this.select({ kind: "link", id: linkId });
    // Un secondo clic sullo stesso nome richiude l'elenco.
    this.portMenu = same ? null : { linkId, end };
  }

  /**
   * Sceglie il dispositivo da cui parte un cavo: il prossimo dispositivo
   * cliccato sarà l'altro capo.
   */
  armLink(deviceId: string): void {
    // Con lo strumento Cavo il primo clic arriva qui, e lo strumento resta;
    // da Collega, sulla barretta, non c'è. Il resto si lascia (D-128).
    const cabling = this.cabling;
    this.releaseTools();
    this.cabling = cabling;
    this.linkFrom = deviceId;
    this.notice = null;
  }

  /**
   * Conclude il cavo cominciato con `armLink`, verso il dispositivo indicato.
   * Indicare di nuovo il dispositivo di partenza annulla.
   */
  connectTo(targetId: string): void {
    const from = this.linkFrom;
    this.linkFrom = null;
    if (from !== null && from !== targetId) this.connect(from, targetId);
  }

  /**
   * Collega due dispositivi con un cavo nuovo, usando su ciascuno la prima
   * porta libera, e seleziona il cavo: da lì si può cambiare porta.
   */
  connect(fromId: string, toId: string): void {
    if (this.simulator === null) return;
    if (fromId === toId) {
      this.notice = "Un cavo unisce due dispositivi diversi.";
      return;
    }
    const ends = [fromId, toId].map((deviceId) => ({
      deviceId,
      portName: freePortsOf(this.simulator!.network, deviceId)[0],
    }));
    const full = ends.find((end) => end.portName === undefined);
    if (full !== undefined) {
      const name = this.view.devices.find((d) => d.id === full.deviceId)?.name ?? "Il dispositivo";
      this.notice = `${name} non ha porte libere.`;
      return;
    }
    const before = this.capture();
    const traces = this.run(addLink(ends[0], ends[1]));
    const added = traces.find((trace) => trace.kind === "link-added");
    if (added !== undefined) {
      this.remember(before);
      this.selection = { kind: "link", id: added.linkId };
    }
  }

  /** Sposta un capo di un cavo su un'altra porta dello stesso dispositivo. */
  changePort(linkId: string, end: "a" | "b", portName: string): void {
    const before = this.capture();
    this.run(moveLinkEnd(linkId, end, portName));
    if (this.notice === null) this.remember(before);
  }

  /**
   * Cambia il nome di un dispositivo, come scritto nel pannello laterale.
   *
   * @returns null se il nome è stato accettato, altrimenti il motivo del
   *   rifiuto, da scrivere sotto il campo
   */
  rename(deviceId: string, name: string): string | null {
    return this.attempt(renameDevice(deviceId, name));
  }

  /**
   * Cambia un campo della configurazione IP di un host, come scritto nel
   * pannello laterale. Un testo vuoto toglie il valore.
   *
   * Due aiuti, perché indirizzo e maschera vanno impostati insieme:
   * scritto l'indirizzo su un host senza maschera, la maschera diventa
   * quella della classe dell'indirizzo; svuotato l'indirizzo, si svuotano
   * anche maschera e gateway.
   *
   * @returns null se il valore è stato accettato, altrimenti il motivo del
   *   rifiuto, da scrivere sotto il campo; in quel caso la rete non cambia
   */
  configure(deviceId: string, field: keyof IpConfig, text: string): string | null {
    const host = this.view.devices.find((device) => device.id === deviceId);
    if (host === undefined || host.kind !== "host") return "Questo dispositivo non ha una configurazione IP.";

    const value = text.trim() === "" ? null : text.trim();
    let config: IpConfig = { ip: host.ip, mask: host.mask, gateway: host.gateway, [field]: value };
    if (field === "ip" && value === null) {
      config = { ip: null, mask: null, gateway: null };
    } else if (field === "ip" && value !== null && host.mask === null) {
      config.mask = defaultMaskFor(value);
    }

    let problem = checkIpConfig(config);
    if (problem !== null && config.ip !== null && config.mask === null) {
      // Non c'è una maschera da proporre perché l'indirizzo è scritto male
      // o non si può assegnare: il motivo da dire è quello, e lo si
      // ottiene controllando l'indirizzo con una maschera qualsiasi.
      problem = checkIpConfig({ ...config, mask: "255.255.255.0" }) ?? problem;
    }
    if (problem !== null) return sentence(problem);
    return this.attempt(configureHost(deviceId, config));
  }

  protected override networkReplaced(): void {
    // Un trascinamento a metà riguardava la rete di prima.
    this.beforeDrag = null;
    super.networkReplaced();
  }
}
