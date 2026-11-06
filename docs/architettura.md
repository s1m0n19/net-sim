# Architettura

**Stato:** descrive il codice al 23 ottobre 2026. Le parti non ancora realizzate sono indicate come *previste*.

L'app è divisa in due parti che non si mescolano: un **motore di simulazione**, che contiene tutta la logica di rete, e un'**interfaccia**, che lo mostra e lo comanda. Il motore non sa di essere disegnato su uno schermo.

```
┌──────────────────────────────────────────────────────────┐
│ Interfaccia (Svelte)                                     │
│   Topologia      Pannelli              Terminali         │
└──────────────┬───────────────────────────▲───────────────┘
               │ azioni dell'utente        │ tracce e stato
┌──────────────▼───────────────────────────┴───────────────┐
│ Motore di simulazione (TypeScript puro)                  │
│   Dispositivi    Protocolli            Coda degli eventi │
└──────────────────────────────────────────▲───────────────┘
                                           │ apri e salva          
          ┌────────────────────────────────┴────┐
          │ File della rete (JSON)              │
          └─────────────────────────────────────┘
```

Questa separazione serve a tre cose:

- **Leggibilità.** Chi studia ARP apre un file che parla solo di ARP, senza codice grafico in mezzo (requisito NF-5).
- **Verificabilità.** Il motore si prova con test automatici, senza aprire il browser (NF-6).
- **Sostituibilità.** Stile grafico e disposizione dei pannelli possono cambiare senza toccare la logica (NF-7).

## Tecnologie

| Parte | Scelta | Motivo |
| --- | --- | --- |
| Linguaggio | TypeScript 6 | I tipi descrivono in modo esplicito frame, pacchetti e tabelle. La versione 7 non è ancora supportata da `svelte-check` |
| Motore | TypeScript senza librerie esterne | È la parte da leggere in classe: nulla da imparare oltre al linguaggio |
| Interfaccia | Svelte 5 | I componenti somigliano a HTML, CSS e JavaScript, già noti agli studenti |
| Topologia | SVG | Nitido a qualsiasi zoom; adeguato ai 50 dispositivi previsti |
| Costruzione | Vite | Produce un sito statico |
| Test | Vitest | Stessa configurazione di Vite |
| Offline | *Previsto* (rilascio 2): service worker generato da `vite-plugin-pwa` | Renderà il sito installabile e utilizzabile senza rete |

## Regola di dipendenza

Il motore non importa mai nulla dall'interfaccia, dal browser o da Svelte. L'interfaccia importa dal motore.

In pratica, dentro `src/engine/` sono vietati `document`, `window`, `setTimeout`, `Date.now()` e `Math.random()`. Il tempo è quello simulato, gestito dal simulatore. Ne deriva che la simulazione è **deterministica**: la stessa rete con le stesse azioni produce sempre gli stessi eventi, nello stesso ordine. I test sono ripetibili e una lezione preparata a casa si svolge in aula allo stesso modo.

## Come comunicano le due parti

1. L'interfaccia invia al motore un'**azione** con `Simulator.dispatch()`. Le azioni sono di tre tipi: traffico (`ping` e `tracert`, più `resolve-address` che serve solo ai test), guasti (staccare un cavo, spegnere un dispositivo) e modifiche alla rete.
2. L'interfaccia fa avanzare il tempo con `Simulator.step()`.
3. Entrambe le chiamate restituiscono le **tracce** di ciò che è successo: frame inviati, ricevuti e scartati, tabelle cambiate, pacchetti a cui un host ha rinunciato, esiti dei ping.
4. L'interfaccia legge lo stato del simulatore e lo copia in una propria variabile, che è ciò che la pagina disegna. Non osserva il simulatore e non ne modifica mai lo stato direttamente.

Anche le modifiche alla rete sono azioni: aggiungere un dispositivo, collegare due porte, cambiare un indirizzo. L'interfaccia le usa per posare, collegare, rinominare, configurare ed eliminare. Pannello grafico e CLI passano dalle stesse azioni, ed è questo che li tiene sincronizzati (requisito CFG-5).

## Struttura delle cartelle

