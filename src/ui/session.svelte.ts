// La rete aperta in questo momento, e ciò che di lei va disegnato.
//
// È il punto di contatto tra l'interfaccia e il motore: i componenti
// leggono `session.view` e chiamano i metodi di `session`; nessuno di loro
// tocca il simulatore direttamente.
//
// La sessione è fatta di otto strati, uno sopra l'altro, ciascuno nel suo
// file; uno strato usa solo quelli sotto di sé. Tutti i metodi si chiamano
// allo stesso modo, su `session`:
//
//   session-core.svelte.ts     la rete aperta, la simulazione, la selezione
//                              e l'inquadratura
//   session-file.svelte.ts     il file: aprire, foglio nuovo, modifiche non
//                              salvate, salvare
//   session-demo.svelte.ts     guasti, ping col mouse, terminali, tabelle
//                              appuntate, filtro
//   session-history.svelte.ts  la cronologia, per annullare e ripristinare
//   session-editing.svelte.ts  le modifiche alla rete, e la griglia
//   session-annotations.svelte.ts  riquadri e note sul disegno
//   session-router.svelte.ts   interfacce e rotte statiche dei router
//   session-cli.svelte.ts      la CLI dei router e degli switch

import { SessionCli } from "./session-cli.svelte";

export { FILE_EXTENSION } from "./session-file.svelte";
export type { Pin, PinTable, Selection, Terminal, TerminalEntry } from "./session-types";

class Session extends SessionCli {}

export const session = new Session();
