# Specifiche del progetto

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti.

- **Stato:** in sviluppo. Il motore del rilascio 1 è quasi completo; l'interfaccia è ancora una pagina provvisoria. Il dettaglio è nella sezione 9.
- **Ultimo aggiornamento:** 9 ottobre 2026.
- **Nome dell'app:** da decidere. In questo documento si usa il nome provvisorio *net-sim*.
- **Documentazione tecnica:** [docs/](docs/README.md).

## 1. Scopo

net-sim è un'applicazione web con cui costruire una rete, configurarne i dispositivi e osservare il traffico che la attraversa. Rispetto a Packet Tracer deve essere più leggera, leggibile da una LIM e costruita attorno alla didattica.

Quattro difetti di Packet Tracer guidano il progetto, e ciascuno diventa un principio:

| Difetto di Packet Tracer | Principio in net-sim |
| --- | --- |
| Troppe finestre e schede che coprono la topologia | Una sola schermata: la topologia resta sempre visibile |
| Dettagli fisici superflui (moduli, rack, tipo di cavo, tempi di avvio) | Si simula solo ciò che serve a capire i protocolli |
| Simulazione poco leggibile | Pacchetti, contenuto e tabelle visibili insieme, a caratteri leggibili da lontano |
| Lentezza, installazione, account obbligatorio | Si apre nel browser, senza account e senza server |

## 2. Utenti e scenari d'uso

Gli utenti sono un docente di sistemi e reti e le sue classi di terza, quarta e quinta superiore.

Gli scenari sono quattro, in ordine di priorità:

1. **Dimostrazione dalla cattedra.** Il docente apre una rete preparata in precedenza, la proietta, genera traffico e la modifica dal vivo secondo le domande della classe. È lo scenario che la prima versione deve servire bene.
2. **Laboratorio guidato.** Gli studenti, ai PC del laboratorio, svolgono un esercizio con obiettivi verificati in automatico, oppure lavorano su un file vuoto.
3. **Studio a casa.** Gli studenti si esercitano in autonomia.
4. **Verifiche valutate.** Lo studente consegna un file che contiene il punteggio e il registro di ciò che ha fatto.

Il programma da coprire nella versione completa comprende LAN e livello 2, IP e routing, trasporto e servizi, sicurezza e wireless.

## 3. Requisiti funzionali

Ogni requisito ha un identificativo e un rilascio. I rilasci 1 e 2 formano la prima versione; le tappe successive sono descritte nella sezione 5.

- **R1**: rilascio 1, sufficiente per la lezione su ARP e ping in una LAN.
- **R2**: rilascio 2, completamento della prima versione.
- **Tn**: tappa successiva numero *n*.

### 3.1 Editor della topologia

| ID | Requisito | Rilascio |
| --- | --- | --- |
| ED-1 | Aggiungere dispositivi scegliendoli da varianti pronte (per esempio switch a 8 o 24 porte) | R1 |
| ED-2 | Collegare due dispositivi scegliendo la porta su ciascuno. Il tipo di cavo è automatico e non causa mai errori | R1 |
| ED-3 | Spostare i dispositivi, ingrandire, rimpicciolire e scorrere la topologia. Le reti previste arrivano a 50 dispositivi | R1 |
| ED-4 | Rinominare ed eliminare dispositivi e collegamenti | R1 |
| ED-5 | Annullare e ripristinare le modifiche a topologia e configurazioni | R1 |
| ED-6 | Copiare e duplicare dispositivi o gruppi di dispositivi con le loro configurazioni | R2 |
| ED-7 | Allineare i dispositivi con una griglia magnetica | R2 |
| ED-8 | Esportare la topologia come immagine | R2 |
| ED-9 | Aggiungere annotazioni: note di testo e riquadri colorati per evidenziare sottoreti o aree | R2 |

### 3.2 Dispositivi

I dispositivi sono generici, non modelli commerciali. Non esistono moduli da inserire, viste fisiche o tempi di avvio.

