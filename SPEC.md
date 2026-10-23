# Specifiche del progetto

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti.

- **Stato:** in sviluppo. Il rilascio 1 è costruito, pubblicato e provato in aula. Del rilascio 2 sono costruiti il routing (router, rotte statiche, `tracert`, server), la CLI in stile IOS e le tabelle nel file; mancano offline e strumenti dell'editor. Il dettaglio è nella sezione 9.
- **Ultimo aggiornamento:** 20 ottobre 2026.
- **Nome dell'app:** *Doppino*, scelto l'11 ottobre 2026 con riserva di cambiarlo. Finché non è definitivo l'app, i file e il repository restano *net-sim*, e così questo documento.
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
| ED-1 | Aggiungere dispositivi dalla colonna a sinistra, scegliendo prima la variante pronta (per esempio switch a 8 o 24 porte). Si posa trascinando, oppure con un clic sulla voce e un clic sul disegno per ogni dispositivo, finché non si preme Esc | R1 |
| ED-2 | Collegare due dispositivi trascinando dall'uno all'altro, con lo strumento Cavo della colonna o con il pulsante Collega della barretta. L'app propone su ciascuno la prima porta libera; un clic sul nome della porta apre l'elenco per cambiarla. Il tipo di cavo è automatico e non causa mai errori | R1 |
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
| DEV-3 | Router con più interfacce, inoltro tra reti, decremento del TTL e riscrittura dei MAC a ogni salto. Tre varianti pronte, a 2, 4 e 8 interfacce, chiamate `Gi0/0`, `Gi0/1`…; ogni interfaccia ha MAC, indirizzo IP e maschera propri. Le interfacce nascono spente, come su un Cisco, e vanno accese | R2 |
| DEV-4 | Routing statico e tabella di routing sul router. Una rotta statica è fatta di rete, maschera e prossimo salto; la rotta di default è 0.0.0.0 con maschera 0.0.0.0. Le reti delle interfacce accese e configurate entrano in tabella da sole. Tra più rotte che corrispondono vince quella con la maschera più lunga | R2 |
| DEV-5 | Server come dispositivo distinto dal PC, predisposto a ospitare servizi. Nel rilascio 2 è un host con un'altra icona e nome `SRV1`: una interfaccia, indirizzo, gateway e terminale come un PC | R2 |
| DEV-6 | VLAN: porte access e trunk 802.1Q, routing tra VLAN | T2 |
| DEV-7 | Servizi sul server: DHCP, DNS, web | T3 |
| DEV-8 | Routing dinamico con i protocolli RIP versione 1, RIP versione 2 e OSPF, e NAT/PAT. La CLI va costruita in modo che i loro comandi (`router rip`, `version 2`, `network`, `router ospf`) si possano aggiungere senza rifarla | T5 |
| DEV-9 | ACL sul router e firewall dedicato con zone e DMZ | T6 |
| DEV-10 | Access point e client Wi-Fi | T7 |
| DEV-11 | Spanning tree (STP) sugli switch: in presenza di un ciclo, gli switch bloccano da soli una porta | T2 |

### 3.3 Configurazione

| ID | Requisito | Rilascio |
| --- | --- | --- |
| CFG-1 | Pannello grafico per configurare il dispositivo selezionato | R1 |
| CFG-2 | Terminale degli host in stile Windows: `ipconfig`, `ping`, `arp -a`. I messaggi sono in inglese, come sui libri e in rete | R1 |
| CFG-3 | `tracert` sugli host: una sonda per salto, con TTL crescente, fino a 30 salti | R2 |
| CFG-4 | CLI di switch e router in stile Cisco IOS: modalità (`enable`, `configure terminal`, `interface`), abbreviazioni dei comandi purché non ambigue, completamento con Tab, aiuto con `?`. Output e messaggi di errore nel formato di IOS, senza intestazioni né diciture di marca | R2 |
| CFG-5 | CLI e pannello grafico sincronizzati: una modifica fatta in uno compare subito nell'altro | R2 |
| CFG-6 | `nslookup` sugli host | T3 |
| CFG-7 | La configurazione IP di un host è accettata o rifiutata come farebbe Windows. Indirizzo e subnet mask si impostano insieme, oppure nessuno dei due; il gateway è facoltativo. Sono rifiutati gli indirizzi scritti male, le maschere con bit non contigui e, come indirizzo dell'host o del gateway, l'indirizzo di rete e quello di broadcast della sottorete, 0.0.0.0, gli indirizzi 127.x.x.x e quelli da 224 in su. Tutto il resto è ammesso, anche se sbagliato per quella rete. Un gateway fuori dalla sottorete dell'host è ammesso | R1 |
| CFG-8 | Un campo del pannello di configurazione ha effetto alla conferma (Invio o uscita dal campo). Se il valore non è accettabile il campo si segna in rosso con il motivo, e la rete conserva il valore di prima. Scritto l'indirizzo su un host senza maschera, la maschera viene proposta in base alla classe dell'indirizzo, come fa Windows | R1 |

I comandi del rilascio 2, decisi l'11 ottobre 2026 (D-89):

| Gruppo | Comandi |
| --- | --- |
| Modalità | `enable`, `disable`, `configure terminal`, `interface`, `exit`, `end` |
| Configurare | `hostname`; `ip address` e `no ip address`; `shutdown` e `no shutdown`; `ip route` e `no ip route` (solo router) |
| Guardare | `show running-config`, `show startup-config`, `show ip interface brief`, `show ip route`, `show arp`, `show interfaces`; sullo switch anche `show mac address-table` |
| Provare | `ping` e `traceroute`, dal router |
| Per abitudine | `copy running-config startup-config` e `write memory`: rispondono `[OK]` e non fanno nulla |
| Per comodità | `do` davanti a `show`, `ping`, `traceroute` e ai comandi di salvataggio, dalle modalità di configurazione (aggiunto il 13 ottobre 2026) |

Sullo switch, finché non ci sono le VLAN, la CLI mostra, rinomina e spegne le porte.

### 3.4 Simulazione

I protocolli funzionano davvero, in forma semplificata: si simulano i campi principali e il comportamento normale, tralasciando timer fini, opzioni rare e casi limite. Le semplificazioni sono elencate in [docs/motore.md](docs/motore.md).

| ID | Requisito | Rilascio |
| --- | --- | --- |
| SIM-1 | Ethernet, ARP, IPv4 e ICMP echo funzionanti | R1 |
| SIM-2 | Due modalità commutabili: tempo reale e passo-passo. In passo-passo la rete avanza di un istante alla volta: tutto ciò che accade nello stesso istante si muove insieme | R1 |
| SIM-3 | Velocità regolabile in tempo reale: 0,5×, 1×, 2×. A 1× un pacchetto impiega circa un secondo e mezzo a percorrere un cavo | R1 |
| SIM-4 | Generare traffico dal terminale dell'host | R1 |
| SIM-5 | Generare un ping con il mouse: pulsante Ping sulla barretta dell'host, poi clic sul dispositivo di destinazione. Manda un solo echo request | R1 |
| SIM-6 | Guasti fisici: staccare un cavo, spegnere un dispositivo | R1 |
| SIM-7 | Guasti fisici: spegnere una singola porta. Per le interfacce dei router arriva insieme al router, perché nascono spente (DEV-3); per le porte degli switch insieme alla CLI (D-93); per la scheda di un host in seguito | R2 |
| SIM-8 | Comportamento da rete vera davanti agli errori di configurazione: nessun avviso preventivo e nessuna spiegazione del fallimento. La causa si cerca con gli strumenti (`ping`, `tracert`, comandi `show`) | R1 |
| SIM-13 | Il ping manda quattro echo request, o il numero richiesto, e conclude ciascuno con l'esito che stamperebbe Windows: risposta, richiesta scaduta, host di destinazione non raggiungibile, trasmissione non riuscita | R1 |
| SIM-14 | Un ping al proprio indirizzo, o a un indirizzo 127.x.x.x, riceve risposta subito e senza che alcun frame esca sul cavo (loopback). Vale anche per un host senza configurazione IP, limitatamente a 127.x.x.x | R1 |
| SIM-15 | Tempesta di broadcast: un ciclo tra switch fa girare i frame senza fine, e in certi casi li moltiplica, come in una rete vera senza spanning tree. La simulazione la lascia avvenire per qualche giro, poi si sospende: quando un frame è stato inoltrato più volte di quante ne ammetta una rete senza cicli, oppure quando i frame in viaggio sono troppi. Un avviso dice che c'è una tempesta di broadcast e che la causa è un ciclo tra switch. Non si riprende: si ricomincia. È un'eccezione dichiarata a SIM-8 | R1 |
| SIM-16 | In tempo reale, una breve pausa a schermo separa un echo request dal successivo, così i quattro giri si distinguono. In passo-passo non c'è pausa. La pausa è dell'interfaccia: il motore si comporta allo stesso modo nelle due modalità | R1 |
| SIM-17 | In tempo reale, quando non viaggia nulla e resta solo un'attesa, non si aspetta davvero: un indicatore sul dispositivo che aspetta si svuota in due o tre secondi, poi il tempo salta alla scadenza | R1 |
| SIM-18 | Messaggi ICMP di errore: «Time exceeded» quando il TTL arriva a zero su un router, «Destination net unreachable» quando un router non ha una rotta, «Destination host unreachable» quando l'ultimo router non ottiene risposta ARP dalla destinazione. `ping` li stampa come Windows (`Reply from <router>: Destination net unreachable.`, `TTL expired in transit.`) | R2 |
| SIM-9 | TCP con handshake visibile e UDP | T3 |
| SIM-10 | Applicazioni simulate sugli host (browser e simili) | T3 |
| SIM-11 | Editor per costruire a mano un pacchetto | T6 |
| SIM-12 | IPv6: indirizzamento, NDP, routing | T8 |

