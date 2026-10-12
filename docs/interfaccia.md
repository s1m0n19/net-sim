# Interfaccia

**Stato:** costruita, da provare in aula. Descrive l'interfaccia decisa nell'intervista del 10 ottobre 2026 e realizzata nei nove passaggi del piano in fondo al documento, tutti fatti. Dove il codice si è scostato dal progetto iniziale, il documento descrive il codice.

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
| barra in alto: file, annulla, etichette, tema, Presenta    |
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
| Barra in alto | Nuova, Apri, Salva, annulla e ripristina, nome della rete, interruttori delle etichette, tema, Presenta | no |
| Colonna a sinistra | Dispositivi da posare e strumento Cavo | sì |
| Disegno | La topologia, con sopra la barra della simulazione | no |
| Pannello laterale | Ciò che è selezionato: un dispositivo, un cavo o un pacchetto | sì |
| Fascia in basso | Una scheda per ogni terminale aperto, più la scheda Eventi | sì |

Colonna, pannello laterale e fascia si aprono e si chiudono con lo stesso pulsante: una piccola freccia, senza parole, che indica da che parte il pannello si ritira. Il suo significato è scritto nel suggerimento che compare passandoci sopra.

La disposizione è una decisione presa con riserva: i pannelli sono componenti indipendenti dalla griglia che li ospita, così cambiarla non richiede di riscriverli (requisito NF-7).

## Che cosa c'è già

Dopo i primi sei passaggi:

- l'ossatura completa, con la colonna, il pannello laterale e la fascia che si aprono e si chiudono;
- i due temi, con il pulsante Tema;
- il foglio vuoto all'avvio;
- **Apri**, che legge un file di rete e segnala in una riga rossa se non è valido, **Nuova**, che torna al foglio vuoto, **Salva** e **Salva con nome**, che scrivono la rete in un file;
- il disegno della rete: dispositivi con nome e indirizzo con prefisso, cavi con il pallino del segnale, cavo staccato, dispositivo spento, host non configurato;
- gli interruttori delle etichette IP, MAC e Porte;
- l'inquadratura: un foglio di base che si allarga solo se serve, la rotella per ingrandire, lo sfondo da trascinare per spostare la vista, i pulsanti −, + e Adatta;
- la **barra della simulazione**: Ricomincia, Avvia e Pausa, Passo, velocità, tick;
- le **buste** in viaggio, con colore e sigla del protocollo;
- in tempo reale: 1,4 secondi per tratto di cavo a 1×, le attese accorciate con l'indicatore sul dispositivo, la pausa tra un echo e il successivo;
- l'avviso della tempesta di broadcast;
- la **selezione** di dispositivi, cavi e buste, con un clic o da tastiera; un clic sullo sfondo o Esc la toglie;
- la **barretta delle azioni**, per ora con le sole azioni che esistono: spegni o accendi, Ping, Collega, Terminale, Appunta ed Elimina sui dispositivi, stacca o riattacca ed Elimina sui cavi;
- il **ping col mouse**: Ping sulla barretta, poi clic sulla destinazione;
- il **pannello laterale**: nome e configurazione IP del dispositivo, che si cambiano da lì, le sue tabelle, capi e stato del cavo, strati annidati del pacchetto;
- la **scheda Eventi**: una riga per fatto, collegata al disegno, con il filtro per conversazione e per protocollo;
- le **tabelle appuntate** sul disegno, trascinabili, con la riga nuova o persa che si fa notare;
- il **terminale** degli host, una scheda per ciascuno, con `ipconfig`, `ping`, `tracert`, `arp -a`, `cls` e `help`;
- l'**editor**: posare PC e switch dalla colonna, spostarli trascinandoli, eliminare dispositivi e cavi, collegarli con un cavo nuovo e scegliere la porta, rinominarli e configurarli dal pannello, annullare e ripristinare ogni modifica;
- il **router** (rilascio 2): si posa dalla colonna nelle tre varianti; dal pannello se ne accendono le interfacce, se ne impostano gli indirizzi e si aggiungono e tolgono le rotte statiche; tabella di routing e tabella ARP si appuntano sul disegno; gli indirizzi delle interfacce sono scritti accanto ai cavi;
- la **modalità presentazione**, con l'ingrandimento regolabile e le scorciatoie da tastiera.