| ID | Requisito | Rilascio |
| --- | --- | --- |
| DEV-1 | PC con una interfaccia di rete, configurazione IPv4 (indirizzo, maschera, gateway) e terminale | R1 |
| DEV-2 | Switch di livello 2 con apprendimento degli indirizzi MAC, flooding, inoltro mirato e broadcast | R1 |
| DEV-3 | Router con più interfacce, inoltro tra reti, decremento del TTL e riscrittura dei MAC a ogni salto | R2 |
| DEV-4 | Routing statico e tabella di routing sul router | R2 |
| DEV-5 | Server come dispositivo distinto dal PC, predisposto a ospitare servizi | R2 |
| DEV-6 | VLAN: porte access e trunk 802.1Q, routing tra VLAN | T2 |
| DEV-7 | Servizi sul server: DHCP, DNS, web | T3 |
| DEV-8 | Routing dinamico (RIP, OSPF) e NAT/PAT | T5 |
| DEV-9 | ACL sul router e firewall dedicato con zone e DMZ | T6 |
| DEV-10 | Access point e client Wi-Fi | T7 |
| DEV-11 | Spanning tree (STP) sugli switch: in presenza di un ciclo, gli switch bloccano da soli una porta | T2 |

### 3.3 Configurazione

| ID | Requisito | Rilascio |
| --- | --- | --- |
| CFG-1 | Pannello grafico per configurare il dispositivo selezionato | R1 |
| CFG-2 | Terminale degli host in stile Windows: `ipconfig`, `ping`, `arp -a` | R1 |
| CFG-3 | `tracert` sugli host | R2 |
| CFG-4 | CLI di switch e router con sintassi Cisco IOS: modalità (`enable`, `configure terminal`, `interface`), abbreviazioni dei comandi, completamento con Tab, aiuto con `?` | R2 |
| CFG-5 | CLI e pannello grafico sincronizzati: una modifica fatta in uno compare subito nell'altro | R2 |
| CFG-6 | `nslookup` sugli host | T3 |
| CFG-7 | La configurazione IP di un host è accettata o rifiutata come farebbe Windows. Indirizzo e subnet mask si impostano insieme, oppure nessuno dei due; il gateway è facoltativo. Sono rifiutati gli indirizzi scritti male, le maschere con bit non contigui e, come indirizzo dell'host o del gateway, l'indirizzo di rete e quello di broadcast della sottorete, 0.0.0.0, gli indirizzi 127.x.x.x e quelli da 224 in su. Tutto il resto è ammesso, anche se sbagliato per quella rete. Un gateway fuori dalla sottorete dell'host è ammesso | R1 |

Il sottoinsieme dei comandi IOS è un punto aperto (sezione 7). Proposta iniziale per R2: `enable`, `configure terminal`, `hostname`, `interface`, `ip address`, `shutdown`, `no shutdown`, `ip route`, `exit`, `end`, `show running-config`, `show ip interface brief`, `show ip route`, `show mac address-table`, `show arp`, `ping`, `traceroute`.

### 3.4 Simulazione

I protocolli funzionano davvero, in forma semplificata: si simulano i campi principali e il comportamento normale, tralasciando timer fini, opzioni rare e casi limite. Le semplificazioni sono elencate in [docs/motore.md](docs/motore.md).