### 3.5 Visualizzazione

| ID | Requisito | Rilascio |
| --- | --- | --- |
| VIS-1 | Pacchetti animati sui collegamenti: buste colorate per protocollo, con la sigla del protocollo sopra | R1 |
| VIS-2 | Contenuto del pacchetto selezionato mostrato a strati annidati (frame, pacchetto, messaggio) con i campi principali | R1 |
| VIS-3 | Tabelle dei dispositivi (MAC, ARP, poi routing) aggiornate mentre il traffico passa | R1 |
| VIS-4 | Animazione, contenuto del pacchetto e tabelle visibili nella stessa schermata, sincronizzati | R1 |
| VIS-5 | Filtro del traffico in cima alla scheda Eventi: selettore della conversazione (tutte, oppure una) e un interruttore per protocollo. Ciò che il filtro nasconde sparisce sia dall'elenco sia dal disegno | R1 |
| VIS-6 | Sotto ogni dispositivo restano sempre il nome e, per gli host, l'indirizzo IP con il prefisso. Indirizzi IP, MAC e nomi delle porte hanno ciascuno un interruttore; MAC e porte sono spenti all'apertura. Dal rilascio 2: gli indirizzi di un router stanno accanto ai cavi, sul capo vicino al router, uno per interfaccia | R1 |
| VIS-7 | Modalità presentazione: nasconde la colonna dei dispositivi e i comandi di modifica, ingrandisce testo, icone e linee, inquadra la rete per riempire lo spazio | R1 |
| VIS-8 | Stato delle porte visibile sui collegamenti (attiva, guasta) | R1 |
| VIS-9 | Elenco cronologico degli eventi, una riga per fatto. Passando su una riga si evidenziano sul disegno il dispositivo e il pacchetto coinvolti; un clic apre il pacchetto nel pannello laterale | R1 |
| VIS-10 | Tabelle appuntabili sul disegno: la tabella MAC di uno switch o la tabella ARP di un host resta visibile accanto al dispositivo qualunque cosa sia selezionata. Si può trascinare, e la riga appena imparata o persa si evidenzia per un momento | R1 |

I campi da mostrare in ogni strato:

| Strato | Campi |
| --- | --- |
| Ethernet | MAC destinazione, MAC sorgente, EtherType |
| ARP | operazione, MAC e IP del mittente, MAC e IP cercati |
| IPv4 | IP sorgente, IP destinazione, TTL, protocollo |
| ICMP | tipo, identificativo, numero di sequenza |

### 3.6 Interfaccia

| ID | Requisito | Rilascio |
| --- | --- | --- |
| UI-1 | Disposizione: barra in alto; colonna dei dispositivi a sinistra, richiudibile; disegno al centro; pannello laterale a destra, che mostra ciò che è selezionato (dispositivo, cavo o pacchetto); fascia in basso a tutta larghezza per terminali ed eventi, richiudibile | R1 |
| UI-2 | Stile a schema pulito e piatto, di carattere sobrio: dispositivi e cavi in tinta neutra, colore riservato a stati e tipi di pacchetto, un solo colore d'accento per l'interfaccia | R1 |
| UI-3 | Interfaccia in italiano; termini tecnici e comandi in inglese (switch, router, gateway, subnet mask, frame) | R1 |
| UI-4 | Uso con mouse e tastiera su PC del laboratorio e PC della cattedra collegato a LIM o proiettore. Nessun gesto tattile | R1 |
| UI-5 | Testo leggibile dal fondo dell'aula in modalità presentazione | R1 |
| UI-6 | Due temi, chiaro e scuro. All'apertura l'app segue il sistema; un pulsante lo cambia | R1 |
| UI-7 | Nessuna informazione è affidata al solo colore: ogni colore con un significato è accompagnato da una forma, una sigla o una scritta | R1 |
| UI-8 | Un clic seleziona. Accanto a ciò che è selezionato compare una barretta con le azioni principali; non esiste un menu del tasto destro | R1 |
| UI-9 | Nessuna separazione tra costruzione e simulazione: si può modificare la rete mentre il traffico viaggia | R1 |
| UI-10 | I comandi della simulazione stanno in una barra flottante in basso al centro del disegno | R1 |
| UI-11 | Una scheda della fascia in basso per ogni terminale aperto, con la sua cronologia | R1 |
| UI-12 | All'avvio l'app mostra sempre un foglio vuoto, con l'invito a trascinare un dispositivo o aprire un file | R1 |
| UI-13 | Zoom con la rotella attorno al puntatore, spostamento trascinando lo sfondo, e pulsanti +, − e Adatta in un angolo del disegno | R1 |
| UI-14 | In modalità presentazione: scorciatoie da tastiera per avvio e pausa, passo, apertura dei pannelli; fascia in basso chiusa; ingrandimento regolabile | R1 |

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

### Criterio di accettazione del rilascio 2

La parte sul routing del rilascio 2 è pronta quando questa lezione si svolge dall'inizio alla fine senza uscire dall'app:

1. Il docente apre un file con due LAN, 192.168.1.0/24 e 192.168.2.0/24, unite da un router. PC1 sta nella prima, PC2 nella seconda.
2. PC1 non ha gateway: `ping 192.168.2.10` fallisce subito, senza che parta alcun frame.
3. Imposta il gateway di PC1 e ripete il ping. La classe vede PC1 chiedere con ARP il MAC del router, non quello di PC2; il router chiedere il MAC di PC2 sull'altra interfaccia; l'echo request attraversare il router.
4. Aprendo il pacchetto prima e dopo il router, la classe vede che gli indirizzi IP sono gli stessi, i MAC sono cambiati e il TTL è sceso di uno.
5. Spegne un'interfaccia del router e mostra che il ping fallisce; la riaccende.
6. Apre un secondo file con tre reti e due router in fila. Senza rotte statiche, il ping da un capo all'altro riceve `Destination net unreachable` dal primo router.
7. Aggiunge la rotta di andata: l'echo request arriva, ma la risposta si ferma al secondo router, che non ha la rotta di ritorno. Aggiunge anche quella, e il ping riesce.
8. `tracert` dall'host mostra i due router e la destinazione, una riga per salto.

### Piano di costruzione del rilascio 2

Deciso nell'intervista dell'11 ottobre 2026. Prima il routing, costruito a piccoli passaggi, ciascuno verificabile:

| N. | Passaggio | Che cosa si può fare dopo |
| --- | --- | --- |
| 1 | Il router nel modello e nei file: interfacce con indirizzo, maschera e stato, rotte statiche; azioni per aggiungerlo e configurarlo | Un file con un router si apre, si salva e si riapre |
| 2 | Inoltro: ARP per interfaccia, tabella di routing, TTL, MAC riscritti, pacchetti in attesa del MAC | Nei test, un ping attraversa uno e due router |
| 3 | Messaggi ICMP di errore ed esiti del ping che ne derivano | Rotta mancante e TTL scaduto si distinguono da un host spento |
| 4 | `tracert` nel motore e nel terminale | Il percorso si legge dal prompt |
| 5 | Il router a schermo: colonna con le tre varianti, icona, indirizzi accanto ai cavi, interfaccia spenta, pannello con interfacce e rotte, tabella di routing appuntabile, eventi | La lezione del criterio di accettazione si svolge nell'app |
| 6 | Il server | Si posa e si usa come un PC |
| 7 | Reti di esempio e test della lezione nel browser | Il routing del rilascio 2 è collaudabile |

Poi, in quest'ordine: CLI in stile IOS, funzionamento offline (che richiede nome e dominio definitivi), strumenti dell'editor, tabelle nel file.

### Criterio di accettazione della CLI

La CLI è pronta quando questa lezione si svolge dall'inizio alla fine senza uscire dall'app, configurando tutto dai terminali:

1. Su un foglio vuoto il docente posa due PC e due router, li collega in fila e dà ai PC indirizzo e gateway.
2. Apre la CLI del primo router: `enable`, `configure terminal`, `hostname`.
3. Per ogni interfaccia: `interface`, `ip address`, `no shutdown`. Mentre scrive, il pannello laterale e il disegno mostrano le stesse cose.
4. Usa le abbreviazioni (`conf t`, `int gi0/0`, `no shut`), il Tab e `?` per farsi suggerire ciò che segue.
5. Aggiunge la rotta statica con `ip route`; ripete tutto sul secondo router.
6. Controlla con `show ip interface brief`, `show ip route` e `show running-config`.
7. Dal router lancia `ping` verso il PC lontano, e legge la fila di simboli; poi `traceroute`.
8. Sbaglia apposta un comando e legge il messaggio di errore con il segno `^` sotto il punto sbagliato.
9. Aggiunge uno switch tra un router e un PC; dalla sua CLI guarda `show mac address-table` e spegne una porta, che si vede spenta sul disegno.

### Piano di costruzione della CLI

Deciso nell'intervista del 12 ottobre 2026.

| N. | Passaggio | Che cosa si può fare dopo |
| --- | --- | --- |
| 1 | Porte spente sugli switch, nel motore, nei file e sul disegno | Una porta di switch si spegne, e si vede |
| 2 | Il nucleo dell'interprete: modalità, albero dei comandi, abbreviazioni, `?`, Tab, messaggi di errore. Solo testo, senza effetti sulla rete | Nei test, ogni riga scritta viene capita o rifiutata come farebbe IOS |
| 3 | I comandi che configurano, collegati alle azioni del motore | `hostname`, `ip address`, `shutdown`, `ip route` cambiano la rete |
| 4 | I comandi `show` | La configurazione e le tabelle si leggono dal terminale |
| 5 | `ping` e `traceroute` dal router | Il router genera traffico, con l'output di IOS |
| 6 | Il terminale a schermo per router e switch | Si apre dalla barretta, in una scheda, con Tab e `?` |
| 7 | La lezione come test nel browser, documento `docs/cli.md` | La CLI è collaudabile |

