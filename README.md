# net-sim

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle scuole superiori. È un'applicazione web: si apre nel browser, senza installazione, account o server.

Il nome è provvisorio.

## Stato

Il progetto è all'inizio. Oggi esiste solo uno **scheletro**: due PC collegati da un cavo e lo scambio ARP tra loro, da far avanzare un passo alla volta.

Mancano ancora switch, ping, editor della rete, salvataggio e grafica curata. Che cosa è previsto, e in che ordine, è scritto in [SPEC.md](SPEC.md).

## Requisiti

- [Node.js](https://nodejs.org/) 22.12 o successivo (anche 24 o 26), con npm.
- Un browser aggiornato (Chrome o Edge).

## Avvio

```sh
npm install
npm run dev
```

Poi si apre http://localhost:5173 nel browser.

## Cosa si può fare

La pagina carica la rete di esempio [examples/due-pc.netsim.json](examples/due-pc.netsim.json): PC1 (192.168.1.10) e PC2 (192.168.1.11) collegati direttamente.

| Pulsante | Effetto |
| --- | --- |
| **PC1 cerca il MAC di 192.168.1.11** | PC1 invia una richiesta ARP in broadcast |
| **Passo** | La rete avanza al prossimo istante in cui succede qualcosa. È disattivato quando non ci sono frame in viaggio |
| **Ricomincia** | Ricarica la rete di esempio, con le tabelle vuote |

Per vedere lo scambio completo: un clic sul primo pulsante, poi due clic su "Passo". Le tabelle ARP dei due PC passano da vuote a una riga ciascuna.

Sotto il disegno compaiono le tabelle ARP e l'elenco degli eventi, con il contenuto di ogni frame.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | Avvia il server di sviluppo su http://localhost:5173 |
| `npm test` | Esegue tutti i test una volta |
| `npx vitest` | Esegue i test e li ripete a ogni modifica |
| `npx vitest run tests/engine/arp.test.ts` | Esegue un solo file di test |
| `npm run check` | Controlla i tipi di TypeScript e dei componenti Svelte |
| `npm run build` | Produce il sito statico nella cartella `dist/` |

## Come è fatto

Il codice è diviso in due parti che non si mescolano:

- **`src/engine/`**: il motore di simulazione. Contiene tutta la logica di rete, in TypeScript puro, e non sa nulla della grafica.
- **`src/ui/`**: l'interfaccia, in Svelte. Mostra lo stato del motore e gli invia i comandi.

`src/storage/` legge i file delle reti. I test stanno in `tests/`.

Il motore è scritto per essere letto: un file per protocollo, nomi dei campi come sul libro di testo, commenti che spiegano il perché. Un buon punto di partenza è [src/engine/protocols/arp.ts](src/engine/protocols/arp.ts), seguito da [src/engine/devices/host.ts](src/engine/devices/host.ts).

## Documentazione

| Documento | Contenuto |
| --- | --- |
| [SPEC.md](SPEC.md) | Che cosa deve fare l'app: requisiti, piano di rilascio, decisioni |
| [docs/architettura.md](docs/architettura.md) | Tecnologie, parti dell'app, convenzioni del codice |
| [docs/motore.md](docs/motore.md) | Come funziona il motore di simulazione |
| [docs/formato-file.md](docs/formato-file.md) | Il formato dei file delle reti |