```
net-sim/
├── SPEC.md                    requisiti, decisioni, stato di avanzamento
├── README.md                  come avviare e provare l'app
├── CLAUDE.md                  regole di lavoro per Claude Code
├── wrangler.jsonc             come Cloudflare pubblica il sito e le anteprime (D-99)
├── docs/                      questa documentazione
├── examples/                  reti di esempio: due-pc, lan-switch, anello-switch, due-lan-router, tre-reti-due-router
├── src/
│   ├── main.ts                avvio della pagina
│   ├── engine/                motore di simulazione, senza dipendenze
│   │   ├── model/             addresses.ts, frames.ts, network.ts, ip-config.ts, router-config.ts, tables.ts
│   │   ├── protocols/         arp.ts, ipv4.ts, icmp.ts, routing.ts
│   │   ├── devices/           host.ts (con host-output, host-sending, host-ping), switch.ts,
│   │   │                      router.ts (con router-sending, router-ping), echo-series.ts
│   │   ├── launching.ts       che cosa fa un dispositivo quando gli si chiede un ping o un tracert
│   │   ├── simulator.ts       coda degli eventi, tempo, azioni
│   │   ├── delivery.ts        consegna di un frame a host, switch e router; attese scadute
│   │   ├── events.ts          ciò che sta in coda: arrivi di frame e scadenze
│   │   ├── traces.ts          le tracce: la registrazione di ciò che è successo
│   │   ├── faults.ts          guasti e segnale: cavo staccato, dispositivo spento
│   │   ├── storm.ts           come si riconosce una tempesta di broadcast
│   │   ├── editing.ts         modifiche alla rete: aggiungere, togliere, collegare, configurare
│   │   ├── duplicating.ts     duplicare un dispositivo, con l'indirizzo libero successivo
│   │   ├── port-editing.ts    accendere e spegnere una porta di switch o un'interfaccia di router
│   │   ├── router-editing.ts  modifiche a un router: indirizzi delle interfacce e rotte statiche
│   │   ├── network-changes.ts le stesse modifiche a simulazione in corso
│   │   ├── snapshot.ts        fotografia della configurazione, per annullare e ripristinare
│   │   └── actions.ts         le azioni accettate dal motore
│   ├── storage/
│   │   ├── load.ts            lettura dei file di rete
│   │   ├── save.ts            scrittura dei file di rete
│   │   ├── tables-file.ts     le tabelle ARP e MAC nel file, da leggere e da scrivere
│   │   ├── annotations-file.ts riquadri e note del disegno: il tipo, e come stanno nel file
│   │   ├── fields.ts          i controlli sui singoli campi di un file
│   │   ├── migrations.ts      le versioni del formato, e il passaggio dall'una all'altra
│   │   └── browser-files.ts   scelta, lettura e scrittura di un file nel browser
│   ├── shell/
│   │   ├── windows.ts         prompt dei comandi degli host: da testo a comando, da risultato a testo
│   │   └── ios/               la CLI in stile IOS di router e switch (vedi cli.md)
│   │       ├── modes.ts           le modalità e i loro prompt
│   │       ├── grammar.ts         di che cosa è fatto un comando: parole chiave, argomenti, albero
│   │       ├── commands.ts        l'albero dei comandi, scritto come dati
│   │       ├── interface-names.ts nomi delle interfacce: brevi, per esteso, abbreviati
│   │       ├── parser.ts          dalla riga al comando: abbreviazioni ed errori
│   │       ├── help.ts            il punto interrogativo e il tasto Tab
│   │       ├── interpreter.ts     il punto d'ingresso: riga e modalità in entrata, esito in uscita
│   │       ├── configure.ts       dai comandi di configurazione alle azioni del motore, con i rifiuti di IOS
│   │       ├── show.ts            i comandi show: configurazione e tabelle, scritte come le scrive IOS
│   │       └── ping.ts            ping e traceroute dal router: dagli esiti al testo
│   └── ui/                    l'interfaccia, descritta in interfaccia.md
│       ├── App.svelte         l'ossatura della schermata
│       ├── session.svelte.ts  la rete aperta: unico punto di contatto con il simulatore;
│       │                      è fatta di otto strati (session-core, -file, -demo, -history,
│       │                      -editing, -annotations, -router, -cli)
│       ├── view.ts            prepara ciò che il disegno mostra (tipi in view-types.ts,
│       │                      testo degli eventi in event-text.ts)
│       ├── presentation.ts    modalità presentazione e scorciatoie
│       ├── preferences.svelte.ts  tema, etichette, pannelli aperti
│       ├── theme/             colori, caratteri, sagome dei dispositivi
│       └── layout/  topology/  panels/  strip/  simulation/
└── tests/
    ├── engine/                un file per argomento, più builders.ts con le reti di prova
    ├── shell/                 comandi del prompt e loro output
    ├── storage/               lettura e scrittura dei file
    ├── ui/                    logica dell'interfaccia: disegno, orologio, modifiche, cronologia
    └── e2e/                   la pagina intera in un browser vero (Playwright)
```