### Criterio di accettazione degli strumenti dell'editor

Gli strumenti dell'editor sono pronti quando questa preparazione di una lezione si svolge dall'inizio alla fine senza uscire dall'app:

1. Su un foglio vuoto il docente accende la griglia, posa uno switch e un PC: cadono sui punti della griglia.
2. Configura il PC (192.168.1.10/24, gateway 192.168.1.1) e lo duplica quattro volte dalla barretta. Le copie si chiamano PC2…PC5, hanno MAC nuovi, indirizzi da 192.168.1.11 a 192.168.1.14, stessa maschera e stesso gateway, e nascono scollegate accanto all'originale. Le collega allo switch.
3. Posa un router e lo duplica: la copia ha lo stesso numero di interfacce, tutte spente e senza indirizzi, e nessuna rotta.
4. Disegna un riquadro attorno alla LAN, ne sceglie il colore e gli scrive «LAN 192.168.1.0/24»; posa accanto una nota con la consegna.
5. Sposta il riquadro, lo ridimensiona dagli angoli, lo elimina e lo fa tornare con Annulla.
6. Salva, riapre il file: riquadro e nota sono al loro posto.
7. In presentazione riquadro e nota si vedono, ma non si spostano né si modificano.
8. Esporta l'immagine, con il tema scuro attivo: ottiene un PNG di tutta la rete, su sfondo chiaro, con riquadro e nota e senza buste in viaggio.

### Piano di costruzione degli strumenti dell'editor

Deciso nell'intervista del 18 ottobre 2026, dopo la prova in aula. Dal più piccolo al più grande; l'esportazione viene per ultima perché deve includere le annotazioni.

| N. | Passaggio | Che cosa si può fare dopo |
| --- | --- | --- |
| 1 | **Fatto.** Griglia magnetica: interruttore nella barra in alto, scatto a 20 px nel posare e nel trascinare | Un disegno si tiene in ordine da solo |
| 2 | **Fatto.** Duplicare nel motore: un'azione nuova, con nome, MAC e indirizzo successivo liberi scelti dal motore (D-46) | Nei test, un PC configurato diventa cinque PC pronti |
| 3 | **Fatto.** Duplicare a schermo: pulsante Duplica sulla barretta, la copia nasce accanto e selezionata, con annulla | Una LAN da molti PC si costruisce in pochi clic |
| 4 | **Fatto.** Annotazioni nel modello della pagina e nei file: riquadri e note, con posizione, dimensione, colore e testo; nella cronologia di annulla e ripristina | Un file con annotazioni si apre, si salva e si riapre |
| 5 | Annotazioni a schermo: strumenti Riquadro e Nota nella colonna, selezione e barretta, testo nel pannello laterale, ridimensionare dagli angoli, presentazione | Il disegno si commenta e si divide in sottoreti |
| 6 | Esportare come immagine: PNG di tutta la rete, tema chiaro, doppia risoluzione | La rete va nelle slide e nelle verifiche su carta |
| 7 | La preparazione del criterio di accettazione come test nel browser; documentazione | Gli strumenti dell'editor sono collaudabili |

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

Alcune decisioni sono prese con riserva. Il progetto deve permettere di cambiarle senza riscrivere il resto.

| Decisione | Scelta attuale | Cosa la rende reversibile |
| --- | --- | --- |
| Stile grafico | Schema pulito e piatto | Icone e colori definiti in un solo punto (NF-7) |
| Disposizione dei pannelli | Colonna a sinistra, pannello laterale a destra, fascia in basso a tutta larghezza | I pannelli sono componenti indipendenti dalla disposizione (NF-7) |
| Schede dei terminali | Una scheda per ogni terminale aperto | Se risulta macchinoso si passa a un solo terminale che segue il dispositivo selezionato: il terminale è un componente che non sa in quale scheda si trova |
| Registro delle attività | Da provare | Modulo separato ed eliminabile (ES-7) |

Punti ancora da decidere:

- [ ] Nome dell'app: scelto *Doppino*, con riserva (`doppino.it` risultava libero l'11 ottobre 2026; marchi non verificati). Da rendere definitivo, e applicare a schermo, file e repository, prima del funzionamento offline (NF-2). Altre proposte considerate: Instrada, Trama, Salto, PacketLab, Salto a salto, Primo Ping, Simulareti, Banco di rete, Fil di rete.
- [ ] Condizioni d'uso per i colleghi: una nota breve da scrivere sul sito o nel README (destinatari decisi: D-66).
- [ ] Rivedere i testi per marchi Cisco: si parla sempre di «stile IOS», e l'output non riporta intestazioni, versioni o diciture di marca (D-90). La CLI è già pubblicata dal 14 ottobre 2026. Un controllo del 16 ottobre ha trovato la parola «Cisco» solo nei commenti del codice, mai nei testi a schermo; resta da decidere se basta.
- [x] Verificare che il filtro della scuola non blocchi il sito pubblicato (`net-sim.simon-nucifora.workers.dev`): dai PC dell'aula si apre (prova in aula, ottobre 2026). Dove pubblicare è deciso: D-64.
- [ ] Dominio `.it` per il sito, da comprare quando il nome dell'app sarà scelto, e prima del funzionamento offline (NF-2): chi ha installato l'app da un indirizzo dovrebbe reinstallarla dal nuovo.
- [x] Valori dei colori e delle dimensioni: quelli di [docs/interfaccia.md](docs/interfaccia.md), provati in aula in presentazione, vanno bene così. Su una LIM non sono ancora stati visti: se ne occupa il punto sull'uso con il dito.
- [x] Come alleggerire il passo-passo di un ping da quattro richieste: in aula, con `ping -n 1` e le tabelle nel file (D-100), è risultato accettabile così.
- [ ] Da decidere: quale icona dare al pulsante che stacca e riattacca un cavo.
- [ ] LIM usata con il dito: UI-4 esclude i gesti tattili, ma trascinamenti e clic vanno provati; la rotella non c'è, restano i pulsanti − e +. Non ancora provato: alla prova in aula non c'era una LIM a disposizione. Insieme vanno visti colori e leggibilità su una LIM.
- [ ] Quanto lasciar durare la tempesta di broadcast prima della sospensione (SIM-15). Oggi: un frame può essere inoltrato fino a 3 volte il numero degli switch, e i frame in viaggio possono arrivare a 200. Da rivedere con il tempo reale, quando guardarla non costerà clic.
- [ ] In quale tappa collocare lo spanning tree (DEV-11). Proposta: T2, insieme alle VLAN.
- [x] In quale rilascio collocare il salvataggio facoltativo delle tabelle (FILE-5): R2, costruito il 18 ottobre 2026 (D-100).
- [ ] Prima del rilascio completo: sostituire le finestrelle del browser (la conferma per le modifiche non salvate, la richiesta del nome in Salva con nome) con riquadri nello stile dell'app, che seguano il tema. Chiesto dall'utente il 10 ottobre 2026.

## 8. Decisioni

Registro delle scelte tecniche importanti, con il motivo. Ogni nuova scelta si aggiunge in fondo; una scelta superata non si cancella, si marca come sostituita. I dettagli stanno in [docs/](docs/README.md).

