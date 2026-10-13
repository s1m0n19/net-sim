// Dalla riga scritta al comando: si percorre l'albero una parola alla volta.
//
// Tre cose possono andare storte, e IOS le distingue:
//   - una parola che lì non può stare           % Invalid input detected at '^' marker.
//   - un'abbreviazione che vale per più parole  % Ambiguous command:  "..."
//   - una riga giusta, ma che non è finita      % Incomplete command.

import { isValidIp } from "../../engine/model/ip-config";
import type { Command, CommandNode, DeviceInfo } from "./grammar";
import { matchInterface } from "./interface-names";

// Una parola della riga, con la posizione a cui comincia: serve a mettere
// il segno `^` sotto il punto sbagliato.
export interface Word {
  text: string;
  start: number;
}

// Fin dove si è arrivati percorrendo l'albero.
export type Walk =
  | {
      ok: true;
      // L'ultimo nodo raggiunto; null se la riga non ha parole.
      node: CommandNode | null;
      // Le parole che possono seguire.
      next: CommandNode[];
      // Gli argomenti incontrati, nell'ordine in cui sono stati scritti.
      values: string[];
    }
  // Una parola che lì non può stare: `position` è il primo carattere sbagliato.
  | { ok: false; error: "invalid"; position: number }
  | { ok: false; error: "ambiguous" };

// Com'è andata la lettura di una riga intera.
export type Parsed =
  | { kind: "empty" }
  | { kind: "command"; command: Command }
  | { kind: "invalid"; position: number }
  | { kind: "ambiguous" }
  | { kind: "incomplete" };

/**
 * Divide una riga in parole, ricordando dove comincia ciascuna.
 *
 * @param line - la riga scritta dall'utente, senza il prompt
 */
export function splitWords(line: string): Word[] {
  return [...line.matchAll(/\S+/g)].map((match) => ({ text: match[0], start: match.index }));
}

/**
 * Tiene, di un elenco di nodi, quelli che esistono su un dispositivo: via
 * quelli riservati all'altro tipo, e via le parole chiave rimaste senza
 * nulla che possa seguirle.
 *
 * @param nodes - i nodi tra cui scegliere
 * @param device - il dispositivo su cui gira la CLI
 */
export function visible(nodes: CommandNode[], device: DeviceInfo): CommandNode[] {
  return nodes.filter((node) => {
    if (node.only !== undefined && node.only !== device.kind) return false;
    return node.command !== undefined || visible(node.next, device).length > 0;
  });
}

/**
 * Percorre l'albero dei comandi seguendo le parole date.
 *
 * Una parola chiave si può abbreviare, purché l'abbreviazione valga per
 * una parola sola; scritta per intero vince sempre.
 *
 * @param roots - le parole con cui una riga può cominciare, in questa modalità
 * @param words - le parole scritte
 * @param device - il dispositivo su cui gira la CLI
 * @returns il punto raggiunto, oppure il primo errore incontrato
 */
export function walk(roots: CommandNode[], words: Word[], device: DeviceInfo): Walk {
  let node: CommandNode | null = null;
  let next = visible(roots, device);
  const values: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const typed = word.text.toLowerCase();

    // 1. Le parole chiave che cominciano così.
    const keywords = next.filter((n) => n.token.kind === "keyword" && n.token.word.startsWith(typed));
    const exact = keywords.find((n) => n.token.kind === "keyword" && n.token.word === typed);
    if (exact === undefined && keywords.length > 1) return { ok: false, error: "ambiguous" };
    const found: CommandNode | undefined = exact ?? keywords[0];
    if (found !== undefined) {
      node = found;
      next = visible(found.next, device);
      continue;
    }

    // 2. Un argomento: un indirizzo, un'interfaccia, un testo.
    if (next.some((n) => n.token.kind === "address") && isValidIp(word.text)) {
      node = next.find((n) => n.token.kind === "address")!;
      values.push(word.text);
      next = visible(node.next, device);
      continue;
    }
    const interfaceNode = next.find((n) => n.token.kind === "interface");
    if (interfaceNode !== undefined) {
      // "gigabitEthernet 0/0": il tipo e il numero possono essere staccati.
      const number = /^[a-z]+$/i.test(word.text) ? words[i + 1] : undefined;
      const match = matchInterface(word.text + (number?.text ?? ""), device.interfaces);
      if (!match.ok) {
        const inNumber = number !== undefined && match.offset >= word.text.length;
        return { ok: false, error: "invalid", position: inNumber ? number.start : word.start + match.offset };
      }
      if (number !== undefined) i++;
      node = interfaceNode;
      values.push(match.name);
      next = visible(node.next, device);
      continue;
    }
    const wordNode = next.find((n) => n.token.kind === "word");
    if (wordNode !== undefined) {
      node = wordNode;
      values.push(word.text);
      next = visible(node.next, device);
      continue;
    }

    // 3. Nulla da fare: il segno va sotto il primo carattere che non
    // corrisponde a nessuna delle parole possibili.
    return { ok: false, error: "invalid", position: word.start + sharedStart(typed, next) };
  }
  return { ok: true, node, next, values };
}

/**
 * Capisce una riga intera.
 *
 * @param roots - le parole con cui una riga può cominciare, in questa modalità
 * @param line - la riga scritta dall'utente, senza il prompt
 * @param device - il dispositivo su cui gira la CLI
 * @returns il comando, oppure che cosa non va
 */
export function parseLine(roots: CommandNode[], line: string, device: DeviceInfo): Parsed {
  const words = splitWords(line);
  if (words.length === 0) return { kind: "empty" };

  const reached = walk(roots, words, device);
  if (!reached.ok) {
    return reached.error === "ambiguous" ? { kind: "ambiguous" } : { kind: "invalid", position: reached.position };
  }
  if (reached.node?.command === undefined) return { kind: "incomplete" };
  return { kind: "command", command: reached.node.command(reached.values) };
}

// Quanti caratteri iniziali di una parola scritta coincidono con l'inizio
// di almeno una delle parole chiave possibili: "shw" contro "show" dà 2.
function sharedStart(typed: string, candidates: CommandNode[]): number {
  let longest = 0;
  for (const candidate of candidates) {
    if (candidate.token.kind !== "keyword") continue;
    let length = 0;
    while (length < typed.length && typed[length] === candidate.token.word[length]) length++;
    longest = Math.max(longest, length);
  }
  return longest;
}
