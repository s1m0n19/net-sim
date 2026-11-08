// Esportare il disegno come immagine PNG (ED-8, D-104, D-119).
//
// L'immagine nasce dal disegno che c'è sullo schermo, così è uguale a ciò
// che si vede: si toglie per un momento la selezione, si copia il disegno
// scrivendo in ogni elemento i colori che avrebbe con il tema chiaro (anche
// se è acceso lo scuro), si tolgono le buste in viaggio e ciò che serve
// solo a lavorare (indicatori di attesa, elenco delle porte, maniglie), si
// mettono dentro i caratteri IBM Plex e la si disegna a doppia risoluzione.
// Il motore non c'entra: è soltanto una fotografia del disegno.

import { tick } from "svelte";
import { chooseImageTarget, writeImage } from "../../storage/browser-files";
import { session } from "../session.svelte";
import type { Bounds } from "../view";

/** Quanti pixel dell'immagine per unità del disegno: doppia risoluzione. */
export const EXPORT_SCALE = 2;

// I limiti di una tela che i browser riescono a creare: oltre, l'immagine
// verrebbe vuota o il browser rifiuterebbe di disegnarla. Sono larghi:
// una rete di 50 dispositivi resta lontanissima (D-119).
export const MAX_IMAGE_SIDE = 16384;
export const MAX_IMAGE_AREA = 64_000_000;

// Lo spazio lasciato attorno a ciò che il disegno contiene, in unità del disegno.
const FRAME_MARGIN = 32;

// Ciò che nell'immagine non va: le buste in viaggio, il cavo che si sta
// tirando, il riquadro che si sta disegnando, le maniglie, e gli elementi
// segnati dai componenti (indicatori di attesa, elenco delle porte).
const SKIPPED = ".packet, .rubber, .sketch, .handle, [data-export-skip]";

// Le proprietà dello stile che decidono come appare un elemento del
// disegno: vanno scritte nella copia, che fuori dalla pagina non ha i fogli
// di stile.
const STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant-numeric",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "paint-order",
  "white-space",
  "visibility",
];

/**
 * Il rettangolo del disegno che l'immagine mostra: tutto ciò che il disegno
 * contiene, scritte comprese, con un margine attorno, a coordinate intere.
 *
 * @param content - lo spazio occupato da ciò che il disegno contiene
 * @param margin - lo spazio da lasciare attorno, in unità del disegno
 */
export function exportFrame(content: Bounds, margin = FRAME_MARGIN): Bounds {
  const x = Math.floor(content.x - margin);
  const y = Math.floor(content.y - margin);
  return {
    x,
    y,
    width: Math.ceil(content.x + content.width + margin) - x,
    height: Math.ceil(content.y + content.height + margin) - y,
  };
}

/**
 * Quanti pixel dell'immagine per unità del disegno: due, la doppia
 * risoluzione, finché l'immagine resta entro i limiti di una tela; per un
 * disegno enorme (una nota lontanissima) quanto basta per restarci, con le
 * stesse proporzioni.
 *
 * @param frame - il rettangolo del disegno che l'immagine mostra
 */
export function exportScale(frame: Bounds): number {
  const bySide = MAX_IMAGE_SIDE / Math.max(frame.width, frame.height);
  const byArea = Math.sqrt(MAX_IMAGE_AREA / (frame.width * frame.height));
  return Math.min(EXPORT_SCALE, bySide, byArea);
}

/**
 * Il nome proposto per l'immagine: quello della rete, oppure «rete».
 *
 * @param fileName - il nome del file della rete, senza estensione, se c'è
 */
export function imageFileName(fileName: string | null): string {
  return `${fileName ?? "rete"}.png`;
}

/**
 * Esporta il disegno come immagine e la fa salvare all'utente.
 *
 * Va chiamata direttamente dal gesto dell'utente: prima di qualsiasi attesa
 * si apre la finestra per scegliere dove salvare, che il browser concede
 * solo in risposta a un gesto. Solo dopo la scelta si prepara l'immagine;
 * se l'utente annulla, non si prepara nulla.
 *
 * @returns il nome dell'immagine salvata, oppure null se non c'è nulla da
 *   esportare o se l'utente ha annullato
 * @throws l'errore del browser, se disegnare o salvare l'immagine non riesce
 */
export async function exportImage(): Promise<string | null> {
  const svg = document.querySelector<SVGSVGElement>('svg[aria-label="Topologia della rete"]');
  if (svg === null) return null;
  // La finestra di salvataggio si apre adesso, nel gesto dell'utente.
  const target = await chooseImageTarget(imageFileName(session.fileName));
  if (target === null) return null;

  // Nell'immagine non c'è nulla di selezionato o evidenziato: si toglie per
  // il tempo della fotografia, e poi si rimette com'era, anche se qualcosa
  // va storto.
  const selection = session.selection;
  const highlight = session.highlight;
  session.selection = null;
  session.highlight = null;
  let image: Blob;
  try {
    await tick();
    image = await drawImage(svg);
  } finally {
    session.selection = selection;
    session.highlight = highlight;
  }
  return writeImage(target, image);
}