Lo stato è *confermata* se è stata scelta o approvata esplicitamente dal docente, *adottata* se è già nel codice su proposta di chi sviluppa ma non è ancora stata discussa. Il 9 ottobre 2026 tutte le decisioni adottate fino a quel momento sono state discusse e confermate o sostituite. L'11 ottobre 2026 lo stesso è stato fatto per quelle successive. La sola D-61, rimasta adottata in attesa della prova in aula, è stata confermata il 20 ottobre 2026.

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
| D-25 | 9 ott 2026 | Il file contiene sempre la configurazione; le tabelle MAC e ARP solo se chi salva lo chiede. Pacchetti in viaggio, attese e tempo non si salvano mai | Serve a preparare lezioni che partono da una rete già calda ed esercizi con una riga ARP sbagliata. Lasciare fuori ciò che è in movimento tiene i file semplici e stabili tra versioni dell'app | Confermata, realizzata con D-100 |
| D-26 | 9 ott 2026 | Un ciclo tra switch produce una tempesta di broadcast; dopo qualche giro la simulazione si sospende con un avviso che ne spiega la causa. Lo spanning tree arriverà in una tappa futura | Mostrare la tempesta fa capire a che cosa serve lo spanning tree; la sospensione impedisce che l'app si blocchi. L'avviso spiega la causa, in deroga a D-8, perché altrimenti sembrerebbe un difetto dell'app | Confermata |
| D-30 | 9 ott 2026 | La tempesta di broadcast si riconosce con due segnali: un frame inoltrato più volte di 3 volte il numero degli switch, oppure più di 200 frame in viaggio | Una soglia sui soli frame in viaggio non basta: in un anello semplice il broadcast gira senza moltiplicarsi e non la supererebbe mai. Il conteggio degli inoltri è anche una prova certa del ciclo, quindi l'avviso non può sbagliare causa | Confermata |
| D-27 | 9 ott 2026 | Un host risponde da solo a un ping verso il proprio indirizzo o verso 127.x.x.x, senza frame sul cavo | È il comportamento reale, e permette di spiegare il loopback e il primo controllo di ogni diagnosi | Confermata |
| D-28 | 9 ott 2026 | La configurazione IP di un host è accettata o rifiutata come farebbe Windows; indirizzo e maschera vanno insieme. Gli indirizzi MAC duplicati sono sempre rifiutati. All'apertura un file viene controllato anche nella struttura | Ciò che Windows non lascia impostare non è un errore da diagnosticare: non si può fare. I MAC li assegna l'app, quindi due uguali sono un file danneggiato | Confermata |
| D-29 | 9 ott 2026 | Tra un echo request e il successivo c'è una pausa solo in tempo reale, ed è l'interfaccia a farla, non il motore | In passo-passo una pausa sarebbe un clic a vuoto; in tempo reale serve a distinguere i quattro giri. Tenerla fuori dal motore lo lascia identico nelle due modalità | Confermata |
| D-31 | 9 ott 2026 | Un guasto agisce attraverso il segnale sul cavo: un host senza segnale non trasmette e il ping dà subito "trasmissione non riuscita"; uno switch dimentica i MAC della porta senza segnale; i frame in viaggio sul cavo staccato vanno persi. Un dispositivo spento toglie il segnale ai vicini, perde i frame diretti a lui, le attese e tutto ciò che aveva imparato | È ciò che fa un PC vero, e rende distinguibili tre situazioni: guasto dalla propria parte, destinazione sparita e mai conosciuta, destinazione sparita ma ancora in tabella ARP | Confermata |
| D-32 | 10 ott 2026 | Schermata unica senza modalità: colonna dei dispositivi richiudibile, disegno, pannello laterale per ciò che è selezionato, fascia in basso a tutta larghezza per terminali ed eventi, barra della simulazione flottante sul disegno | Si costruisce e si osserva nello stesso posto, come serve in una dimostrazione dal vivo; la topologia non viene mai coperta | Confermata |
| D-33 | 10 ott 2026 | Il pannello laterale mostra il pacchetto selezionato al posto del dispositivo; le tabelle si vedono insieme al pacchetto appuntandole sul disegno | Un solo pannello largo e leggibile, senza rinunciare a vedere insieme viaggio, contenuto e tabelle | Confermata |
| D-34 | 10 ott 2026 | Un clic seleziona; le azioni stanno su una barretta accanto all'oggetto selezionato, senza menu del tasto destro | Tutto ciò che si può fare è visibile, e funziona alla LIM | Confermata |
| D-35 | 10 ott 2026 | Aspetto sobrio, due temi (chiaro e scuro), e nessuna informazione affidata al solo colore | L'attenzione va alla rete; il chiaro serve alla proiezione, lo scuro a chi lavora a lungo; il secondo segno regge il daltonismo e i proiettori sbiaditi | Confermata |
| D-36 | 10 ott 2026 | Pacchetti come buste con la sigla del protocollo; sotto i dispositivi sempre nome e indirizzo con prefisso | La sigla dice che cos'è senza cliccare; il prefisso mostra la maschera senza occupare una riga | Confermata |
| D-37 | 10 ott 2026 | I messaggi del terminale degli host sono in inglese; il resto dell'interfaccia, eventi compresi, è in italiano | È ciò che gli studenti troveranno sui libri, in rete e sugli apparati | Confermata |
| D-38 | 10 ott 2026 | Il ping dalla barretta manda un solo echo request; quello dal terminale quattro | Il primo è lo strumento per le dimostrazioni, il secondo si comporta come Windows | Confermata |
| D-39 | 10 ott 2026 | In tempo reale un tratto di cavo dura 1,4 secondi a 1× (un secondo, alla prima prova, è risultato troppo rapido); le attese non si aspettano davvero ma si mostrano con un indicatore che si svuota in pochi secondi | È il ritmo per commentare a voce, senza tempi morti quando non viaggia nulla | Confermata |
| D-40 | 10 ott 2026 | Un campo di configurazione ha effetto alla conferma; la maschera viene proposta in base alla classe dell'indirizzo | Evita stati intermedi mentre si scrive, e permette di rispettare la regola "indirizzo e maschera insieme" un campo alla volta | Confermata |
| D-41 | 10 ott 2026 | All'avvio sempre un foglio vuoto; nessuna rete ricordata e nessun esempio integrato | Prevedibile, e adatto ai PC del laboratorio che vengono ripuliti | Confermata |
| D-42 | 10 ott 2026 | I caratteri dell'interfaccia sono inclusi nel sito, non caricati da un servizio esterno | L'app deve funzionare offline e dietro il filtro della scuola | Confermata |
| D-43 | 10 ott 2026 | Durante la costruzione della nuova interfaccia la pagina provvisoria resta raggiungibile all'indirizzo `/#provvisoria` | Finché la nuova non sa lanciare un ping, togliere la vecchia lascerebbe l'app senza modo di mostrare la simulazione | Superata: la pagina provvisoria è stata cancellata quando la nuova interfaccia l'ha sostituita |
| D-44 | 10 ott 2026 | Nell'output di `ping` la durata è scritta in tick: `time=8 ticks`, e `time<1 tick` per una risposta immediata | È l'unità del tempo simulato; scrivere millisecondi sarebbe inventare un numero | Sostituita da D-65 |
| D-45 | 10 ott 2026 | Ricominciando la simulazione i terminali restano aperti ma si svuotano | I PC tornano come appena accesi; l'output di prima parlerebbe di una rete che non esiste più | Confermata |
| D-46 | 10 ott 2026 | Identificativi, nomi, porte e indirizzi MAC di un dispositivo nuovo li sceglie il motore, prendendo il primo libero della serie | L'utente dice solo che cosa vuole aggiungere; la scelta è sempre la stessa a parità di rete, quindi i test restano ripetibili | Confermata |
| D-47 | 10 ott 2026 | Due dispositivi non possono avere lo stesso nome | Il nome è ciò che l'utente vede nell'elenco degli eventi e nel terminale: due uguali non si distinguerebbero | Confermata |
| D-48 | 10 ott 2026 | Cambiando la configurazione IP, un host dimentica tabella ARP e attese; gli altri host tengono le loro tabelle | È ciò che succede riavviando una scheda di rete, e lascia agli altri una riga ARP vecchia, che è un caso reale da diagnosticare | Confermata |
| D-49 | 10 ott 2026 | Il disegno parte da un foglio di base e l'inquadratura si allarga solo quando un dispositivo ne esce | Se l'inquadratura seguisse sempre la rete, il disegno si sposterebbe a ogni dispositivo posato o trascinato. Lo zoom manuale arriverà con il passaggio 8 | Confermata, insieme a D-59 che la completa |
| D-50 | 10 ott 2026 | I nomi delle porte di un cavo selezionato si vedono sempre, anche con l'etichetta Porte spenta | Cambiare porta parte da un clic sul nome: se il nome non si vedesse, non ci sarebbe modo di farlo. Sugli altri cavi resta l'etichetta a decidere | Confermata |
| D-51 | 10 ott 2026 | Con lo strumento Cavo attivo un cavo si tira anche con due clic, sul primo dispositivo e poi sul secondo, oltre che trascinando | Su una LIM o con un touchpad trascinare è scomodo. È lo stesso gesto del pulsante Collega | Confermata |
| D-52 | 10 ott 2026 | Svuotare il campo dell'indirizzo IP toglie anche subnet mask e gateway | Indirizzo e maschera vanno impostati insieme (CFG-7): modificando un campo alla volta non ci sarebbe modo di togliere la configurazione a un host, perché ogni passo intermedio verrebbe rifiutato | Confermata |
| D-53 | 10 ott 2026 | Il motivo per cui un campo del pannello viene rifiutato sta sotto il campo, non nella riga in alto sul disegno | Va letto accanto a ciò che si è scritto, e deve restare finché non lo si corregge | Confermata |
| D-54 | 10 ott 2026 | Annullare vuol dire tornare a una fotografia della configurazione, eseguendo le modifiche che la separano dalla rete di adesso. La simulazione non viene riavviata | Una copia della configurazione per ogni modifica è più semplice da capire di un meccanismo che inverte le singole operazioni; ed eseguire le differenze come normali modifiche fa trattare la simulazione in corso con le stesse regole di sempre, senza perdere le tabelle di chi non è stato toccato | Confermata |
| D-55 | 10 ott 2026 | Si annullano le modifiche alla rete e gli spostamenti sul disegno; guasti e traffico no | ED-5 parla di topologia e configurazioni. Spegnere un dispositivo o staccare un cavo fa parte della dimostrazione, e ha già il suo comando per tornare indietro | Confermata |
| D-56 | 10 ott 2026 | Un dispositivo che torna con un annullamento è appena acceso: stesso nome, stessi indirizzi e stessi cavi, tabelle vuote | Lo stato di esecuzione non fa parte della configurazione, ed è ciò che succederebbe rimettendo a mano lo stesso dispositivo | Confermata |
| D-57 | 10 ott 2026 | Salva scrive nel file da cui la rete viene (aperto o già salvato), altrimenti chiede dove; Salva con nome chiede sempre dove, e da lì in poi il file della rete è quello nuovo. Dove il browser non permette di scrivere in un file scelto, il file viene scaricato | È il comportamento di un programma da scrivania. Salva con nome serve a non sovrascrivere il file di partenza, per esempio una rete di esempio | Confermata |
| D-58 | 10 ott 2026 | La rete risulta modificata quando il file che ne uscirebbe è diverso dall'ultimo aperto o salvato. Con modifiche non salvate, Nuova, Apri e la chiusura della pagina chiedono conferma | Confrontare i file è più semplice e più giusto che contare le modifiche: annullare tutto riporta a "salvata", e il traffico non conta. La conferma evita di perdere con un clic una rete costruita in classe | Confermata |
| D-59 | 10 ott 2026 | L'inquadratura è automatica (il foglio di base, D-49) finché l'utente non ingrandisce, sposta la vista o preme Adatta; da lì è un rettangolo fisso che cambia solo lui. Nuova torna a quella automatica | Chi costruisce una rete da zero non deve pensare alla vista; chi l'ha scelta non deve vedersela cambiare da un dispositivo posato | Confermata |
| D-60 | 10 ott 2026 | Un file appena aperto viene inquadrato per intero, come con Adatta. Adatta lascia margine per etichette e barra della simulazione, e non ingrandisce oltre un riquadro minimo | Con il solo foglio di base le reti di esempio apparivano piccole. Senza il riquadro minimo un PC da solo riempirebbe lo schermo | Confermata |
| D-61 | 10 ott 2026 | In presentazione l'ingrandimento è un solo fattore, regolabile dal 100% al 200% (di partenza 140%). Barre, pannello e fascia si ingrandiscono per intero; nel disegno crescono dispositivi, scritte, buste, tabelle e spessore delle linee, mentre le distanze tra i dispositivi restano quelle della rete | Un fattore solo è facile da regolare guardando dal fondo dell'aula. Ingrandire gli elementi e non le distanze è ciò che rende leggibile una rete grande, che altrimenti verrebbe solo rimpicciolita dall'inquadratura | Confermata il 20 ottobre 2026, dopo la prova in aula: leggibile dal fondo dell'aula con il 140% di partenza |
| D-62 | 10 ott 2026 | In presentazione spariscono i comandi per costruire (colonna, file, annulla, etichette, Collega, Elimina, tasto Canc); restano guasti, ping, terminale, tabelle appuntate, spostamento dei dispositivi, modifica di nome e indirizzi dal pannello, e Ctrl+Z per annullare | Durante una dimostrazione servono i guasti e il cambio di un indirizzo (criterio di accettazione, punto 7); eliminare un dispositivo per sbaglio davanti alla classe no | Confermata |
| D-63 | 10 ott 2026 | Le scorciatoie Spazio, Freccia destra, E e T valgono solo in presentazione, e mai mentre si scrive in una casella o nel terminale. Esc prima lascia andare un gesto a metà, poi esce | Fuori dalla presentazione quei tasti si premono per altri motivi. Così UI-14 è rispettato senza sorprese | Confermata |
| D-64 | 11 ott 2026 | Il sito è pubblicato su Cloudflare, nel piano gratuito, e si aggiorna da solo a ogni push sul ramo `main`. Il repository resta privato. Le prove si fanno in locale | È gratuito senza un tetto mensile che possa sospendere il sito, non obbliga a rendere pubblico il codice prima di aver deciso destinatari e licenza, e accetta un dominio `.it` comprato altrove | Confermata; dal 17 ottobre 2026 il ramo pubblicato è `stabile` (D-99) |
| D-65 | 11 ott 2026 | Nell'output di `ping` la durata è scritta in millisecondi, come su Windows: un tick vale un millisecondo (`time=8ms`), e una risposta immediata è `time<1ms` | La riga deve essere quella che gli studenti vedranno su un PC vero. Il numero è di comodo, ma resta leggibile: dice quanti tratti di cavo ha attraversato lo scambio | Confermata |
| D-66 | 11 ott 2026 | L'app è rivolta alle classi del docente e ai colleghi. Il repository resta privato; il codice del motore lo mostra il docente in classe | Aprire il codice richiede di scegliere una licenza e di curare marchi e sintassi Cisco: non serve per usare l'app dal sito. Si potrà aprire in seguito | Confermata |
| D-67 | 11 ott 2026 | La pagina ha pochi test che eseguono i percorsi principali in un browser vero (Playwright, sul sito costruito): la lezione del criterio di accettazione, costruire una rete, salvare e riaprire, inquadratura e presentazione. A ogni push GitHub Actions esegue test, controllo dei tipi e build, e segna l'esito sul commit; è un avviso, non blocca la pubblicazione | I componenti a schermo erano verificati solo a occhio, e ogni push pubblica. Pochi percorsi veri coprono clic e trascinamenti che un browser simulato non vede; un avviso basta finché si lavora su un ramo solo | Confermata; con D-99 l'avviso decide quando pubblicare |
| D-68 | 11 ott 2026 | I quattro file oltre le 300 righe sono stati divisi per argomento, senza cambiare comportamento né i nomi usati dal resto del codice. `session` è diventata tre classi una sopra l'altra (rete e simulazione; dimostrazione; modifiche), i cui metodi si chiamano ancora tutti su `session` | La convenzione "un concetto, un file" serve a chi legge, studenti compresi. Dividere `session` a strati evita di toccare tutti i componenti e i test che la usano | Confermata |
| D-69 | 11 ott 2026 | Il rilascio 2 comincia dal router con il routing statico, costruito dal motore verso lo schermo; seguono CLI in stile IOS, offline, strumenti dell'editor e tabelle nel file. Il routing dinamico (RIP, RIPv2, OSPF) resta alla tappa T5 | Il router apre le lezioni su IP e routing ed è la base di quasi tutto il resto. La CLI viene subito dopo, finché è fresco ciò che deve configurare; l'offline aspetta nome e dominio | Confermata |
| D-70 | 11 ott 2026 | Il router generico ha tre varianti, a 2, 4 e 8 interfacce, tutte Ethernet e chiamate `Gi0/n`. Le interfacce nascono spente, come su un Cisco | Dimenticare di accendere un'interfaccia è il primo errore che si fa su un apparato vero: il docente vuole che gli studenti lo incontrino. È l'unico punto in cui si segue l'apparato reale invece della semplificazione | Confermata |
| D-71 | 11 ott 2026 | Una rotta statica è fatta di rete, maschera e prossimo salto. Niente interfaccia di uscita, niente distanza amministrativa | È la forma che si insegna per prima e che su Ethernet funziona sempre. La distanza amministrativa servirà con il routing dinamico | Confermata |
| D-72 | 11 ott 2026 | Si simulano tre messaggi ICMP di errore: TTL scaduto, rete non raggiungibile, host non raggiungibile | Sono gli indizi con cui si diagnostica un problema di routing, e il primo serve a `tracert`. Senza, una rotta mancante e un host spento darebbero lo stesso `Request timed out` | Confermata |
| D-73 | 11 ott 2026 | `tracert` manda una sonda per salto, non tre come Windows | Sul disegno il meccanismo si vede meglio, e in passo-passo i passi non triplicano. La riga ha un tempo solo | Confermata |
| D-74 | 11 ott 2026 | Fino all'arrivo della CLI il router si configura dal pannello laterale: interfacce (acceso o spento, indirizzo, maschera) e rotte statiche da aggiungere e togliere | La lezione sul routing non deve aspettare la CLI. Quando arriverà, CLI e pannello passeranno dalle stesse azioni (CFG-5) | Confermata |
| D-75 | 11 ott 2026 | Gli indirizzi di un router sono scritti accanto ai cavi, sul capo vicino al router, uno per interfaccia | Si vede a colpo d'occhio quale indirizzo guarda quale rete; una pila sotto il dispositivo non lo direbbe | Confermata |
| D-76 | 11 ott 2026 | Il server arriva subito, come host con un'altra icona; i servizi in T3 | Serve a disegnare reti credibili e costa poco | Confermata |
| D-77 | 11 ott 2026 | Due interfacce dello stesso router non possono avere reti sovrapposte. Conta la maschera, di qualsiasi lunghezza, non la classe dell'indirizzo: `10.0.0.1/30` e `10.0.0.5/30` vanno bene, `192.168.1.1/24` e `192.168.1.129/25` no | È ciò che fa un router vero, e rientra nella regola per cui si rifiuta ciò che l'apparato non lascerebbe impostare. Le maschere di lunghezza variabile sono materia di lezione e devono funzionare | Confermata |
| D-78 | 11 ott 2026 | Lo stato acceso o spento di un'interfaccia di router è configurazione, non un guasto: si salva nel file (se manca vale spenta) e Annulla lo rimette com'era. Cavo staccato e dispositivo spento restano guasti, che Annulla non tocca | Su un router lo stato dell'interfaccia si imposta, come un indirizzo, e nasce spento | Confermata |
| D-79 | 11 ott 2026 | Cambiando l'indirizzo di un'interfaccia il router dimentica tutta la tabella ARP e ciò che stava aspettando. Due rotte statiche verso la stessa rete con prossimi salti diversi sono ammesse | La prima è la regola dei PC (D-48), applicata all'intero router per semplicità. La seconda lascia preparare reti con una rotta sbagliata accanto a quella giusta | Confermata |
| D-80 | 11 ott 2026 | Nella tabella di routing una rete collegata c'è solo se l'interfaccia è accesa, ha un indirizzo e sente il segnale. Una rotta statica viene usata solo se il suo prossimo salto sta su una rete collegata; a parità di maschera vince la prima della tabella. Il router non fa proxy ARP | Le prime due regole sono quelle di un router vero nei casi che si incontrano a lezione. Cercare una rotta anche per il prossimo salto e dividere il traffico tra rotte equivalenti sono comportamenti reali ma lontani dalla lezione sul routing statico. Il proxy ARP confonderebbe la lezione sul gateway | Confermata |
| D-81 | 11 ott 2026 | Nelle statistiche di `ping` ogni risposta conta come pacchetto ricevuto, anche quando è un avviso di errore (`Destination net unreachable`, `Destination host unreachable`, `TTL expired in transit`), come su Windows. Vale anche per l'«host unreachable» detto dal PC stesso, che prima era contato come perso. La riga di risposta riporta il TTL con cui l'echo reply è arrivato | È ciò che gli studenti vedono su un PC vero, incongruenza compresa. Il TTL vero permette di contare i router dal solo ping | Confermata |
| D-82 | 11 ott 2026 | Le buste dei messaggi ICMP di errore restano etichettate `ICMP`; negli eventi e nel pannello si chiamano «ICMP time exceeded» e «ICMP destination unreachable» | In inglese come gli altri nomi di protocollo | Confermata |
| D-83 | 11 ott 2026 | Per vedere `TTL expired in transit` in un ciclo di routing si aggiunge a `ping` l'opzione `-i TTL`, che esiste su Windows; la scadenza del ping resta di 40 tick. Da realizzare insieme a `tracert` | Con TTL 128 e un tick per salto un ciclo dura 127 tick, più della scadenza del ping: `ping` stamperebbe `Request timed out`, e a schermo il giro durerebbe minuti. Con `ping -i 6` il ciclo si mostra in pochi passi, senza toccare i tempi del rilascio 1 | Confermata |
| D-84 | 11 ott 2026 | `tracert` stampa le righe di Windows: un asterisco e `Request timed out.` per un salto muto, proseguendo fino al limite (trenta, o quello chiesto con `-h`); `<router>  reports: Destination net unreachable.` quando un router avvisa, e lì finisce; `Transmit error: code 1231.` quando il PC non può spedire | Sono le righe che gli studenti troveranno su un PC vero, anche quando sono criptiche | Confermata |
| D-85 | 12 ott 2026 | Le icone di router e switch sono i simboli degli schemi di rete: per il router un cerchio con quattro frecce, due che entrano e due che escono; per lo switch un rettangolo con quattro frecce a versi alternati | Sono i simboli che gli studenti trovano sui libri, quindi si riconoscono senza spiegazioni, e tra loro si distinguono anche da lontano. Scelte dal docente tra cinque proposte per ciascuno | Confermata |
| D-86 | 12 ott 2026 | Un'interfaccia di router spenta si riconosce sul disegno da un quadratino rosso vuoto, al posto del pallino del segnale, sul capo del cavo vicino al router; con l'etichetta Porte accesa compare anche la scritta «spenta». Sulla barretta del router non ci sono Ping né Terminale fino alla CLI, e per appuntare c'è la sola tabella di routing | Colore più un secondo segno, come per gli altri stati. Il ping dal router richiede di scegliere un indirizzo sorgente, cosa che si fa dalla CLI | Confermata |
| D-87 | 12 ott 2026 | Scrivendo l'indirizzo di un'interfaccia di router si può aggiungere il prefisso (`10.0.0.5/30`). Senza prefisso la maschera proposta è quella della classe, a meno che non faccia sovrapporre la rete a quella di un'altra interfaccia: in quel caso si propone la maschera di quell'altra | Sui router le maschere lunghe sono la norma, e con la sola maschera della classe la seconda interfaccia di una rete `10.x` verrebbe rifiutata prima di poterne scrivere la maschera | Confermata il 12 ottobre 2026, con riserva di rivederla |
| D-88 | 12 ott 2026 | Nel pannello del router la maschera di una rotta statica si scrive per esteso o come prefisso (`/24`), anche in coda alla rete. Una rotta che non viene usata resta in tabella, attenuata e con la scritta «non usata». Un router ha due tabelle appuntabili, di routing e ARP, ciascuna con il suo pulsante nel pannello; dalla barretta si appunta quella di routing | Le rotte si scrivono spesso con il prefisso. La rotta inutilizzabile deve restare visibile perché è l'errore da diagnosticare. In lezione serve la tabella di routing, ma la tabella ARP del router mostra che cerca il vicino e non la destinazione | Confermata |
| D-89 | 12 ott 2026 | La CLI in stile IOS del rilascio 2 comprende i comandi di configurazione di base, i `show` delle tabelle e della configurazione, e `ping` e `traceroute` dal router. Sugli switch mostra, rinomina e spegne le porte. Si scrive come su IOS: abbreviazioni non ambigue, Tab, `?`. I comandi di RIP versione 1 e 2 e di OSPF restano alla tappa T5, e l'interprete va costruito perché si possano aggiungere | Serve a svolgere la lezione sul routing interamente da terminale, come su un apparato vero. Abbreviazioni, Tab e `?` sono il modo in cui si lavora davvero su IOS | Confermata |
| D-90 | 12 ott 2026 | Output e messaggi di errore della CLI hanno il formato di IOS (`% Invalid input detected at '^' marker.`, le sigle di `show ip route`), ma senza intestazioni, numeri di versione o diciture di marca | È ciò che gli studenti troveranno sugli apparati e sui libri. Evitare i testi di marca tiene l'app, che andrà ai colleghi, lontana dal prodotto di un altro | Confermata |
| D-91 | 12 ott 2026 | Dal router `ping` manda cinque richieste e stampa i simboli di IOS (`!` risposta, `.` scadenza, `U` irraggiungibile) con la percentuale di successo; `traceroute` una riga per salto. L'indirizzo sorgente è quello dell'interfaccia da cui il pacchetto esce | È il primo output di IOS che si impara a leggere, diverso apposta da quello di Windows | Confermata |
| D-92 | 12 ott 2026 | `copy running-config startup-config` e `write memory` sono accettati e rispondono `[OK]`, ma non fanno nulla: non esiste una configurazione di avvio separata, e la rete si salva con il file. `show startup-config` mostra la configurazione in uso | L'abitudine giusta non va punita con un errore; simulare due configurazioni aggiungerebbe uno stato a ogni dispositivo senza che la lezione sul routing lo richieda | Confermata |
| D-93 | 12 ott 2026 | Le porte degli switch si possono spegnere, e nascono accese; si spengono dalla CLI. Sul disegno una porta spenta si vede come un'interfaccia di router spenta | Completa il requisito SIM-7 e dà alla CLI dello switch qualcosa da configurare prima delle VLAN. Su uno switch vero le porte nascono accese | Confermata |
| D-94 | 13 ott 2026 | I comandi della CLI sono un albero scritto come dati, percorso una parola alla volta; lo stesso albero risponde a `?` e al Tab. Le descrizioni dell'aiuto sono in inglese, nello stile di IOS ma con parole nostre. Si aggiunge `do`. Una parola sconosciuta dà sempre l'errore con il segno `^`: non viene presa per un nome di computer da cercare, come farebbe IOS in modalità utente. Entrando in configurazione compare la riga `Enter configuration commands, one per line.  End with CNTL/Z.` | Un albero di dati lascia aggiungere RIP e OSPF senza toccare l'interprete. L'inglese è ciò che gli studenti vedranno sugli apparati; le parole nostre tengono lontani i testi di marca (D-90). `do` in lezione si usa di continuo. L'attesa della ricerca del nome è un fastidio di IOS che non insegna nulla | Confermata |
| D-95 | 13 ott 2026 | I comandi di configurazione della CLI passano dalle stesse azioni del pannello. Ciò che viene rifiutato lo è con il messaggio di IOS (`Bad mask /24 for address …`, `% … overlaps with GigabitEthernet0/0`, `%Inconsistent address and mask`, `%No matching route to delete`); una rotta riscritta uguale non è un errore. Una rotta il cui prossimo salto è un indirizzo del router stesso viene rifiutata mentre la si scrive, dalla CLI (`%Invalid next hop address (it's this router)`) e dal pannello; il motore e i file la ammettono, perché rifiutarla lì romperebbe annulla e ripristina quando l'indirizzo arriva dopo la rotta. `shutdown` e `no shutdown` stampano subito le righe `%LINK-5-CHANGED` e `%LINEPROTO-5-UPDOWN`, la seconda solo se dall'altra parte c'è segnale. `hostname` vuole una lettera iniziale e poi lettere, cifre e trattini, e rifiuta un nome già usato con un messaggio nostro. `ip address` vuole sempre la maschera: maschera proposta e prefisso restano aiuti del pannello | Le stesse azioni tengono sincronizzati pannello e CLI (CFG-5) senza altro codice. I messaggi sono quelli che gli studenti troveranno sugli apparati; le due righe sullo stato sono le prime che si imparano a leggere, e la seconda dice se il cavo funziona | Confermata |
| D-96 | 13 ott 2026 | I comandi `show` hanno il formato di IOS, con quattro semplificazioni. I MAC sono scritti con i due punti, come nel resto dell'app, e non nel formato `0200.0000.0301`. `show ip route` è quello classico: righe `C` e `S` e gateway di ultima istanza, senza le righe `L` né le intestazioni «is subnetted»; una rotta statica non usata non compare. `show interfaces` dà stato, MAC e indirizzo, senza contatori. In `show arp` l'età vale `-` per gli indirizzi del router e `0` per quelli imparati | Lo stesso indirizzo scritto in due modi tra terminale e pannello confonderebbe più di quanto insegni. Le altre righe di IOS descrivono cose che il motore non ha (contatori, scadenza delle righe ARP) o che in una prima lezione sul routing distraggono | Confermata |
| D-97 | 13 ott 2026 | Un router fa ping e traceroute con le stesse azioni del motore degli host, e gli esiti sono le stesse tracce. La logica della serie di echo request è una sola per host e router (`echo-series.ts`). Il primo ping verso un vicino mai visto riesce (`!!!!!`): il pacchetto aspetta la risposta ARP invece di andare perso come su IOS (`.!!!!`). L'intestazione di `ping` non ha la riga `Type escape sequence to abort.` e riporta la scadenza vera, `timeout is 40 ms`. `traceroute` manda una sonda ICMP per salto. La scadenza resta di 40 tick: cinque echo request falliti durano 200 tick | Stesse azioni e stesse tracce vogliono dire che scheda Eventi e filtro funzionano senza modifiche. Riprodurre il punto iniziale costerebbe 40 tick di attesa a ogni primo ping. Il ping qui non si interrompe, e un'intestazione che dichiara due secondi sarebbe falsa. Il motore non ha UDP fino alla tappa T3 | Confermata |
| D-98 | 14 ott 2026 | La CLI si apre dal pulsante Terminale della barretta di router e switch, in una scheda come quelle dei PC. `?` risponde appena premuto e lascia la riga com'era; Ctrl+Z nella CLI vale `end`, e per annullare restano le frecce in alto e Ctrl+Z fuori dalla CLI. Ogni comando che cambia la rete è un passo della cronologia. La CLI torna alla modalità utente chiudendo la scheda, con Ricomincia e spegnendo il dispositivo. Nessuna riga vuota tra un comando e l'altro. Un terminale non resta occupato da un ping se nella simulazione non c'è più nulla di quella conversazione | È il comportamento di IOS dove non contrasta con l'app. Un passo per comando è coerente con il pannello, dove ogni campo confermato è un passo. Spegnere un apparato vero vuol dire riavviarlo | Confermata |
| D-99 | 17 ott 2026 | Il sito delle classi è costruito dal ramo `stabile`; `main`, su cui si lavora, diventa un'anteprima a un altro indirizzo. Si pubblica portando `main` su `stabile` (`git push origin main:stabile`), dopo che i controlli di GitHub Actions su quel commit sono passati | Con l'app in uso a lezione, un push sbagliato o una novità non ancora provata romperebbero il sito a metà settimana. Pubblicare diventa un gesto separato e voluto, senza cambiare né il servizio né il modo di lavorare | Confermata |
| D-100 | 18 ott 2026 | Le tabelle nel file (FILE-5) si scelgono con l'interruttore Tabelle accanto a Salva con nome: vale per la rete aperta, si accende aprendo un file che le contiene e si spegne con Nuova. Si salvano le tabelle ARP di host e router e quelle MAC degli switch, come sono al salvataggio. Diventano le tabelle di partenza: aperto il file la rete parte con quelle, e Ricomincia ci torna. Le tabelle cambiate dal traffico non rendono la rete «modificata». Una riga sbagliata si prepara con la rete stessa, senza comandi nuovi. All'apertura si controlla solo che le righe siano scritte bene e indichino porte esistenti. Costruite prima di offline e strumenti dell'editor, cambiando l'ordine di D-69 | Un interruttore lascia Salva e Salva con nome come sono, e funziona anche dove la finestra di salvataggio è quella del sistema. Ricominciare dalle tabelle del file permette di ripetere la dimostrazione già calda. Il traffico non è una modifica da confermare (D-58). Cambiare un indirizzo dopo un ping è il modo in cui una riga sbagliata nasce davvero (D-48). Erano l'unica parte del rilascio 2 senza dipendenze esterne, e accorciano il passo-passo del ping | Confermata |
| D-101 | 18 ott 2026 | Si duplica un dispositivo alla volta, con il pulsante Duplica della barretta; la copia nasce scollegata, accanto all'originale, e resta selezionata. Nome e MAC sono i successivi liberi. Un PC o un server copia maschera e gateway e prende il primo indirizzo libero della stessa sottorete dopo quello dell'originale (nessun indirizzo se non ce ne sono). Uno switch copia il numero di porte e quali sono spente; un router copia il numero di interfacce, che nascono spente e senza indirizzi, senza rotte. Niente selezione multipla | Dopo la prova in aula serve soprattutto a costruire in fretta una LAN da molti PC, e l'indirizzo successivo dà una LAN che funziona subito. Copiare gli indirizzi di un router produrrebbe solo conflitti. Un dispositivo alla volta rispetta «un clic seleziona» (UI-8) e lascia allo sfondo il compito di spostare la vista | Confermata |
| D-102 | 18 ott 2026 | La griglia magnetica si accende con un interruttore nella barra in alto, accanto alle etichette, ed è invisibile: acceso, il centro di un dispositivo posato o trascinato scatta al punto più vicino di una griglia di 20 px | Il disegno si tiene ordinato senza segni in più sul foglio, che resta pulito anche proiettato. Spenta, il trascinamento resta libero come oggi | Confermata |
| D-103 | 18 ott 2026 | Le annotazioni sono di due tipi: riquadri colorati e trasparenti, dietro ai dispositivi, con un'etichetta, e note di testo libere. Si posano con gli strumenti Riquadro e Nota della colonna, si selezionano con un clic, la barretta ha colore ed Elimina, il testo si scrive nel pannello laterale, il riquadro si ridimensiona dagli angoli. Cinque colori tenui fissi, leggibili nei due temi. Stanno nel file e in annulla e ripristina; in presentazione si vedono ma non si modificano. Non fanno parte della rete: stanno fuori dal motore, come le posizioni | I riquadri servono a mostrare le sottoreti, le note a scrivere una consegna sul disegno. Gli stessi gesti dei dispositivi non chiedono nulla di nuovo da imparare. Colori fissi evitano scelte illeggibili su un proiettore o in uno dei due temi (UI-7: il riquadro ha anche la sua etichetta) | Confermata |
| D-104 | 18 ott 2026 | Esporta immagine produce un PNG di tutta la rete, inquadrata come con Adatta, con le etichette accese in quel momento, annotazioni e tabelle appuntate, senza buste in viaggio; sempre con il tema chiaro e a doppia risoluzione | L'immagine va nelle slide, nei compiti e nelle verifiche su carta: deve contenere tutta la rete, stampare nitida e su sfondo chiaro, qualunque cosa mostri lo schermo in quel momento | Confermata |
| D-105 | 21 ott 2026 | La sessione passa da cinque a sette strati. Il file (aprire, foglio nuovo, modifiche non salvate, salvare) esce da `session-core` in `session-file`; la cronologia di annulla e ripristina esce da `session-editing` in `session-history`, sotto le modifiche, e gli strati sopra la usano con `capture`, `remember` e `attempt`. I metodi si chiamano tutti su `session` come prima, e nessun componente né test cambia | I due file avevano superato le 300 righe con due concetti ciascuno, e Duplica e le annotazioni stanno per aggiungere metodi proprio lì. Dividere prima, per concetto, tiene leggibile il codice che gli studenti leggono, e dà alle annotazioni un posto chiaro: entreranno nella fotografia della cronologia e nel confronto delle modifiche non salvate | Confermata |
| D-106 | 22 ott 2026 | Nel file le annotazioni sono un campo `annotations` accanto a `network`, scritto solo se ce n'è almeno una. Ognuna ha tipo (`box` o `note`), identificativo (`a1`, `a2`…, il primo libero), angolo in alto a sinistra, colore per nome (`blue`, `green`, `yellow`, `red`, `purple`) e testo; un riquadro anche larghezza e altezza, mai sotto i 40 px. Nella sessione stanno accanto alle posizioni e passano dalla vista; i metodi sono in un ottavo strato, `session-annotations`. Entrano nella fotografia della cronologia e nel confronto delle modifiche non salvate. Colore, testo, aggiungere ed eliminare sono passi da annullare; spostare e ridimensionare lo sono solo a trascinamento finito | Come le posizioni, non sono rete: tenerle fuori da `network` lascia il motore e i file senza annotazioni come sono. Il colore per nome lascia al tema le tinte, che si possono cambiare (NF-7). Un trascinamento è un gesto solo, come per i dispositivi | Confermata |

