# net-sim

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle scuole superiori. È un'applicazione web: si apre nel browser, senza installazione, account o server.

Il nome è provvisorio.

## Stato

Il progetto è in sviluppo. La parte che simula la rete funziona per una LAN: PC e switch, con ARP, ping e guasti.

L'interfaccia è in costruzione: dei nove passaggi previsti ne sono fatti sei. Oggi apre una rete da file e permette di condurre una dimostrazione, con ping, tempo reale o passi, guasti, contenuto dei pacchetti, tabelle, elenco degli eventi e terminale dei PC. Manca ancora l'editor per costruire le reti, il salvataggio e la modalità presentazione.

Che cosa è previsto, e a che punto è ogni parte, è scritto in [SPEC.md](SPEC.md), sezione 9, e in [docs/interfaccia.md](docs/interfaccia.md).

## Requisiti

- [Node.js](https://nodejs.org/) 22.12 o successivo (anche 24 o 26), con npm.
- Un browser aggiornato (Chrome o Edge).

## Avvio

```sh
npm install
npm run dev
```

Poi si apre http://localhost:5173 nel browser.

## L'interfaccia

All'avvio mostra un foglio vuoto. Con **Apri** si sceglie un file di rete: quelli di esempio stanno nella cartella [examples/](examples/).

| Comando | Effetto |
| --- | --- |
| **Nuova** | Torna al foglio vuoto |
| **Apri** | Apre un file di rete. Se il file non è valido, una riga rossa dice che cosa non va |
| **Etichette: IP, MAC, Porte** | Accendono e spengono ciò che è scritto sul disegno. All'apertura è acceso solo l'indirizzo IP |
| **Tema** | Passa dal tema chiaro a quello scuro. All'apertura segue l'impostazione del computer |
| **Le tre frecce** | Chiudono e riaprono i pannelli: in fondo alla colonna dei dispositivi, nell'angolo in alto del pannello di destra, a destra nella riga delle schede in basso |

Sul disegno: un pallino verde a ogni capo di un cavo su cui passa il segnale; un cavo staccato è rosso, tratteggiato e con una croce; un dispositivo spento è grigio, con la scritta "spento".

Aperta una rete, in basso al centro del disegno compare la **barra della simulazione**:

| Comando | Effetto |
| --- | --- |
| **Ricomincia** | Riporta la rete allo stato di una appena accesa: tabelle vuote, nessun pacchetto, tempo a zero. Guasti e configurazione restano |
| **Avvia / Pausa** | Fa scorrere il tempo da solo, o lo ferma. Avviato, resta in ascolto: un ping lanciato dopo parte subito |
| **Passo** | Fa arrivare a destinazione i pacchetti in viaggio e si ferma. Disponibile a tempo fermo |
| **1×** | Cambia la velocità: 0,5×, 1×, 2×. A 1× un pacchetto impiega circa un secondo e mezzo a percorrere un cavo |

**Selezione.** Un clic su un dispositivo, un cavo o una busta lo seleziona: il pannello di destra ne mostra i dettagli, e accanto compare una barretta con le azioni. Un clic sullo sfondo, o il tasto Esc, toglie la selezione.

| Selezionato | Sulla barretta | Nel pannello di destra |
| --- | --- | --- |
| Un PC | Spegni o accendi · Ping · Terminale · Appunta la tabella | Configurazione IP, MAC, tabella ARP, pacchetti in attesa |
| Uno switch | Spegni o accendi · Appunta la tabella | Numero di porte, tabella MAC |
| Un cavo | Stacca o riattacca | I due capi e lo stato |
| Una busta | — | Il contenuto a strati annidati: Ethernet, poi ARP oppure IPv4 e ICMP |

**Ping.** Seleziona il PC di partenza, premi Ping sulla barretta (la freccia), poi fai clic sul dispositivo di destinazione. Parte un solo echo request. Esc rinuncia.

**Tabelle appuntate.** Il pulsante con la griglia, sulla barretta di un dispositivo, appunta la sua tabella sul disegno: resta visibile qualunque cosa sia selezionata, così si guarda la tabella MAC riempirsi mentre il pacchetto viaggia. Si trascina dove dà meno fastidio e si toglie con la crocetta. Una riga appena imparata si accende per un momento; una appena persa resta un attimo, barrata.

**Terminale.** Il pulsante `>_` sulla barretta di un PC apre il suo prompt dei comandi in una scheda della fascia in basso. Ogni PC ha la sua scheda, con la crocetta per chiuderla.

| Comando | Che cosa fa |
| --- | --- |
| `ipconfig` | Mostra la configurazione IP del PC |
| `ping 192.168.1.11` | Manda quattro echo request, come su Windows; `ping -n 1 192.168.1.11` ne manda uno |
| `arp -a` | Mostra la tabella ARP |
| `cls` | Pulisce lo schermo |
| `help` | Elenca i comandi |

I messaggi sono in inglese. L'output di `ping` cresce mentre la simulazione avanza, quindi dopo aver lanciato il comando serve Avvia o Passo. La durata è in tick, l'unità del tempo simulato. Freccia su e freccia giù richiamano i comandi già scritti.

**Eventi.** La fascia in basso elenca ciò che succede, una riga per fatto: tempo, dispositivo, sigla del protocollo, descrizione. L'ultima riga di un ping è il suo esito.

- Passando con il mouse su una riga, sul disegno si evidenziano con un contorno tratteggiato il dispositivo e la busta di cui parla.
- Un clic su una riga apre nel pannello di destra il pacchetto, o il dispositivo se la riga non riguarda un pacchetto.
- In cima, il **filtro**: "Conversazione" per seguire un solo ping tra quelli lanciati, e gli interruttori ARP e ICMP. Ciò che il filtro nasconde sparisce anche dal disegno.

I pacchetti sono buste colorate con la sigla sopra: ambra per ARP, viola per ICMP. Quando non viaggia nulla e un PC sta aspettando una risposta che non arriva, accanto a lui compare un anello con una clessidra che si svuota in due o tre secondi; poi il tempo salta alla scadenza.

Salva, annulla, Presenta e le voci della colonna si vedono ma non sono ancora attivi.

Durante lo sviluppo l'indirizzo può aprire un esempio e mettere la rete in una certa situazione. Nel sito pubblicato queste scorciatoie non esistono.

| Parametro | Effetto |
| --- | --- |
| `?esempio=lan-switch` | Apre `examples/lan-switch.netsim.json` |
| `&ping=PC1>192.168.1.11` | Lancia un ping; con `&richieste=4` manda quattro richieste |
| `&passi=3` | Avanza subito di tre istanti |
| `&avvia` | Fa scorrere il tempo |

## Limiti noti

- **Le reti non si possono ancora costruire né salvare.** Si aprono da file; per prepararne una nuova bisogna scrivere il JSON a mano, partendo da un esempio.
- **Un ping completo, a passi, richiede molti clic.** Con le quattro richieste di Windows sono venti. Con Avvia scorre da solo.

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
