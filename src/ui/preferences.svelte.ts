// Preferenze di chi guarda: tema, etichette visibili, pannelli aperti.
// Riguardano solo lo schermo: il motore non le conosce e non stanno nel file.

export type Theme = "light" | "dark";

class Preferences {
  // null = segue l'impostazione del sistema.
  theme = $state<Theme | null>(null);

  // Che cosa è scritto sul disegno, oltre ai nomi dei dispositivi.
  labels = $state({ ip: true, mac: false, ports: false });

  paletteOpen = $state(true);
  sideOpen = $state(true);
  stripOpen = $state(true);

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