| ID | Requisito | Rilascio |
| --- | --- | --- |
| SIM-1 | Ethernet, ARP, IPv4 e ICMP echo funzionanti | R1 |
| SIM-2 | Due modalità commutabili: tempo reale e passo-passo. In passo-passo la rete avanza di un istante alla volta: tutto ciò che accade nello stesso istante si muove insieme | R1 |
| SIM-3 | Velocità regolabile in tempo reale | R1 |
| SIM-4 | Generare traffico dal terminale dell'host | R1 |
| SIM-5 | Generare un ping con il mouse, indicando sorgente e destinazione sulla topologia | R1 |
| SIM-6 | Guasti fisici: staccare un cavo, spegnere un dispositivo | R1 |
| SIM-7 | Guasti fisici: spegnere una singola porta | R2 |
| SIM-8 | Comportamento da rete vera davanti agli errori di configurazione: nessun avviso preventivo e nessuna spiegazione del fallimento. La causa si cerca con gli strumenti (`ping`, `tracert`, comandi `show`) | R1 |
| SIM-13 | Il ping manda quattro echo request, o il numero richiesto, e conclude ciascuno con l'esito che stamperebbe Windows: risposta, richiesta scaduta, host di destinazione non raggiungibile, trasmissione non riuscita | R1 |
| SIM-14 | Un ping al proprio indirizzo, o a un indirizzo 127.x.x.x, riceve risposta subito e senza che alcun frame esca sul cavo (loopback). Vale anche per un host senza configurazione IP, limitatamente a 127.x.x.x | R1 |
| SIM-15 | Tempesta di broadcast: un ciclo tra switch fa girare i frame senza fine, e in certi casi li moltiplica, come in una rete vera senza spanning tree. La simulazione la lascia avvenire per qualche giro, poi si sospende: quando un frame è stato inoltrato più volte di quante ne ammetta una rete senza cicli, oppure quando i frame in viaggio sono troppi. Un avviso dice che c'è una tempesta di broadcast e che la causa è un ciclo tra switch. Non si riprende: si ricomincia. È un'eccezione dichiarata a SIM-8 | R1 |
| SIM-16 | In tempo reale, una breve pausa a schermo separa un echo request dal successivo, così i quattro giri si distinguono. In passo-passo non c'è pausa. La pausa è dell'interfaccia: il motore si comporta allo stesso modo nelle due modalità | R1 |
| SIM-9 | TCP con handshake visibile e UDP | T3 |
| SIM-10 | Applicazioni simulate sugli host (browser e simili) | T3 |
| SIM-11 | Editor per costruire a mano un pacchetto | T6 |
| SIM-12 | IPv6: indirizzamento, NDP, routing | T8 |

### 3.5 Visualizzazione

| ID | Requisito | Rilascio |
| --- | --- | --- |
| VIS-1 | Pacchetti animati sui collegamenti, colorati per protocollo | R1 |
| VIS-2 | Contenuto del pacchetto selezionato mostrato a strati annidati (frame, pacchetto, messaggio) con i campi principali | R1 |
| VIS-3 | Tabelle dei dispositivi (MAC, ARP, poi routing) aggiornate mentre il traffico passa | R1 |
| VIS-4 | Animazione, contenuto del pacchetto e tabelle visibili nella stessa schermata, sincronizzati | R1 |
| VIS-5 | Di norma è visibile solo la conversazione seguita: il traffico generato dall'utente e quello che esso provoca. Interruttori per protocollo mostrano o nascondono il resto | R1 |
| VIS-6 | Indirizzi IP, maschere, MAC e nomi delle porte visibili sulla topologia, attivabili separatamente | R1 |
| VIS-7 | Modalità presentazione: nasconde gli strumenti di modifica e ingrandisce testo e topologia | R1 |
| VIS-8 | Stato delle porte visibile sui collegamenti (attiva, guasta) | R1 |
| VIS-9 | Elenco cronologico degli eventi della simulazione | R1 |

I campi da mostrare in ogni strato sono un punto aperto (sezione 7). Proposta iniziale:

| Strato | Campi |
| --- | --- |
| Ethernet | MAC destinazione, MAC sorgente, EtherType |
| ARP | operazione, MAC e IP del mittente, MAC e IP del destinatario |
| IPv4 | IP sorgente, IP destinazione, TTL, protocollo |
| ICMP | tipo, identificativo, numero di sequenza |

### 3.6 Interfaccia

| ID | Requisito | Rilascio |
| --- | --- | --- |
| UI-1 | Disposizione: topologia al centro, pannello laterale per configurazione e tabelle del dispositivo selezionato, fascia in basso per terminale ed elenco degli eventi | R1 |
| UI-2 | Stile a schema pulito e piatto: dispositivi e cavi in tinta neutra, colore riservato a sottoreti, stati e tipi di pacchetto | R1 |
| UI-3 | Interfaccia in italiano; termini tecnici e comandi in inglese (switch, router, gateway, subnet mask, frame) | R1 |
| UI-4 | Uso con mouse e tastiera su PC del laboratorio e PC della cattedra collegato a LIM o proiettore. Nessun gesto tattile | R1 |
| UI-5 | Testo leggibile dal fondo dell'aula in modalità presentazione | R1 |

### 3.7 File

