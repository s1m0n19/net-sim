// I colori dei due temi raggiungono i contrasti di WCAG 2.2 AA per le
// coppie che l'interfaccia usa davvero (D-115): 4,5:1 per il testo, 3:1
// per i segni grafici che servono a capire, come il bordo di un campo.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Il file si legge da disco: Vitest non elabora i CSS, e con ?raw darebbe
// una stringa vuota.
const tokens = readFileSync(new URL("../../src/ui/theme/tokens.css", import.meta.url), "utf8");

// I colori di un blocco di tokens.css, per nome.
function colorsOf(block: RegExp): Record<string, string> {
  const body = tokens.match(block)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

const THEMES = {
  chiaro: colorsOf(/:root \{([\s\S]*?)\n\}/),
  scuro: colorsOf(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/),
};

// Luminanza relativa e rapporto di contrasto, come li definisce WCAG.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// [testo o segno, sfondo, a che cosa serve, contrasto minimo]
const PAIRS: [string, string, string, number][] = [
  ["ink", "surface", "il testo", 4.5],
  ["muted", "surface", "il testo attenuato", 4.5],
  ["muted", "surface-2", "il testo attenuato negli eventi e nelle interfacce", 4.5],
  ["muted", "canvas", "le scritte attenuate del disegno e i segnaposto dei campi", 4.5],
  ["accent", "surface", "un pulsante acceso", 4.5],
  ["on-accent", "accent", "il testo dei pulsanti principali", 4.5],
  ["canvas", "arp", "la sigla ARP", 4.5],
  ["canvas", "icmp", "la sigla ICMP", 4.5],
  ["arp", "canvas", "la scritta ARP sul disegno", 4.5],
  ["icmp", "canvas", "la scritta ICMP sul disegno", 4.5],
  ["up", "surface", "«accesa»", 4.5],
  ["up", "surface-2", "«accesa» nel riquadro dell'interfaccia", 4.5],
  ["down", "surface", "gli errori e «spenta»", 4.5],
  ["down", "surface-2", "«spenta» nel riquadro dell'interfaccia", 4.5],
  ["field-border", "surface", "il bordo di un campo", 3],
  ["field-border", "canvas", "il bordo di un campo, sul suo fondo", 3],
  ["accent", "surface", "il contorno del fuoco da tastiera", 3],
  ...(["blue", "green", "yellow", "red", "purple"] as const).map(
    (color): [string, string, string, number] => [`annotation-${color}`, "canvas", `il bordo di un'annotazione ${color}`, 3],
  ),
];

describe("i contrasti dei colori", () => {
  for (const [theme, colors] of Object.entries(THEMES)) {
    test(`nel tema ${theme} ogni coppia raggiunge il minimo`, () => {
      for (const [fg, bg, use, min] of PAIRS) {
        expect(colors[fg], `--${fg} nel tema ${theme}`).toBeDefined();
        expect(colors[bg], `--${bg} nel tema ${theme}`).toBeDefined();
        expect(contrast(colors[fg], colors[bg]), `${use}: --${fg} su --${bg}`).toBeGreaterThanOrEqual(min);
      }
    });
  }

  test("il tema scuro scelto dal sistema e quello scelto con il pulsante hanno gli stessi colori", () => {
    const fromSystem = colorsOf(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n {2}\}/);
    expect(Object.keys(fromSystem).length).toBeGreaterThan(10);
    expect(fromSystem).toEqual(THEMES.scuro);
  });
});