## 9. Stato di avanzamento

Aggiornato al 20 ottobre 2026. Le percentuali sono stime a occhio, pesate sul lavoro e non sul numero di requisiti.

| Traguardo | Completamento |
| --- | --- |
| Motore del rilascio 1 | completo |
| Rilascio 1 intero | circa 99%: costruito e provato in aula; restano la LIM con il dito e una rete grande su un PC dell'aula |
| Rilascio 2 | circa 80%: routing, CLI e tabelle nel file costruiti; degli strumenti dell'editor fatti 2 passaggi su 7; manca l'offline |
| Prima versione (rilasci 1 e 2) | circa 90% |
| Progetto completo, fino alla tappa T8 | circa 30%: le tappe T1–T8 non sono cominciate, e T1, T3 e T5 valgono ciascuna quanto il rilascio 2 o più |

Motore e interfaccia del rilascio 1 sono entrambi costruiti. L'interfaccia è stata progettata il 10 ottobre 2026 ([docs/interfaccia.md](docs/interfaccia.md)) e costruita in nove passaggi, tutti fatti. Il sito è pubblicato (D-64) e la prova in aula, a ottobre 2026, non ha mostrato problemi: il sito si apre dai PC della scuola, la presentazione si legge dal fondo dell'aula con l'ingrandimento di partenza (D-61, confermata), e il passo-passo del ping è accettabile. Restano da provare l'uso di una LIM con il dito, perché non ce n'era una a disposizione, e una rete grande su un PC dell'aula.