| ID | Requisito | Rilascio |
| --- | --- | --- |
| FILE-1 | Salvare la rete in un file locale e riaprirlo. Nessun account, nessun server | R1 |
| FILE-2 | Formato con numero di versione, così le versioni future dell'app aprono i file vecchi | R1 |
| FILE-3 | Nessuna importazione dei file `.pkt` di Packet Tracer | — |
| FILE-4 | All'apertura un file viene controllato e, se qualcosa non torna, rifiutato con un messaggio che dice che cosa: campi mancanti o del tipo sbagliato, identificativi duplicati, indirizzi MAC duplicati, una porta con più di un cavo, collegamenti verso porte inesistenti, configurazione IP non accettabile secondo CFG-7 | R1 |
| FILE-5 | Al salvataggio si può scegliere se includere nel file le tabelle MAC e ARP, per preparare una rete che parte "già calda" o con una riga sbagliata. Pacchetti in viaggio, attese e tempo non si salvano mai | R2 |

### 3.8 Esercizi e verifiche

| ID | Requisito | Rilascio |
| --- | --- | --- |
| ES-1 | Un file di esercizio contiene una rete di partenza e un testo di consegna visibile nell'app | T1 |
| ES-2 | Il docente definisce obiettivi verificabili (per esempio: PC1 raggiunge SRV1) e l'app mostra allo studente quali sono soddisfatti | T1 |
| ES-3 | Il docente può preparare reti con errori di configurazione nascosti, che l'app non evidenzia | T1 |
| ES-4 | Un'unica app per docente e studenti. Il file di esercizio è protetto da password: senza di essa non si vedono soluzioni e criteri | T1 |
| ES-5 | Resta sempre possibile lavorare su un file vuoto, senza esercizio | R1 |
| ES-6 | Il file consegnato contiene nome dello studente e punteggio degli obiettivi | T4 |
| ES-7 | Il file consegnato contiene il registro delle attività (comandi e orari). Funzione sperimentale, da costruire come modulo eliminabile | T4 |

Limite noto: senza server, la protezione con password scoraggia la curiosità ma non resiste a uno studente esperto e determinato.

## 4. Requisiti non funzionali

| ID | Requisito | Rilascio |
| --- | --- | --- |
| NF-1 | Sito statico: nessun server applicativo, nessuna raccolta di dati personali | R1 |
| NF-2 | Funziona offline dopo la prima visita ed è installabile dal browser | R2 |
| NF-3 | Browser di riferimento: Chrome ed Edge aggiornati su PC recenti | R1 |
| NF-4 | Fluida con reti fino a 50 dispositivi | R1 |
| NF-5 | Il codice è anche materiale didattico: il motore di simulazione deve essere leggibile da studenti di quarta e quinta, con un file per protocollo e commenti che rimandano alla teoria | R1 |
| NF-6 | Il motore di simulazione è coperto da test automatici | R1 |
| NF-7 | Stile grafico e disposizione dei pannelli sono sostituibili senza toccare il motore | R1 |

## 5. Piano di rilascio

La prima versione va in aula appena possibile, quindi è divisa in due rilasci.

**Rilascio 1.** Tutto ciò che serve per la lezione su ARP e ping in una LAN: PC e switch, editor di base, ARP e ICMP, simulazione nelle due modalità, visualizzazione completa, salvataggio su file.

**Rilascio 2.** Router e routing statico, CLI in stile IOS, server, `tracert`, strumenti dell'editor, funzionamento offline.

Tappe successive, in ordine proposto:

| Tappa | Contenuto |
| --- | --- |
| T1 | Esercizi con consegna, obiettivi verificati, errori nascosti, protezione dei file |
| T2 | VLAN e spanning tree |
| T3 | Trasporto e servizi: TCP, UDP, DHCP, DNS, web, applicazioni simulate |
| T4 | Verifiche: punteggio e registro delle attività |
| T5 | Routing dinamico e NAT |
| T6 | Sicurezza: ACL, firewall, pacchetti costruiti a mano, attacchi a scopo didattico, VPN |
| T7 | Wireless |
| T8 | IPv6 |

### Criterio di accettazione del rilascio 1

Il rilascio 1 è pronto quando questa lezione si svolge dall'inizio alla fine senza uscire dall'app:

