# net-sim

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle scuole superiori. È un'applicazione web: si apre nel browser, senza installazione, account o server.

Il nome è provvisorio.

**Provalo:** https://net-sim.simon-nucifora.workers.dev

## Stato

Il progetto è in sviluppo. La parte che simula la rete funziona per una LAN: PC e switch, con ARP, ping e guasti.

L'interfaccia del rilascio 1 è costruita: tutti e nove i passaggi previsti sono fatti, e resta da provarla in aula. Oggi apre e salva una rete su file e permette di condurre una dimostrazione, con ping, tempo reale o passi, guasti, contenuto dei pacchetti, tabelle, elenco degli eventi e terminale dei PC. L'editor è completo: si posano, si spostano, si collegano, si configurano e si eliminano i dispositivi, e ogni modifica si annulla. Con Presenta si proietta in aula.

Che cosa è previsto, e a che punto è ogni parte, è scritto in [SPEC.md](SPEC.md), sezione 9, e in [docs/interfaccia.md](docs/interfaccia.md).

## Pubblicazione

Il sito pubblico sta su Cloudflare, nel piano gratuito, ed è collegato a questo repository: **a ogni push sul ramo `main`** Cloudflare esegue `npm run build` e pubblica la cartella `dist/`. Non c'è altro da fare, e non esiste un comando per pubblicare a mano.

- La versione di Node usata per costruire è quella scritta in `.nvmrc`.
- Sul sito pubblicato le scorciatoie di sviluppo nell'indirizzo (`?esempio=` e simili) non esistono, e le reti di esempio non sono incluse: si aprono dal proprio computer con Apri.
- Le prove si fanno sempre in locale, con `npm run dev`: ciò che arriva su `main` è subito pubblico.

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

Il **router** (rilascio 2, in costruzione) si posa dalla colonna: passando su **Router** si sceglie tra 2, 4 e 8 interfacce. Nasce con le interfacce spente, come un Cisco: selezionalo e, nel pannello a destra, accendi ogni interfaccia con il suo interruttore e scrivi indirizzo e maschera. Un'interfaccia spenta si riconosce sul disegno da un quadratino rosso sul suo capo del cavo, e l'indirizzo di ogni interfaccia è scritto accanto al suo cavo, vicino al router.

- La maschera viene proposta dalla classe dell'indirizzo; per una maschera diversa scrivi il prefisso insieme all'indirizzo, per esempio `10.0.0.1/30`.
- Due interfacce dello stesso router non possono avere reti che si sovrappongono.
- Ai PC va dato come gateway l'indirizzo dell'interfaccia del router sulla loro rete.

A quel punto un ping da una LAN all'altra attraversa il router, con i MAC che cambiano e il TTL che scende di uno, e `tracert` mostra la strada. Quando non può consegnare un pacchetto il router avvisa il mittente, e `ping` lo stampa come su Windows (`Destination net unreachable`). Le **rotte statiche** si aggiungono dal pannello del router, sotto la tabella di routing: rete, maschera (anche come prefisso, `/24`) e prossimo salto, cioè l'indirizzo del router vicino. Una crocetta toglie una rotta. In tabella le reti collegate hanno la sigla C e le rotte statiche la S; una rotta il cui prossimo salto non è su una rete collegata resta in elenco ma è segnata «non usata».

La tabella di routing si appunta sul disegno dalla barretta del router, per tenerla in vista mentre i pacchetti viaggiano; dal pannello si appunta anche la tabella ARP.

Per provare: apri `examples/tre-reti-due-router.netsim.json`. Senza rotte un ping da PC1 a `192.168.2.10` riceve `Destination net unreachable`; aggiunta su R1 la rotta verso `192.168.2.0/24` via `10.0.0.2` la richiesta arriva ma la risposta si ferma su R2; aggiunta su R2 quella verso `192.168.1.0/24` via `10.0.0.1` il ping riesce, e `tracert` mostra i due router.

**Costruire.** Dalla colonna a sinistra si posano i dispositivi, in due modi:

- trascinando la voce **PC** sul disegno;
- con un clic sulla voce e poi un clic sul disegno per ogni dispositivo da posare. Esc per finire.

Passando su **Switch** si apre l'elenco delle varianti, a 8 o a 24 porte. I dispositivi prendono da soli un nome (PC1, PC2, SW1) e i loro indirizzi MAC. Un dispositivo si sposta trascinandolo, e si elimina con il cestino sulla sua barretta o con il tasto Canc.

Per collegare due dispositivi ci sono due modi:

- lo strumento **Cavo** della colonna: finché è acceso, trascinare da un dispositivo a un altro tira un cavo invece di spostare; in alternativa, un clic sul primo e uno sul secondo. Si spegne con Esc o con un altro clic sulla voce;
- il pulsante **Collega** sulla barretta di un dispositivo, seguito da un clic sull'altro.

Il cavo occupa su ciascun dispositivo la prima porta libera. Per cambiarla, fai clic sul nome della porta accanto al cavo e scegli dall'elenco, che mostra solo le porte libere. I nomi delle porte si vedono sul cavo selezionato, oppure su tutti accendendo l'etichetta **Porte**.

