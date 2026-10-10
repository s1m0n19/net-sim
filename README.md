# net-sim

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle scuole superiori. È un'applicazione web: si apre nel browser, senza installazione, account o server.

Il nome è provvisorio.

## Stato

Il progetto è in sviluppo. La parte che simula la rete funziona per una LAN: PC e switch, con ARP, ping e guasti.

L'interfaccia è in costruzione, e per ora ce ne sono due:

| Indirizzo | Che cos'è | Che cosa fa oggi |
| --- | --- | --- |
| http://localhost:5173 | La **nuova interfaccia**, al secondo passaggio di nove | Apre una rete da file, la disegna e mostra un ping che viaggia, in tempo reale o a passi |
| http://localhost:5173/#provvisoria | La **pagina provvisoria** di prima | Ciò che la nuova non ha ancora: guasti, tabelle MAC e ARP, elenco degli eventi |

La pagina provvisoria verrà cancellata quando la nuova interfaccia saprà fare le stesse cose. Che cosa è previsto, e a che punto è ogni parte, è scritto in [SPEC.md](SPEC.md), sezione 9, e in [docs/interfaccia.md](docs/interfaccia.md).

## Requisiti

- [Node.js](https://nodejs.org/) 22.12 o successivo (anche 24 o 26), con npm.
- Un browser aggiornato (Chrome o Edge).

## Avvio

```sh
npm install
npm run dev
```

Poi si apre http://localhost:5173 nel browser.

## La nuova interfaccia

All'avvio mostra un foglio vuoto. Con **Apri** si sceglie un file di rete: quelli di esempio stanno nella cartella [examples/](examples/).

| Comando | Effetto |
| --- | --- |
| **Nuova** | Torna al foglio vuoto |
| **Apri** | Apre un file di rete. Se il file non è valido, una riga rossa dice che cosa non va |
| **Etichette: IP, MAC, Porte** | Accendono e spengono ciò che è scritto sul disegno. All'apertura è acceso solo l'indirizzo IP |
| **Tema** | Passa dal tema chiaro a quello scuro. All'apertura segue l'impostazione del computer |
| **‹ chiudi**, a sinistra | Chiude la colonna dei dispositivi |
| **chiudi**, in basso a destra | Chiude la fascia in basso |

Sul disegno: un pallino verde a ogni capo di un cavo su cui passa il segnale; un cavo staccato è rosso, tratteggiato e con una croce; un dispositivo spento è grigio, con la scritta "spento".

Aperta una rete, in basso al centro del disegno compare la **barra della simulazione**:

| Comando | Effetto |
| --- | --- |
| **Ricomincia** | Riporta la rete allo stato di una appena accesa: tabelle vuote, nessun pacchetto, tempo a zero. Guasti e configurazione restano |
| **Avvia / Pausa** | Fa scorrere il tempo da solo, o lo ferma. Avviato, resta in ascolto: un ping lanciato dopo parte subito |
| **Passo** | Fa arrivare a destinazione i pacchetti in viaggio e si ferma. Disponibile a tempo fermo |
| **1×** | Cambia la velocità: 0,5×, 1×, 2×. A 1× un pacchetto impiega circa un secondo e mezzo a percorrere un cavo |

Per lanciare un ping c'è, nel pannello di destra, un **ping di prova** provvisorio: host di partenza, indirizzo, numero di richieste. Verrà sostituito dal pulsante Ping sul dispositivo.

I pacchetti sono buste colorate con la sigla sopra: ambra per ARP, viola per ICMP. Quando non viaggia nulla e un PC sta aspettando una risposta che non arriva, accanto a lui compare un anello con una clessidra che si svuota in due o tre secondi; poi il tempo salta alla scadenza.

Salva, annulla, Presenta e le voci della colonna si vedono ma non sono ancora attivi.

Durante lo sviluppo l'indirizzo può aprire un esempio e mettere la rete in una certa situazione. Nel sito pubblicato queste scorciatoie non esistono.

| Parametro | Effetto |
| --- | --- |
| `?esempio=lan-switch` | Apre `examples/lan-switch.netsim.json` |
| `&ping=PC1>192.168.1.11` | Lancia un ping; con `&richieste=4` manda quattro richieste |
| `&passi=3` | Avanza subito di tre istanti |
| `&avvia` | Fa scorrere il tempo |

## La pagina provvisoria

Sta all'indirizzo http://localhost:5173/#provvisoria.

La pagina offre tre reti di esempio, nella rete 192.168.1.0/24:

| Rete | Contenuto | File |
| --- | --- | --- |
| **LAN con switch** | Lo switch SW1 con PC1, PC2 e PC3 | [examples/lan-switch.netsim.json](examples/lan-switch.netsim.json) |
| **Due PC** | PC1 e PC2 collegati direttamente | [examples/due-pc.netsim.json](examples/due-pc.netsim.json) |
| **Tre switch ad anello** | SW1, SW2 e SW3 collegati in cerchio, con PC1 e PC2. Serve a vedere una tempesta di broadcast | [examples/anello-switch.netsim.json](examples/anello-switch.netsim.json) |

| Comando | Effetto |
| --- | --- |
| **Rete** | Sceglie la rete di esempio e la carica con le tabelle vuote |
| ***host* fa ping a *indirizzo* con *n* richieste** | Sceglie chi fa il ping, verso quale indirizzo IP e con quanti echo request (quattro, come su Windows, se non si cambia). L'indirizzo si sceglie dall'elenco o si scrive a mano |
| **Ping** | L'host scelto invia gli echo request, uno alla volta: il successivo parte quando il precedente si è concluso. Se non conosce il MAC della destinazione, prima parte da sola la richiesta ARP |
| **Passo** | La rete avanza al prossimo istante in cui succede qualcosa: l'arrivo di un frame o la scadenza di un'attesa. È disattivato quando non c'è più nulla in programma |
| **Ricomincia** | Ricarica la rete attuale, con le tabelle vuote e senza guasti |
| **Clic su un cavo** | Lo stacca o lo riattacca. Staccato diventa rosso e tratteggiato |
| **Clic su un dispositivo** | Lo spegne o lo accende. Spento diventa grigio |

Per vedere un ping nella LAN con switch conviene impostare una sola richiesta: "Ping", poi otto clic su "Passo". I primi quattro passi sono lo scambio ARP, gli altri quattro l'echo request e l'echo reply. Un secondo ping dura solo quattro passi, perché le tabelle sono già piene.

Con le quattro richieste di Windows lo stesso ping dura venti passi: otto per la prima, quattro per ciascuna delle altre tre.

Altre prove possibili scrivendo l'indirizzo a mano:

- `192.168.1.99`, che nessuno ha: la richiesta ARP resta senza risposta. Quando non viaggia più nulla, il passo successivo salta alla scadenza dell'attesa (20 tick): il PC rinuncia all'echo request, che finisce con "host di destinazione non raggiungibile". Con più richieste, ognuna ripete la richiesta ARP e aspetta altri 20 tick.
- `127.0.0.1`, oppure l'indirizzo del PC che fa il ping: il PC si risponde da solo, subito, e sul cavo non passa nulla.
- `10.0.0.5`, in un'altra rete: i PC di esempio non hanno un gateway, quindi non parte nulla e tutte le richieste finiscono subito con "trasmissione non riuscita".

### Guasti

Un PC che non sente il segnale sul cavo lo dice con la scritta "senza segnale": succede se il suo cavo è staccato o se il dispositivo all'altro capo è spento. Un dispositivo spento perde le sue tabelle e, riacceso, riparte da zero.

Tre prove nella LAN con switch, ciascuna con una richiesta sola e partendo da "Ricomincia":

| Prova | Esito del ping da PC1 a PC2 |
| --- | --- |
| Stacca il cavo di PC1, poi "Ping" | Trasmissione non riuscita, subito: PC1 non sente il segnale |
| Stacca il cavo di PC2, poi "Ping" | Host di destinazione non raggiungibile, dopo tre passi: nessuno risponde all'ARP |
| Fai un ping completo, poi stacca il cavo di PC2 e ripeti il ping | Richiesta scaduta: PC1 conosce ancora il MAC di PC2 e l'echo request parte, ma lo switch non sa più dove mandarlo |

Spegnendo lo switch, tutti e tre i PC restano senza segnale. Riaccendendolo, la sua tabella MAC è vuota, mentre i PC ricordano ancora le loro tabelle ARP.

### Tempesta di broadcast

Nella rete "Tre switch ad anello" non c'è spanning tree. Un ping da PC1 a PC2 fa partire una richiesta ARP in broadcast, che gli switch si passano in cerchio senza fine, nei due versi. Dopo dieci passi la simulazione si sospende e compare un avviso: c'è una tempesta di broadcast, causata da un ciclo tra switch. Da lì non si può proseguire: "Passo" e "Ping" sono disattivati, e si riparte con "Ricomincia".

Guardando la tabella MAC degli switch durante la tempesta si vede la riga di PC1 spostarsi da una porta all'altra.

### Esiti del ping

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
- **Nella pagina provvisoria le reti sono solo le tre di esempio.** Un file qualsiasi si apre dalla nuova interfaccia, che però non sa ancora simulare.

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
- **`src/ui/`**: l'interfaccia, in Svelte. Mostra lo stato del motore e gli invia i comandi. La pagina provvisoria sta in `src/ui/provisional/`.

`src/storage/` legge i file delle reti. I test stanno in `tests/` e coprono il motore, la lettura dei file e la preparazione del disegno, non i componenti a schermo.

Il motore è scritto per essere letto: un file per protocollo, nomi dei campi come sul libro di testo, commenti che spiegano il perché. Un buon punto di partenza è [src/engine/protocols/arp.ts](src/engine/protocols/arp.ts), seguito da [src/engine/devices/host.ts](src/engine/devices/host.ts).

## Documentazione

| Documento | Contenuto |
| --- | --- |
| [SPEC.md](SPEC.md) | Che cosa deve fare l'app: requisiti, piano di rilascio, punti aperti, decisioni, stato di avanzamento |
| [docs/architettura.md](docs/architettura.md) | Tecnologie, parti dell'app, convenzioni del codice |
| [docs/motore.md](docs/motore.md) | Come funziona il motore di simulazione, dove semplifica la realtà, difetti noti |
| [docs/formato-file.md](docs/formato-file.md) | Il formato dei file delle reti |
| [docs/interfaccia.md](docs/interfaccia.md) | L'interfaccia definitiva: progetto, stato e piano di costruzione |
