# net-sim

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle scuole superiori. È un'applicazione web: si apre nel browser, senza installazione, account o server.

Il nome è provvisorio.

## Stato

Il progetto è all'inizio. Oggi esiste solo uno **scheletro**: PC e switch, con ARP e ping funzionanti, da far avanzare un passo alla volta.

Mancano ancora editor della rete, salvataggio, terminale e grafica curata. Un ping manda un solo echo request, e se resta senza risposta non scade. Che cosa è previsto, e in che ordine, è scritto in [SPEC.md](SPEC.md).

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

La pagina offre due reti di esempio, nella rete 192.168.1.0/24:

| Rete | Contenuto | File |
| --- | --- | --- |
| **LAN con switch** | Lo switch SW1 con PC1, PC2 e PC3 | [examples/lan-switch.netsim.json](examples/lan-switch.netsim.json) |
| **Due PC** | PC1 e PC2 collegati direttamente | [examples/due-pc.netsim.json](examples/due-pc.netsim.json) |

| Comando | Effetto |
| --- | --- |
| **Rete** | Sceglie la rete di esempio e la carica con le tabelle vuote |
| ***host* fa ping a *indirizzo*** | Sceglie chi fa il ping e verso quale indirizzo IP. L'indirizzo si sceglie dall'elenco o si scrive a mano |
| **Ping** | L'host scelto invia un echo request. Se non conosce il MAC della destinazione, prima parte da sola la richiesta ARP |
| **Passo** | La rete avanza al prossimo istante in cui succede qualcosa. È disattivato quando non ci sono frame in viaggio |
| **Ricomincia** | Ricarica la rete attuale, con le tabelle vuote |

Per vedere un ping completo nella LAN con switch: "Ping", poi otto clic su "Passo". I primi quattro passi sono lo scambio ARP, gli altri quattro l'echo request e l'echo reply. Un secondo ping dura solo quattro passi, perché le tabelle sono già piene.

Altre prove possibili scrivendo l'indirizzo a mano:

- `192.168.1.99`, che nessuno ha: la richiesta ARP resta senza risposta e l'echo request rimane in attesa.
- `10.0.0.5`, in un'altra rete: i PC di esempio non hanno un gateway, quindi non parte nulla.

Sotto il disegno compaiono la tabella MAC dello switch, le tabelle ARP dei PC con gli eventuali pacchetti in attesa, e l'elenco degli eventi con il contenuto di ogni frame.

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