Gli interpreti di `src/shell/` stanno fuori dal motore perché traducono testo in azioni: sono un secondo modo, accanto al pannello grafico, di comandare lo stesso motore. Non eseguono nulla da sé: propongono l'azione a chi li chiama, cioè a `session`. La CLI è descritta in [cli.md](cli.md).


## Convenzioni del codice

- **Un concetto, un file.** `arp.ts` contiene ARP e nient'altro. Se un file supera le 300 righe circa, probabilmente contiene due concetti. L'11 ottobre 2026 i quattro file che le superavano sono stati divisi, e il 13 ottobre anche `devices/host.ts`, `simulator.ts` (la consegna è passata in `delivery.ts`), `editing.ts` e `session-editing.svelte.ts` (le parti sui router sono passate in `router-editing.ts` e `session-router.svelte.ts`). Il 21 ottobre la sessione è passata da cinque a sette strati (D-105): il file è uscito da `session-core.svelte.ts` in `session-file.svelte.ts`, la cronologia da `session-editing.svelte.ts` in `session-history.svelte.ts`. Il 22 ottobre le annotazioni hanno avuto l'ottavo, `session-annotations.svelte.ts`. Restano poco sopra le 300 righe `shell/windows.ts`, `engine/model/network.ts`, `engine/actions.ts`, `panels/SidePanel.svelte` e `session-demo.svelte.ts`.
- **I nomi seguono la teoria.** Un campo si chiama come sul libro di testo e negli standard: `ttl`, `etherType`, `senderMac`.
- **Identificatori in inglese, commenti e messaggi in italiano.** I nomi dei protocolli e dei loro campi sono in inglese ovunque, e mescolare le due lingue negli identificatori produce nomi goffi. I commenti spiegano il perché in italiano e rimandano al concetto di teoria. È la decisione D-15.
- **Funzioni pure dove possibile.** Una funzione che decide ("dato questo frame e questa tabella MAC, su quali porte lo inoltro?") non modifica nulla e restituisce la risposta. Si legge e si prova da sola. Esempi: `chooseOutputPorts`, `nextHopFor`, `sameNetwork`.
- **I dispositivi non spediscono e non misurano il tempo.** Restituiscono un elenco di cose da fare (frame da inviare, attese da avviare o annullare, esiti) e il simulatore le esegue.
- **Niente scorciatoie intelligenti.** Tra una soluzione breve e una ovvia, si sceglie quella ovvia.
- **Ogni funzione pubblica ha una docstring**: cosa fa, parametri, valore restituito, eccezioni.
- **Ogni comportamento ha un test**, scritto come una piccola storia: costruisco la rete, faccio l'azione, controllo cosa è successo. I nomi dei test sono affermazioni in italiano e si leggono come un elenco di regole. I dispositivi dei test si creano con `createHost` e `createSwitch`, le reti con `tests/engine/builders.ts`.

## Le tre parti dello stato

