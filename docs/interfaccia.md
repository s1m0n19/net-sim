# Interfaccia

**Stato:** in costruzione. Descrive l'interfaccia decisa nell'intervista del 10 ottobre 2026. Dei nove passaggi del piano, in fondo al documento, sono fatti i primi cinque: ossatura, temi, disegno della rete, apertura di un file; barra della simulazione, tempo reale, buste animate, attese; selezione, barretta delle azioni, pannello laterale; scheda Eventi con il filtro; tabelle appuntate. Tutto il resto è descritto qui ma non esiste ancora; la pagina provvisoria di prima resta raggiungibile all'indirizzo `/#provvisoria` finché la nuova non la sostituisce del tutto: oggi le manca solo il ping con quattro richieste, che arriverà con il terminale.

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

Dopo i primi cinque passaggi:

- l'ossatura completa, con la colonna, il pannello laterale e la fascia che si aprono e si chiudono;
- i due temi, con il pulsante Tema;
- il foglio vuoto all'avvio;
- **Apri**, che legge un file di rete e segnala in una riga rossa se non è valido, e **Nuova**, che torna al foglio vuoto;
- il disegno della rete: dispositivi con nome e indirizzo con prefisso, cavi con il pallino del segnale, cavo staccato, dispositivo spento, host non configurato;
- gli interruttori delle etichette IP, MAC e Porte;
- la rete sempre inquadrata per intero;
- la **barra della simulazione**: Ricomincia, Avvia e Pausa, Passo, velocità, tick;
- le **buste** in viaggio, con colore e sigla del protocollo;
- in tempo reale: 1,4 secondi per tratto di cavo a 1×, le attese accorciate con l'indicatore sul dispositivo, la pausa tra un echo e il successivo;
- l'avviso della tempesta di broadcast;
- la **selezione** di dispositivi, cavi e buste, con un clic o da tastiera; un clic sullo sfondo o Esc la toglie;
- la **barretta delle azioni**, per ora con le sole azioni che esistono: spegni o accendi, Ping e Appunta sui dispositivi, stacca o riattacca sui cavi;
- il **ping col mouse**: Ping sulla barretta, poi clic sulla destinazione;
- il **pannello laterale**, in sola lettura: configurazione e tabelle del dispositivo, capi e stato del cavo, strati annidati del pacchetto;
- la **scheda Eventi**: una riga per fatto, collegata al disegno, con il filtro per conversazione e per protocollo;
- le **tabelle appuntate** sul disegno, trascinabili, con la riga nuova o persa che si fa notare.

Salva, annulla, Presenta e le voci della colonna sono visibili ma spenti. Sulla barretta mancano Collega, Terminale ed Elimina, che arriveranno con i passaggi a cui appartengono.

## All'avvio

L'app si apre sempre su un foglio vuoto, con un invito al centro del disegno: trascinare un dispositivo dalla colonna, oppure aprire un file. Non ricorda l'ultima rete e non ha reti di esempio integrate: quelle della cartella `examples/` si aprono come qualsiasi file.

## Colonna dei dispositivi e degli strumenti

- **Dispositivi.** Una voce per tipo. Le varianti pronte (switch a 8 o a 24 porte) si scelgono prima di posare: passando sulla voce si apre il loro elenco.
- **Posare.** In due modi: trascinando la voce sul disegno, per posarne uno; oppure con un clic sulla voce e poi un clic sul disegno per ogni dispositivo da posare, finché non si preme Esc.
- **Strumento Cavo.** Finché è attivo, trascinare da un dispositivo a un altro tira un cavo invece di spostare. Si disattiva con Esc o con un secondo clic.
- I tipi non ancora disponibili (router, server) compaiono attenuati.

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
| Host | Spegni o accendi · Ping · Collega · Terminale · Appunta la tabella ARP · Elimina |
| Switch | Spegni o accendi · Collega · Appunta la tabella MAC · Elimina |
| Cavo | Stacca o riattacca · Elimina |

**Ping dalla barretta.** Si preme Ping e poi si fa clic sul dispositivo di destinazione. Manda **un solo** echo request: è lo strumento per le dimostrazioni. Le quattro richieste di Windows si ottengono dal terminale.

Mentre si aspetta il clic sulla destinazione, il pulsante Ping resta premuto, il puntatore diventa una croce e in alto sul disegno una riga dice che cosa fare. Esc rinuncia. Se la destinazione non ha un indirizzo IP, per esempio uno switch, la riga lo dice e il ping non parte.

