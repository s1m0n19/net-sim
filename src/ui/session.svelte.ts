// La rete aperta in questo momento, e ciò che di lei va disegnato.
//
// È il punto di contatto tra l'interfaccia e il motore: i componenti
// leggono `session.view` e chiamano i metodi di `session`; nessuno di loro
// tocca il simulatore direttamente.
//
// La sessione è fatta di tre strati, uno sopra l'altro, ciascuno nel suo
// file. Tutti i metodi si chiamano allo stesso modo, su `session`:
//
//   session-core.svelte.ts     la rete aperta, la simulazione, il file,
//                              la selezione e l'inquadratura
//   session-demo.svelte.ts     guasti, ping col mouse, terminali, tabelle
//                              appuntate, filtro
//   session-editing.svelte.ts  le modifiche alla rete e la cronologia

import { SessionEditing } from "./session-editing.svelte";

export { FILE_EXTENSION } from "./session-core.svelte";
export type { Pin, PinTable, Selection, Terminal, TerminalEntry } from "./session-types";

class Session extends SessionEditing {}

export const session = new Session();