### Requisiti del rilascio 1

| Stato | Requisiti |
| --- | --- |
| **Fatto** | ED-1 posare PC e switch dalla colonna · UI-8 selezione e barretta · UI-7 colore più un secondo segno · VIS-7 modalità presentazione · UI-14 scorciatoie e ingrandimento regolabile · FILE-1 aprire e salvare · ED-3 spostare, ingrandire e scorrere · UI-13 rotella, sfondo e pulsanti dell'inquadratura · DEV-1 PC · DEV-2 switch · ED-4 rinominare ed eliminare · ED-5 annulla e ripristina · CFG-1 pannello di configurazione · CFG-7 regole di Windows, per i file e per il pannello · CFG-8 conferma del campo e maschera proposta · ED-2 cavi nuovi e scelta della porta · SIM-1 Ethernet, ARP, IPv4, ICMP · SIM-8 comportamento da rete vera · SIM-13 quattro echo request ed esiti · SIM-14 loopback · SIM-15 sospensione della tempesta di broadcast · SIM-6 guasti: cavo staccato e dispositivo spento · UI-3 lingua · UI-4 mouse e tastiera · UI-1 disposizione della schermata · UI-2 stile grafico · UI-6 due temi · UI-10 barra della simulazione · SIM-5 ping col mouse · VIS-2 pacchetto a strati · VIS-3 tabelle aggiornate dal vivo · CFG-2 terminale degli host · SIM-4 traffico dal terminale · UI-11 una scheda per terminale · VIS-4 pacchetto, contenuto e tabelle insieme · VIS-5 filtro del traffico · VIS-9 elenco degli eventi · VIS-10 tabelle appuntate · UI-12 foglio vuoto all'avvio · VIS-1 buste con sigla · VIS-6 etichette sul disegno · VIS-8 stato delle porte sui collegamenti: segnale, cavo staccato, dispositivo spento, porta spenta · SIM-2 tempo reale e passo-passo · SIM-3 velocità · SIM-16 pausa tra gli echo · SIM-17 attese accorciate · NF-1 sito statico · NF-3 browser · NF-5 codice leggibile · NF-6 test del motore · FILE-4 controlli all'apertura di un file · UI-5 leggibilità dal fondo dell'aula, provata in aula in presentazione |
| **A metà** | FILE-2 il numero di versione c'è, le migrazioni no: serviranno al primo cambio di formato |
| **Da provare** | NF-4 reti fino a 50 dispositivi: misurate il 17 ottobre 2026 in Chrome senza finestra, con la CPU rallentata 4 volte, su una rete di prova (un router, 4 switch, 45 PC): 60 fotogrammi al secondo, senza blocchi, a rete ferma, durante un ping attraverso il router, trascinando il router e durante una tempesta di broadcast su 50 dispositivi; resta da provare su un PC dell'aula, e a quella dimensione le scritte risultano molto piccole prima di ingrandire · UI-9 modificare la rete mentre il traffico viaggia: funziona nei test, mai provato a lungo a mano · NF-7 stile e disposizione sostituibili: colori, caratteri e icone stanno in un solo punto, la disposizione in `App.svelte`; mai messo alla prova con uno stile diverso |