Selezionato un dispositivo, nel pannello a destra si cambiano il **nome** e, per un PC, **indirizzo IP**, **subnet mask** e **gateway**. Un campo ha effetto quando premi Invio o esci dal campo; Esc rimette il valore di prima.

- Scritto l'indirizzo su un PC senza maschera, la maschera viene proposta da sola: è quella della classe dell'indirizzo (255.255.255.0 per 192.168.1.10), come fa Windows. Si può cambiare.
- Un valore non accettabile, per esempio l'indirizzo di broadcast della sottorete o un nome già usato, segna il campo in rosso con il motivo sotto, e la rete conserva il valore di prima.
- Svuotare l'indirizzo toglie tutta la configurazione del PC.
- Cambiare la configurazione di un PC ne svuota la tabella ARP, come riavviare la scheda di rete.

**Muoversi sul disegno.** La rotella del mouse ingrandisce e rimpicciolisce attorno al puntatore; trascinando lo sfondo si sposta la vista. Nell'angolo in basso a destra del disegno ci sono **−**, **+** e **Adatta**, che inquadra tutta la rete. Un file appena aperto viene inquadrato per intero.

**Presentare.** **Presenta**, in alto a destra, prepara la schermata per il proiettore: spariscono la colonna dei dispositivi e i comandi di file, annulla, etichette ed eliminazione; testo, icone, buste e linee si ingrandiscono; la rete viene inquadrata per intero e la fascia in basso si chiude. Con **A−** e **A+** regoli l'ingrandimento dal 100% al 200%, guardando dal fondo dell'aula. Si esce con **Esci** o con Esc, e fascia e inquadratura tornano com'erano.

In presentazione la simulazione si comanda anche da tastiera:

| Tasto | Effetto |
| --- | --- |
| Spazio | Avvia o mette in pausa |
| Freccia destra | Un passo |
| E | Apre o chiude la scheda Eventi |
| T | Apre o chiude i terminali; se non ce ne sono, apre quello del PC selezionato |
| Esc | Esce dalla presentazione |

Guasti, ping, terminale, tabelle appuntate e modifica degli indirizzi dal pannello restano disponibili. Per lo schermo intero usa il comando del browser (F11).

**Salvare.** **Salva**, o Ctrl+S (Cmd+S su Mac), scrive la rete in un file `.netsim.json`: dispositivi, cavi, indirizzi, posizioni e guasti. Tabelle e pacchetti in viaggio non si salvano: una rete riaperta è una rete appena accesa.

- In Chrome ed Edge la prima volta scegli dove salvare; da lì in poi Salva aggiorna lo stesso file. Vale anche per un file aperto con Apri: il browser chiede una volta il permesso di scriverci.
- **Salva con nome**, o Ctrl+Maiusc+S, chiede sempre dove salvare e lascia intatto il file di partenza: da lì in poi Salva aggiorna il file nuovo.
- In Firefox e Safari ogni Salva scarica il file nella cartella dei download; Salva con nome chiede prima il nome.
- Accanto al nome compare «● modificata» finché ci sono modifiche non salvate. In quel caso **Nuova**, **Apri** e la chiusura della pagina chiedono conferma.

**Annulla e ripristina.** Le due frecce nella barra in alto, oppure Ctrl+Z e Ctrl+Maiusc+Z (anche Ctrl+Y; Cmd su Mac), annullano e rifanno le modifiche alla rete, una alla volta, fino a cento:

- sono modifiche: posare, spostare, collegare, cambiare porta, rinominare, configurare, eliminare;
- non lo sono i guasti (spegnere, staccare un cavo) né il traffico: annullare li salta e li lascia come sono;
- annullare non riavvia la simulazione. È come fare a mano la modifica contraria: un PC eliminato torna con nome, indirizzi e cavi, ma con la tabella ARP vuota, e gli altri dispositivi tengono le loro tabelle;
- aprire un file o premere Nuova svuota la cronologia.

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
| Un PC | Spegni o accendi · Ping · Terminale · Appunta la tabella · Elimina | Configurazione IP, MAC, tabella ARP, pacchetti in attesa |
| Uno switch | Spegni o accendi · Appunta la tabella · Elimina | Numero di porte, tabella MAC |
| Un cavo | Stacca o riattacca · Elimina | I due capi e lo stato |
| Una busta | — | Il contenuto a strati annidati: Ethernet, poi ARP oppure IPv4 e ICMP |

**Ping.** Seleziona il PC di partenza, premi Ping sulla barretta (la freccia), poi fai clic sul dispositivo di destinazione. Parte un solo echo request. Esc rinuncia.

**Tabelle appuntate.** Il pulsante con la griglia, sulla barretta di un dispositivo, appunta la sua tabella sul disegno: resta visibile qualunque cosa sia selezionata, così si guarda la tabella MAC riempirsi mentre il pacchetto viaggia. Si trascina dove dà meno fastidio e si toglie con la crocetta. Una riga appena imparata si accende per un momento; una appena persa resta un attimo, barrata.

