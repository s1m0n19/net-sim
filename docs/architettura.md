# Architettura

**Stato:** proposta, precede il codice.

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
└──────────────┬───────────────────────────▲───────────────┘
               │ salva                     │ apri
          ┌────▼───────────────────────────┴────┐
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
| Linguaggio | TypeScript | I tipi descrivono in modo esplicito frame, pacchetti e tabelle |
| Motore | TypeScript senza librerie esterne | È la parte da leggere in classe: nulla da imparare oltre al linguaggio |
| Interfaccia | Svelte | I componenti somigliano a HTML, CSS e JavaScript, già noti agli studenti |
| Topologia | SVG | Nitido a qualsiasi zoom; adeguato ai 50 dispositivi previsti |
| Costruzione | Vite | Produce un sito statico |
| Offline | Service worker generato da `vite-plugin-pwa` | Rende il sito installabile e utilizzabile senza rete (rilascio 2) |
| Test | Vitest | Stessa configurazione di Vite |

## Regola di dipendenza

Il motore non importa mai nulla dall'interfaccia, dal browser o da Svelte. L'interfaccia importa dal motore.

In pratica, dentro `src/engine/` sono vietati `document`, `window`, `setTimeout`, `Date.now()` e `Math.random()`. Il tempo è quello simulato, gestito dal motore stesso. Ne deriva che la simulazione è **deterministica**: la stessa rete con le stesse azioni produce sempre gli stessi eventi, nello stesso ordine. I test sono ripetibili e una lezione preparata a casa si svolge in aula allo stesso modo.

## Come comunicano le due parti

1. L'interfaccia invia al motore un'**azione**: "aggiungi un PC", "collega queste due porte", "PC1 esegue un ping verso 192.168.1.11", "avanza di un evento".
2. Il motore aggiorna lo stato e restituisce le **tracce** di ciò che è successo: "il frame X ha lasciato la porta Fa0/1 di SW1", "PC2 ha aggiunto una riga alla tabella ARP".
3. L'interfaccia legge lo stato e le tracce e li disegna: anima il pacchetto, aggiorna la tabella, aggiunge una riga all'elenco degli eventi.

L'interfaccia non modifica mai lo stato della rete direttamente. Anche il pannello grafico e la CLI passano dalle stesse azioni, ed è questo a tenerli sincronizzati (requisito CFG-5).

## Struttura delle cartelle

```
net-sim/
├── SPEC.md
├── docs/
├── src/
│   ├── engine/                motore di simulazione, senza dipendenze
│   │   ├── model/             tipi di base: indirizzi, frame, pacchetti, rete
│   │   ├── protocols/         un file per protocollo: ethernet, arp, ipv4, icmp
│   │   ├── devices/           un file per dispositivo: host, switch, router
│   │   ├── simulator.ts       coda degli eventi e avanzamento del tempo
│   │   └── actions.ts         le azioni accettate dal motore
│   ├── shell/                 interpreti dei comandi: prompt Windows, CLI IOS
│   ├── storage/               lettura e scrittura dei file, migrazioni di versione
│   └── ui/                    interfaccia Svelte
│       ├── topology/          disegno e modifica della rete
│       ├── panels/            configurazione, tabelle, contenuto del pacchetto
│       ├── terminal/          terminale e CLI
│       └── theme/             icone e colori, in un solo punto
└── tests/
    └── engine/                uno scenario di prova per ogni comportamento
```

`shell/` sta fuori dal motore perché traduce testo in azioni: è un secondo modo, accanto al pannello grafico, di comandare lo stesso motore.

## Convenzioni del codice

- **Un concetto, un file.** `arp.ts` contiene ARP e nient'altro. Se un file supera le 300 righe circa, probabilmente contiene due concetti.
- **I nomi seguono la teoria.** Un campo si chiama come sul libro di testo e negli standard: `ttl`, `etherType`, `senderMac`.
- **Identificatori in inglese, commenti in italiano.** I nomi dei protocolli e dei loro campi sono in inglese ovunque, e mescolare le due lingue negli identificatori produce nomi goffi. I commenti spiegano il perché in italiano e rimandano al concetto di teoria. *Proposta da confermare.*
- **Funzioni pure dove possibile.** Una funzione che decide ("dato questo frame e questa tabella MAC, su quali porte lo inoltro?") non modifica nulla e restituisce la risposta. Si legge e si prova da sola.
- **Niente scorciatoie intelligenti.** Tra una soluzione breve e una ovvia, si sceglie quella ovvia.
- **Ogni comportamento ha un test** in `tests/engine/`, scritto come una piccola storia: costruisco la rete, faccio l'azione, controllo cosa è successo. I test fanno anche da esempi d'uso.

## Le tre parti dello stato

Lo stato si divide in tre parti con vita diversa:

| Parte | Esempi | Salvata nel file | Soggetta ad annulla |
| --- | --- | --- | --- |
| Configurazione | dispositivi, collegamenti, indirizzi, posizioni, annotazioni | sì | sì |
| Stato di esecuzione | tabelle MAC e ARP, pacchetti in viaggio, tempo simulato | no (proposta) | no |
| Stato della vista | zoom, dispositivo selezionato, filtri, modalità presentazione | solo inquadratura ed etichette visibili | no |

Annulla e ripristina (requisito ED-5) agiscono solo sulla configurazione. La proposta è conservare una pila di copie della configurazione: è un oggetto piccolo, e una copia per ogni modifica è più semplice da capire di un meccanismo che inverte le singole operazioni.