1. Il docente apre un file con uno switch e tre PC configurati nella rete 192.168.1.0/24.
2. In modalità presentazione, con la simulazione in passo-passo, lancia `ping 192.168.1.11` dal terminale di PC1.
3. La classe vede partire la richiesta ARP in broadcast, lo switch che la inoltra su tutte le porte e registra il MAC di PC1 nella propria tabella.
4. PC2 risponde, PC3 scarta. La tabella ARP di PC1 e la tabella MAC dello switch si aggiornano.
5. Parte l'echo request, che lo switch inoltra sulla sola porta di PC2, e torna l'echo reply.
6. Selezionando un pacchetto in qualsiasi momento, la classe ne vede gli strati con indirizzi MAC e IP.
7. Il docente stacca il cavo di PC2 e ripete il ping, che fallisce. Poi cambia l'indirizzo di PC3 in uno di un'altra rete e mostra che un ping verso PC3 fallisce senza che parta alcuna richiesta ARP.
8. Salva la rete modificata in un nuovo file.

## 6. Fuori ambito

- Modelli commerciali di dispositivi, moduli hardware, viste di rack e armadi.
- Tipi di cavo (dritto, incrociato, fibra, seriale, console).
- Emulazione fedele di IOS: si realizza solo il sottoinsieme didattico.
- Account, salvataggio in cloud, condivisione tramite link.
- Uso da tablet e smartphone.
- Avvisi e spiegazioni testuali degli errori di configurazione.
- Collegamenti degradati (perdita, ritardo, banda limitata).
- Raccolta di reti di esempio integrata nell'app.
- Importazione dei file di Packet Tracer.

## 7. Decisioni reversibili e punti aperti

Tre decisioni sono prese con riserva. Il progetto deve permettere di cambiarle senza riscrivere il resto.

| Decisione | Scelta attuale | Cosa la rende reversibile |
| --- | --- | --- |
| Stile grafico | Schema pulito e piatto | Icone e colori definiti in un solo punto (NF-7) |
| Disposizione dei pannelli | Laterale più fascia in basso | I pannelli sono componenti indipendenti dalla disposizione (NF-7) |
| Registro delle attività | Da provare | Modulo separato ed eliminabile (ES-7) |

Punti ancora da decidere:

- [ ] Nome dell'app. Proposte: Instrada, Trama, Salto, PacketLab, Doppino.
- [ ] Destinatari: solo le classi del docente, i colleghi, oppure pubblica e open source. Nel terzo caso servono una licenza e attenzione a marchi e sintassi Cisco.
- [ ] Sottoinsieme dei comandi IOS (proposta nella sezione 3.3).
- [ ] Campi mostrati negli strati dei pacchetti (proposta nella sezione 3.5).
- [ ] Dove pubblicare il sito, verificando che il filtro della scuola non lo blocchi.
- [ ] Lingua dei messaggi del terminale degli host: italiano, come nei Windows del laboratorio, o inglese.
- [ ] Come non affidare il significato al solo colore: studenti daltonici, proiettori sbiaditi.
- [ ] Se aggiungere test automatici della pagina e un controllo automatico dei test a ogni invio al repository. Oggi la pagina è verificata solo a occhio.
- [ ] Quanto lasciar durare la tempesta di broadcast prima della sospensione (SIM-15). Oggi: un frame può essere inoltrato fino a 3 volte il numero degli switch, e i frame in viaggio possono arrivare a 200. Da rivedere con il tempo reale, quando guardarla non costerà clic.
- [ ] In quale tappa collocare lo spanning tree (DEV-11). Proposta: T2, insieme alle VLAN.
- [ ] In quale rilascio collocare il salvataggio facoltativo delle tabelle (FILE-5). Proposta: R2.

## 8. Decisioni

Registro delle scelte tecniche importanti, con il motivo. Ogni nuova scelta si aggiunge in fondo; una scelta superata non si cancella, si marca come sostituita. I dettagli stanno in [docs/](docs/README.md).

Lo stato è *confermata* se è stata scelta o approvata esplicitamente dal docente, *adottata* se è già nel codice su proposta di chi sviluppa ma non è ancora stata discussa. Il 9 ottobre 2026 tutte le decisioni adottate fino a quel momento sono state discusse e confermate o sostituite.