Rilascio 2: progettato l'11 ottobre 2026 (criteri di accettazione e piani nella sezione 5). Tre delle sue parti sono costruite:

- **Routing**, i sette passaggi del suo piano, dall'11 al 12 ottobre. Il motore instrada, avvisa con i messaggi ICMP di errore e offre `tracert` e `ping -i`. A schermo il router si posa, si configura (interfacce, rotte statiche), mostra le sue tabelle e i suoi indirizzi; il server si usa come un PC. La lezione del criterio di accettazione è eseguita per intero da `tests/e2e/router.spec.ts`.
- **CLI in stile IOS**, i sette passaggi del suo piano, dal 13 al 14 ottobre. Le porte degli switch si spengono. L'interprete (`src/shell/ios/`) ha modalità, abbreviazioni, `?`, Tab, `do` e i messaggi di errore di IOS. I comandi di configurazione passano dalle azioni del pannello (D-95), i `show` leggono la rete (D-96), il router fa ping e traceroute (D-97). La CLI si apre dalla barretta di router e switch, e ogni comando che cambia la rete è un passo della cronologia (D-98). La lezione del criterio di accettazione è eseguita da `tests/e2e/cli.spec.ts`; il codice è descritto in `docs/cli.md`.
- **Tabelle nel file**, il 18 ottobre (D-100). L'interruttore Tabelle fa salvare le tabelle ARP e MAC; un file che le contiene parte già caldo, e Ricomincia torna a quelle. Il percorso è eseguito da `tests/e2e/file.spec.ts`.

