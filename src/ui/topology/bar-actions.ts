// Che cosa offre la barretta delle azioni, a seconda di ciò che è
// selezionato. Tutto ciò che si può fare a un dispositivo o a un cavo sta
// qui: non esiste un menu nascosto del tasto destro.
//
// Le azioni più usate per ciascun tipo di dispositivo sono "primarie" e si
// vedono sempre, con l'icona e una scritta; le altre stanno nel menu
// "Altro" della barretta (D-111). Che cosa fa ogni azione lo decide la
// sessione: qui si sceglie solo che cosa mostrare.

import { preferences } from "../preferences.svelte";
import { session } from "../session.svelte";
import type { IconName } from "../theme/Icon.svelte";
import { annotationRect } from "./annotation-geometry";

export interface BarAction {
  icon: IconName;
  // La scritta breve, sotto l'icona o nel menu "Altro".
  text: string;
  // La descrizione completa, per chi legge con il lettore di schermo e per
  // il suggerimento. Dice che cosa fa l'azione, non come risolvere un
  // problema di rete.
  label: string;
  // Si vede sempre sulla barretta; altrimenti sta nel menu "Altro".
  primary: boolean;
  // Un'azione che toglie qualcosa dalla rete: si distingue dalle altre.
  danger?: boolean;
  // Il pulsante resta premuto: l'azione aspetta un secondo clic altrove,
  // oppure è accesa (una tabella appuntata).
  active?: boolean;
  run: () => void;
}

/**
 * Dove sta, sul disegno, ciò che è selezionato: la barretta si mette
 * accanto. `top` è il bordo alto dell'oggetto, `bottom` il bordo basso
 * delle sue scritte; tutto in coordinate del disegno.
 */
export interface BarAnchor {
  x: number;
  top: number;
  bottom: number;
  // Metà della larghezza, bordo della selezione compreso: per mettere la
  // barretta al fianco di un dispositivo quando sopra e sotto non c'è posto.
  halfWidth?: number;
}

// La barretta: accanto a che cosa, e i suoi pulsanti.
export interface SelectionBar {
  anchor: BarAnchor;
  actions: BarAction[];
}

/**
 * La barretta di ciò che è selezionato adesso.
 *
 * @returns dove si aggancia e i suoi pulsanti, oppure null se non c'è
 *   nulla di selezionato a cui si possa fare qualcosa, se la simulazione
 *   è sospesa, o se è scelto uno strumento della colonna
 */