Con questo i nove passaggi del piano sono fatti.

## File

- **Salva** (Ctrl+S, Cmd+S su Mac) scrive la rete nel file da cui viene, quello aperto o quello dell'ultimo salvataggio; se non ce n'è uno chiede dove, proponendo il nome della rete. Dove il browser non lo permette, scarica il file (D-57). È spento sul foglio vuoto.
- **Salva con nome** (Ctrl+Maiusc+S) chiede sempre dove, e da lì in poi il file della rete è quello nuovo: serve a non sovrascrivere il file di partenza. Dove il browser può solo scaricare, chiede il nome.
- Accanto al nome della rete, **«● modificata»** dice che ci sono modifiche non salvate: il file che ne uscirebbe è diverso dall'ultimo aperto o salvato. Contano le modifiche alla rete, gli spostamenti e i guasti; non il traffico. Annullare tutto riporta a "salvata".
- Con modifiche non salvate, **Nuova**, **Apri** e la chiusura della pagina chiedono conferma (D-58). Per ora la conferma, come la richiesta del nome, è una finestrella del browser; prima del rilascio completo diventeranno riquadri nello stile dell'app.
- Salvare non tocca la simulazione, la selezione né la cronologia.

## All'avvio

L'app si apre sempre su un foglio vuoto, con un invito al centro del disegno: trascinare un dispositivo dalla colonna, oppure aprire un file. Non ricorda l'ultima rete e non ha reti di esempio integrate: quelle della cartella `examples/` si aprono come qualsiasi file.

## Colonna dei dispositivi e degli strumenti

- **Dispositivi.** Una voce per tipo. Le varianti pronte (switch a 8 o a 24 porte; router a 2, 4 o 8 interfacce) si scelgono prima di posare: passando sulla voce si apre il loro elenco.
- **Posare.** In due modi: trascinando la voce sul disegno, per posarne uno; oppure con un clic sulla voce e poi un clic sul disegno per ogni dispositivo da posare, finché non si preme Esc. Nel secondo modo la voce resta evidenziata, il puntatore cambia e una riga in alto sul disegno dice che cosa fare. Il dispositivo appena posato viene selezionato.
- **Strumento Cavo.** Finché è attivo, trascinare da un dispositivo a un altro tira un cavo invece di spostare; lo stesso si ottiene con un clic sul primo dispositivo e uno sul secondo (D-51). Mentre si trascina, una linea tratteggiata segue il mouse. Si disattiva con Esc o con un secondo clic sulla voce.
- **Server.** Si posa come un PC. Per la rete è un host identico a un PC, con indirizzo, gateway e terminale; cambiano l'icona e il nome (`SRV1`). I servizi che ospiterà arrivano più avanti.

Un dispositivo appena posato riceve un nome progressivo (PC1, PC2, SW1) e i suoi indirizzi MAC. Un PC nasce senza configurazione IP.

## Disegno

### Dispositivi ed etichette

Sagome essenziali a tratto, in tinta neutra, su un riquadro arrotondato. Sotto ogni dispositivo restano sempre scritti il **nome** e, per gli host, l'**indirizzo con il prefisso** (`192.168.1.10/24`); un host senza indirizzo mostra "non configurato".

Indirizzi MAC e nomi delle porte sono spenti all'apertura e si accendono dalla barra in alto, ciascuno con il suo interruttore. Anche l'indirizzo IP ha il suo, acceso all'apertura.

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

Accanto a ciò che è selezionato compare una **barretta** con le azioni principali, come icone. Non c'è un menu del tasto destro: tutto ciò che si può fare è visibile, e funziona anche alla LIM.

| Selezionato | Azioni sulla barretta |
| --- | --- |
| Host (PC o server) | Spegni o accendi · Ping · Collega · Terminale · Appunta la tabella ARP · Elimina |
| Switch | Spegni o accendi · Collega · Appunta la tabella MAC · Elimina |
| Router | Spegni o accendi · Collega · Appunta la tabella di routing · Elimina |
| Cavo | Stacca o riattacca · Elimina |

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

### Spostare ed eliminare

Un dispositivo si sposta trascinandolo: cavi, buste in viaggio e tabella appuntata lo seguono. Un clic senza movimento resta un clic, e seleziona. Mentre si trascina l'inquadratura resta ferma, e si riadatta al rilascio.

