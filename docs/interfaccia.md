# Interfaccia

**Stato:** costruita e provata in aula a ottobre 2026, senza problemi; resta da provare una LIM con il dito. Descrive l'interfaccia decisa nell'intervista del 10 ottobre 2026 e realizzata nei nove passaggi del piano in fondo al documento, tutti fatti. Dove il codice si è scostato dal progetto iniziale, il documento descrive il codice.

Il riferimento visivo è il [bozzetto](https://claude.ai/artifact/LeV9qPUha1C4oQG8h765of), che mostra la schermata in cinque situazioni. È privato: lo apre solo chi lo ha creato o chi ha ricevuto l'accesso.

## Principi

- **Una sola schermata.** La topologia resta sempre visibile; nulla la copre con finestre.
- **Nessuna modalità.** Si costruisce e si osserva nello stesso posto: mentre i pacchetti viaggiano si può aggiungere un PC, cambiare un indirizzo, staccare un cavo.
- **Leggibile da lontano.** L'uso principale è la dimostrazione dalla cattedra.
- **Colore più un secondo segno.** Nessuna informazione è affidata al solo colore.
- **Sobria.** Aspetto da strumento di lavoro: l'attenzione va alla rete, non ai pannelli.

## Ossatura

```
+------------------------------------------------------------+
| barra in alto: progetto, Salva, annulla, Visualizza, Presenta |
+--------+-----------------------------------+---------------+
| colon- |                                   | pannello      |
| na dei |            DISEGNO                | laterale:     |
| dispo- |                                   | ciò che è     |
| sitivi |                                   | selezionato   |
| e      |                                   |               |
| stru-  |      [ barra della simulazione ]  |               |
| menti  |                                   |               |
+--------+-----------------------------------+---------------+
| fascia in basso, a tutta larghezza: terminali ed eventi    |
+------------------------------------------------------------+
```

| Area | Contenuto | Si può chiudere |
| --- | --- | --- |
| Barra in alto | Marchio e nome della rete con le modifiche non salvate; menu Progetto e Salva; annulla e ripristina; menu Visualizza, con il tema; Presenta (vedi «Barra in alto») | no |
| Colonna a sinistra | Dispositivi da posare e strumento Cavo | sì |
| Disegno | La topologia, con sopra la barra della simulazione | no |
| Pannello laterale | Ciò che è selezionato: un dispositivo, un cavo o un pacchetto | sì |
| Fascia in basso | Una scheda per ogni terminale aperto, più la scheda Eventi | sì |

Colonna, pannello laterale e fascia si aprono e si chiudono con lo stesso pulsante: una piccola freccia, senza parole, che indica da che parte il pannello si ritira. Il suo significato è scritto nel suggerimento che compare passandoci sopra.

**Aree che seguono il loro contenuto** (D-107). Perché il disegno abbia tutto lo spazio quando non c'è altro da leggere, due aree si aprono e si chiudono da sole, con la stessa regola (`layout/auto-open.ts`): si aprono quando il contenuto compare, si chiudono quando sparisce, e in mezzo vale la scelta fatta con la freccia.

- **La fascia in basso** si apre da sola solo per il primo terminale, che si apre sempre con un gesto esplicito (Terminale sulla barretta, T in presentazione). Gli eventi non la aprono (D-118): il motore ne scrive anche per ogni modifica della rete, e la fascia si apriva al primo PC posato, togliendo al disegno quasi 200 px. Gli eventi restano registrati e si leggono aprendo la scheda Eventi o con la freccia. Se la si chiude resta chiusa, se è aperta resta aperta sulla sua scheda, qualunque cosa succeda alla rete. Si richiude da sola quando non resta nulla (Nuova, Apri, oppure Ricomincia senza terminali aperti). In presentazione non si apre da sola: lì la aprono T ed E.
- **Il pannello laterale**, in presentazione, segue la selezione: senza nulla di selezionato è chiuso, e lascia il posto al disegno. Fuori dalla presentazione resta come lo si lascia.

**Finestre piccole e ingrandimento** (D-112). La schermata è provata a 1920×1080, 1366×768, 1280×800, 1024×768 e 900×700, e in presentazione a ogni ingrandimento dal 100% al 200% (`tests/e2e/responsive.spec.ts`). In nessun caso la pagina scorre di lato, e ogni comando resta intero nella finestra. Non ci sono soglie sulla larghezza della finestra: ogni area si adatta allo spazio che ha davvero, con le container query di CSS. In presentazione le barre e il pannello sono ingranditi con `zoom`, e così la regola guarda lo spazio già diviso per l'ingrandimento. Le regole, area per area:

- **Barra in alto**: il nome del file si accorcia, poi sparisce la scritta «net-sim»; in presentazione, molto ingrandita, va via la scritta «Ingrandimento» e poi il nome del file. I comandi restano tutti.
- **Colonna dei dispositivi**: se la fascia in basso la fa troppo bassa, le voci perdono icone e didascalie e si stringono, così Cavo e la freccia restano raggiungibili.
- **Disegno**: se è più stretto di 800 px, i pulsanti −, + e Adatta salgono sopra la barra della simulazione invece di finirle sotto. La barra della simulazione, se non ci sta, va a capo su due righe. La barretta delle azioni evita lo zoom e la barra della simulazione, e se con le scritte non ci sta resta con le sole icone (vedi «Selezione e barretta delle azioni»).
- **Pannello laterale**: in presentazione non supera i due quinti della finestra. Quando è stretto, ogni etichetta va sopra il suo campo, e gli indirizzi si leggono per intero.
- **Fascia in basso**: con molti terminali le loro schede scorrono di lato, e la scheda aperta si porta in vista; Eventi e la freccia restano fermi a destra.

### Barra in alto

Alta 52 px, divisa in quattro gruppi (D-110):

| Gruppo | Che cosa contiene |
| --- | --- |
| Identità e progetto | Il marchio e il nome dell'app; il nome del file, o «Senza nome», con la pastiglia **Da salvare** quando ci sono modifiche non salvate (un punto e una scritta, non il solo colore); il menu **Progetto**, che in testa ripete il nome intero del file e lo stato («Modifiche non salvate», «Tutto salvato»), poi Nuova rete, Apri rete…, Salva con nome…, Esporta immagine… (vedi «Esportare come immagine») e la casella «Salva anche le tabelle ARP e MAC», con una riga che ne spiega l'effetto; il pulsante **Salva**, fuori dal menu e sempre in vista, l'unico pieno nel colore d'accento, con l'etichetta «con tabelle» accanto quando la casella è spuntata |
| Modifica | Annulla e Ripristina, due icone con il suggerimento e la scorciatoia; spente quando non c'è nulla da annullare o ripristinare |
| Visualizzazione | Il menu **Visualizza**: caselle per indirizzi IP, indirizzi MAC, nomi delle porte, griglia magnetica e tema scuro. Una casella cambia subito il disegno, e il menu resta aperto per cambiarne altre |
| Presentazione | **Presenta**, con il contorno e il testo nel colore d'accento: si trova subito, ma non domina la barra di chi lavora |

I menu (`layout/Menu.svelte`) seguono lo schema «menu button» di WAI-ARIA: un clic, Invio, Spazio o freccia giù aprono l'elenco e portano il fuoco sulla prima voce; le frecce scorrono le voci saltando quelle spente; Home e Fine vanno agli estremi; Esc chiude e riporta il fuoco sul pulsante; Tab o un clic fuori chiudono. Un comando chiude il menu, una casella no. Le icone della barra stanno tutte in `theme/Icon.svelte`; altezza dei controlli, arrotondamento e ombra dei menu sono token di `theme/tokens.css`.

Quando la barra è stretta il nome del file si accorcia con i puntini, ma non sotto le sei lettere: per intero resta nel suggerimento e in testa al menu Progetto. Sotto i 1060 px di barra resta il solo marchio, senza la scritta «net-sim». Le soglie riguardano la larghezza della barra, non quella della finestra (D-112): fino a 900 px di finestra tutti i comandi restano nello schermo, senza scorrimento orizzontale. In presentazione la barra mostra marchio, nome del file, ingrandimento, il tema come pulsante a sé (il menu Visualizza lì non c'è) ed Esci. Quando l'ingrandimento la rende stretta, prima sparisce la scritta «Ingrandimento», sotto i 760 px di barra, poi il nome del file con la pastiglia, sotto i 470.

La disposizione è una decisione presa con riserva: i pannelli sono componenti indipendenti dalla griglia che li ospita, così cambiarla non richiede di riscriverli (requisito NF-7).

## Che cosa c'è già

Dopo i nove passaggi del piano, e le parti del rilascio 2:

- l'ossatura completa, con la colonna, il pannello laterale e la fascia che si aprono e si chiudono;
- i due temi, con il pulsante Tema;
- il foglio vuoto all'avvio;
- **Apri rete**, che legge un file di rete e segnala in una riga rossa se non è valido, **Nuova rete**, che torna al foglio vuoto, e **Salva con nome**, nel menu Progetto, e **Salva**, che scrivono la rete in un file, con le tabelle se la casella è spuntata;
- il disegno della rete: dispositivi con nome e indirizzo con prefisso, cavi con il pallino del segnale, cavo staccato, dispositivo spento, host non configurato;
- il menu Visualizza, con le caselle delle etichette IP, MAC e Porte e quella della griglia magnetica;
- l'inquadratura: un foglio di base che si allarga solo se serve, la rotella per ingrandire, lo sfondo da trascinare per spostare la vista, i pulsanti −, + e Adatta;
- la **barra della simulazione**: Ricomincia, Avvia e Pausa, Passo, velocità, tick;
- le **buste** in viaggio, con colore e sigla del protocollo;
- in tempo reale: 1,4 secondi per tratto di cavo a 1×, le attese accorciate con l'indicatore sul dispositivo, la pausa tra un echo e il successivo;
- l'avviso della tempesta di broadcast;
- la **selezione** di dispositivi, cavi e buste, con un clic o da tastiera; un clic sullo sfondo o Esc la toglie;
- la **barretta delle azioni**, con le azioni principali in vista e le altre nel menu Altro: spegni o accendi, Ping, Collega, Duplica, Terminale, Appunta ed Elimina sui dispositivi, stacca o riattacca ed Elimina sui cavi;
- il **ping col mouse**: Ping sulla barretta, poi clic sulla destinazione;
- il **pannello laterale**: nome e configurazione IP del dispositivo, che si cambiano da lì, le sue tabelle, capi e stato del cavo, strati annidati del pacchetto;
- la **scheda Eventi**: una riga per fatto, collegata al disegno, con il filtro per conversazione e per protocollo;
- le **tabelle appuntate** sul disegno, trascinabili, con la riga nuova o persa che si fa notare;
- il **terminale** degli host, una scheda per ciascuno, con `ipconfig`, `ping`, `tracert`, `arp -a`, `cls` e `help`;
- l'**editor**: posare PC e switch dalla colonna, spostarli trascinandoli, eliminare dispositivi e cavi, collegarli con un cavo nuovo e scegliere la porta, rinominarli e configurarli dal pannello, annullare e ripristinare ogni modifica;
- il **router** (rilascio 2): si posa dalla colonna nelle tre varianti; dal pannello se ne accendono le interfacce, se ne impostano gli indirizzi e si aggiungono e tolgono le rotte statiche; tabella di routing e tabella ARP si appuntano sul disegno; gli indirizzi delle interfacce sono scritti accanto ai cavi;
- il **server** (rilascio 2), che si posa e si usa come un PC;
- la **CLI in stile IOS** di router e switch (rilascio 2), in una scheda come il terminale dei PC;
- la **modalità presentazione**, con l'ingrandimento regolabile e le scorciatoie da tastiera.

## File

- **Salva** (Ctrl+S, Cmd+S su Mac) scrive la rete nel file da cui viene, quello aperto o quello dell'ultimo salvataggio; se non ce n'è uno chiede dove, proponendo il nome della rete. Dove il browser non lo permette, scarica il file (D-57). È spento sul foglio vuoto.
- **Salva con nome** (Ctrl+Maiusc+S) chiede sempre dove, e da lì in poi il file della rete è quello nuovo: serve a non sovrascrivere il file di partenza. Dove il browser può solo scaricare, chiede il nome.
- La casella **Salva anche le tabelle ARP e MAC**, nel menu Progetto, fa salvare anche le tabelle ARP e MAC di ogni dispositivo, così come sono in quel momento (FILE-5, D-100): serve a preparare una rete che riparte già calda, o con una riga sbagliata ottenuta con la rete stessa (un ping, poi un indirizzo cambiato). Si spunta da sola aprendo un file che contiene le tabelle e si toglie con Nuova rete; spuntata, Salva e Salva con nome la seguono, e accanto a Salva compare l'etichetta «con tabelle». Le tabelle salvate diventano quelle a cui torna Ricomincia.
- Accanto al nome della rete, la pastiglia **Da salvare** dice che ci sono modifiche non salvate: il file che ne uscirebbe è diverso dall'ultimo aperto o salvato. Contano le modifiche alla rete, gli spostamenti e i guasti; non il traffico, nemmeno quando le tabelle si salvano, e non la casella delle tabelle. Annullare tutto riporta a "salvata".
- Con modifiche non salvate, **Nuova rete**, **Apri rete** e la chiusura della pagina chiedono conferma (D-58). Per ora la conferma, come la richiesta del nome, è una finestrella del browser; prima del rilascio completo diventeranno riquadri nello stile dell'app.
- Salvare non tocca la simulazione, la selezione né la cronologia.

### Esportare come immagine

**Esporta immagine…**, nel menu Progetto sotto Salva con nome, produce un'immagine PNG di tutta la rete, per le slide e le verifiche su carta (ED-8, D-104, D-119). Dove il browser lo permette chiede dove salvarla, proponendo il nome della rete con `.png` (o «rete.png»), e la finestra si apre subito, prima di preparare l'immagine: annullando non succede nulla (D-122); altrimenti la scarica. L'immagine mostra soltanto ciò che si esporta, con 32 unità di margine attorno: buste, elenco delle porte e maniglie non la allargano. Per un disegno enorme la risoluzione scende quanto serve a restare entro 16 384 pixel di lato e 64 milioni di pixel, con le stesse proporzioni. È spento quando sul disegno non c'è nulla, né dispositivi né annotazioni; in presentazione non c'è, come tutto il menu Progetto.

- **Che cosa contiene.** Ciò che il disegno contiene, scritte comprese, con un margine attorno: dispositivi, cavi, le etichette accese in quel momento (IP, MAC, porte), le tabelle appuntate, riquadri e note. Non contiene le buste in viaggio, gli indicatori di attesa, l'elenco delle porte aperto, la selezione, le evidenziature e le crocette per togliere le tabelle appuntate.
- **Com'è fatta.** Sempre con i colori del tema chiaro, anche se è acceso lo scuro, e a doppia risoluzione: due pixel per unità del disegno. I caratteri sono gli IBM Plex dell'app, messi dentro l'immagine. L'inquadratura è quella dell'estensione vera del disegno, scritte comprese, più precisa dei margini stimati di Adatta; non dipende dallo zoom né dalla grandezza della finestra.
- **Come nasce** (`topology/export-image.ts`). Dal disegno sullo schermo: per un istante si toglie la selezione, si copia il disegno scrivendo in ogni elemento lo stile che avrebbe con il tema chiaro, si tolgono gli elementi segnati come «da non esportare», e la copia si disegna su una tela. Lo schermo non cambia: tema, selezione e simulazione restano come erano. Se qualcosa non riesce, una riga in alto lo dice.

## All'avvio

L'app si apre sempre su un foglio vuoto, con un invito al centro del disegno: trascinare un dispositivo dalla colonna, oppure aprire un file. Non ha reti di esempio integrate: quelle della cartella `examples/` si aprono come qualsiasi file.

**La copia di recupero** (D-120, D-121). L'app non riapre da sola l'ultima rete, ma non perde il lavoro non salvato. Finché la rete è «Da salvare», nel browser c'è una copia di ciò che andrebbe nel file (rete, posizioni, annotazioni; non le tabelle, il traffico, i terminali), con il nome del file da cui veniva. È una sola: l'ultima rete su cui si lavorava. Si riscrive quando la rete cambia, non a ogni passo della simulazione, e sparisce quando la rete torna salvata, con un salvataggio riuscito o annullando tutte le modifiche.

Se alla riapertura della pagina c'è una copia, una riga sotto la barra in alto lo dice: «C'è una rete non salvata dell'ultima volta («lezione»), lasciata alle 10:42 di sabato 8 novembre. Vuoi riprenderla?», con **Riprendi** e **Scarta**. Il pulsante non si chiama «Ripristina», che è già il nome di quello che rifà una modifica annullata. Riprendi riapre la rete con il suo nome, ed è «Da salvare»: il file su disco è ancora quello di prima, e Salva chiede dove scrivere, perché dopo il ricaricamento il browser non ricorda più il file. Scarta lascia andare la copia. Finché non si sceglie la copia non si tocca: una modifica fatta per sbaglio prima di rispondere non la cancella.

Non sostituisce il file: il lavoro si consegna sempre salvandolo. Se il browser non ha dove tenerla (una finestra anonima, lo spazio finito), la copia non c'è e l'app funziona come prima. La tengono `storage/recovery.ts` e lo strato del file della sessione.

## Colonna dei dispositivi e degli strumenti

- **Dispositivi.** Una voce per tipo. Le varianti pronte (switch a 8 o a 24 porte; router a 2, 4 o 8 interfacce) si scelgono prima di posare: passando sulla voce si apre il loro elenco, e un clic sulla voce lo lascia aperto. Da tastiera Invio lo apre e lo chiude, Tab entra nelle varianti, Esc lo chiude e ridà il fuoco alla voce; l'elenco si chiude anche quando il fuoco va altrove.
- **Colonna bassa.** Le voci sono sette. Se la fascia in basso lascia alla colonna meno di 560 px, restano senza icone né didascalie, una sotto l'altra (D-112); sotto i 300 px, con la fascia alzata al massimo su uno schermo piccolo, restano le sole icone su due colonne, con la freccia accanto a Nota, e il nome per il lettore di schermo e nel suggerimento (D-117). Tutte sempre raggiungibili.
- **Posare.** In due modi: trascinando la voce sul disegno, per posarne uno; oppure con un clic sulla voce e poi un clic sul disegno per ogni dispositivo da posare, finché non si preme Esc. Nel secondo modo la voce resta evidenziata, il puntatore cambia e una riga in alto sul disegno dice che cosa fare. Il dispositivo appena posato viene selezionato.
- **Strumento Cavo.** Finché è attivo, trascinare da un dispositivo a un altro tira un cavo invece di spostare; lo stesso si ottiene con un clic sul primo dispositivo e uno sul secondo (D-51). Mentre si trascina, una linea tratteggiata segue il mouse. Si disattiva con Esc o con un secondo clic sulla voce.
- **Strumenti Riquadro e Nota** (ED-9, D-117). Sotto Cavo. Con Riquadro si disegna un riquadro trascinando sullo sfondo; con Nota un clic posa una nota. Restano scelti finché non si lasciano, con un secondo clic sulla voce o con Esc, come il Cavo; scegliere un dispositivo, il Cavo o l'altro strumento li lascia: ne resta scelto uno solo. Vedi «Annotazioni».
- **Server.** Si posa come un PC. Per la rete è un host identico a un PC, con indirizzo, gateway e terminale; cambiano l'icona e il nome (`SRV1`). I servizi che ospiterà arrivano più avanti.

Un dispositivo appena posato riceve un nome progressivo (PC1, PC2, SW1) e i suoi indirizzi MAC. Un PC nasce senza configurazione IP.

## Disegno

### Dispositivi ed etichette

Sagome essenziali a tratto, in tinta neutra, su un riquadro arrotondato. Sotto ogni dispositivo restano sempre scritti il **nome** e, per gli host, l'**indirizzo con il prefisso** (`192.168.1.10/24`); un host senza indirizzo mostra "non configurato".

Indirizzi MAC e nomi delle porte sono spenti all'apertura e si accendono dal menu Visualizza, ciascuno con la sua casella. Anche l'indirizzo IP ha la sua, spuntata all'apertura.

### Cavi

Un cavo collegato è una linea neutra, con un pallino verde a ogni capo che sente il segnale. Un cavo staccato è rosso, tratteggiato e con una croce a metà.

**Tirare un cavo.** Si trascina dal primo dispositivo al secondo. L'app propone su ciascuno la prima porta libera e scrive i due nomi accanto al cavo; un clic su un nome apre l'elenco delle porte libere di quel dispositivo, per cambiarla. Il tipo di cavo non esiste.

### Pacchetti

Un pacchetto in viaggio è una **busta colorata con sopra la sigla del protocollo**. Il colore dice il protocollo, la sigla lo conferma.

| Protocollo | Colore | Sigla |
| --- | --- | --- |
| ARP | ambra | ARP |
| ICMP | viola | ICMP |

A velocità normale una busta impiega 1,4 secondi a percorrere un cavo. Il valore è la costante `TICK_SECONDS` in `src/ui/simulation/playback.ts`.

### Selezione e barretta delle azioni

Un clic su un dispositivo, un cavo o una busta lo **seleziona**: compare un contorno nel colore d'accento e il pannello laterale ne mostra il contenuto. Un clic sullo sfondo toglie la selezione.

Accanto a ciò che è selezionato compare una **barretta** con le azioni (D-111). Non c'è un menu del tasto destro: tutto ciò che si può fare è sulla barretta, e funziona anche alla LIM. Le azioni più usate per quel tipo di dispositivo si vedono sempre, con l'icona e sotto la scritta; le altre stanno nel menu **Altro** (i tre punti), in fondo alla barretta.

| Selezionato | Sempre in vista | Nel menu Altro |
| --- | --- | --- |
| Host (PC o server) | Terminale · Ping (se acceso) · Collega | Tabella ARP · Spegni o Accendi · Duplica · Elimina |
| Switch | Terminale (la CLI) · Collega · Tabella MAC | Spegni o Accendi · Duplica · Elimina |
| Router | Terminale (la CLI) · Collega · Tabella routing | Spegni o Accendi · Duplica · Elimina |
| Cavo | Stacca o Riattacca · Elimina | — |
| Riquadro o nota | Elimina (fuori dalla presentazione) | — |

- **Premuto.** Ping e Collega restano premuti (colore d'accento) finché l'app aspetta il secondo clic, e la riga in alto sul disegno dice che cosa fare; anche il pulsante di una tabella appuntata resta premuto.
- **Elimina** è in rosso, sul cavo e nel menu Altro: si distingue da Stacca, che lascia il cavo al suo posto senza segnale.
- **Dove sta.** La barretta è un elemento della pagina sopra il disegno, non del disegno: ha sempre la stessa grandezza sullo schermo, a qualsiasi zoom, e in presentazione cresce con l'ingrandimento. Sta sopra l'oggetto selezionato, centrata; se sopra non c'è posto va sotto le sue scritte, e di lato non esce mai dal disegno (`topology/bar-placement.ts`).
- **Il menu Altro** (D-116) resta tutto dentro il disegno, quindi non va mai sopra la colonna dei dispositivi né sotto il pannello. Di solito si apre allineato al bordo destro del pulsante e dalla parte dove c'è più spazio; vicino al bordo sinistro si allinea al bordo sinistro del pulsante, e se nessuno dei due allineamenti ci sta si accosta al bordo. In verticale si apre sotto o sopra, dove ci sta. In un disegno più stretto del menu diventa più stretto, e le scritte vanno a capo; se in altezza non c'è posto per tutte le voci, scorrono. Prima di comparire il menu si misura, trasparente, così non si vede nel punto sbagliato, e la prima voce riceve già il fuoco da tastiera (`layout/menu-placement.ts`). I menu Progetto e Visualizza non cambiano: si aprono sotto il loro pulsante, come sempre.
- **I comandi del disegno** (D-112). La barretta evita lo zoom e la barra della simulazione: se sopra l'oggetto coprirebbe uno dei due, scivola di lato quanto basta, purché resti sopra l'oggetto; se non basta, va sotto. Se coprirebbe qualcosa sia sopra sia sotto, vale la regola di sempre, e copre lo zoom finché resta la selezione. Succede solo al 200% in una finestra larga fino a 1024 px.
- **Un oggetto più alto di ciò che si vede** (D-118), come un grande riquadro: se né sopra né sotto c'è un posto libero, la barretta sta in cima al disegno, sopra l'oggetto stesso, invece di finire sopra lo zoom e la barra della simulazione. Se il centro dell'oggetto è fuori dal disegno, la barretta resta vicina al suo punto più vicino che si vede.
- **Compatta** (D-112). Se con le scritte la barretta è più larga del disegno, i pulsanti restano con le sole icone, in presentazione su uno schermo stretto. Descrizione e suggerimento non cambiano. La larghezza con le scritte si misura una volta per ogni insieme di azioni e ingrandimento: così la barretta non salta da una forma all'altra.
- **Tastiera.** I pulsanti si raggiungono con Tab, le frecce sinistra e destra si muovono tra loro, Invio e Spazio li premono; il menu Altro si apre con Invio e si chiude con Esc, che ridà il fuoco al pulsante senza togliere la selezione.
- I clic sulla barretta non arrivano al disegno sotto: non selezionano altro e non spostano la vista.
- I suggerimenti dicono che cosa fa un'azione, mai come risolvere un problema della rete.

**Duplica** (ED-6, D-101). Crea una copia del dispositivo e la seleziona, come un dispositivo appena posato; è un solo passo di Annulla. La copia nasce scollegata, al primo posto libero a destra dell'originale, a 140 px (`topology/placement.ts`): abbastanza perché due indirizzi IP non si tocchino, e multiplo del passo della griglia. Premendo ancora Duplica sulla copia si fa una fila. Che cosa la copia prende dall'originale lo decide il motore (`engine/duplicating.ts`, vedi [motore.md](motore.md)). Sta nel menu Altro; come Collega, in presentazione non c'è. L'icona sono due fogli sovrapposti.

**Ping dalla barretta.** Si preme Ping e poi si fa clic sul dispositivo di destinazione. Manda **un solo** echo request: è lo strumento per le dimostrazioni. Le quattro richieste di Windows si ottengono dal terminale.

Mentre si aspetta il clic sulla destinazione, il pulsante Ping resta premuto, il puntatore diventa una croce e in alto sul disegno una riga dice che cosa fare. Esc rinuncia. Se la destinazione non ha un indirizzo IP, per esempio uno switch, la riga lo dice e il ping non parte.

**Pacchetto selezionato.** Del pacchetto si tiene una copia al momento del clic: il pannello continua a mostrarne il contenuto anche dopo che è arrivato, con la scritta "Arrivato" al posto di "In viaggio".

**A simulazione sospesa** la barretta non compare: da una tempesta di broadcast si esce solo con Ricomincia.

**Collega dalla barretta.** Si preme Collega e poi si fa clic sul dispositivo di destinazione: tira un cavo senza attivare lo strumento. Un clic sullo stesso dispositivo, o Esc, annulla.

**Porte.** Il cavo nuovo occupa su ciascun capo la prima porta libera, e viene selezionato. Se un dispositivo non ha porte libere il cavo non nasce, e una riga in alto lo dice. I nomi delle due porte sono scritti accanto al cavo: su quello selezionato sempre, sugli altri quando è accesa l'etichetta Porte (D-50). Un clic su un nome apre l'elenco delle porte su cui quel capo può stare, cioè l'attuale e quelle libere dello stesso dispositivo, e un clic su una voce sposta il capo. L'elenco si apre sotto il nome, oppure sopra nella metà bassa del disegno, e si chiude con Esc o con un altro clic sul nome.

### Tabelle appuntate

Ogni tabella (MAC di uno switch, ARP di un host) si può **appuntare** sul disegno: compare in un riquadro accanto al suo dispositivo, legata a lui da una linea tratteggiata, e resta visibile qualunque cosa sia selezionata. È il modo per vedere insieme il pacchetto che viaggia, il suo contenuto e la tabella che cambia.

- Si appunta e si toglie in tre modi: dal pulsante sulla barretta del dispositivo, dal pulsante "appunta" accanto alla tabella nel pannello laterale, e, per toglierla, dalla crocetta nel suo angolo.
- Nasce sotto il dispositivo. Si può trascinare dove dà meno fastidio; la linea la segue, e parte da sotto le etichette per non coprirle.
- Una riga appena imparata si accende nel colore d'accento e torna normale in un secondo e mezzo. Una riga appena persa resta un momento, rossa e barrata, e svanisce.
- Gli indirizzi sono scritti per intero.
- L'inquadratura si allarga quanto serve per far stare anche le tabelle.
- Ricominciando la simulazione restano dove sono. Aprendo un'altra rete spariscono: quali tabelle sono appuntate non si salva nel file.

### Annotazioni

Riquadri colorati con un'etichetta, per mostrare una sottorete o un'area, e note di testo, per scrivere una consegna (ED-9, D-103, D-117). Non fanno parte della rete: il simulatore non le conosce, e un ping le attraversa come se non ci fossero. Stanno nel file (formato 2, D-106) e nella cronologia.

- **Disegnare un riquadro.** Con lo strumento Riquadro, si preme su un punto libero del disegno e si trascina, in qualsiasi direzione; un'anteprima tratteggiata segue il puntatore. Lasciando il pulsante il riquadro nasce, blu e senza etichetta, e resta selezionato. Un clic senza trascinare non crea nulla, ed Esc a metà rinuncia. Il riquadro più piccolo è 40×40. Con lo strumento scelto, trascinare lo sfondo disegna invece di spostare la vista. La griglia magnetica non vale per le annotazioni.
- **Posare una nota.** Con lo strumento Nota, un clic posa una nota vuota e porta il cursore nel suo testo, nel pannello laterale. Una nota vuota mostra «Nota vuota», attenuato, per poterla ritrovare; nel file il testo resta vuoto.
- **Come si vedono.** Un riquadro ha un bordo sottile del suo colore e un fondo appena tinto, e sta dietro cavi e dispositivi; l'etichetta è in alto a sinistra, nel colore del testo, con un alone che la fa leggere anche sopra un cavo. Una nota ha un fondo appena tinto, un segno del suo colore a sinistra e il testo con i suoi ritorni a capo; una riga più lunga di 40 caratteri va a capo da sola, tra le parole, così la nota non si allarga oltre. Le righe le calcola `topology/annotation-geometry.ts`, senza misurare lo schermo: la stessa nota si potrà disegnare nell'immagine esportata.
- **Colori.** Cinque, fissi: blu, verde, giallo, rosso, viola (`--annotation-*` in `theme/tokens.css`, per i due temi). Il bordo arriva ad almeno 3:1 sul disegno, il fondo è leggerissimo e le scritte sono nel colore del testo, così la rete sotto resta leggibile. Non hanno un significato: un riquadro rosso non dice che qualcosa non va.
- **Selezionare.** Un clic sul bordo o sull'etichetta di un riquadro, o su una nota, la seleziona: un contorno tratteggiato nel colore d'accento, e il pannello laterale ne mostra i dettagli. L'interno di un riquadro non riceve i clic: arrivano al disegno, e i dispositivi e i cavi che contiene restano tutti da cliccare (stanno anche sopra di lui). Da tastiera, un'annotazione si raggiunge con Tab e si seleziona con Invio; il suo nome dice che cos'è e che cosa c'è scritto («Riquadro: LAN 1», «Nota: Configura le rotte…»).
- **Mentre si sceglie un dispositivo** per un ping o un cavo, o si posa qualcosa, le annotazioni lasciano passare il clic: non sono una destinazione, e non sono un capo di un cavo.
- **Spostare.** Trascinando un'annotazione la si sposta, e la si seleziona; un clic senza movimento seleziona soltanto. L'inquadratura resta ferma per tutto il trascinamento. Un trascinamento intero è un solo passo da annullare.
- **Ridimensionare.** Un riquadro selezionato ha quattro maniglie agli angoli: trascinandone una, l'angolo opposto resta fermo, e il riquadro non scende sotto 40×40 né si ribalta. Anche questo è un solo passo da annullare. Le maniglie si usano con il puntatore; da tastiera non sono previste.
- **Eliminare.** Dalla barretta (Elimina), dal pannello laterale o con Canc fuori dai campi di testo; Annulla la fa tornare.
- **In presentazione** si vedono, con il testo ingrandito, e si selezionano per leggerle nel pannello; non si spostano, non si ridimensionano, non si modificano e non si eliminano, nemmeno da tastiera. Gli strumenti per crearle non ci sono.
- **Inquadratura.** Adatta e l'inquadratura automatica tengono dentro riquadri e note, anche su un foglio senza dispositivi; lì la scritta «La rete è vuota» non compare, ma la barra della simulazione resta nascosta, perché non c'è rete da far scorrere.

### Spostare ed eliminare

Un dispositivo si sposta trascinandolo: cavi, buste in viaggio e tabella appuntata lo seguono. Un clic senza movimento resta un clic, e seleziona. Mentre si trascina l'inquadratura resta ferma, e si riadatta al rilascio.

**Griglia magnetica** (ED-7, D-102). La casella **Griglia magnetica**, nel menu Visualizza, la accende e la spegne. Non si disegna: accesa, il centro di un dispositivo posato o trascinato scatta al punto più vicino di una griglia di 20 px (`topology/grid.ts`), e il trascinamento procede a scatti. Accenderla non sposta i dispositivi già posati. È una scelta di chi disegna, come le etichette: aprire un file o un foglio nuovo non la cambia, e in presentazione l'interruttore non c'è.

Si elimina ciò che è selezionato con il cestino sulla barretta, oppure con il tasto Canc o Backspace. Eliminando un dispositivo spariscono anche i suoi cavi, la sua tabella appuntata e il suo terminale. Scrivendo in una casella di testo o nel terminale, Canc e Backspace cancellano solo il testo.

### Annulla e ripristina

Le due frecce della barra in alto, e da tastiera Ctrl+Z per annullare e Ctrl+Maiusc+Z o Ctrl+Y per ripristinare (Cmd su Mac). Sono spente quando non c'è nulla da annullare o da ripristinare. Scrivendo in una casella di testo o nel terminale, le scorciatoie restano quelle del testo.

- **Che cosa si annulla** (D-55): posare, spostare, collegare, cambiare porta, rinominare, configurare, eliminare. Un trascinamento conta come una sola modifica. Guasti e traffico non si annullano: restano come sono.
- **La simulazione continua** (D-54, D-56): annullare equivale a fare a mano la modifica contraria. Un dispositivo che torna è appena acceso, con le tabelle vuote; gli altri tengono le loro. Un frame in viaggio verso qualcosa che sparisce va perso. L'elenco degli eventi mostra ciò che è successo con le righe di sempre ("PC3 viene tolto dalla rete").
- **Con ciò che sparisce** se ne vanno la sua selezione, la sua tabella appuntata e il suo terminale. Tornando, il dispositivo non li riporta.
- **Limiti.** Si torna indietro di cento modifiche. Una modifica nuova cancella ciò che si poteva ripristinare. Aprire un file o Nuova svuotano la cronologia; Ricomincia no. A simulazione sospesa annullare viene rifiutato, come ogni altra modifica.

### L'inquadratura

Il disegno parte da un foglio di base. Finché la rete ci sta, posare o spostare un dispositivo non cambia nulla; se un dispositivo esce dal foglio, l'inquadratura si allarga per contenerlo. Così il disegno non "salta" a ogni modifica.

**Il limite dell'ingrandimento automatico** (D-118). Fuori dalla presentazione, l'inquadratura che sceglie l'app non supera 1,25 pixel dello schermo per unità del disegno (`AUTO_MAX_SCALE` in `topology/camera.ts`): un PC, largo 52 unità, occupa al più 65 pixel, un router 75. Su uno schermo grande una rete piccola resta proporzionata e al centro, con spazio attorno, invece di essere ingrandita fino a riempirlo; una rete grande non arriva al limite e si inquadra tutta come prima. Il limite vale per il foglio di base, che su uno schermo grande si allarga attorno al suo centro prima di contenere la rete (così, finché la rete sta in ciò che si vede, posare o spostare non fa saltare nulla), per Adatta e per l'apertura di un file. Non vale per lo zoom a mano (+, −, rotella, trascinamento), che resta libero tra i limiti di sempre, né in presentazione, dove dispositivi e scritte devono essere grandi per la LIM. Misure a 1920×1080: un PC solo passa da 83 px (108 con Adatta) a 65.

Un trascinamento tiene ferma l'inquadratura che si vede davvero, comprese tabelle appuntate, annotazioni e limite di scala, non il solo foglio dei dispositivi: il disegno non salta quando comincia.

### Muoversi sul disegno

La rotella del mouse ingrandisce e rimpicciolisce attorno al puntatore: ciò che sta sotto il puntatore resta dov'è. Trascinando lo sfondo si sposta la vista; un clic senza movimento resta un clic, e posa o toglie la selezione. Nell'angolo in basso a destra del disegno ci sono i pulsanti −, + e Adatta: i primi due agiscono attorno al centro di ciò che si vede, Adatta inquadra tutta la rete.

- **Automatica o scelta** (D-59). Finché non si tocca nulla vale l'inquadratura automatica del foglio. Dal primo ingrandimento, spostamento o Adatta l'inquadratura è quella scelta, e non cambia più da sola: un dispositivo posato fuori vista resta fuori vista finché non si preme Adatta. Nuova torna a quella automatica.
- **All'apertura di un file** la rete viene inquadrata per intero, come con Adatta (D-60), annotazioni comprese (D-117, D-118).
- **Adatta** lascia margine per le etichette e per la barra della simulazione, tiene dentro anche le tabelle appuntate, i riquadri e le note. Lo spazio della barra si riserva in pixel dello schermo (D-107): la barra ha sempre la stessa grandezza, comunque sia rimpicciolita la rete, quindi nemmeno una rete grande finisce sotto di lei. Adatta non ingrandisce oltre un riquadro minimo, e fuori dalla presentazione oltre 1,25 pixel per unità (D-118): un PC da solo non riempie lo schermo. Su un foglio senza dispositivi né annotazioni torna all'inquadratura automatica.
- **Limiti.** Si arriva a quattro volte più vicino e a cinque volte più lontano del foglio di base.
- Con la vista si ingrandisce tutto il disegno, comprese scritte ed elenco delle porte; la barretta delle azioni no, perché sta sopra il disegno e resta sempre grande uguale. L'inquadratura non si salva nel file.

### Righe in alto sul disegno

In alto al centro del disegno compaiono righe brevi, su tre livelli distinti, sempre in quest'ordine dall'alto (D-113, `topology/Messages.svelte`):

| Livello | Quando | Come si riconosce | Per il lettore di schermo |
| --- | --- | --- | --- |
| Condizione critica | La tempesta di broadcast ha sospeso la simulazione (SIM-15) | Tutto il bordo rosso, titolo rosso in grassetto | `role="alert"` |
| Operazione rifiutata | L'interfaccia non ha potuto fare ciò che si è chiesto: un cavo senza porte libere, un ping verso chi non ha un indirizzo, un dato che il motore non accetta, un salvataggio non riuscito | Bordo sinistro rosso e una crocetta ✕, come gli errori dei campi del pannello | `role="alert"` |
| Istruzione | Un'operazione aspetta un clic: posare, tirare un cavo, scegliere la destinazione di un ping | Bordo sinistro nel colore d'accento; il tasto per rinunciare è scritto come un tasto, <kbd>Esc</kbd> | Una sola regione `role="status"` che c'è sempre, così ogni istruzione nuova si annuncia una volta |

- Un rifiuto dice che cosa non è stato fatto, mai come sistemare la rete (SIM-8): «SW1 non ha un indirizzo IP a cui fare ping», non perché un ping fallirebbe. L'unica spiegazione di una causa è quella della tempesta, prevista da SIM-15; il suo testo non cambia.
- Nessuna riga sparisce a tempo. Un'istruzione resta finché l'operazione è in corso (Esc la chiude); un rifiuto resta finché non si fa qualcos'altro: una nuova selezione o un nuovo comando.
- Non c'è un centro notifiche né una cronologia dei messaggi: ciò che è successo nella rete sta nella scheda Eventi.
- Le righe non ricevono i clic, e la barretta delle azioni le evita come evita lo zoom e la barra della simulazione. In presentazione partono sotto i pulsanti dello zoom, che lì stanno in alto a destra.

## Barra della simulazione

Una barra compatta che galleggia in basso al centro del disegno, come i comandi di un lettore video. Resta anche in modalità presentazione. Sul foglio vuoto non c'è, perché non c'è nulla da far scorrere. Su un disegno più stretto della barra (in presentazione, su uno schermo piccolo) i comandi vanno a capo su due righe, e la barra resta nel disegno; su un disegno più stretto di 800 px i pulsanti dello zoom salgono sopra di lei (D-112).

| Comando | Effetto |
| --- | --- |
| Ricomincia | Riporta la rete allo stato di una appena accesa: nessun pacchetto, tempo a zero, tabelle vuote, o quelle del file se è stato salvato con le tabelle. Guasti e configurazione restano |
| Avvia / Pausa | Fa scorrere il tempo da solo, o lo ferma |
| Passo | Avanza di un istante. Disponibile a simulazione ferma |
| Velocità | 0,5×, 1×, 2× |
| Tempo | Il tick corrente |
| Stato | **Ferma**, **In esecuzione** o **Sospesa** (D-113) |

**Lo stato.** In fondo alla barra una scritta in una pastiglia dice in che stato è la simulazione, con un segno che cambia anche di forma: un cerchio vuoto (Ferma), pieno nel colore d'accento (In esecuzione), rosso con un punto esclamativo (Sospesa). Passandoci sopra, una riga spiega che cosa vuol dire. Lo stato si ricava solo da due fatti sicuri, il tempo reale avviato e la sospensione del motore (`simulation/simulation-state.ts`):

- **In esecuzione** vale anche quando non c'è nulla in programma: il tempo reale resta in ascolto, e un ping lanciato dopo parte da solo.
- Un **Passo** non è uno stato: dura un istante, poi la simulazione è di nuovo ferma.
- Non esistono «Completata» né altri stati che dicano come è andato il traffico: che non ci sia altro in programma non dice nulla sull'esito.
- Non è un annuncio per il lettore di schermo: cambia solo perché lo si è chiesto con un pulsante, che cambia nome (Avvia, Pausa), oppure insieme all'avviso della tempesta, che si annuncia da sé. Nessun annuncio a ogni tick.

**Tempo a schermo e tempo simulato.** Il motore avanza a scatti, da un istante al successivo. A schermo invece le buste scivolano: l'orologio dell'interfaccia tiene un tempo che sta tra un istante e l'altro, e la posizione di una busta sul cavo dipende da quello. Quando il tempo a schermo raggiunge il prossimo istante, l'orologio chiede al motore di elaborarlo. Avvia non si spegne quando la rete resta ferma: resta in ascolto, e un ping lanciato dopo parte da solo.

**Passo.** Fa arrivare a destinazione le buste in viaggio, un po' più svelto del tempo reale, e si ferma. Le buste nate in quell'istante restano accanto a chi le ha spedite, in attesa del passo successivo.

**Attese.** In tempo reale, quando non viaggia nulla e c'è solo un'attesa in corso (una risposta ARP o un echo reply che non arrivano), non si aspetta davvero: sul dispositivo che aspetta compare un piccolo indicatore che si svuota in due o tre secondi, qualunque sia la durata in tick, poi il tempo salta alla scadenza. Si vede chi sta aspettando, senza tempi morti.

**Pausa tra gli echo.** In tempo reale una breve pausa a schermo separa un echo request dal successivo, così i quattro giri di un ping si distinguono. In passo-passo non c'è. La pausa è dell'interfaccia: il motore non ne sa nulla.

**Tempesta di broadcast.** Quando il motore si sospende, lo stato diventa «Sospesa» e un avviso in alto sul disegno ne spiega la causa. Si riparte con Ricomincia.

## Pannello laterale

Mostra l'ultima cosa selezionata. Si chiude con la freccia nell'angolo in alto a destra, e si riduce a una striscia sottile sul bordo, da cui si riapre. Chiuso, resta chiuso anche quando si seleziona qualcosa: lo riapre solo l'utente.

Largo 290 px; in presentazione, ingrandito, al massimo due quinti della finestra. Quando il suo contenuto è più stretto di 250 px ogni etichetta va sopra il suo campo, anche nell'editor delle rotte, perché un indirizzo non si tagli (D-112). Il contenuto che non ci sta scorre in verticale, mai di lato.

**Come è organizzato** (D-114). In testa l'**intestazione**: il nome grande, e sotto il tipo seguito dagli stati già noti, separati da un punto a mezza altezza («PC · acceso · segnale presente»). Ogni stato ha un cerchietto pieno se acceso, collegato, presente o in viaggio, vuoto se no: la parola dice lo stesso, e il colore non è il solo segno. Gli stati dicono com'è il dispositivo, non perché: «senza segnale» non diventa una diagnosi.

Sotto, **sezioni** separate da una riga sottile, ciascuna con un titolo breve in maiuscoletto (`panels/PanelSection.svelte`). Niente schede, niente riquadri decorativi: lo spazio va ai dati. Le etichette dei campi stanno in una colonna larga uguale in tutte le sezioni, così i campi cominciano tutti nello stesso punto; i valori che non si cambiano, come il MAC, sono allineati al testo dei campi ma senza bordo.

Una tabella che si appunta sul disegno ha il suo pulsante accanto al titolo della sezione: «appunta», oppure «✓ appuntata» nel colore d'accento quando è già sul disegno. Il pulsante è descritto dal titolo della sezione, così il lettore di schermo dice di quale tabella è. Le tabelle a due colonne (ARP e MAC, `panels/PairTable.svelte`) hanno le intestazioni attenuate sopra una riga più scura, i valori in carattere a larghezza fissa, e «Vuota.» in corsivo quando non c'è nulla. Nessun colore dice se una riga è giusta.

| Selezionato | Sezioni |
| --- | --- |
| PC o server | Identità (nome, MAC) · Configurazione IPv4 (indirizzo IP, subnet mask, gateway) · Tabella ARP · In attesa del MAC, se c'è qualcosa in attesa |
| Switch | Identità (nome, numero di porte) · Tabella MAC |
| Router | Identità (nome) · Interfacce · Tabella di routing, con il modulo per aggiungere una rotta · Tabella ARP · In attesa del MAC |
| Cavo | Capi del cavo |
| Pacchetto | Contenuto del frame |

### Dispositivo

Nome, tipo, stato (acceso o spento, segnale presente o assente), e per un host due gruppi: l'identità (nome e MAC, che non si cambia) e la configurazione IPv4 (indirizzo, subnet mask, gateway). Sotto, le sue tabelle, ciascuna con il pulsante per appuntarla. Il nome si cambia dal suo campo, con le stesse regole di conferma della configurazione; un nome vuoto o già usato viene rifiutato.

**Modificare la configurazione.** Un campo ha effetto quando lo si conferma, con Invio o uscendo dal campo. Il valore viene controllato con le regole di `checkIpConfig`:

- se è accettabile, viene applicato;
- se non lo è, il campo si segna in rosso e sotto compare il motivo, per esempio "è l'indirizzo di broadcast della sottorete". La rete conserva il valore di prima, e ciò che si è scritto resta nel campo per correggerlo (D-53).

Esc, dentro un campo, rimette il valore della rete senza togliere la selezione. Uscire da un campo senza averlo cambiato non fa nulla: in particolare non svuota la tabella ARP dell'host (D-48).

**Togliere la configurazione.** Svuotare l'indirizzo svuota anche maschera e gateway (D-52). Svuotare la sola maschera viene rifiutato.

**Maschera proposta.** Scritto l'indirizzo su un host senza maschera, la maschera si compila da sola con quella della classe dell'indirizzo (255.255.255.0 per 192.168.1.10), come fa Windows. Si può cambiare. Senza questo aiuto il primo indirizzo verrebbe rifiutato, perché indirizzo e maschera vanno impostati insieme.

### Router

Nome, stato, e poi le sue **interfacce**, una sotto l'altra, ciascuna in un gruppo leggero con il fondo appena più scuro (D-114). Ciascuna ha:

- il nome completo, in grassetto;
- un **interruttore** che dice «accesa» o «spenta» e la cambia con un clic. Un router nasce con tutte le interfacce spente (D-70);
- i campi **Indirizzo IP** e **Subnet mask**, con le stesse regole di conferma dei PC: Invio o uscita dal campo, bordo rosso e motivo se il valore viene rifiutato.

Accesa o spenta si legge in tre modi: la parola sull'interruttore, un cerchietto pieno o vuoto accanto, e la barra sul bordo sinistro del gruppo, piena e verde o tratteggiata e grigia. Il rosso resta sull'interruttore, come il quadratino sul capo del cavo: con otto interfacce spente il pannello non si riempie di rosso. Un campo vuoto mostra in corsivo «nessun indirizzo» (o «nessuna» per la maschera): così un'interfaccia senza indirizzo non si confonde con una spenta. Le interfacce restano tutte aperte: un router a 8 interfacce si scorre, ma nulla della configurazione resta nascosto.

Tre aiuti nello scrivere l'indirizzo di un'interfaccia:

- la maschera viene proposta dalla classe dell'indirizzo, come per i PC;
- se quella maschera farebbe sovrapporre la rete a quella di un'altra interfaccia dello stesso router, viene proposta la maschera di quell'altra: dopo `10.0.0.1/30` su un'interfaccia, `10.0.0.5` sull'altra diventa `/30` anche lei, invece di essere rifiutata come `/8`;
- nel campo dell'indirizzo si può scrivere anche il prefisso, `10.0.0.5/30`, e indirizzo e maschera si impostano insieme.

Sotto le interfacce, la **tabella di routing**: una rotta per rete, con la sigla C per una rete collegata e S per una rotta statica (spiegate da una riga di legenda), il prossimo salto e l'interfaccia di uscita. Una rotta statica il cui prossimo salto non sta su una rete collegata non ha un'interfaccia: la rotta è attenuata, in corsivo, e dice «non usata».

Ogni rotta sta su due righe, con le colonne allineate tra una rotta e l'altra (D-114, una griglia CSS con `subgrid`): sopra la sigla, la rete di destinazione in grassetto e la crocetta; sotto il prossimo salto e l'uscita. Le intestazioni hanno la stessa forma. In cinque colonne affiancate, con indirizzi lunghi ma comuni (`172.16.128.0/17` via `192.168.200.254`), la tabella era più larga del pannello; su due righe ci sta sempre, e destinazioni, prossimi salti e uscite restano in colonna, facili da confrontare. Il lettore di schermo legge ogni rotta di seguito, con le parole «rete collegata» o «rotta statica», «prossimo salto» e «uscita».

- **Togliere una rotta statica**: la crocetta a destra della rotta.
- **Aggiungerne una**: il riquadro **Aggiungi rotta statica**, sotto la tabella e separato da lei, con i tre campi (rete, maschera, prossimo salto) e il pulsante Aggiungi rotta, o Invio. La maschera si scrive per esteso oppure come prefisso (`/24`); il prefisso può stare anche in coda alla rete (`192.168.2.0/24`). Una rotta rifiutata lascia i campi come sono, con il motivo sotto.

In fondo, la **tabella ARP** del router.

Tutte e due le tabelle si appuntano sul disegno, ciascuna con il suo pulsante; nascono una a sinistra e una a destra sotto il router. Dalla barretta si appunta la tabella di routing, che è quella che serve in lezione.

Sul disegno un'interfaccia spenta si riconosce dal quadratino rosso sul capo del cavo vicino al router; con l'etichetta Porte accesa, accanto al nome della porta compare «spenta». Una porta di switch spenta si vede allo stesso modo, sul capo del cavo vicino allo switch (D-93). Le porte degli switch non hanno un interruttore nel pannello: si spengono dalla CLI dello switch, con `shutdown`, oppure arrivano spente da un file.

**Indirizzi sul disegno** (D-75). Un router non ha un indirizzo solo, quindi sotto di lui resta soltanto il nome: l'indirizzo di ogni interfaccia è scritto accanto al suo cavo, sul capo vicino al router, con il prefisso (`192.168.1.1/24`). Così si vede a colpo d'occhio quale indirizzo guarda quale rete. Li accende e li spegne l'interruttore IP, come per i PC.

La scritta comincia appena fuori dal router e si allontana da lui, sopra il cavo; se il cavo sale sta invece sotto, così non lo attraversa mai. Su un cavo corto tra due router i due indirizzi non starebbero di fila: quello del secondo capo va sotto il cavo, e il nome della sua porta, se acceso, passa sopra. Su un cavo troppo corto perché la scritta ci stia partendo dal router, come capita in presentazione, la scritta sta centrata a metà del cavo, così non finisce sopra il dispositivo all'altro capo.

Limite noto: la posizione di ogni scritta è calcolata guardando solo il suo cavo. Con più cavi vicini sullo stesso router, in certe posizioni indirizzi e nomi delle porte possono sovrapporsi tra loro; spostando un dispositivo si separano.

### Cavo

Nel titolo i due dispositivi («Cavo tra PC2 e SW1»), sotto lo stato: collegato, con il segnale presente o assente, oppure staccato. Poi i due capi, ciascuno con dispositivo e porta.

### Pacchetto

In testa la descrizione, lo stato (in viaggio o arrivato) e da dove a dove. Sotto, il contenuto a **strati annidati**: un riquadro per livello, ciascuno dentro quello che lo trasporta, con i campi principali. Lo strato più interno ha il colore del suo protocollo; il nome di ogni strato ha accanto un segno di quel colore, e i campi stanno su righe separate da una linea punteggiata, che porta l'occhio dall'etichetta a sinistra al valore a destra (D-114).

| Strato | Campi |
| --- | --- |
| Ethernet | MAC destinazione, MAC sorgente, EtherType |
| ARP | operazione, MAC e IP del mittente, MAC e IP cercati |
| IPv4 | IP sorgente, IP destinazione, TTL, protocollo |
| ICMP | tipo, identificativo, numero di sequenza |

### Riquadro e nota

Il titolo è «Riquadro» o «Nota», e sotto il colore (con il campione e il nome) e, per un riquadro, la grandezza. Poi tre sezioni (D-117):

- **Etichetta** (riquadro) o **Testo** (nota). L'etichetta si conferma con Invio o uscendo dal campo. Nel testo di una nota Invio va a capo: si conferma uscendo dal campo o con Ctrl+Invio. In tutti e due Esc rimette il testo di prima, senza togliere la selezione; una riga sotto il campo lo ricorda. Il testo che si sta scrivendo resta, anche se intanto la simulazione va avanti. Ogni conferma che cambia qualcosa è un passo da annullare.
- **Colore**: cinque scelte, ciascuna con il campione e il nome, in un gruppo di pulsanti di scelta (si cambia anche con le frecce). Quella scelta ha il bordo d'accento e il nome in grassetto.
- **Elimina**: il pulsante, rosso.

In presentazione il pannello si legge soltanto: il testo, il colore, e nessun campo né pulsante.

### Nessuna selezione

Una riga che dice che cosa comparirà qui.

## Fascia in basso

Corre sotto tutta la schermata. Con molti terminali aperti, le loro schede scorrono di lato in una riga sottile, e quella aperta si porta sempre in vista; la scheda Eventi e la freccia restano ferme a destra, e la pagina non si allarga (D-112). Si chiude lasciando visibile la sola riga delle schede, e si apre e si chiude anche da sola, seguendo eventi e terminali (vedi «Ossatura»). Si fa più alta o più bassa trascinandone il bordo superiore, o con le frecce su e giù quando il bordo ha il fuoco: tra 100 px e il 60% della finestra, perché il disegno resti visibile. L'altezza scelta vale finché la pagina resta aperta.

### Terminali

Ogni terminale aperto dalla barretta diventa una **scheda**, con il nome del dispositivo e una crocetta per chiuderla. Si passa da PC1 a PC2 senza perdere la cronologia di nessuno dei due. Su un host il terminale è il prompt dei comandi di Windows; su un router o uno switch è la CLI in stile IOS (vedi sotto).

Questa scelta è presa con riserva: se si rivelasse macchinosa, si passerà a un solo terminale che segue il dispositivo selezionato.

Quando un comando finisce, il cursore torna sulla riga di comando, così si può scrivere il successivo senza cliccare. Non però se nel frattempo si è fatto clic altrove, sul disegno o su un pulsante: in quel caso il cursore resta dov'è, e i tasti premuti per comandare la simulazione non finiscono scritti nel terminale.

I comandi sono quelli di Windows e i **messaggi sono in inglese**, come sui libri e in rete.

| Comando | Che cosa fa |
| --- | --- |
| `ipconfig` | Mostra indirizzo, maschera e gateway. Con il cavo staccato mostra solo `Media disconnected` |
| `ping indirizzo` | Manda quattro echo request. `ping -n 2 indirizzo` ne manda due |
| `arp -a` | Mostra la tabella ARP, con i MAC scritti con i trattini come su Windows |
| `tracert indirizzo` | Mostra i router sulla strada, una riga per salto. `tracert -h 5 indirizzo` si ferma al quinto salto invece che al trentesimo |
| `ping -i 6 indirizzo` | Come `ping`, ma il pacchetto parte con TTL 6: dopo sei router si ferma. Serve a mostrare un ciclo di routing in pochi passi |
| `cls` | Pulisce lo schermo |
| `help` | Elenca i comandi disponibili |

L'output di `ping` cresce mentre la simulazione avanza: una riga per ogni echo request che si conclude, poi le statistiche. Finché il ping non è finito il prompt non torna, come su un PC vero. Se nel frattempo il dispositivo viene spento o riconfigurato, il prompt torna appena nella simulazione non resta più nulla di quel ping.

| Esito | Riga stampata |
| --- | --- |
| Risposta | `Reply from 192.168.1.11: bytes=32 time=8ms TTL=128`. Il TTL è quello con cui la risposta è arrivata: 127 dopo un router, 126 dopo due |
| Richiesta scaduta | `Request timed out.` |
| Host non raggiungibile | `Reply from 192.168.1.10: Destination host unreachable.` (l'indirizzo è quello del PC che fa ping, come su Windows) |
| Trasmissione non riuscita | `PING: transmit failed. General failure.` |
| Rete non raggiungibile, detto da un router | `Reply from 192.168.1.1: Destination net unreachable.` (l'indirizzo è quello del router che non ha la rotta) |
| Host non raggiungibile, detto da un router | `Reply from 10.0.0.2: Destination host unreachable.` (l'ultimo router non ha trovato la destinazione) |
| TTL scaduto | `Reply from 10.0.0.2: TTL expired in transit.` |

### La CLI di router e switch

Il terminale di un router o di uno switch è la CLI in stile IOS (D-89, D-90): il pulsante Terminale sulla barretta apre una scheda come quelle dei PC. Comandi, modalità e messaggi sono descritti in [SPEC.md](../SPEC.md), sezione 3.3; l'interprete sta in `src/shell/ios/`.

- **Si parte da `R1>`**, la modalità utente, senza password. `enable`, `configure terminal`, `interface` portano a `R1#`, `R1(config)#`, `R1(config-if)#`; ogni riga resta sullo schermo con il prompt che aveva.
- **Tab** completa la parola che si sta scrivendo, e il tipo di un'interfaccia (`int gi` diventa `int GigabitEthernet`, a cui va aggiunto il numero). **`?`** risponde appena lo si preme, senza Invio: stampa le possibilità sotto la riga scritta, che resta lì da finire.
- **Ctrl+Z** dentro la CLI vale `end`, come su IOS: torna a `R1#`. Per annullare una modifica restano le frecce della barra in alto, e Ctrl+Z fuori dalla CLI.
- **Ciò che si configura** passa dalle stesse azioni del pannello: compare subito nel pannello e sul disegno, e ogni comando che cambia qualcosa è un passo della cronologia. Un comando che non cambia nulla non lo è.
- **`ping` e `traceroute`** dal router crescono mentre la simulazione avanza, come quelli dei PC, e intanto il prompt è occupato.
- **Si torna a `R1>`** chiudendo la scheda, con Ricomincia e spegnendo il dispositivo (che su un apparato vero vuol dire riavviarlo).
- Tra un comando e l'altro non c'è la riga vuota che lascia Windows.

`tracert` stampa una riga per salto man mano che lo scopre, e alla fine `Trace complete.`:

| Che cosa succede | Riga stampata |
| --- | --- |
| Un router, o la destinazione, risponde | `  2     6 ms  10.0.0.2` |
| Il salto non risponde | `  2     *     Request timed out.` (e prosegue con il successivo) |
| Un router avvisa che non si passa | `  2  192.168.1.1  reports: Destination net unreachable.` (e finisce) |
| Il PC non può nemmeno spedire | `  1  Transmit error: code 1231.` (è la riga di Windows) |

A differenza di Windows manda una sola sonda per salto, quindi ogni riga ha un tempo solo.

Come su Windows, nelle statistiche finali ogni riga che comincia con `Reply from` conta come pacchetto ricevuto, anche quando è un avviso di errore: dopo un `Destination net unreachable` si legge `Received = 1, Lost = 0`. Contano come persi solo le richieste scadute e le trasmissioni non riuscite.

La durata è scritta in millisecondi, come su Windows, ma è un numero di comodo: un tick del tempo simulato vale un millisecondo (D-65), quindi `time=8ms` dice che lo scambio ha attraversato otto tratti di cavo. Una risposta immediata, come dal loopback, è `time<1ms`.

Altre cose da sapere:

- freccia su e freccia giù richiamano i comandi già scritti;
- un ping lanciato dal terminale compare tra le conversazioni del filtro, come quelli lanciati dalla barretta;
- ricominciando la simulazione i terminali restano aperti ma si svuotano: i PC sono come appena accesi;
- il terminale di un dispositivo spento, PC, router o switch, non accetta comandi (D-109): resta aperto, con l'output di prima attenuato, e al posto della riga di comando un avviso dell'interfaccia dice «R1 è spento. Il terminale torna disponibile quando lo riaccendi.»; anche la scheda lo segna, «Terminale · R1 · spento». Da spento, nemmeno `?`, Tab e Ctrl+Z hanno effetto, quindi la configurazione non si cambia dal terminale. Il pannello laterale invece resta modificabile: è l'editor della rete;
- un nome al posto di un indirizzo non viene trovato: non esiste ancora un DNS.

### Eventi

Una riga per ogni fatto: tempo, dispositivo, che cosa è successo. Sono in italiano, come il resto dell'interfaccia. Le colonne (Tick, Dispositivo, Protocollo, Evento) hanno un'intestazione che resta in cima mentre l'elenco scorre, e una riga sottile le separa (D-113).

- Passando su una riga, sul disegno si evidenziano il dispositivo e il pacchetto coinvolti.
- Un clic sulla riga apre nel pannello laterale il pacchetto, o il dispositivo se la riga non parla di un pacchetto. Il puntatore a mano compare solo sulle righe che aprono qualcosa.
- Le righe del pacchetto mostrato nel pannello hanno una barra a sinistra e il testo in grassetto.
- Da tastiera l'elenco è una sola fermata di Tab: si entra sull'ultima riga scelta (o sull'ultima), le frecce su e giù, Home e Fine si muovono tra le righe, Invio o Spazio aprono quella col fuoco, che ha un contorno oltre al fondo.

In cima c'è il **filtro**: un selettore della conversazione (tutte, oppure una, per esempio "ping PC1 → 192.168.1.11") e un interruttore per protocollo. Ciò che il filtro nasconde sparisce sia dall'elenco sia dal disegno. A destra, quante righe si vedono sul totale.

Alcune regole del filtro:

- un guasto non appartiene a nessuna conversazione, quindi si vede sempre;
- un cambio di tabella appartiene alla conversazione che lo ha provocato, e non ha protocollo: spegnere ARP non lo nasconde;
- l'esito di un ping conta come ICMP;
- ricominciando si torna a "tutte", perché le conversazioni di prima non esistono più.

Ogni riga dice che cosa è successo, non perché: "PC3 scarta ARP request", senza il motivo. Le righe non vengono classificate in riuscite o sbagliate.

**Scorrimento** (D-113). Chi guarda il fondo dell'elenco segue gli eventi nuovi: l'elenco scorre da solo fino all'ultima riga. Chi è risalito a leggere quelli di prima resta dov'è anche mentre la simulazione va avanti (`strip/follow-list.ts`), e un pulsante **↓ Ultimi eventi**, in basso a destra, lo riporta in fondo, da dove si segue di nuovo. Nessun evento si perde e l'ordine non cambia.

## Modalità presentazione

Si attiva dal pulsante Presenta e si lascia con Esc o con il pulsante Esci, che ne prende il posto.

- **Che cosa sparisce** (D-62): la colonna dei dispositivi; nella barra in alto i menu Progetto e Visualizza, Salva, annulla e ripristina; sulla barretta Collega ed Elimina. Il tasto Canc e Ctrl+S non fanno nulla.
- **Che cosa resta**: il disegno, la barra della simulazione, il pannello laterale, le tabelle appuntate e le annotazioni, che però non si modificano; guasti, ping, terminale; i dispositivi si possono ancora spostare, e nome e indirizzi cambiare dal pannello. Ctrl+Z annulla ancora: rimette a posto un indirizzo cambiato o un dispositivo spostato per sbaglio, senza uscire.
- **Ingrandimento** (D-61): un solo fattore, di partenza 140%, regolabile dal 100% al 200% con A− e A+ nella barra in alto. Barre, pannello e fascia si ingrandiscono per intero. Nel disegno crescono dispositivi, scritte, buste, tabelle appuntate e spessore delle linee, mentre le distanze tra i dispositivi restano quelle della rete. Anche la barretta delle azioni cresce con l'ingrandimento (D-111). Il pannello laterale non supera i due quinti della finestra (D-112).
- **Inquadratura**: entrando, e a ogni cambio di ingrandimento, la rete viene inquadrata per intero. I pulsanti −, + e Adatta salgono nell'angolo in alto a destra del disegno, perché in basso la barra della simulazione è più larga. Agli ingrandimenti più alti la barra della simulazione va a capo, e la barretta delle azioni scivola di lato per non coprire lo zoom (D-112).
- **La fascia in basso parte chiusa**, e non si apre da sola: la aprono T ed E.
- **Il pannello laterale segue la selezione**: chiuso finché non si seleziona qualcosa, si richiude togliendo la selezione (D-107).
- **All'uscita** fascia, pannello e inquadratura tornano com'erano prima di entrare.

Lo schermo intero resta quello del browser (F11): l'app non lo chiede da sola.

Scorciatoie da tastiera, per condurre la dimostrazione senza cercare i pulsanti (D-63). Valgono solo in presentazione, e non mentre si scrive in una casella o nel terminale:

| Tasto | Effetto |
| --- | --- |
| Spazio | Avvia o mette in pausa. Su un pulsante o su un dispositivo con il fuoco resta un clic |
| Freccia destra | Un passo |
| E | Apre la fascia sulla scheda Eventi; se è già lì, la chiude |
| T | Apre la fascia sul terminale in primo piano, o sull'ultimo aperto; se è già lì, la chiude. Senza terminali aperti, apre quello del dispositivo selezionato |
| Esc | Lascia andare un gesto a metà (ping da puntare, elenco delle porte); altrimenti esce dalla presentazione |

## Aspetto

Carattere **sobrio**: superfici neutre, bordi sottili, angoli appena arrotondati, un solo colore d'accento. Testo in IBM Plex Sans; indirizzi, tabelle e terminale in IBM Plex Mono.

### Temi

Due temi, chiaro e scuro. All'apertura l'app segue l'impostazione del sistema; il pulsante Tema la cambia. Il chiaro è quello pensato per la proiezione.

| Ruolo | Chiaro | Scuro |
| --- | --- | --- |
| Sfondo dell'app | `#eef0f3` | `#0f1318` |
| Pannelli | `#ffffff` | `#1a2028` |
| Sfondo del disegno | `#fbfcfd` | `#151a21` |
| Testo | `#1b2430` | `#e6eaef` |
| Testo secondario | `#5b6675` | `#98a3b1` |
| Bordi e righe di separazione | `#cdd3db` | `#36414e` |
| Bordo dei campi in cui si scrive | `#8e9398` | `#626b75` |
| Accento | `#0b6e8a` | `#5cc4e0` |
| ARP | `#a65f00` | `#f0b04a` |
| ICMP | `#7a3fd0` | `#c09bff` |
| Segnale presente, acceso | `#188044` | `#4dc57f` |
| Guasto | `#cf3a3a` | `#f0716c` |

Sono i valori del bozzetto, ritoccati il 7 novembre 2026 per il contrasto (D-115): nel tema chiaro l'ambra di ARP (da `#b86a00`, 4,0:1) e il verde (da `#1c9650`, 3,5:1 sul fondo delle interfacce) sono scuriti quanto basta per arrivare a 4,5:1, nella stessa tinta; il bordo dei campi ha un colore suo, che arriva a 3:1, perché è il solo segno che lì si può scrivere. Le righe di separazione restano leggere. Tutte le coppie usate davvero sono controllate da `tests/ui/contrast.test.ts`, nei due temi. Da ritoccare ancora, se serve, quando l'interfaccia si vedrà su una LIM.

### Caratteri e misure

Tre misure di carattere, in `theme/tokens.css` (D-115), e nessun testo dell'interfaccia sotto i 12 px:

| Token | Misura | Per che cosa |
| --- | --- | --- |
| `--text-base` | 13 px | il testo, i campi, i dati tecnici (indirizzi, tabelle, terminale) |
| `--text-small` | 12 px | etichette e metadati: titoli delle sezioni in maiuscoletto, intestazioni delle tabelle, sigle dei protocolli, pastiglie, scritte della colonna e della barretta, stato della simulazione |
| `--text-title` | 16 px | il titolo del pannello laterale |

La base resta a 13 px: a 14 lo spazio per `255.255.255.252` nel campo di un'interfaccia scende da 26 a 11 px, e in presentazione al 200% su una finestra di 900×700 a 4 px. È troppo poco: il carattere è lo stesso ovunque, ma ogni sistema lo disegna un po' diverso, e su Linux un pixel di differenza ha già tagliato quell'indirizzo. I testi del disegno (nomi, indirizzi, tabelle appuntate) crescono con lo zoom e restano a parte, come il marchio. La presentazione ingrandisce tutto con il suo fattore.

Le altre misure condivise: le spaziature `--space-1` (4 px), `--space-2` (8 px) e `--space-3` (12 px); l'arrotondamento `--radius` (4 px) dei controlli, `--radius-control` (6 px) della barra in alto, `--radius-float` (8 px) di tutto ciò che galleggia (menu, barretta, barra della simulazione, righe dei messaggi, varianti della colonna); due ombre, `--shadow-menu` per i menu, che si aprono per un momento sopra tutto, e `--shadow-float`, più leggera, per i comandi che restano (barra della simulazione, zoom, messaggi, il pulsante Ultimi eventi); `--disabled-opacity` (0,45) per ogni controllo spento.

### Pulsanti

Ogni famiglia ha le sue misure: i pulsanti della barra in alto (`.tb`, 34 px), quelli della barretta (50 px per l'ingrandimento) e quelli dei pannelli e della barra della simulazione (`.btn`) non hanno la stessa grandezza, perché stanno in posti diversi. Dentro una famiglia, gli stati sono gli stessi (D-115):

| Stato | Come si vede |
| --- | --- |
| Normale | bordo sottile, fondo della superficie |
| Al passaggio | il fondo si scurisce appena, il bordo si fa più netto |
| Premuto per un momento | il fondo si scurisce ancora |
| Fuoco da tastiera | contorno di 2 px nel colore d'accento |
| Spento | attenuato allo stesso modo ovunque, e non reagisce |
| Acceso e che resta acceso (`aria-pressed`) | bordo e testo nel colore d'accento su un fondo appena tinto, e un segno che non è il colore: la spunta dei filtri ARP e ICMP e di «appuntata»; i pulsanti della barretta si riempiono del colore d'accento |
| Principale | pieno nel colore d'accento: uno solo per gruppo, Salva in alto, Avvia o Pausa nella simulazione |
| Distruttivo | testo rosso: Elimina nella barretta e nel menu Altro; la crocetta di una rotta diventa rossa solo al passaggio e con il fuoco, perché una colonna di crocette rosse sarebbe troppo vistosa |

L'interruttore di un'interfaccia del router non è un «acceso» nel colore d'accento: ha il verde e il rosso del quadratino sul cavo.

### Icone

Tutte in `theme/Icon.svelte`, nello stesso stile: riquadro di 24, tratto di 1,8, angoli arrotondati. Accanto a una scritta l'icona è nascosta al lettore di schermo, e il nome resta la scritta; un pulsante con la sola icona ha il suo `aria-label`. I quattro comandi della simulazione hanno le loro (D-115): una freccia che torna in cerchio (Ricomincia), il triangolo (Avvia), due barre (Pausa), il triangolo con una barra (Passo). Restano testo le sigle dei protocolli, gli indirizzi, la velocità «1×», i tasti come <kbd>Esc</kbd> e i simboli della CLI. Le icone dei dispositivi non cambiano.

### Colore più un secondo segno

| Informazione | Colore | Secondo segno |
| --- | --- | --- |
| Protocollo di un pacchetto | ambra, viola | la sigla sopra la busta |
| Cavo staccato | rosso | tratteggio e croce |
| Interfaccia di router o porta di switch spenta | rosso | un quadratino vuoto al posto del pallino, sul capo del cavo vicino al dispositivo; nel pannello del router la parola «spenta» |
| Segnale su una porta | verde | il pallino c'è o non c'è |
| Dispositivo spento | grigio | la scritta "spento" |
| Campo rifiutato | bordo rosso | il motivo scritto sotto, con la crocetta |
| Filtro di un protocollo acceso | accento | la spunta |
| Stato della simulazione | accento, rosso | il cerchietto vuoto o pieno, il punto esclamativo, la parola |
| Selezione | accento | contorno più spesso e barretta |

## Come è organizzato il codice

L'interfaccia sta in `src/ui/`, divisa per area. 

| File o cartella | Contenuto |
| --- | --- |
| `App.svelte` | L'ossatura: la griglia che dispone le aree. I componenti non sanno dove si trovano |
| `session.svelte.ts` | `session`, l'unico punto che parla con il simulatore. È fatta di otto strati, uno sopra l'altro (D-105, D-106); i metodi si chiamano tutti su `session` |
| `session-core.svelte.ts` | Primo strato: la rete aperta, ciò che di lei va disegnato, il tempo a schermo, la selezione, i gesti a metà, l'inquadratura |
| `session-file.svelte.ts` | Secondo strato: il file. Aprire, foglio nuovo, modifiche non salvate, preparare il salvataggio con o senza tabelle |
| `session-demo.svelte.ts` | Terzo strato: guasti, ping col mouse, terminali, tabelle appuntate, filtro |
| `session-history.svelte.ts` | Quarto strato: la cronologia per annullare e ripristinare. Gli strati sopra la usano con `capture`, `remember` e `attempt` |
| `session-editing.svelte.ts` | Quinto strato: le modifiche alla rete e la griglia magnetica |
| `session-annotations.svelte.ts` | Sesto strato: riquadri e note del disegno. Aggiungere, colore, testo ed eliminare sono passi da annullare; spostare e ridimensionare passano dal trascinamento (`holdBounds`). A schermo sono *previsti* (passaggio 5 del piano degli strumenti dell'editor) |
| `session-router.svelte.ts` | Settimo strato: interfacce e rotte statiche dei router, dal pannello |
| `session-cli.svelte.ts` | Ottavo strato: la CLI di router e switch nei terminali |
| `session-types.ts` | I tipi di selezione, tabelle appuntate, terminali e punti della cronologia |
| `view.ts` | Trasforma rete e posizioni in ciò che i componenti disegnano: etichette, segnale sui cavi, inquadratura. Non usa il browser, quindi ha i suoi test |
| `view-types.ts`, `event-text.ts` | I tipi di ciò che si disegna; il testo di ogni riga dell'elenco degli eventi |
| `preferences.svelte.ts` | Ciò che riguarda solo chi guarda: tema, etichette accese, pannelli aperti |
| `theme/tokens.css` | I colori dei due temi, i caratteri, le misure: in un solo punto |
| `theme/DeviceIcon.svelte` | Le sagome dei dispositivi |
| `layout/` | Barra in alto (`TopBar.svelte`, con i menu di `Menu.svelte`) e colonna dei dispositivi |
| `presentation.ts` | Modalità presentazione: entrare, uscire, scorciatoie. L'ingrandimento sta in `preferences` |
| `topology/` | Il disegno (`Topology.svelte`) e i suoi componenti: dispositivi, cavi, buste, indicatore di attesa, barretta delle azioni, elenco delle porte, tabelle appuntate, messaggi. Senza schermo: `camera.ts`, `geometry.ts`, `grid.ts`, `placement.ts` e `bar-placement.ts` (calcoli), `bar-actions.ts` (che cosa offre la barretta, quali azioni sono sempre in vista), `keyboard.ts` (i tasti), `view-gestures.ts` (rotella e trascinamento dello sfondo) |
| `panels/` | Il pannello laterale: le sue sezioni (`PanelSection.svelte`), il campo della configurazione (`ConfigField.svelte`), le tabelle a due colonne (`PairTable.svelte`), le interfacce e le rotte del router, gli strati annidati del pacchetto |
| `strip/` | La fascia in basso: le schede, i terminali, l'elenco degli eventi con il suo filtro |
| `simulation/SimulationBar.svelte` | La barra della simulazione |
| `simulation/playback.ts` | L'orologio: fa scorrere il tempo a schermo e chiede al motore di avanzare. Ha i suoi test, con un orologio finto |

I caratteri IBM Plex sono inclusi nel sito, non scaricati da un servizio esterno: l'app deve funzionare anche senza rete e dietro il filtro della scuola. Sono inclusi i pesi 400, 500 e 600 di IBM Plex Sans e 400 e 500 di IBM Plex Mono (`src/main.ts`): lo stile usa solo quelli. Il 600 sul carattere a larghezza fissa (destinazione e sigla di una rotta, nome di un'interfaccia, nome del file in testa al menu Progetto) non è incluso, e il browser lo ricava dal 500.

Restano valide le regole di [architettura.md](architettura.md): l'interfaccia comanda il motore solo con le azioni e ne legge lo stato dopo ogni comando. Ciò che riguarda solo lo schermo (selezione, tabelle appuntate, inquadratura, tema, filtro, terminali aperti) è stato della vista, e il motore non lo conosce.

Gli interpreti dei comandi stanno fuori da `src/ui/`: il prompt dei PC in `src/shell/windows.ts`, la CLI di router e switch in `src/shell/ios/` ([cli.md](cli.md)). Lì il testo diventa un comando e il risultato di un comando diventa testo, senza sapere nulla né del simulatore né dello schermo. È `session` a eseguire il comando e a tenere ciò che ogni terminale ha stampato.

Fuori da `src/ui/` stanno anche le parti su cui si appoggia l'editor: le azioni di modifica nel motore (`editing.ts`, `router-editing.ts`, `port-editing.ts`), che scelgono da sole nomi e indirizzi MAC dei dispositivi nuovi, e la scrittura dei file in `src/storage/`.

## Piano di costruzione

Nove passaggi, ciascuno verificabile da solo nel browser.

| N. | Passaggio | Che cosa si vede alla fine |
| --- | --- | --- |
| 1 | **Fatto.** Ossatura, temi, disegno della rete nel nuovo stile, apertura di un file | Si apre un file di esempio e lo si vede disegnato con il nuovo aspetto, nei due temi |
| 2 | **Fatto.** Barra della simulazione: passo, tempo reale, velocità, buste animate con sigla, attese, avviso di sospensione | Un ping si guarda scorrere da solo |
| 3 | **Fatto.** Selezione, barretta e pannello laterale: dispositivo e cavo in sola lettura, pacchetto a strati, guasti e ping dalla barretta | Si conduce la dimostrazione di ARP e ping |
| 4 | **Fatto.** Fascia in basso con la scheda Eventi, il filtro e il collegamento al disegno | Si segue una sola conversazione |
| 5 | **Fatto.** Tabelle appuntate | Si vedono insieme pacchetto, contenuto e tabelle |
| 6 | **Fatto.** Terminale: interprete dei comandi e schede | `ping` e `arp -a` dal prompt |
| 7 | **Fatto.** Editor: azioni di modifica nel motore; colonna, spostare ed eliminare; strumento Cavo, Collega e scelta della porta; nome e configurazione dal pannello; annulla e ripristina | Si costruisce una rete da zero |
| 8 | **Fatto.** Nuova, Salva e Salva con nome; zoom, spostamento della vista e Adatta | Si prepara una rete a casa e la si riapre in aula |
| 9 | **Fatto.** Modalità presentazione e scorciatoie | Il rilascio 1 è completo |

Dopo il passaggio 3 l'app è già proiettabile per la lezione su ARP e ping, su una rete preparata come file.
