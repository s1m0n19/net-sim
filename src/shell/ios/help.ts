// L'aiuto della CLI: il punto interrogativo e il tasto Tab.
//
// `?` ha due usi, e la differenza la fa uno spazio:
//   sh?       quali parole cominciano con "sh"
//   show ?    che cosa può seguire "show", con una descrizione per ciascuna
//
// Tab completa la parola che si sta scrivendo, se ce n'è una sola possibile.

import { MAX_VLAN_ID } from "../../engine/model/vlans";
import { commandsFor } from "./commands";
import type { CommandNode, DeviceInfo } from "./grammar";
import { interfaceTypesOf } from "./interface-names";
import type { Mode } from "./modes";
import { splitWords, walk } from "./parser";

const UNRECOGNIZED = "% Unrecognized command";

/**
 * Risponde a un punto interrogativo.
 *
 * @param device - il dispositivo su cui gira la CLI
 * @param mode - la modalità in cui si trova la sessione
 * @param text - ciò che è scritto sulla riga prima del `?`
 * @returns le righe da mostrare: le parole possibili, oppure un messaggio
 *   se ciò che precede non è l'inizio di un comando
 */
export function helpFor(device: DeviceInfo, mode: Mode, text: string): string[] {
  const words = splitWords(text);
  // Senza spazio prima del `?`, l'ultima parola è ancora da finire.
  const unfinished = words.length > 0 && !/\s$/.test(text) ? words[words.length - 1].text.toLowerCase() : null;
  const reached = walk(commandsFor(mode), unfinished === null ? words : words.slice(0, -1), device);
  if (!reached.ok) {
    return [reached.error === "ambiguous" ? `% Ambiguous command:  "${text.trim()}"` : UNRECOGNIZED];
  }

  if (unfinished !== null) {
    // Le parole che cominciano così, una accanto all'altra.
    const keywords = startingWith(reached.next, unfinished);
    if (keywords.length > 0) return [keywords.join("  ")];
    // Nessuna: forse si sta scrivendo un argomento.
    const expected = describe(reached.next.filter((node) => node.token.kind !== "keyword"), device);
    return expected.length > 0 ? table(expected) : [UNRECOGNIZED];
  }

  const options = describe(reached.next, device);
  // <cr> ("carriage return", cioè Invio): la riga può anche finire qui.
  if (reached.node?.command !== undefined) options.push(["<cr>", ""]);
  return options.length > 0 ? table(options) : [UNRECOGNIZED];
}

/**
 * Completa la parola che si sta scrivendo, come fa il tasto Tab.
 *
 * @param device - il dispositivo su cui gira la CLI
 * @param mode - la modalità in cui si trova la sessione
 * @param text - ciò che è scritto sulla riga
 * Dove serve un'interfaccia completa il tipo, come IOS: `int gi` diventa
 * `int GigabitEthernet`, senza spazio, perché subito dopo va il numero.
 *
 * @returns la riga con l'ultima parola scritta per intero e uno spazio;
 *   la riga com'era, se le parole possibili sono più d'una o nessuna
 */
export function complete(device: DeviceInfo, mode: Mode, text: string): string {
  const words = splitWords(text);
  if (words.length === 0 || /\s$/.test(text)) return text;

  const last = words[words.length - 1];
  const reached = walk(commandsFor(mode), words.slice(0, -1), device);
  if (!reached.ok) return text;

  const typed = last.text.toLowerCase();
  const keywords = startingWith(reached.next, typed);
  if (keywords.length === 1) return `${text.slice(0, last.start)}${keywords[0]} `;

  // Nessuna parola chiave: forse si sta scrivendo il tipo di un'interfaccia.
  const wantsInterface = reached.next.some((node) => node.token.kind === "interface");
  if (keywords.length === 0 && wantsInterface && /^[a-z]+$/.test(typed)) {
    const types = interfaceTypesOf(device.interfaces).filter((type) => type.full.toLowerCase().startsWith(typed));
    if (types.length === 1) return `${text.slice(0, last.start)}${types[0].full}`;
  }
  return text;
}

// Le parole chiave, tra quelle possibili, che cominciano con il testo dato.
function startingWith(nodes: CommandNode[], typed: string): string[] {
  const words: string[] = [];
  for (const node of nodes) {
    if (node.token.kind === "keyword" && node.token.word.startsWith(typed)) words.push(node.token.word);
  }
  return words.sort();
}

// Per ogni nodo, come si chiama nell'aiuto e la sua descrizione, in
// ordine alfabetico.
function describe(nodes: CommandNode[], device: DeviceInfo): [string, string][] {
  const rows = nodes.flatMap((node): [string, string][] => {
    switch (node.token.kind) {
      case "keyword":
        return [[node.token.word, node.help]];
      case "address":
        return [["A.B.C.D", node.help]];
      case "word":
        return [["WORD", node.help]];
      case "vlan-id":
        return [[`<1-${MAX_VLAN_ID}>`, node.help]];
      case "interface":
        // Al posto di un'interfaccia si elencano i tipi che il dispositivo ha.
        return interfaceTypesOf(device.interfaces).map((type) => [type.full, type.help]);
    }
  });
  return rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// Due colonne: la parola e la descrizione, allineate.
function table(rows: [string, string][]): string[] {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, help]) => `  ${label.padEnd(width)}  ${help}`.trimEnd());
}
