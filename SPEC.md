# Specifiche del progetto

Simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti.

- **Stato:** bozza. Del codice esiste solo lo scheletro (scambio ARP tra due PC).
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

### 3.3 Configurazione

| ID | Requisito | Rilascio |
| --- | --- | --- |
| CFG-1 | Pannello grafico per configurare il dispositivo selezionato | R1 |
| CFG-2 | Terminale degli host in stile Windows: `ipconfig`, `ping`, `arp -a` | R1 |
| CFG-3 | `tracert` sugli host | R2 |
| CFG-4 | CLI di switch e router con sintassi Cisco IOS: modalità (`enable`, `configure terminal`, `interface`), abbreviazioni dei comandi, completamento con Tab, aiuto con `?` | R2 |
| CFG-5 | CLI e pannello grafico sincronizzati: una modifica fatta in uno compare subito nell'altro | R2 |
| CFG-6 | `nslookup` sugli host | T3 |

Il sottoinsieme dei comandi IOS è un punto aperto (sezione 7). Proposta iniziale per R2: `enable`, `configure terminal`, `hostname`, `interface`, `ip address`, `shutdown`, `no shutdown`, `ip route`, `exit`, `end`, `show running-config`, `show ip interface brief`, `show ip route`, `show mac address-table`, `show arp`, `ping`, `traceroute`.

### 3.4 Simulazione

I protocolli funzionano davvero, in forma semplificata: si simulano i campi principali e il comportamento normale, tralasciando timer fini, opzioni rare e casi limite. Le semplificazioni sono elencate in [docs/motore.md](docs/motore.md).

| ID | Requisito | Rilascio |
| --- | --- | --- |
| SIM-1 | Ethernet, ARP, IPv4 e ICMP echo funzionanti | R1 |
| SIM-2 | Due modalità commutabili: tempo reale e passo-passo. In passo-passo la rete avanza di un evento alla volta | R1 |
| SIM-3 | Velocità regolabile in tempo reale | R1 |
| SIM-4 | Generare traffico dal terminale dell'host | R1 |
| SIM-5 | Generare un ping con il mouse, indicando sorgente e destinazione sulla topologia | R1 |
| SIM-6 | Guasti fisici: staccare un cavo, spegnere un dispositivo | R1 |
| SIM-7 | Guasti fisici: spegnere una singola porta | R2 |
| SIM-8 | Comportamento da rete vera davanti agli errori di configurazione: nessun avviso preventivo e nessuna spiegazione del fallimento. La causa si cerca con gli strumenti (`ping`, `tracert`, comandi `show`) | R1 |
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
| T2 | VLAN |
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
- [ ] Lingua degli identificatori nel codice: adottata la proposta di [docs/architettura.md](docs/architettura.md), da confermare (decisione D-15).
- [ ] Se salvare nel file anche lo stato della simulazione: adottata la proposta di [docs/formato-file.md](docs/formato-file.md), da confermare (decisione D-14).
- [ ] Come trattare i cicli tra switch in assenza di spanning tree (vedi [docs/motore.md](docs/motore.md)).

## 8. Decisioni

Registro delle scelte tecniche importanti, con il motivo. Ogni nuova scelta si aggiunge in fondo; una scelta superata non si cancella, si marca come sostituita. I dettagli stanno in [docs/](docs/README.md).

Lo stato è *confermata* se è stata scelta o approvata esplicitamente dal docente, *adottata* se è già nel codice su proposta di chi sviluppa ma non è ancora stata discussa.

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
| D-10 | 9 ott 2026 | Simulatore a eventi discreti, deterministico | Tempo reale e passo-passo diventano lo stesso meccanismo; test e lezioni sono ripetibili | Adottata |
| D-11 | 9 ott 2026 | Tempo misurato in tick astratti, un tick per collegamento | Con i tempi veri, rallentare un pacchetto perché sia visibile renderebbe lunghissime le attese | Adottata |
| D-12 | 9 ott 2026 | Un passo elabora tutti gli eventi dello stesso istante | I frame di un broadcast si muovono insieme, come nella realtà | Adottata |
| D-13 | 9 ott 2026 | I dispositivi restituiscono una reazione; è il simulatore a spedire i frame | Il comportamento di un dispositivo si legge e si prova da solo | Adottata |
| D-14 | 9 ott 2026 | Il file contiene solo la configurazione, non le tabelle né i pacchetti in viaggio | Una rete aperta si comporta sempre allo stesso modo. Non si può salvare una simulazione a metà | Adottata |
| D-15 | 9 ott 2026 | Identificatori in inglese, commenti e messaggi in italiano | I nomi dei campi dei protocolli sono in inglese ovunque; i commenti devono essere letti dagli studenti | Adottata |
| D-16 | 9 ott 2026 | TypeScript fermo alla versione 6 | Lo strumento di controllo dei componenti Svelte non supporta ancora la 7 | Adottata |