Si elimina ciò che è selezionato con il cestino sulla barretta, oppure con il tasto Canc o Backspace. Eliminando un dispositivo spariscono anche i suoi cavi, la sua tabella appuntata e il suo terminale. Scrivendo in una casella di testo o nel terminale, Canc e Backspace cancellano solo il testo.

### Annulla e ripristina

Le due frecce della barra in alto, e da tastiera Ctrl+Z per annullare e Ctrl+Maiusc+Z o Ctrl+Y per ripristinare (Cmd su Mac). Sono spente quando non c'è nulla da annullare o da ripristinare. Scrivendo in una casella di testo o nel terminale, le scorciatoie restano quelle del testo.

- **Che cosa si annulla** (D-55): posare, spostare, collegare, cambiare porta, rinominare, configurare, eliminare. Un trascinamento conta come una sola modifica. Guasti e traffico non si annullano: restano come sono.
- **La simulazione continua** (D-54, D-56): annullare equivale a fare a mano la modifica contraria. Un dispositivo che torna è appena acceso, con le tabelle vuote; gli altri tengono le loro. Un frame in viaggio verso qualcosa che sparisce va perso. L'elenco degli eventi mostra ciò che è successo con le righe di sempre ("PC3 viene tolto dalla rete").
- **Con ciò che sparisce** se ne vanno la sua selezione, la sua tabella appuntata e il suo terminale. Tornando, il dispositivo non li riporta.
- **Limiti.** Si torna indietro di cento modifiche. Una modifica nuova cancella ciò che si poteva ripristinare. Aprire un file o Nuova svuotano la cronologia; Ricomincia no. A simulazione sospesa annullare viene rifiutato, come ogni altra modifica.

### L'inquadratura

Il disegno parte da un foglio di base. Finché la rete ci sta, posare o spostare un dispositivo non cambia nulla; se un dispositivo esce dal foglio, l'inquadratura si allarga per contenerlo. Così il disegno non "salta" a ogni modifica.

### Muoversi sul disegno

La rotella del mouse ingrandisce e rimpicciolisce attorno al puntatore: ciò che sta sotto il puntatore resta dov'è. Trascinando lo sfondo si sposta la vista; un clic senza movimento resta un clic, e posa o toglie la selezione. Nell'angolo in basso a destra del disegno ci sono i pulsanti −, + e Adatta: i primi due agiscono attorno al centro di ciò che si vede, Adatta inquadra tutta la rete.

- **Automatica o scelta** (D-59). Finché non si tocca nulla vale l'inquadratura automatica del foglio. Dal primo ingrandimento, spostamento o Adatta l'inquadratura è quella scelta, e non cambia più da sola: un dispositivo posato fuori vista resta fuori vista finché non si preme Adatta. Nuova torna a quella automatica.
- **All'apertura di un file** la rete viene inquadrata per intero, come con Adatta (D-60).
- **Adatta** lascia margine per le etichette e per la barra della simulazione, tiene dentro anche le tabelle appuntate, e non ingrandisce oltre un riquadro minimo: un PC da solo non riempie lo schermo. Sul foglio vuoto torna all'inquadratura automatica.
- **Limiti.** Si arriva a quattro volte più vicino e a cinque volte più lontano del foglio di base.
- Con la vista si ingrandisce tutto il disegno, comprese scritte, barretta delle azioni ed elenco delle porte. L'inquadratura non si salva nel file.

## Barra della simulazione

Una barra compatta che galleggia in basso al centro del disegno, come i comandi di un lettore video. Resta anche in modalità presentazione.

| Comando | Effetto |
| --- | --- |
| Ricomincia | Riporta la rete allo stato di una appena accesa: tabelle vuote, nessun pacchetto, tempo a zero. Guasti e configurazione restano |
| Avvia / Pausa | Fa scorrere il tempo da solo, o lo ferma |
| Passo | Avanza di un istante. Disponibile a simulazione ferma |
| Velocità | 0,5×, 1×, 2× |
| Tempo | Il tick corrente |

**Tempo a schermo e tempo simulato.** Il motore avanza a scatti, da un istante al successivo. A schermo invece le buste scivolano: l'orologio dell'interfaccia tiene un tempo che sta tra un istante e l'altro, e la posizione di una busta sul cavo dipende da quello. Quando il tempo a schermo raggiunge il prossimo istante, l'orologio chiede al motore di elaborarlo. Avvia non si spegne quando la rete resta ferma: resta in ascolto, e un ping lanciato dopo parte da solo.

