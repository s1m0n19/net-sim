# net-sim

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle scuole superiori. È un'applicazione web: si apre nel browser, senza installazione, account o server.

Il nome è provvisorio.

## Stato

Il progetto è in sviluppo. Oggi la parte che simula la rete funziona per una LAN: PC e switch, con ARP e ping, da far avanzare un passo alla volta.

Quello che si vede a schermo è invece una **pagina provvisoria**, fatta per osservare la simulazione: disegno essenziale, comandi con pulsanti e menu. Mancano ancora l'editor per costruire le reti, il salvataggio, il terminale dei PC, i guasti, l'avanzamento automatico del tempo e la grafica curata.

Che cosa è previsto, e a che punto è ogni parte, è scritto in [SPEC.md](SPEC.md), sezione 9.

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
| ***host* fa ping a *indirizzo* con *n* richieste** | Sceglie chi fa il ping, verso quale indirizzo IP e con quanti echo request (quattro, come su Windows, se non si cambia). L'indirizzo si sceglie dall'elenco o si scrive a mano |
| **Ping** | L'host scelto invia gli echo request, uno alla volta: il successivo parte quando il precedente si è concluso. Se non conosce il MAC della destinazione, prima parte da sola la richiesta ARP |
| **Passo** | La rete avanza al prossimo istante in cui succede qualcosa: l'arrivo di un frame o la scadenza di un'attesa. È disattivato quando non c'è più nulla in programma |
| **Ricomincia** | Ricarica la rete attuale, con le tabelle vuote |

Per vedere un ping nella LAN con switch conviene impostare una sola richiesta: "Ping", poi otto clic su "Passo". I primi quattro passi sono lo scambio ARP, gli altri quattro l'echo request e l'echo reply. Un secondo ping dura solo quattro passi, perché le tabelle sono già piene.

Con le quattro richieste di Windows lo stesso ping dura venti passi: otto per la prima, quattro per ciascuna delle altre tre.

Altre prove possibili scrivendo l'indirizzo a mano:

- `192.168.1.99`, che nessuno ha: la richiesta ARP resta senza risposta. Quando non viaggia più nulla, il passo successivo salta alla scadenza dell'attesa (20 tick): il PC rinuncia all'echo request, che finisce con "host di destinazione non raggiungibile". Con più richieste, ognuna ripete la richiesta ARP e aspetta altri 20 tick.
- `127.0.0.1`, oppure l'indirizzo del PC che fa il ping: il PC si risponde da solo, subito, e sul cavo non passa nulla.
- `10.0.0.5`, in un'altra rete: i PC di esempio non hanno un gateway, quindi non parte nulla e tutte le richieste finiscono subito con "trasmissione non riuscita".

Ogni echo request si conclude con un esito, scritto nell'elenco degli eventi come lo scriverebbe il comando `ping`:

| Esito | Significato |
| --- | --- |
| Risposta da *indirizzo* | È arrivato l'echo reply |
| Richiesta scaduta | L'echo request è partito, ma dopo 40 tick non è tornato nulla |
| Host di destinazione non raggiungibile | Il PC sapeva a chi consegnare il pacchetto sulla propria LAN (la destinazione o il gateway), ma quel dispositivo non ha risposto all'ARP |
| Trasmissione non riuscita | Il PC non sapeva a chi consegnarlo: non ha un indirizzo, oppure la destinazione è in un'altra rete e non c'è un gateway |

Sotto il disegno compaiono la tabella MAC dello switch, le tabelle ARP dei PC con gli eventuali pacchetti in attesa, e l'elenco degli eventi con il contenuto di ogni frame.

## Limiti noti

- **Venti clic per un ping completo.** Con le quattro richieste di Windows e senza avanzamento automatico, un ping nella LAN richiede venti passi. Per una dimostrazione conviene impostare una richiesta sola.
- **Un ciclo tra switch non si ferma.** Le reti di esempio non ne hanno; anche qui la correzione è decisa (sospensione con avviso), non ancora fatta.
- **Le reti sono solo quelle di esempio.** Per provarne un'altra bisogna modificare un file in `examples/`.
- **Non si può ancora provocare la "richiesta scaduta"** dalla pagina: serve un guasto, e i guasti non esistono ancora.

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

`src/storage/` legge i file delle reti. I test stanno in `tests/` e coprono il motore e la lettura dei file, non la pagina.

Il motore è scritto per essere letto: un file per protocollo, nomi dei campi come sul libro di testo, commenti che spiegano il perché. Un buon punto di partenza è [src/engine/protocols/arp.ts](src/engine/protocols/arp.ts), seguito da [src/engine/devices/host.ts](src/engine/devices/host.ts).

## Documentazione

| Documento | Contenuto |
| --- | --- |
| [SPEC.md](SPEC.md) | Che cosa deve fare l'app: requisiti, piano di rilascio, punti aperti, decisioni, stato di avanzamento |
| [docs/architettura.md](docs/architettura.md) | Tecnologie, parti dell'app, convenzioni del codice |
| [docs/motore.md](docs/motore.md) | Come funziona il motore di simulazione, dove semplifica la realtà, difetti noti |
| [docs/formato-file.md](docs/formato-file.md) | Il formato dei file delle reti |