**Pacchetto selezionato.** Del pacchetto si tiene una copia al momento del clic: il pannello continua a mostrarne il contenuto anche dopo che è arrivato, con la scritta "Arrivato" al posto di "In viaggio".

**A simulazione sospesa** la barretta non compare: da una tempesta di broadcast si esce solo con Ricomincia.

**Collega dalla barretta.** Si preme Collega e poi si fa clic sul dispositivo di destinazione: tira un cavo senza attivare lo strumento.

### Tabelle appuntate

Ogni tabella (MAC di uno switch, ARP di un host) si può **appuntare** sul disegno: compare in un riquadro accanto al suo dispositivo, legata a lui da una linea tratteggiata, e resta visibile qualunque cosa sia selezionata. È il modo per vedere insieme il pacchetto che viaggia, il suo contenuto e la tabella che cambia.

- Si appunta e si toglie in tre modi: dal pulsante sulla barretta del dispositivo, dal pulsante "appunta" accanto alla tabella nel pannello laterale, e, per toglierla, dalla crocetta nel suo angolo.
- Nasce sotto il dispositivo. Si può trascinare dove dà meno fastidio; la linea la segue, e parte da sotto le etichette per non coprirle.
- Una riga appena imparata si accende nel colore d'accento e torna normale in un secondo e mezzo. Una riga appena persa resta un momento, rossa e barrata, e svanisce.
- Gli indirizzi sono scritti per intero.
- L'inquadratura si allarga quanto serve per far stare anche le tabelle.
- Ricominciando la simulazione restano dove sono. Aprendo un'altra rete spariscono: quali tabelle sono appuntate non si salva nel file.

### Muoversi sul disegno

La rotella del mouse ingrandisce e rimpicciolisce attorno al puntatore; trascinando lo sfondo si sposta la vista. In un angolo del disegno ci sono i pulsanti +, − e Adatta, che inquadra tutta la rete.

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

Nome, tipo, stato (acceso o spento, segnale presente o assente), e per un host i campi della configurazione IP: indirizzo, subnet mask, gateway. Sotto, le sue tabelle, ciascuna con il pulsante per appuntarla.

**Modificare la configurazione.** Un campo ha effetto quando lo si conferma, con Invio o uscendo dal campo. Il valore viene controllato con le regole di `checkIpConfig`:

- se è accettabile, viene applicato;
- se non lo è, il campo si segna in rosso e sotto compare il motivo, per esempio "è l'indirizzo di broadcast della sottorete". La rete conserva il valore di prima.

**Maschera proposta.** Scritto l'indirizzo su un host senza maschera, la maschera si compila da sola con quella della classe dell'indirizzo (255.255.255.0 per 192.168.1.10), come fa Windows. Si può cambiare. Senza questo aiuto il primo indirizzo verrebbe rifiutato, perché indirizzo e maschera vanno impostati insieme.

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

I comandi sono quelli di Windows (`ipconfig`, `ping`, `arp -a`) e i **messaggi sono in inglese**, come sui libri e in rete: `Reply from 192.168.1.11`, `Request timed out.`, `Destination host unreachable.`, `PING: transmit failed. General failure.`

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

Si attiva dal pulsante Presenta e si lascia con Esc.

- Spariscono la colonna dei dispositivi e i comandi di file, annulla ed etichette.
- Testo, icone, buste e spessore delle linee aumentano, e la rete viene inquadrata per riempire lo spazio. Il fattore di ingrandimento è regolabile.
- La fascia in basso parte chiusa.
- Restano il disegno, la barra della simulazione, il pannello laterale e le tabelle appuntate.

Scorciatoie da tastiera, per condurre la dimostrazione senza cercare i pulsanti:

| Tasto | Effetto |
| --- | --- |
| Spazio | Avvia o mette in pausa |
| Freccia destra | Un passo |
| E | Apre o chiude la scheda Eventi |
| T | Apre o chiude i terminali |
| Esc | Esce dalla presentazione |

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
| Segnale su una porta | verde | il pallino c'è o non c'è |
| Dispositivo spento | grigio | la scritta "spento" |
| Campo rifiutato | bordo rosso | il motivo scritto sotto |
| Selezione | accento | contorno più spesso e barretta |

## Come è organizzato il codice

L'interfaccia sta in `src/ui/`, divisa per area. Le parti segnate *previsto* non esistono ancora.