| Parte | Esempi | Dove sta oggi | Nel file |
| --- | --- | --- | --- |
| Configurazione | dispositivi, porte, collegamenti, indirizzi, rotte statiche | nei dispositivi della rete (`Host`, `Switch`, `Router`) | sì |
| Disegno | coordinate di ogni dispositivo; riquadri e note (annotazioni) | fuori dal motore, in `LoadedFile.positions` e `LoadedFile.annotations` | sì |
| Stato di esecuzione | tabelle MAC e ARP, pacchetti in attesa, echo in sospeso, coda degli eventi, tempo | nei dispositivi e nel `Simulator`, che tiene anche le tabelle di partenza (la tabella di routing no: `routingTableOf` la calcola ogni volta da configurazione e segnale) | le sole tabelle MAC e ARP, se chi salva lo chiede (D-25, D-100); il resto mai |
| Stato della vista | selezione, tabelle appuntate, terminali aperti e modalità della CLI, filtro, inquadratura, cronologia per annullare; tema, etichette, pannelli aperti, presentazione | in `session` e in `preferences` (`src/ui/`) | no |

`createHost` e `createSwitch` costruiscono un dispositivo "appena acceso": la configurazione data più lo stato di esecuzione iniziale. Li usano il lettore dei file e i test, così lo stato iniziale è definito in un solo punto. Le tabelle di un file salvato con le tabelle non passano da lì: il lettore le restituisce a parte, e il simulatore le aggiunge come tabelle di partenza (`model/tables.ts`).

Annulla e ripristina (requisito ED-5) agiscono solo sulla configurazione e sulle posizioni. Prima di ogni modifica `session` fotografa la configurazione (`takeSnapshot`, in `src/engine/snapshot.ts`) e la mette su una pila insieme alle posizioni: è un oggetto piccolo, e una copia per ogni modifica è più semplice da capire di un meccanismo che inverte le singole operazioni. Annullare invia al motore l'azione `restore-configuration`, che calcola le modifiche tra la rete di adesso e la fotografia e le esegue una alla volta: la simulazione in corso viene trattata come per qualsiasi altra modifica (D-54).

## Cosa non è coperto da test

I test riguardano il motore, la lettura dei file e le parti dell'interfaccia che non hanno bisogno di uno schermo: `view.ts`, che prepara il disegno, `simulation/playback.ts`, l'orologio, e `session`, con modifiche, cronologia, terminali e CLI. I singoli componenti a schermo non hanno test propri. La pagina intera è provata da pochi percorsi eseguiti in un browser vero (decisione D-67), in `tests/e2e/`, con Playwright, sul sito costruito e non sul server di sviluppo:

| File | Percorso |
| --- | --- |
| `lezione.spec.ts` | La lezione del criterio di accettazione del rilascio 1, dall'apertura del file al salvataggio |
| `costruire.spec.ts` | Una rete costruita da zero con il mouse; spostare, annullare, eliminare |
| `file.spec.ts` | Salvare e riaprire, modifiche non salvate, file non valido |
| `vista.spec.ts` | Rotella, sfondo e Adatta; modalità presentazione; fascia, pannello e barra che seguono il loro contenuto |
| `barra.spec.ts` | La barra in alto: i menu Progetto e Visualizza con il mouse e con la tastiera, Salva e annulla, il tema, la presentazione, uno schermo da 1024×768 |
| `router.spec.ts` | Due LAN e un router costruiti con il mouse; le due metà della lezione del criterio di accettazione del rilascio 2: gateway, MAC e TTL attraverso un router, poi routing statico con tre reti e due router |
| `cli.spec.ts` | La lezione del criterio di accettazione della CLI: due router configurati da terminale, `show`, `ping` e `traceroute`, uno switch con una porta spenta |

Le finestre di Chrome per scegliere dove aprire e salvare non si possono comandare da un test: lì l'app viene provata con il ripiego che usa negli altri browser, cioè campo di tipo file e scaricamento. L'aspetto (colori, dimensioni, leggibilità) resta da guardare a occhio.

A ogni push GitHub Actions esegue test, controllo dei tipi e test della pagina (`.github/workflows/controlli.yml`) e segna l'esito sul commit. Non blocca nulla da solo, ma il sito delle classi si aggiorna solo portando un commit sul ramo `stabile`, e lo si fa dopo che i controlli su quel commit sono passati (D-99).