Restano: strumenti dell'editor, progettati il 18 ottobre 2026 dopo la prova in aula (criterio di accettazione e piano nella sezione 5, decisioni D-101…D-104; fatti i passaggi da 1 a 4: la griglia magnetica, il duplicare nel motore e a schermo, le annotazioni nei file e nella cronologia), e funzionamento offline, che aspetta nome e dominio. Tappe successive: nulla è iniziato.

### Requisiti del rilascio 2

| Stato | Requisiti |
| --- | --- |
| **Fatto** | ED-6 duplicare, un dispositivo alla volta (D-101) · ED-7 griglia magnetica · FILE-5 tabelle nel file · DEV-3 router · DEV-4 routing statico e tabella di routing · DEV-5 server · CFG-3 `tracert` · CFG-4 CLI in stile IOS · CFG-5 CLI e pannello sincronizzati · SIM-18 messaggi ICMP di errore |
| **Fatto in parte** | SIM-7 porta spenta: interfacce dei router e porte degli switch sì, scheda di un host no |
| **Da fare** | NF-2 offline e installabile · ED-8 esportare come immagine · ED-9 annotazioni |

### Rispetto al criterio di accettazione della CLI

| Punto | Stato |
| --- | --- |
| 1. Foglio vuoto: due PC e due router in fila, PC configurati | Funziona |
| 2. `enable`, `configure terminal`, `hostname` | Funziona |
| 3. `interface`, `ip address`, `no shutdown`; pannello e disegno mostrano le stesse cose | Funziona |
| 4. Abbreviazioni, Tab e `?` | Funziona |
| 5. `ip route`, poi tutto sul secondo router | Funziona |
| 6. `show ip interface brief`, `show ip route`, `show running-config` | Funziona |
| 7. `ping` dal router con la fila di simboli, poi `traceroute` | Funziona |
| 8. Un comando sbagliato, con il `^` sotto il punto giusto | Funziona |
| 9. Uno switch: `show mac address-table` e una porta spenta che si vede sul disegno | Funziona, provato su una rete di esempio con lo switch già al suo posto |

I nove punti sono eseguiti da due test in un browser vero (`tests/e2e/cli.spec.ts`). Il codice è descritto in [docs/cli.md](docs/cli.md).

### Rispetto al criterio di accettazione del rilascio 2

| Punto | Stato |
| --- | --- |
| 1. Aprire un file con due LAN unite da un router | Funziona |
| 2. Senza gateway il ping fallisce subito, senza frame | Funziona |
| 3. Con il gateway: ARP verso il router, poi il router cerca PC2 | Funziona |
| 4. Prima e dopo il router: stessi IP, MAC cambiati, TTL sceso di uno | Funziona |
| 5. Spegnere un'interfaccia del router, e riaccenderla | Funziona |
| 6. Tre reti e due router: senza rotte, `Destination net unreachable` | Funziona |
| 7. Rotta di andata, poi anche quella di ritorno | Funziona |
| 8. `tracert` mostra i due router e la destinazione | Funziona |

Come per il rilascio 1, gli otto punti sono eseguiti di fila da test automatici in un browser vero (`tests/e2e/router.spec.ts`). La prova in aula non ha mostrato problemi.

### Rispetto al criterio di accettazione del rilascio 1

| Punto | Stato |
| --- | --- |
| 1. Aprire un file con uno switch e tre PC | Funziona nella nuova interfaccia |
| 2. Lanciare il ping dal terminale, in modalità presentazione | Funziona |
| 3. Richiesta ARP in broadcast, flooding, tabella MAC | Funziona |
| 4. PC2 risponde, PC3 scarta, le tabelle si aggiornano | Funziona |
| 5. Echo request su una sola porta, echo reply | Funziona |
| 6. Selezionare un pacchetto e vederne gli strati | Funziona |
| 7. Staccare un cavo; cambiare un indirizzo | Funzionano entrambi: il cavo con un clic, l'indirizzo dal pannello laterale |
| 8. Salvare la rete | Funziona; la finestra di salvataggio va provata nei browser dell'aula |

Dall'11 ottobre 2026 gli otto punti sono eseguiti di fila da un test automatico in un browser vero (`tests/e2e/lezione.spec.ts`). La prova in aula non ha mostrato problemi: il sito passa il filtro della scuola e la presentazione si legge dal fondo dell'aula. Resta da provare una LIM.

### Che cosa esiste oltre ai requisiti

- 14 test della pagina in un browser vero (`tests/e2e/`), tra cui le lezioni dei tre criteri di accettazione eseguite per intero, e un controllo automatico a ogni push.
- 863 test automatici su motore, lettura e scrittura dei file, comandi del terminale e sulle parti dell'interfaccia che non hanno bisogno di uno schermo: preparazione del disegno, orologio del tempo reale, modifiche e cronologia, inquadratura, presentazione.
- Cinque reti di esempio in `examples/`: due PC, una LAN con uno switch, tre switch ad anello, due LAN unite da un router, tre reti con due router in fila.
- Il sito pubblicato, che si aggiorna a ogni push sul ramo `stabile` (D-99), e l'anteprima del ramo `main`.

### Difetti noti

I tre difetti documentati il 9 ottobre 2026 sono stati corretti: controlli su configurazione IP e file (D-28), loopback (D-27), sospensione della tempesta di broadcast (D-26).

Uno aperto, di poco conto:

- **Scritte che si sovrappongono attorno a un router.** In alcune posizioni, trascinando un router, gli indirizzi delle interfacce e i nomi delle porte finiscono uno sull'altro, o sopra un cavo vicino. Segnalato dal docente il 12 ottobre 2026 e lasciato così per ora: basta spostare un dispositivo. Le posizioni delle scritte sono calcolate cavo per cavo (`topology/geometry.ts`), senza tenere conto degli altri cavi dello stesso dispositivo.