| N. | Data | Decisione | Motivo | Stato |
| --- | --- | --- | --- | --- |
| D-1 | 8 ott 2026 | Applicazione web statica, senza server né account | La rete della scuola è instabile e filtrata; nessun dato personale da gestire | Confermata |
| D-2 | 8 ott 2026 | Le reti si salvano in file locali | Si distribuiscono con qualsiasi mezzo e funzionano offline | Confermata |
| D-3 | 8 ott 2026 | Motore di simulazione separato dall'interfaccia, senza dipendenze | Il motore si legge in classe e si prova senza browser; la grafica può cambiare senza toccarlo | Confermata |
| D-4 | 8 ott 2026 | TypeScript per tutto il codice | I tipi descrivono in modo esplicito frame, pacchetti e tabelle | Confermata |
| D-5 | 8 ott 2026 | Svelte per l'interfaccia, SVG per la topologia | I componenti somigliano a HTML, CSS e JavaScript; SVG è nitido a ogni zoom e basta per 50 dispositivi | Confermata |
| D-6 | 8 ott 2026 | Vite per la costruzione, Vitest per i test | Producono un sito statico e condividono la configurazione | Confermata |
| D-7 | 8 ott 2026 | Protocolli realmente funzionanti ma semplificati | Si simula ciò che serve a capire, non ogni timer e caso limite. Le semplificazioni sono elencate in docs/motore.md | Confermata |
| D-8 | 8 ott 2026 | L'app non avvisa degli errori di configurazione e non spiega i fallimenti | Deve comportarsi come una rete vera: la diagnosi è parte dell'esercizio | Confermata |
| D-9 | 9 ott 2026 | Lo sviluppo parte da uno scheletro: scambio ARP tra due PC | È il comportamento vero più piccolo che attraversa file, motore, interfaccia e test | Confermata |
| D-10 | 9 ott 2026 | Simulatore a eventi discreti, deterministico | Tempo reale e passo-passo diventano lo stesso meccanismo; test e lezioni sono ripetibili | Confermata |
| D-11 | 9 ott 2026 | Tempo misurato in tick astratti, un tick per collegamento | Con i tempi veri, rallentare un pacchetto perché sia visibile renderebbe lunghissime le attese | Confermata |
| D-12 | 9 ott 2026 | Un passo elabora tutti gli eventi dello stesso istante | I frame di un broadcast si muovono insieme, come nella realtà | Confermata |
| D-13 | 9 ott 2026 | I dispositivi restituiscono una reazione; è il simulatore a spedire i frame | Il comportamento di un dispositivo si legge e si prova da solo | Confermata |
| D-14 | 9 ott 2026 | Il file contiene solo la configurazione, non le tabelle né i pacchetti in viaggio | Una rete aperta si comporta sempre allo stesso modo. Non si può salvare una simulazione a metà | Sostituita da D-25 |
| D-15 | 9 ott 2026 | Identificatori in inglese, commenti e messaggi in italiano | I nomi dei campi dei protocolli sono in inglese ovunque; i commenti devono essere letti dagli studenti | Confermata |
| D-16 | 9 ott 2026 | TypeScript fermo alla versione 6 | Lo strumento di controllo dei componenti Svelte non supporta ancora la 7 | Confermata |
| D-17 | 9 ott 2026 | Le subnet mask devono avere i bit a 1 contigui (notazione CIDR); le altre sono rifiutate | Una maschera con bit alternati non è una configurazione sbagliata da diagnosticare: non è una maschera | Confermata |
| D-18 | 9 ott 2026 | Un ping manda un solo echo request, finché non esistono i timer | Mandarne quattro di seguito, come Windows, richiede di attendere ogni risposta fino a una scadenza | Sostituita da D-24 |
| D-19 | 9 ott 2026 | I pacchetti IP partono con TTL 128 | È il valore di Windows, coerente con il terminale degli host in stile Windows | Confermata |
| D-20 | 9 ott 2026 | Ogni pacchetto messo in attesa fa partire una richiesta ARP; i pacchetti in attesa non scadono | Senza timer è il modo più semplice per non lasciare mai un ping in silenzio. Da rivedere con i timer | Sostituita da D-22 |
| D-21 | 9 ott 2026 | Le attese sono eventi della coda: un host chiede di avviarle o annullarle, il simulatore le fa scadere | Il tempo resta in un solo punto e gli host restano funzioni senza orologio, quindi facili da provare | Confermata |
| D-22 | 9 ott 2026 | Una sola richiesta ARP per indirizzo alla volta; se non arriva risposta entro 20 tick i pacchetti in attesa sono scartati, senza ripetere la richiesta | Evita richieste doppie e pacchetti appesi per sempre. Venti tick bastano per andata e ritorno nelle reti previste | Confermata |
| D-23 | 9 ott 2026 | Ogni echo request si conclude con uno di quattro esiti: risposta, richiesta scaduta (40 tick), host di destinazione non raggiungibile (ARP senza risposta), trasmissione non riuscita (nessuna strada) | Sono gli esiti che il ping di Windows stampa. Tenerli distinti serve a riconoscere i problemi di rotte e, più avanti, di ACL. Non spiegano la causa, quindi non contraddicono D-8 | Confermata |
| D-24 | 9 ott 2026 | Un ping manda quattro echo request, o il numero richiesto, uno alla volta; il successivo parte nell'istante in cui il precedente si conclude | Quattro è il valore di Windows. Senza la pausa di un secondo tra una richiesta e l'altra il passo-passo non ha clic a vuoto | Confermata; per la pausa vedi D-29 |
| D-25 | 9 ott 2026 | Il file contiene sempre la configurazione; le tabelle MAC e ARP solo se chi salva lo chiede. Pacchetti in viaggio, attese e tempo non si salvano mai | Serve a preparare lezioni che partono da una rete già calda ed esercizi con una riga ARP sbagliata. Lasciare fuori ciò che è in movimento tiene i file semplici e stabili tra versioni dell'app | Confermata, da realizzare |
| D-26 | 9 ott 2026 | Un ciclo tra switch produce una tempesta di broadcast; dopo qualche giro la simulazione si sospende con un avviso che ne spiega la causa. Lo spanning tree arriverà in una tappa futura | Mostrare la tempesta fa capire a che cosa serve lo spanning tree; la sospensione impedisce che l'app si blocchi. L'avviso spiega la causa, in deroga a D-8, perché altrimenti sembrerebbe un difetto dell'app | Confermata |
| D-30 | 9 ott 2026 | La tempesta di broadcast si riconosce con due segnali: un frame inoltrato più volte di 3 volte il numero degli switch, oppure più di 200 frame in viaggio | Una soglia sui soli frame in viaggio non basta: in un anello semplice il broadcast gira senza moltiplicarsi e non la supererebbe mai. Il conteggio degli inoltri è anche una prova certa del ciclo, quindi l'avviso non può sbagliare causa | Confermata |
| D-27 | 9 ott 2026 | Un host risponde da solo a un ping verso il proprio indirizzo o verso 127.x.x.x, senza frame sul cavo | È il comportamento reale, e permette di spiegare il loopback e il primo controllo di ogni diagnosi | Confermata |
| D-28 | 9 ott 2026 | La configurazione IP di un host è accettata o rifiutata come farebbe Windows; indirizzo e maschera vanno insieme. Gli indirizzi MAC duplicati sono sempre rifiutati. All'apertura un file viene controllato anche nella struttura | Ciò che Windows non lascia impostare non è un errore da diagnosticare: non si può fare. I MAC li assegna l'app, quindi due uguali sono un file danneggiato | Confermata |
| D-29 | 9 ott 2026 | Tra un echo request e il successivo c'è una pausa solo in tempo reale, ed è l'interfaccia a farla, non il motore | In passo-passo una pausa sarebbe un clic a vuoto; in tempo reale serve a distinguere i quattro giri. Tenerla fuori dal motore lo lascia identico nelle due modalità | Confermata, da realizzare |
| D-31 | 9 ott 2026 | Un guasto agisce attraverso il segnale sul cavo: un host senza segnale non trasmette e il ping dà subito "trasmissione non riuscita"; uno switch dimentica i MAC della porta senza segnale; i frame in viaggio sul cavo staccato vanno persi. Un dispositivo spento toglie il segnale ai vicini, perde i frame diretti a lui, le attese e tutto ciò che aveva imparato | È ciò che fa un PC vero, e rende distinguibili tre situazioni: guasto dalla propria parte, destinazione sparita e mai conosciuta, destinazione sparita ma ancora in tabella ARP | Confermata |

