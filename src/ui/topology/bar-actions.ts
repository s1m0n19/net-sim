// Che cosa offre la barretta delle azioni, a seconda di ciò che è
// selezionato. Tutto ciò che si può fare a un dispositivo o a un cavo sta
// qui: non esiste un menu nascosto.

import { preferences } from "../preferences.svelte";
import { session } from "../session.svelte";

export type ActionIcon = "power" | "ping" | "link" | "terminal" | "pin" | "unplug" | "replug" | "remove";

export interface BarAction {
  icon: ActionIcon;
  label: string;
  // Il pulsante resta premuto: l'azione aspetta un secondo clic altrove.
  active?: boolean;
  run: () => void;
}

// La barretta: dove sta sul disegno, e i suoi pulsanti.
export interface SelectionBar {
  x: number;
  y: number;
  actions: BarAction[];
}

/**
 * La barretta di ciò che è selezionato adesso.
 *
 * @returns posizione e pulsanti, oppure null se non c'è nulla di
 *   selezionato a cui si possa fare qualcosa, o se la simulazione è sospesa
 */
export function selectionBar(): SelectionBar | null {
  const selection = session.selection;
  if (selection === null || session.view.suspended) return null;

  if (selection.kind === "device") {
    const device = session.view.devices.find((d) => d.id === selection.id);
    if (device === undefined) return null;
    const actions: BarAction[] = [
      {
        icon: "power",
        label: device.powered ? `Spegni ${device.name}` : `Accendi ${device.name}`,
        run: () => session.togglePower(device.id),
      },
    ];
    if (device.kind === "host" && device.powered) {
      actions.push({
        icon: "ping",
        label: `Ping da ${device.name}: poi fai clic sulla destinazione`,
        active: session.pingFrom === device.id,
        run: () => session.armPing(device.id),
      });
    }
    // In presentazione i comandi per costruire la rete non ci sono.
    if (!preferences.presenting) {
      actions.push({
        icon: "link",
        label: `Collega ${device.name}: poi fai clic sull'altro dispositivo`,
        active: session.linkFrom === device.id,
        run: () => session.armLink(device.id),
      });
    }
    if (device.kind === "host") {
      actions.push({
        icon: "terminal",
        label: `Apri il terminale di ${device.name}`,
        run: () => {
          session.openTerminal(device.id);
          preferences.stripOpen = true;
        },
      });
    }
    const removeDevice: BarAction = {
      icon: "remove",
      label: `Elimina ${device.name}, con i suoi cavi`,
      run: () => session.removeSelection(),
    };
    const table = device.kind === "host" ? "ARP" : "MAC";
    actions.push({
      icon: "pin",
      label: session.isPinned(device.id)
        ? `Togli la tabella ${table} di ${device.name} dal disegno`
        : `Appunta la tabella ${table} di ${device.name} sul disegno`,
      active: session.isPinned(device.id),
      run: () => session.togglePin(device.id),
    });
    if (!preferences.presenting) actions.push(removeDevice);
    return { x: device.x, y: device.y - 42 * preferences.scale, actions };
  }

  if (selection.kind === "link") {
    const link = session.view.links.find((l) => l.id === selection.id);
    if (link === undefined) return null;
    return {
      x: (link.from.x + link.to.x) / 2,
      y: (link.from.y + link.to.y) / 2 - 16,
      actions: [
        {
          icon: link.connected ? "unplug" : "replug",
          label: link.connected ? "Stacca il cavo" : "Riattacca il cavo",
          run: () => session.toggleLink(link.id),
        },
        ...(preferences.presenting
          ? []
          : [{ icon: "remove" as const, label: "Elimina il cavo", run: () => session.removeSelection() }]),
      ],
    };
  }
  return null;
}
