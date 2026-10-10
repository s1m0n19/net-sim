# Architettura

**Stato:** descrive il codice al 9 ottobre 2026. Le parti non ancora realizzate sono indicate come *previste*.

L'app è divisa in due parti che non si mescolano: un **motore di simulazione**, che contiene tutta la logica di rete, e un'**interfaccia**, che lo mostra e lo comanda. Il motore non sa di essere disegnato su uno schermo.

```
┌──────────────────────────────────────────────────────────┐
│ Interfaccia (Svelte)                                     │
│   oggi: una pagina provvisoria                           │
└──────────────┬───────────────────────────▲───────────────┘
               │ azioni dell'utente        │ tracce e stato
┌──────────────▼───────────────────────────┴───────────────┐
│ Motore di simulazione (TypeScript puro)                  │
│   Dispositivi    Protocolli            Coda degli eventi │
└──────────────────────────────────────────▲───────────────┘
                                           │ apri (salva: previsto)
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

1. L'interfaccia invia al motore un'**azione** con `Simulator.dispatch()`. Le azioni sono di tre tipi: traffico (`ping`, più `resolve-address` che serve solo ai test), guasti (staccare un cavo, spegnere un dispositivo) e modifiche alla rete.
2. L'interfaccia fa avanzare il tempo con `Simulator.step()`.
3. Entrambe le chiamate restituiscono le **tracce** di ciò che è successo: frame inviati, ricevuti e scartati, tabelle cambiate, pacchetti a cui un host ha rinunciato, esiti dei ping.
4. L'interfaccia legge lo stato del simulatore e lo copia in una propria variabile, che è ciò che la pagina disegna. Non osserva il simulatore e non ne modifica mai lo stato direttamente.

Anche le modifiche alla rete sono azioni: aggiungere un dispositivo, collegare due porte, cambiare un indirizzo. Oggi esistono nel motore, ma l'interfaccia non le usa ancora. Pannello grafico e CLI passeranno dalle stesse azioni, ed è questo che li terrà sincronizzati (requisito CFG-5).

## Struttura delle cartelle

```
net-sim/
├── SPEC.md                    requisiti, decisioni, stato di avanzamento
├── README.md                  come avviare e provare l'app
├── CLAUDE.md                  regole di lavoro per Claude Code
├── docs/                      questa documentazione
├── examples/                  reti di esempio: due-pc, lan-switch, anello-switch
├── src/
│   ├── main.ts                avvio della pagina
│   ├── engine/                motore di simulazione, senza dipendenze
│   │   ├── model/             addresses.ts, frames.ts, network.ts, ip-config.ts
│   │   ├── protocols/         arp.ts, ipv4.ts, icmp.ts
│   │   ├── devices/           host.ts, switch.ts
│   │   ├── simulator.ts       coda degli eventi, tempo, tracce
│   │   ├── editing.ts         modifiche alla rete: aggiungere, togliere, collegare, configurare
│   │   └── actions.ts         le azioni accettate dal motore
│   ├── storage/
│   │   └── load.ts            lettura dei file di rete
│   ├── shell/
│   │   └── windows.ts         prompt dei comandi degli host: da testo a comando, da risultato a testo
│   ├── storage/…              (più browser-files.ts: scelta di un file nel browser)
│   └── ui/                    la nuova interfaccia, descritta in interfaccia.md
│       ├── App.svelte         l'ossatura della schermata
│       ├── session.svelte.ts  la rete aperta: unico punto di contatto con il simulatore
│       ├── view.ts            prepara ciò che il disegno mostra
│       ├── preferences.svelte.ts  tema, etichette, pannelli aperti
│       ├── theme/             colori, caratteri, sagome dei dispositivi
│       ├── layout/  topology/  panels/  strip/  simulation/
│       └── provisional/       la pagina provvisoria, da cancellare
└── tests/
    ├── engine/                un file per argomento, più builders.ts con le reti di prova
    ├── shell/                 comandi del prompt e loro output
    ├── storage/               lettura dei file
    └── ui/                    preparazione del disegno e orologio del tempo reale
```

Cartelle *previste* e non ancora esistenti:

- In `src/shell/`, accanto al prompt degli host che esiste già, la CLI in stile IOS di switch e router (rilascio 2). Gli interpreti stanno fuori dal motore perché traducono testo in azioni: sono un secondo modo, accanto al pannello grafico, di comandare lo stesso motore.
- Scrittura dei file e migrazioni di versione in `src/storage/`.

## Convenzioni del codice

- **Un concetto, un file.** `arp.ts` contiene ARP e nient'altro. Se un file supera le 300 righe circa, probabilmente contiene due concetti.
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
| Configurazione | dispositivi, porte, collegamenti, indirizzi | nei dispositivi della rete (`Host`, `Switch`) | sì |
| Posizioni sul disegno | coordinate di ogni dispositivo | fuori dal motore, in `LoadedFile.positions` | sì |
| Stato di esecuzione | tabelle MAC e ARP, pacchetti in attesa, echo in sospeso, coda degli eventi, tempo | nei dispositivi e nel `Simulator` | oggi no. *Previsto* (D-25): le sole tabelle MAC e ARP, se chi salva lo chiede |
| Stato della vista | rete di esempio scelta, host e indirizzo del ping | in `App.svelte` | no |

`createHost` e `createSwitch` costruiscono un dispositivo "appena acceso": la configurazione data più lo stato di esecuzione iniziale. Li usano il lettore dei file e i test, così lo stato iniziale è definito in un solo punto.

*Previsto:* annulla e ripristina (requisito ED-5) agiranno solo sulla configurazione. La proposta è conservare una pila di copie della configurazione: è un oggetto piccolo, e una copia per ogni modifica è più semplice da capire di un meccanismo che inverte le singole operazioni.

## Cosa non è coperto da test

I test riguardano il motore, la lettura dei file e le due parti dell'interfaccia che non hanno bisogno di uno schermo: `view.ts`, che prepara il disegno, e `simulation/playback.ts`, l'orologio. I componenti a schermo non hanno test automatici: si verificano nel browser, a occhio o con uno screenshot. Non esiste un controllo automatico che esegua i test a ogni invio al repository.