**Passo.** Fa arrivare a destinazione le buste in viaggio, un po' più svelto del tempo reale, e si ferma. Le buste nate in quell'istante restano accanto a chi le ha spedite, in attesa del passo successivo.

**Attese.** In tempo reale, quando non viaggia nulla e c'è solo un'attesa in corso (una risposta ARP o un echo reply che non arrivano), non si aspetta davvero: sul dispositivo che aspetta compare un piccolo indicatore che si svuota in due o tre secondi, qualunque sia la durata in tick, poi il tempo salta alla scadenza. Si vede chi sta aspettando, senza tempi morti.

**Pausa tra gli echo.** In tempo reale una breve pausa a schermo separa un echo request dal successivo, così i quattro giri di un ping si distinguono. In passo-passo non c'è. La pausa è dell'interfaccia: il motore non ne sa nulla.

**Tempesta di broadcast.** Quando il motore si sospende, la barra lo dice e un avviso ne spiega la causa. Si riparte con Ricomincia.

## Pannello laterale

Mostra l'ultima cosa selezionata. Si chiude con la freccia nell'angolo in alto a destra, e si riduce a una striscia sottile sul bordo, da cui si riapre. Chiuso, resta chiuso anche quando si seleziona qualcosa: lo riapre solo l'utente.

### Dispositivo

Nome, tipo, stato (acceso o spento, segnale presente o assente), e per un host i campi della configurazione IP: indirizzo, subnet mask, gateway. Sotto, le sue tabelle, ciascuna con il pulsante per appuntarla. Il nome si cambia dal suo campo, con le stesse regole di conferma della configurazione; un nome vuoto o già usato viene rifiutato.

**Modificare la configurazione.** Un campo ha effetto quando lo si conferma, con Invio o uscendo dal campo. Il valore viene controllato con le regole di `checkIpConfig`:

- se è accettabile, viene applicato;
- se non lo è, il campo si segna in rosso e sotto compare il motivo, per esempio "è l'indirizzo di broadcast della sottorete". La rete conserva il valore di prima, e ciò che si è scritto resta nel campo per correggerlo (D-53).

Esc, dentro un campo, rimette il valore della rete senza togliere la selezione. Uscire da un campo senza averlo cambiato non fa nulla: in particolare non svuota la tabella ARP dell'host (D-48).

**Togliere la configurazione.** Svuotare l'indirizzo svuota anche maschera e gateway (D-52). Svuotare la sola maschera viene rifiutato.

**Maschera proposta.** Scritto l'indirizzo su un host senza maschera, la maschera si compila da sola con quella della classe dell'indirizzo (255.255.255.0 per 192.168.1.10), come fa Windows. Si può cambiare. Senza questo aiuto il primo indirizzo verrebbe rifiutato, perché indirizzo e maschera vanno impostati insieme.

### Router

Nome, stato, e poi le sue **interfacce**, una sotto l'altra. Ciascuna ha:

- un **interruttore** che dice «accesa» o «spenta» e la cambia con un clic. Un router nasce con tutte le interfacce spente (D-70);
- i campi **Indirizzo IP** e **Subnet mask**, con le stesse regole di conferma dei PC: Invio o uscita dal campo, bordo rosso e motivo se il valore viene rifiutato.

Tre aiuti nello scrivere l'indirizzo di un'interfaccia:

- la maschera viene proposta dalla classe dell'indirizzo, come per i PC;
- se quella maschera farebbe sovrapporre la rete a quella di un'altra interfaccia dello stesso router, viene proposta la maschera di quell'altra: dopo `10.0.0.1/30` su un'interfaccia, `10.0.0.5` sull'altra diventa `/30` anche lei, invece di essere rifiutata come `/8`;
- nel campo dell'indirizzo si può scrivere anche il prefisso, `10.0.0.5/30`, e indirizzo e maschera si impostano insieme.

Sotto le interfacce, la **tabella di routing**: una riga per rete, con la sigla C per una rete collegata e S per una rotta statica, il prossimo salto e l'interfaccia da cui si esce. Una rotta statica il cui prossimo salto non sta su una rete collegata non ha un'interfaccia: la riga è attenuata e dice «non usata».