## 9. Stato di avanzamento

Aggiornato al 9 ottobre 2026. Le percentuali sono stime a occhio, pesate sul lavoro e non sul numero di requisiti.

| Traguardo | Completamento |
| --- | --- |
| Motore del rilascio 1 | completo |
| Rilascio 1 intero | circa 40% |
| Prima versione (rilasci 1 e 2) | circa 20% |
| Progetto completo, fino alla tappa T8 | circa 8% |

Il motore è molto più avanti dell'interfaccia: ciò che separa il progetto dalla prima lezione è quasi tutto a schermo.

### Requisiti del rilascio 1

| Stato | Requisiti |
| --- | --- |
| **Fatto** | DEV-2 switch · SIM-1 Ethernet, ARP, IPv4, ICMP · SIM-8 comportamento da rete vera · SIM-13 quattro echo request ed esiti · SIM-14 loopback · SIM-15 sospensione della tempesta di broadcast · SIM-6 guasti: cavo staccato e dispositivo spento · UI-3 lingua · UI-4 mouse e tastiera · NF-1 sito statico · NF-3 browser · NF-5 codice leggibile · NF-6 test del motore · FILE-4 controlli all'apertura di un file |
| **Fatto in forma provvisoria** | VIS-3 tabelle aggiornate dal vivo · VIS-9 elenco degli eventi · VIS-1 pacchetti animati, senza colore per protocollo · VIS-6 indirizzi IP e MAC sempre visibili, senza porte né interruttori · SIM-5 ping da pulsante e menu, non con il mouse sulla topologia · VIS-8 cavo staccato, dispositivo spento e PC senza segnale si vedono sul disegno, ma non lo stato delle singole porte |
| **A metà** | DEV-1 PC: la configurazione IP funziona ma si imposta solo nel file; manca il terminale · SIM-2 solo passo-passo · FILE-1 solo lettura delle reti di esempio · FILE-2 il numero di versione c'è, le migrazioni no · VIS-5 il numero di conversazione esiste nel motore, il filtro no · CFG-7 le regole sulla configurazione IP esistono e valgono per i file; manca il pannello che le applichi a ciò che l'utente scrive |
| **Da fare** | ED-1 … ED-5 tutto l'editor · CFG-1 pannello di configurazione · CFG-2 e SIM-4 terminale dell'host · SIM-3 velocità · SIM-16 pausa tra gli echo in tempo reale · VIS-2 pacchetto a strati · VIS-4 vista sincronizzata · VIS-7 modalità presentazione · UI-1 disposizione a pannelli · UI-2 stile grafico · UI-5 leggibilità da lontano · NF-4 reti fino a 50 dispositivi, mai provate · NF-7 stile e disposizione sostituibili |

