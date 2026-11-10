// Preferenze di chi guarda: tema, etichette visibili, pannelli aperti.
// Riguardano solo lo schermo: il motore non le conosce e non stanno nel file.

import { STRIP_HEIGHT } from "./layout/auto-open";
import { deviceShape, type DeviceShape } from "./topology/device-shape";

export type Theme = "light" | "dark";

const MAGNIFICATION_STEP = 0.2;

class Preferences {
  // null = segue l'impostazione del sistema.
  theme = $state<Theme | null>(null);

  // Che cosa è scritto sul disegno, oltre ai nomi dei dispositivi.
  labels = $state({ ip: true, mac: false, ports: false });

  paletteOpen = $state(true);
  sideOpen = $state(true);
  // La fascia parte chiusa: all'avvio il foglio è vuoto, e si apre da sola
  // al primo evento o terminale (D-107).
  stripOpen = $state(false);
  // L'altezza della fascia, che si cambia trascinandone il bordo.
  stripHeight = $state(STRIP_HEIGHT.initial);

  // Modalità presentazione: l'app proiettata in aula.
  presenting = $state(false);
  // Di quanto si ingrandisce tutto in presentazione; si regola dalla barra.
  magnification = $state(1.4);

  /** Il fattore di ingrandimento in uso: 1 fuori dalla presentazione. */
  get scale(): number {
    return this.presenting ? this.magnification : 1;
  }

  /**
   * Le misure dei dispositivi sul disegno: compatte nell'editor, più
   * grandi in presentazione (D-127). Vanno moltiplicate per `scale`.
   */
  get shape(): DeviceShape {
    return deviceShape(this.presenting);
  }

  /**
   * Aumenta o diminuisce l'ingrandimento della presentazione, a scatti,
   * tra 1 e 2.
   *
   * @param steps - quanti scatti: positivo ingrandisce, negativo rimpicciolisce
   */
  magnify(steps: number): void {
    const wanted = this.magnification + steps * MAGNIFICATION_STEP;
    this.magnification = Math.round(Math.min(2, Math.max(1, wanted)) * 10) / 10;
  }

  /** Il tema in uso in questo momento, tenendo conto del sistema. */
  currentTheme(): Theme {
    if (this.theme !== null) return this.theme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  /** Passa dal tema chiaro a quello scuro, o viceversa. */
  toggleTheme(): void {
    this.theme = this.currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = this.theme;
  }
}

export const preferences = new Preferences();