- **Togliere una rotta statica**: la crocetta in fondo alla sua riga.
- **Aggiungerne una**: i tre campi sotto la tabella (rete, maschera, prossimo salto) e il pulsante Aggiungi rotta, o Invio. La maschera si scrive per esteso oppure come prefisso (`/24`); il prefisso può stare anche in coda alla rete (`192.168.2.0/24`). Una rotta rifiutata lascia i campi come sono, con il motivo sotto.

In fondo, la **tabella ARP** del router.

Tutte e due le tabelle si appuntano sul disegno, ciascuna con il suo pulsante; nascono una a sinistra e una a destra sotto il router. Dalla barretta si appunta la tabella di routing, che è quella che serve in lezione.

Sul disegno un'interfaccia spenta si riconosce dal quadratino rosso sul capo del cavo vicino al router; con l'etichetta Porte accesa, accanto al nome della porta compare «spenta».

**Indirizzi sul disegno** (D-75). Un router non ha un indirizzo solo, quindi sotto di lui resta soltanto il nome: l'indirizzo di ogni interfaccia è scritto accanto al suo cavo, sul capo vicino al router, con il prefisso (`192.168.1.1/24`). Così si vede a colpo d'occhio quale indirizzo guarda quale rete. Li accende e li spegne l'interruttore IP, come per i PC.

La scritta comincia appena fuori dal router e si allontana da lui, sopra il cavo; se il cavo sale sta invece sotto, così non lo attraversa mai. Su un cavo corto tra due router i due indirizzi non starebbero di fila: quello del secondo capo va sotto il cavo, e il nome della sua porta, se acceso, passa sopra. Su un cavo troppo corto perché la scritta ci stia partendo dal router, come capita in presentazione, la scritta sta centrata a metà del cavo, così non finisce sopra il dispositivo all'altro capo.

Limite noto: la posizione di ogni scritta è calcolata guardando solo il suo cavo. Con più cavi vicini sullo stesso router, in certe posizioni indirizzi e nomi delle porte possono sovrapporsi tra loro; spostando un dispositivo si separano.

### Cavo

I due capi, ciascuno con dispositivo e porta, e lo stato: collegato o staccato.

### Pacchetto

Il contenuto a **strati annidati**: un riquadro per livello, ciascuno dentro quello che lo trasporta, con i campi principali. Lo strato più interno ha il colore del suo protocollo.

| Strato | Campi |
| --- | --- |
| Ethernet | MAC destinazione, MAC sorgente, EtherType |
| ARP | operazione, MAC e IP del mittente, MAC e IP cercati |
| IPv4 | IP sorgente, IP destinazione, TTL, protocollo |
| ICMP | tipo, identificativo, numero di sequenza |

### Nessuna selezione

Una riga che dice che cosa comparirà qui.

## Fascia in basso

Corre sotto tutta la schermata. Si chiude lasciando visibile la sola riga delle schede.

### Terminali

Ogni terminale aperto dalla barretta di un host diventa una **scheda**, con il nome dell'host e una crocetta per chiuderla. Si passa da PC1 a PC2 senza perdere la cronologia di nessuno dei due.

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

L'output di `ping` cresce mentre la simulazione avanza: una riga per ogni echo request che si conclude, poi le statistiche. Finché il ping non è finito il prompt non torna, come su un PC vero.