Rilascio 2 e tappe successive: nulla è iniziato.

### Rispetto al criterio di accettazione del rilascio 1

| Punto | Stato |
| --- | --- |
| 1. Aprire un file con uno switch e tre PC | La rete esiste come esempio integrato; manca l'apertura di un file |
| 2. Lanciare il ping dal terminale, in modalità presentazione | Il ping parte da un pulsante; mancano terminale e modalità presentazione |
| 3. Richiesta ARP in broadcast, flooding, tabella MAC | Funziona |
| 4. PC2 risponde, PC3 scarta, le tabelle si aggiornano | Funziona |
| 5. Echo request su una sola porta, echo reply | Funziona |
| 6. Selezionare un pacchetto e vederne gli strati | Il contenuto si vede solo come testo grezzo nell'elenco degli eventi |
| 7. Staccare un cavo; cambiare un indirizzo | Staccare un cavo funziona, con un clic. Manca la modifica della configurazione |
| 8. Salvare la rete | Manca |

### Che cosa esiste oltre ai requisiti

- 202 test automatici su motore e lettura dei file.
- Tre reti di esempio in `examples/`: due PC, una LAN con uno switch, tre switch ad anello.
- Una pagina provvisoria in `src/ui/`, descritta in [README.md](README.md): serve a vedere il motore funzionare, e verrà sostituita dall'interfaccia definitiva.

### Difetti noti

Nessuno. I tre difetti documentati il 9 ottobre 2026 sono stati corretti: controlli su configurazione IP e file (D-28), loopback (D-27), sospensione della tempesta di broadcast (D-26).