| File o cartella | Contenuto |
| --- | --- |
| `App.svelte` | L'ossatura: la griglia che dispone le aree. I componenti non sanno dove si trovano |
| `session.svelte.ts` | La rete aperta, ciò che di lei va disegnato, la selezione e i comandi (ping, guasti, passo). È l'unico punto che parla con il simulatore |
| `view.ts` | Trasforma rete e posizioni in ciò che i componenti disegnano: etichette, segnale sui cavi, inquadratura. Non usa il browser, quindi ha i suoi test |
| `preferences.svelte.ts` | Ciò che riguarda solo chi guarda: tema, etichette accese, pannelli aperti |
| `theme/tokens.css` | I colori dei due temi, i caratteri, le misure: in un solo punto |
| `theme/DeviceIcon.svelte` | Le sagome dei dispositivi |
| `layout/` | Barra in alto e colonna dei dispositivi. *Previsto:* modalità presentazione |
| `topology/` | Il disegno: dispositivi, cavi, buste, indicatore di attesa, barretta delle azioni, tabelle appuntate, messaggi. *Previsto:* zoom |
| `panels/` | Il pannello laterale, in sola lettura, e gli strati annidati del pacchetto. *Previsto:* modifica della configurazione |
| `strip/` | La fascia in basso, con la scheda Eventi e il suo filtro. *Previsto:* terminali |
| `simulation/SimulationBar.svelte` | La barra della simulazione |
| `simulation/playback.ts` | L'orologio: fa scorrere il tempo a schermo e chiede al motore di avanzare. Ha i suoi test, con un orologio finto |
| `provisional/` | La pagina provvisoria di prima. Verrà cancellata |

I caratteri IBM Plex sono inclusi nel sito, non scaricati da un servizio esterno: l'app deve funzionare anche senza rete e dietro il filtro della scuola.

Restano valide le regole di [architettura.md](architettura.md): l'interfaccia comanda il motore solo con le azioni e ne legge lo stato dopo ogni comando. Ciò che riguarda solo lo schermo (selezione, tabelle appuntate, inquadratura, tema, filtro, terminali aperti) è stato della vista, e il motore non lo conosce.

Serviranno parti nuove fuori da `src/ui/`:

- **azioni di modifica** nel motore: aggiungere, spostare, collegare, eliminare, rinominare, configurare;
- **generazione degli indirizzi MAC** per i dispositivi nuovi;
- **`src/shell/`**: l'interprete dei comandi del terminale;
- **scrittura dei file** in `src/storage/`.

## Piano di costruzione

Nove passaggi, ciascuno verificabile da solo nel browser. La pagina provvisoria resta all'indirizzo `/#provvisoria` finché la nuova interfaccia non sa fare tutto ciò che fa lei: le manca il ping con quattro richieste, che arriva con il terminale al passaggio 6.

| N. | Passaggio | Che cosa si vede alla fine |
| --- | --- | --- |
| 1 | **Fatto.** Ossatura, temi, disegno della rete nel nuovo stile, apertura di un file | Si apre un file di esempio e lo si vede disegnato con il nuovo aspetto, nei due temi |
| 2 | **Fatto.** Barra della simulazione: passo, tempo reale, velocità, buste animate con sigla, attese, avviso di sospensione | Un ping si guarda scorrere da solo |
| 3 | **Fatto.** Selezione, barretta e pannello laterale: dispositivo e cavo in sola lettura, pacchetto a strati, guasti e ping dalla barretta | Si conduce la dimostrazione di ARP e ping senza la pagina provvisoria |
| 4 | **Fatto.** Fascia in basso con la scheda Eventi, il filtro e il collegamento al disegno | Si segue una sola conversazione |
| 5 | **Fatto.** Tabelle appuntate | Si vedono insieme pacchetto, contenuto e tabelle |
| 6 | Terminale: interprete dei comandi e schede | `ping` e `arp -a` dal prompt |
| 7 | Editor: azioni di modifica nel motore, colonna, strumento Cavo, configurazione dal pannello, annulla e ripristina | Si costruisce una rete da zero |
| 8 | Nuova e Salva, zoom e spostamento della vista | Si prepara una rete a casa e la si riapre in aula |
| 9 | Modalità presentazione e scorciatoie | Il rilascio 1 è completo |

Dopo il passaggio 3 l'app è già proiettabile per la lezione su ARP e ping, su una rete preparata come file.