| Esito | Riga stampata |
| --- | --- |
| Risposta | `Reply from 192.168.1.11: bytes=32 time=8ms TTL=128`. Il TTL è quello con cui la risposta è arrivata: 127 dopo un router, 126 dopo due |
| Richiesta scaduta | `Request timed out.` |
| Host non raggiungibile | `Reply from 192.168.1.10: Destination host unreachable.` (l'indirizzo è quello del PC che fa ping, come su Windows) |
| Trasmissione non riuscita | `PING: transmit failed. General failure.` |
| Rete non raggiungibile, detto da un router | `Reply from 192.168.1.1: Destination net unreachable.` (l'indirizzo è quello del router che non ha la rotta) |
| Host non raggiungibile, detto da un router | `Reply from 10.0.0.2: Destination host unreachable.` (l'ultimo router non ha trovato la destinazione) |
| TTL scaduto | `Reply from 10.0.0.2: TTL expired in transit.` |

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
- il terminale di un PC spento non accetta comandi;
- un nome al posto di un indirizzo non viene trovato: non esiste ancora un DNS.

### Eventi

Una riga per ogni fatto: tempo, dispositivo, che cosa è successo. Sono in italiano, come il resto dell'interfaccia.

- Passando su una riga, sul disegno si evidenziano il dispositivo e il pacchetto coinvolti.
- Un clic sulla riga apre il pacchetto nel pannello laterale.

In cima c'è il **filtro**: un selettore della conversazione (tutte, oppure una, per esempio "ping PC1 → 192.168.1.11") e un interruttore per protocollo. Ciò che il filtro nasconde sparisce sia dall'elenco sia dal disegno. A destra, quante righe si vedono sul totale.

Alcune regole del filtro:

- un guasto non appartiene a nessuna conversazione, quindi si vede sempre;
- un cambio di tabella appartiene alla conversazione che lo ha provocato, e non ha protocollo: spegnere ARP non lo nasconde;
- l'esito di un ping conta come ICMP;
- ricominciando si torna a "tutte", perché le conversazioni di prima non esistono più.

Ogni riga dice che cosa è successo, non perché: "PC3 scarta ARP request", senza il motivo. L'elenco scorre da solo fino all'ultima riga.

## Modalità presentazione

Si attiva dal pulsante Presenta e si lascia con Esc o con il pulsante Esci, che ne prende il posto.

- **Che cosa sparisce** (D-62): la colonna dei dispositivi; nella barra in alto Nuova, Apri, Salva, annulla e le etichette; sulla barretta Collega ed Elimina. Il tasto Canc e Ctrl+S non fanno nulla.
- **Che cosa resta**: il disegno, la barra della simulazione, il pannello laterale e le tabelle appuntate; guasti, ping, terminale; i dispositivi si possono ancora spostare, e nome e indirizzi cambiare dal pannello. Ctrl+Z annulla ancora: rimette a posto un indirizzo cambiato o un dispositivo spostato per sbaglio, senza uscire.
- **Ingrandimento** (D-61): un solo fattore, di partenza 140%, regolabile dal 100% al 200% con A− e A+ nella barra in alto. Barre, pannello e fascia si ingrandiscono per intero. Nel disegno crescono dispositivi, scritte, buste, tabelle appuntate e spessore delle linee, mentre le distanze tra i dispositivi restano quelle della rete. La barretta delle azioni non cresce.
- **Inquadratura**: entrando, e a ogni cambio di ingrandimento, la rete viene inquadrata per intero. I pulsanti −, + e Adatta salgono nell'angolo in alto a destra del disegno, perché in basso la barra della simulazione è più larga.
- **La fascia in basso parte chiusa.**
- **All'uscita** fascia e inquadratura tornano com'erano prima di entrare.

Lo schermo intero resta quello del browser (F11): l'app non lo chiede da sola.

Scorciatoie da tastiera, per condurre la dimostrazione senza cercare i pulsanti (D-63). Valgono solo in presentazione, e non mentre si scrive in una casella o nel terminale:

| Tasto | Effetto |
| --- | --- |
| Spazio | Avvia o mette in pausa. Su un pulsante o su un dispositivo con il fuoco resta un clic |
| Freccia destra | Un passo |
| E | Apre la fascia sulla scheda Eventi; se è già lì, la chiude |
| T | Apre la fascia sul terminale in primo piano, o sull'ultimo aperto; se è già lì, la chiude. Senza terminali aperti, apre quello del PC selezionato |
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
| Bordi | `#cdd3db` | `#36414e` |
| Accento | `#0b6e8a` | `#5cc4e0` |
| ARP | `#b86a00` | `#f0b04a` |
| ICMP | `#7a3fd0` | `#c09bff` |
| Segnale presente | `#1c9650` | `#4dc57f` |
| Guasto | `#cf3a3a` | `#f0716c` |

Sono i valori del bozzetto: un punto di partenza, da ritoccare quando l'interfaccia si vedrà funzionare su una LIM.

### Colore più un secondo segno

| Informazione | Colore | Secondo segno |
| --- | --- | --- |
| Protocollo di un pacchetto | ambra, viola | la sigla sopra la busta |
| Cavo staccato | rosso | tratteggio e croce |
| Interfaccia di router spenta | rosso | un quadratino vuoto al posto del pallino, sul capo del cavo vicino al router; nel pannello la parola «spenta» |
| Segnale su una porta | verde | il pallino c'è o non c'è |
| Dispositivo spento | grigio | la scritta "spento" |
| Campo rifiutato | bordo rosso | il motivo scritto sotto |
| Selezione | accento | contorno più spesso e barretta |

## Come è organizzato il codice

L'interfaccia sta in `src/ui/`, divisa per area. 

| File o cartella | Contenuto |
| --- | --- |
| `App.svelte` | L'ossatura: la griglia che dispone le aree. I componenti non sanno dove si trovano |
| `session.svelte.ts` | `session`, l'unico punto che parla con il simulatore. È fatta di tre strati, uno sopra l'altro; i metodi si chiamano tutti su `session` |
| `session-core.svelte.ts` | Primo strato: la rete aperta, ciò che di lei va disegnato, il tempo a schermo, il file, la selezione, i gesti a metà, l'inquadratura |
| `session-demo.svelte.ts` | Secondo strato: guasti, ping col mouse, terminali, tabelle appuntate, filtro |
| `session-editing.svelte.ts` | Terzo strato: le modifiche alla rete e la cronologia per annullare |
| `session-types.ts` | I tipi di selezione, tabelle appuntate, terminali e punti della cronologia |
| `view.ts` | Trasforma rete e posizioni in ciò che i componenti disegnano: etichette, segnale sui cavi, inquadratura. Non usa il browser, quindi ha i suoi test |
| `view-types.ts`, `event-text.ts` | I tipi di ciò che si disegna; il testo di ogni riga dell'elenco degli eventi |
| `preferences.svelte.ts` | Ciò che riguarda solo chi guarda: tema, etichette accese, pannelli aperti |
| `theme/tokens.css` | I colori dei due temi, i caratteri, le misure: in un solo punto |
| `theme/DeviceIcon.svelte` | Le sagome dei dispositivi |
| `layout/` | Barra in alto e colonna dei dispositivi |
| `presentation.ts` | Modalità presentazione: entrare, uscire, scorciatoie. L'ingrandimento sta in `preferences` |
| `topology/` | Il disegno (`Topology.svelte`) e i suoi componenti: dispositivi, cavi, buste, indicatore di attesa, barretta delle azioni, elenco delle porte, tabelle appuntate, messaggi. Senza schermo: `camera.ts` e `geometry.ts` (calcoli), `bar-actions.ts` (che cosa offre la barretta), `keyboard.ts` (i tasti), `view-gestures.ts` (rotella e trascinamento dello sfondo) |
| `panels/` | Il pannello laterale, il campo della configurazione (`ConfigField.svelte`) e gli strati annidati del pacchetto |
| `strip/` | La fascia in basso: le schede, i terminali, l'elenco degli eventi con il suo filtro |
| `simulation/SimulationBar.svelte` | La barra della simulazione |
| `simulation/playback.ts` | L'orologio: fa scorrere il tempo a schermo e chiede al motore di avanzare. Ha i suoi test, con un orologio finto |

I caratteri IBM Plex sono inclusi nel sito, non scaricati da un servizio esterno: l'app deve funzionare anche senza rete e dietro il filtro della scuola.

Restano valide le regole di [architettura.md](architettura.md): l'interfaccia comanda il motore solo con le azioni e ne legge lo stato dopo ogni comando. Ciò che riguarda solo lo schermo (selezione, tabelle appuntate, inquadratura, tema, filtro, terminali aperti) è stato della vista, e il motore non lo conosce.

Il prompt dei comandi sta fuori da `src/ui/`, in `src/shell/windows.ts`: lì il testo diventa un comando e il risultato di un comando diventa testo, senza sapere nulla né del simulatore né dello schermo. È `session` a eseguire il comando e a tenere ciò che ogni terminale ha stampato.

Serviranno parti nuove fuori da `src/ui/`:

- **azioni di modifica** nel motore: aggiungere, spostare, collegare, eliminare, rinominare, configurare;
- **generazione degli indirizzi MAC** per i dispositivi nuovi;
- **scrittura dei file** in `src/storage/`.

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