export function selectionBar(): SelectionBar | null {
  const selection = session.selection;
  if (selection === null || session.view.suspended) return null;
  // Mentre si posa, si tira un cavo o si annota con uno strumento della
  // colonna, la barretta non si vede: le sue azioni non c'entrano, e
  // coprirebbe il punto dove si vuole fare clic. La selezione resta, e la
  // barretta torna quando lo strumento si lascia (D-138).
  if (session.usingPaletteTool) return null;
  const presenting = preferences.presenting;

  if (selection.kind === "device") {
    const device = session.view.devices.find((d) => d.id === selection.id);
    if (device === undefined) return null;
    const actions: BarAction[] = [];

    // Il prompt dei comandi su un host, la CLI su un router o uno switch.
    actions.push({
      icon: "terminal",
      text: "Terminale",
      label: `Apri il terminale di ${device.name}`,
      primary: true,
      run: () => {
        session.openTerminal(device.id);
        preferences.stripOpen = true;
      },
    });
    // Un host spento non fa ping.
    if (device.kind === "host" && device.powered) {
      actions.push({
        icon: "ping",
        text: "Ping",
        label: `Ping da ${device.name}: poi fai clic sulla destinazione`,
        primary: true,
        active: session.pingFrom === device.id,
        run: () => session.armPing(device.id),
      });
    }
    // In presentazione i comandi per costruire la rete non ci sono.
    if (!presenting) {
      actions.push({
        icon: "link",
        text: "Collega",
        label: `Collega ${device.name}: poi fai clic sull'altro dispositivo`,
        primary: true,
        active: session.linkFrom === device.id,
        run: () => session.armLink(device.id),
      });
    }
    // La tabella del dispositivo, da appuntare sul disegno: sempre in vista
    // per switch e router, nel menu per gli host.
    const table = device.kind === "host" ? "ARP" : device.kind === "switch" ? "MAC" : "routing";
    const pinned = session.isPinned(device.id);
    actions.push({
      icon: "table",
      text: `Tabella ${table}`,
      label: pinned
        ? `Togli la tabella ${table === "routing" ? "di routing" : table} di ${device.name} dal disegno`
        : `Appunta la tabella ${table === "routing" ? "di routing" : table} di ${device.name} sul disegno`,
      primary: device.kind !== "host",
      active: pinned,
      run: () => session.togglePin(device.id),
    });
    actions.push({
      icon: "power",
      text: device.powered ? "Spegni" : "Accendi",
      label: device.powered ? `Spegni ${device.name}` : `Accendi ${device.name}`,
      primary: false,
      run: () => session.togglePower(device.id),
    });
    if (!presenting) {
      actions.push(
        {
          icon: "duplicate",
          text: "Duplica",
          label: `Duplica ${device.name}: la copia nasce accanto, scollegata`,
          primary: false,
          run: () => session.duplicate(device.id),
        },
        {
          icon: "trash",
          text: "Elimina",
          label: `Elimina ${device.name}, con i suoi cavi`,
          primary: false,
          danger: true,
          run: () => session.removeSelection(),
        },
      );
    }
    // Sopra, il bordo della selezione; sotto, il nome e, per un host,
    // l'indirizzo (device-shape.ts; k in presentazione).
    const k = preferences.scale;
    const shape = preferences.shape;
    const half = (device.kind === "host" ? shape.hostHalfWidth : shape.otherHalfWidth) + shape.selectionMargin;
    const anchor = { x: device.x, top: device.y + shape.barTop * k, bottom: device.y + shape.barBottom * k, halfWidth: half * k };
    return { anchor, actions };
  }

  if (selection.kind === "link") {
    const link = session.view.links.find((l) => l.id === selection.id);
    if (link === undefined) return null;
    const x = (link.from.x + link.to.x) / 2;
    const y = (link.from.y + link.to.y) / 2;
    const actions: BarAction[] = [
      // Staccare è un guasto temporaneo: il cavo resta, e si riattacca.
      {
        icon: link.connected ? "unplug" : "replug",
        text: link.connected ? "Stacca" : "Riattacca",
        label: link.connected ? "Stacca il cavo: resta al suo posto, senza segnale" : "Riattacca il cavo",
        primary: true,
        run: () => session.toggleLink(link.id),
      },
    ];
    if (!presenting) {
      // Eliminare invece toglie il cavo dalla rete.
      actions.push({
        icon: "trash",
        text: "Elimina",
        label: "Elimina il cavo dalla rete",
        primary: true,
        danger: true,
        run: () => session.removeSelection(),
      });
    }
    return { anchor: { x, top: y - 10, bottom: y + 10 }, actions };
  }

  // Un riquadro o una nota (D-117): sulla barretta solo Elimina. Testo e
  // colore si cambiano nel pannello laterale. In presentazione non si
  // modificano: niente barretta.
  if (selection.kind === "annotation") {
    const annotation = session.annotation(selection.id);
    if (annotation === undefined || presenting) return null;
    const area = annotationRect(annotation, preferences.scale);
    const actions: BarAction[] = [
      {
        icon: "trash",
        text: "Elimina",
        label: annotation.kind === "box" ? "Elimina il riquadro dal disegno" : "Elimina la nota dal disegno",
        primary: true,
        danger: true,
        run: () => session.removeSelection(),
      },
    ];
    return { anchor: { x: area.x + area.width / 2, top: area.y, bottom: area.y + area.height }, actions };
  }
  return null;
}