// Disegna l'immagine del disegno: una copia con gli stili scritti dentro,
// senza ciò che non va esportato, misurata, con i caratteri e uno sfondo,
// poi in un'immagine a doppia risoluzione.
async function drawImage(svg: SVGSVGElement): Promise<Blob> {
  const { copy, background } = styledCopy(svg);
  for (const element of copy.querySelectorAll(SKIPPED)) element.remove();
  // I confini si misurano sulla copia già senza buste, menu e maniglie:
  // così non allargano l'immagine.
  const frame = exportFrame(measure(copy));

  const scale = exportScale(frame);
  const width = Math.max(1, Math.floor(frame.width * scale));
  const height = Math.max(1, Math.floor(frame.height * scale));
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("viewBox", `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.removeAttribute("style");
  copy.removeAttribute("class");

  // Lo sfondo del disegno, del tema chiaro, sotto a tutto.
  const backdrop = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  backdrop.setAttribute("x", String(frame.x));
  backdrop.setAttribute("y", String(frame.y));
  backdrop.setAttribute("width", String(frame.width));
  backdrop.setAttribute("height", String(frame.height));
  backdrop.setAttribute("fill", background);
  copy.insertBefore(backdrop, copy.firstChild);

  // Fuori dalla pagina i caratteri vanno messi dentro l'immagine.
  const fonts = document.createElementNS("http://www.w3.org/2000/svg", "style");
  fonts.textContent = await embeddedFonts();
  copy.insertBefore(fonts, copy.firstChild);

  return rasterize(new XMLSerializer().serializeToString(copy), width, height);
}

// Lo spazio occupato da ciò che una copia del disegno contiene. Una copia
// staccata dalla pagina non si può misurare (il browser risponde 0×0):
// la si mette per un istante in un contenitore invisibile, fuori dallo
// schermo e senza interazioni, e la si toglie subito, anche in caso di
// errore. Il disegno vero non si tocca.
function measure(copy: SVGSVGElement): Bounds {
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = "position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
  holder.appendChild(copy);
  document.body.appendChild(holder);
  try {
    const box = copy.getBBox();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } finally {
    holder.remove();
  }
}

// Copia il disegno e scrive in ogni elemento della copia lo stile che
// avrebbe con il tema chiaro. Il tema si cambia solo per il tempo della
// lettura degli stili, senza che lo schermo si ridisegni nel frattempo.
function styledCopy(svg: SVGSVGElement): { copy: SVGSVGElement; background: string } {
  const root = document.documentElement;
  const theme = root.getAttribute("data-theme");
  root.setAttribute("data-theme", "light");
  try {
    const copy = svg.cloneNode(true) as SVGSVGElement;
    // La copia non è il disegno: niente nome né ruolo, anche nell'istante
    // in cui sta nella pagina per essere misurata.
    copy.removeAttribute("aria-label");
    copy.removeAttribute("role");
    copy.removeAttribute("tabindex");
    const originals = [svg, ...svg.querySelectorAll("*")];
    const copies = [copy, ...copy.querySelectorAll("*")];
    originals.forEach((original, index) => {
      const style = getComputedStyle(original);
      const target = copies[index];
      if (style.display === "none") {
        target.setAttribute("data-export-skip", "");
        return;
      }
      const declarations = STYLE_PROPERTIES.map((name) => `${name}:${style.getPropertyValue(name)}`);
      target.setAttribute("style", declarations.join(";"));
    });
    return { copy, background: getComputedStyle(root).getPropertyValue("--canvas").trim() };
  } finally {
    if (theme === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }
}

// I caratteri IBM Plex della pagina, come regole @font-face con i file
// dentro: un'immagine non può caricare file esterni. Si preparano una volta.
let fontRules: Promise<string> | null = null;

function embeddedFonts(): Promise<string> {
  fontRules ??= collectFonts();
  return fontRules;
}

async function collectFonts(): Promise<string> {
  const faces: CSSFontFaceRule[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule && rule.style.getPropertyValue("font-family").includes("IBM Plex")) faces.push(rule);
    }
  }
  const rules = await Promise.all(
    faces.map(async (face) => {
      const source = /url\(["']?([^"')]+)["']?\)/.exec(face.style.getPropertyValue("src"))?.[1];
      if (source === undefined) return "";
      const base = face.parentStyleSheet?.href ?? location.href;
      const data = await asDataUrl(new URL(source, base).href);
      const property = (name: string) => face.style.getPropertyValue(name);
      const range = property("unicode-range");
      return (
        `@font-face{font-family:${property("font-family")};font-style:${property("font-style") || "normal"};` +
        `font-weight:${property("font-weight") || "400"};${range ? `unicode-range:${range};` : ""}src:url(${data});}`
      );
    }),
  );
  return rules.join("\n");
}

async function asDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Dall'SVG all'immagine PNG, attraverso un'immagine e una tela.
async function rasterize(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const picture = new Image();
    picture.src = url;
    await picture.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Il browser non sa disegnare l'immagine.");
    context.drawImage(picture, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob === null ? reject(new Error("Il browser non sa creare l'immagine.")) : resolve(blob)), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