**Terminale.** Il pulsante `>_` sulla barretta di un PC apre il suo prompt dei comandi in una scheda della fascia in basso. Ogni PC ha la sua scheda, con la crocetta per chiuderla.

| Comando | Che cosa fa |
| --- | --- |
| `ipconfig` | Mostra la configurazione IP del PC |
| `ping 192.168.1.11` | Manda quattro echo request, come su Windows; `ping -n 1 192.168.1.11` ne manda uno |
| `arp -a` | Mostra la tabella ARP |
| `tracert 192.168.2.10` | Mostra i router sulla strada, una riga per salto; con `-h 5` si ferma al quinto |
| `ping -i 6 172.16.0.1` | Come `ping`, ma il pacchetto parte con TTL 6: utile per mostrare un ciclo di routing |
| `cls` | Pulisce lo schermo |
| `help` | Elenca i comandi |

I messaggi sono in inglese. L'output di `ping` cresce mentre la simulazione avanza, quindi dopo aver lanciato il comando serve Avvia o Passo. La durata è in tick, l'unità del tempo simulato. Freccia su e freccia giù richiamano i comandi già scritti.

**Eventi.** La fascia in basso elenca ciò che succede, una riga per fatto: tempo, dispositivo, sigla del protocollo, descrizione. L'ultima riga di un ping è il suo esito.

- Passando con il mouse su una riga, sul disegno si evidenziano con un contorno tratteggiato il dispositivo e la busta di cui parla.
- Un clic su una riga apre nel pannello di destra il pacchetto, o il dispositivo se la riga non riguarda un pacchetto.
- In cima, il **filtro**: "Conversazione" per seguire un solo ping tra quelli lanciati, e gli interruttori ARP e ICMP. Ciò che il filtro nasconde sparisce anche dal disegno.

I pacchetti sono buste colorate con la sigla sopra: ambra per ARP, viola per ICMP. Quando non viaggia nulla e un PC sta aspettando una risposta che non arriva, accanto a lui compare un anello con una clessidra che si svuota in due o tre secondi; poi il tempo salta alla scadenza.

Le voci Router e Server della colonna si vedono ma non sono ancora attive.

Durante lo sviluppo l'indirizzo può aprire un esempio e mettere la rete in una certa situazione. Nel sito pubblicato queste scorciatoie non esistono.

| Parametro | Effetto |
| --- | --- |
| `?esempio=lan-switch` | Apre `examples/lan-switch.netsim.json` |
| `&ping=PC1>192.168.1.11` | Lancia un ping; con `&richieste=4` manda quattro richieste |
| `&passi=3` | Avanza subito di tre istanti |
| `&avvia` | Fa scorrere il tempo |

## Limiti noti

- **Attorno a un router le scritte a volte si sovrappongono.** Con più cavi vicini, in certe posizioni gli indirizzi delle interfacce e i nomi delle porte finiscono uno sull'altro. Basta spostare un dispositivo.
- **Salvare funziona al meglio in Chrome ed Edge.** Lì Salva scrive nel file scelto e poi sempre nello stesso; in Firefox e Safari ogni salvataggio scarica una copia nuova nella cartella dei download.
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
| `npm run test:e2e` | Costruisce il sito e ne prova i percorsi principali in un browser vero. La prima volta serve `npx playwright install chromium` |

## Come è fatto

Il codice è diviso in due parti che non si mescolano:

- **`src/engine/`**: il motore di simulazione. Contiene tutta la logica di rete, in TypeScript puro, e non sa nulla della grafica.
- **`src/ui/`**: l'interfaccia, in Svelte. Mostra lo stato del motore e gli invia i comandi.

`src/storage/` legge e scrive i file delle reti, e `src/shell/` interpreta i comandi del terminale. I test stanno in `tests/` e coprono il motore, i file, il terminale e la logica dell'interfaccia (modifiche, cronologia, inquadratura, presentazione), non i singoli componenti a schermo. La pagina intera è provata a parte, in un browser vero, dai test di `tests/e2e/`: tra questi c'è la lezione su ARP e ping eseguita dall'inizio alla fine. A ogni push GitHub esegue tutti i controlli e ne segna l'esito sul commit.

Il motore è scritto per essere letto: un file per protocollo, nomi dei campi come sul libro di testo, commenti che spiegano il perché. Un buon punto di partenza è [src/engine/protocols/arp.ts](src/engine/protocols/arp.ts), seguito da [src/engine/devices/host.ts](src/engine/devices/host.ts).

## Documentazione

| Documento | Contenuto |
| --- | --- |
| [SPEC.md](SPEC.md) | Che cosa deve fare l'app: requisiti, piano di rilascio, punti aperti, decisioni, stato di avanzamento |
| [docs/architettura.md](docs/architettura.md) | Tecnologie, parti dell'app, convenzioni del codice |
| [docs/motore.md](docs/motore.md) | Come funziona il motore di simulazione, dove semplifica la realtà, difetti noti |
| [docs/formato-file.md](docs/formato-file.md) | Il formato dei file delle reti |
| [docs/interfaccia.md](docs/interfaccia.md) | L'interfaccia definitiva: progetto, stato e piano di costruzione |
