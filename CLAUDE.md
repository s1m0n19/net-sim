# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Il progetto

net-sim (nome provvisorio) è un simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle superiori. È un sito statico: nessun server, nessun account.

Il codice è anche materiale didattico: gli studenti leggeranno il motore di simulazione. La leggibilità vale più della concisione.

Documenti di riferimento, da leggere prima di lavorare su una parte e da aggiornare insieme al codice:

- `SPEC.md`: requisiti numerati (ED-1, SIM-2, ...) con il rilascio in cui arrivano, criterio di accettazione del rilascio 1, punti aperti (sezione 7), registro delle decisioni (sezione 8), stato di avanzamento (sezione 9).
- `docs/architettura.md`, `docs/motore.md`, `docs/formato-file.md`: come è fatto il codice.
- `docs/cli.md`: la CLI in stile IOS di router e switch, e come aggiungerle comandi e modalità.
- `docs/interfaccia.md`: il progetto dell'interfaccia definitiva, deciso con l'utente, con il piano di costruzione in nove passaggi. Va seguito: le scelte di aspetto e di interazione non si cambiano senza chiederlo.

I documenti in `docs/` descrivono il codice com'è e indicano come *previsto* ciò che ancora non esiste. Quando una modifica li rende falsi vanno corretti nello stesso lavoro; lo stesso vale per la sezione 9 di `SPEC.md`.

## Stato attuale

Il punto preciso sta nella sezione 9 di `SPEC.md`, che va tenuta aggiornata; qui solo l'essenziale per orientarsi.

- **Rilascio 1** (lezione su ARP e ping in una LAN con switch): costruito, pubblicato e provato in aula senza problemi. Il motore ha host, switch, ARP, IPv4, ping con quattro esiti, guasti e tempesta di broadcast; l'interfaccia è quella progettata in `docs/interfaccia.md`. Resta da provare una LIM con il dito.
- **Rilascio 2**, costruito per parti, ciascuna con il suo piano nella sezione 5 di `SPEC.md`:
  - **Routing** (fatto): router e rotte statiche (`devices/router*.ts`, `protocols/routing.ts`, `model/router-config.ts`), messaggi ICMP di errore (`protocols/icmp.ts`), `tracert` e `ping -i` (`devices/host-ping.ts`), server (un `Host` con `role: "server"`). A schermo `InterfaceFields.svelte`, `RouteEditor.svelte` e gli indirizzi accanto ai cavi (`addressLabelPoint` in `topology/geometry.ts`). La lezione è in `tests/e2e/router.spec.ts`.
  - **CLI in stile IOS** (fatta): `src/shell/ios/`, descritta in `docs/cli.md`; ping e traceroute dal router in `devices/router-ping.ts` e `devices/echo-series.ts`; a schermo nello strato `session-cli.svelte.ts`. La lezione è in `tests/e2e/cli.spec.ts`.
  - **Tabelle nel file** (fatte, D-100): `model/tables.ts`, le tabelle di partenza del `Simulator` (Ricomincia ci torna), `storage/tables-file.ts`, la casella delle tabelle nel menu Progetto della barra in alto (`session.saveTables`).
  - **Strumenti dell'editor** (fatti, D-101…D-104, D-117, D-119, piano in sette passaggi): fatti la griglia magnetica (`session.grid`, `topology/grid.ts`; in sviluppo `&griglia`) e il duplicare, nel motore (azione `duplicate-device`, `engine/duplicating.ts`) e a schermo (pulsante Duplica, `session.duplicate`, posto della copia in `topology/placement.ts`; in sviluppo `&duplica=PC1`). Fatte anche le annotazioni nei file e nella cronologia (D-106): tipo e file in `storage/annotations-file.ts`, metodi nello strato `session-annotations.svelte.ts`, nella vista `view.annotations`. Fatte anche le annotazioni a schermo (D-117): strumenti Riquadro e Nota nella colonna (`session.annotating`, `session.sketch`, `topology/box-drawing.ts`), `AnnotationBox.svelte` e `AnnotationNote.svelte` con i calcoli in `topology/annotation-geometry.ts` e i gesti in `topology/annotation-interaction.ts`, il pannello in `panels/AnnotationPanel.svelte`, la selezione `{ kind: "annotation" }`; la lezione è in `tests/e2e/annotazioni.spec.ts`. Fatta anche l'esportazione come immagine (D-119): `topology/export-image.ts`, voce Esporta immagine nel menu Progetto, `chooseImageTarget` e `writeImage` in `storage/browser-files.ts` (la finestra per scegliere dove salvare si apre per prima, nel clic: D-122); gli elementi da non esportare hanno `data-export-skip`. Il criterio di accettazione è eseguito da `tests/e2e/strumenti.spec.ts`, i casi difficili dell'esportazione da `tests/e2e/esportazione.spec.ts`.
  - **Copia di recupero** (fatta, D-120, D-121): `storage/recovery.ts`, `checkRecovery`, `restoreRecovery` e `discardRecovery` nello strato del file, la riga `layout/RecoveryOffer.svelte`; la lezione è in `tests/e2e/recupero.spec.ts`.
  - **Firefox e Safari** (fatto, D-123): i test della pagina girano anche in Firefox e WebKit, ciascuno in un lavoro di GitHub Actions; per le scritte dell'SVG i test usano `textBox` e `clickText` di `tests/e2e/helpers.ts`, perché Playwright in WebKit ne sbaglia la posizione.
  - **Licenza** (fatta, D-124): GPL versione 3 o successive, testo in `LICENSE`.
  - **Proporzioni del disegno** (fatte, D-127): dispositivi e barretta più compatti nell'editor, uguali a prima in presentazione; tutte le misure del dispositivo e di ciò che gli sta attorno in `topology/device-shape.ts` (`preferences.shape`).
  - **Chiarezza degli strumenti** (fatta, D-128): uno strumento alla volta con `session.releaseTools()`; voce attiva della colonna con fondo tinto e spunta; istruzioni anche per Riquadro e Nota in `topology/Messages.svelte`; i test in `feedback.spec.ts`.
  - **Colonna, barretta e flussi** (fatti, D-129): riga tra dispositivi e strumenti, varianti con il dito e da tastiera (`colonna.spec.ts`), barretta che evita i vicini (`placeBar`, argomento `neighbours`), istruzione «Traffico pronto» (`session.launchedAt`).
  - **Icone** (fatte, D-130): switch con le porte, router con la strada che si divide, server ad armadio, Ping andata e ritorno; una sagoma per tipo in `theme/DeviceIcon.svelte`, uguale in colonna e disegno.
  - **Pannello del router** (fatto, D-131): interfacce come schede che si aprono (`panels/InterfaceFields.svelte`), modulo delle rotte apribile (`RouteEditor.svelte`); nei test `openInterface` e `openRouteForm` di `tests/e2e/helpers.ts`.
  - **Guida e segnalazioni** (decise, D-126, piano in otto passaggi nella sezione 5 di `SPEC.md`): menu «?» con Guida (F1, riquadro sopra l'app), Segnala un problema (issue impostata) e Informazioni su net-sim (avvisi della GPL); da costruire.
  - **Da costruire dopo** (D-120): gli aggiornamenti alla prossima apertura vengono con l'offline.
  - **Offline** (NF-2): da fare; aspetta nome e dominio definitivi.
- **Tappe successive** (T1–T8): non cominciate.

Un difetto noto, di poco conto: attorno a un router indirizzi e nomi delle porte a volte si sovrappongono (SPEC, sezione 9).

## Comandi

```sh
npm run dev      # server di sviluppo su http://localhost:5173
npm test         # tutti i test, una sola esecuzione
npm run check    # controllo dei tipi (TypeScript e componenti Svelte)
npm run build    # sito statico in dist/
npm run test:e2e # test della pagina in Chromium (costruisce il sito e lo prova)
npm run test:e2e:browser # gli stessi in Chromium, Firefox e WebKit (D-123)

npx vitest run tests/engine/arp.test.ts    # un solo file di test
npx vitest run -t "la richiesta parte"     # i test il cui nome contiene il testo
npx vitest                                 # test in ascolto sulle modifiche
npx playwright test lezione                # un solo file dei test della pagina
npx playwright install chromium            # una volta sola: scarica il browser dei test
```

Non c'è un linter. `npm run check` deve chiudersi senza errori né avvisi. A ogni push GitHub Actions (`.github/workflows/controlli.yml`) esegue test, controllo dei tipi e test della pagina nei tre browser e segna l'esito sul commit: dopo un push va controllato, insieme alla costruzione di Cloudflare (l'anteprima di `main`, o il sito se il push era su `stabile`).

Per vedere davvero la pagina, con il server di sviluppo acceso:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1400,860 --virtual-time-budget=4000 --screenshot=/percorso/uscita.png \
  "http://localhost:5173/?esempio=lan-switch"
```

`?esempio=nome` apre `examples/nome.netsim.json` ed esiste solo in sviluppo, come `&ping=PC1>192.168.1.11`, `&richieste=4`, `&passi=3`, `&avanti=0.5` (sposta le buste di mezzo tratto), `&seleziona=PC1` (o un cavo come `l2`, o `pacchetto`), `&appunta=SW1,PC1`, `?posa=PC@200,150;SW8@450,150;R4@700,150` (posa dispositivi su un foglio vuoto; con `&griglia` sulla griglia magnetica; `&duplica=PC1`, ripetibile, ne duplica uno dopo `&scrivi`), `?scegli`, `&strumento=riquadro` (o `nota`), `&collega=PC1>SW1;PC2>SW1` (tira cavi tra i dispositivi posati), `&cavo`, `&da=PC1`, `&porta=2b` (elenco delle porte del secondo cavo, capo b), `&accendi=R1:Gi0/0` (accende un'interfaccia di router), `&spegni=SW1:Fa0/1` (spegne una porta di switch), `&scrivi=ip:192.168.1.10;name:Aula` (scrive nei campi del pannello e conferma), `&annulla=2`, `&ripristina=1`, `&vista=100,50,400,250` (inquadra quel rettangolo), `&adatta`, `&presenta` e `&ingrandimento=1.8` (solo con `?esempio=`), `&terminale=PC1&comando=arp%20-a` (con `&poi=8` per avanzare dopo i comandi; anche su un router o uno switch, con `&aiuto=show%20` per il `?`), `&stacca`, `&mira` e `&avvia` (vedi `src/main.ts`). Aggiungere `--blink-settings=preferredColorScheme=1` forza il tema chiaro. Chrome senza finestra non fa scorrere le animazioni: lo screenshot mostra sempre un istante fermo, quindi una situazione va preparata con `passi` e `avanti`. Il movimento si verifica con i test dell'orologio (`tests/ui/playback.test.ts`), che usano un orologio finto. Lo screenshot va fatto e guardato prima di dire all'utente che una modifica a schermo funziona. Se il server serve una versione vecchia di un file spostato o ricreato, va riavviato.

TypeScript è fermo alla versione 6 perché `svelte-check` non supporta ancora la 7.

## Architettura

Due parti che non si mescolano:

- **Motore** (`src/engine/`): tutta la logica di rete, in TypeScript puro senza dipendenze.
- **Interfaccia** (`src/ui/`): componenti Svelte 5 (rune) che mostrano e comandano il motore.

Accanto a queste, `src/storage/` legge e scrive i file di rete (`load.ts`, `save.ts`, e `browser-files.ts` per la scelta del file nel browser) e `src/shell/` contiene gli interpreti dei comandi: oggi il prompt Windows degli host (`windows.ts`, solo testo: non conosce né il simulatore né lo schermo) e, in `ios/`, la CLI in stile IOS di router e switch (descritta in `docs/cli.md`).

### Regola di dipendenza

Il motore non importa mai da `ui/`, da Svelte o dal browser. Dentro `src/engine/` sono vietati `document`, `window`, `setTimeout`, `Date.now()` e `Math.random()`: la simulazione deve essere deterministica, così i test sono ripetibili.

### Flusso

1. L'interfaccia invia un'**azione** (`src/engine/actions.ts`) con `Simulator.dispatch()`. Le azioni sono l'unico modo di comandare il motore.
2. Il `Simulator` (`src/engine/simulator.ts`) è a eventi discreti: tiene una coda ordinata di arrivi di frame e di scadenze di attese, ciascuno con il suo istante in **tick** (un tick per collegamento attraversato). `step()` salta al prossimo istante ed elabora **tutti** gli eventi di quell'istante, uno alla volta dalla testa della coda.
3. I dispositivi (`src/engine/devices/`; l'host è diviso in `host.ts`, `host-sending.ts`, `host-ping.ts` e `host-output.ts`, il router in `router.ts`, `router-sending.ts` e `router-ping.ts`) non spediscono nulla e non misurano il tempo: restituiscono un elenco di cose da fare (`HostOutput`: frame da inviare, attese da avviare o annullare, esiti dei ping), più l'eventuale scarto e il cambio di tabella. È il simulatore a eseguirle.
4. `dispatch()` e `step()` restituiscono le **tracce** di ciò che è successo; l'elenco completo resta in `sim.traces`.
5. L'interfaccia non osserva il simulatore: dopo ogni comando ne copia lo stato in una variabile `$state.raw` e disegna quella. Lo fa `session` (`src/ui/session.svelte.ts`), unico punto di contatto con il simulatore, usando `buildView` (`src/ui/view.ts`); i componenti leggono `session.view` e non fanno calcoli. `session` è fatta di otto classi una sopra l'altra, ciascuna nel suo file (`session-core`: rete, simulazione, selezione, inquadratura; `session-file`: aprire, salvare, modifiche non salvate; `session-demo`: guasti, terminali, tabelle, filtro; `session-history`: la cronologia di annulla e ripristina, con `capture`, `remember` e `attempt`; `session-editing`: modifiche e griglia; `session-annotations`: riquadri e note del disegno; `session-router`: interfacce e rotte dei router; `session-cli`: la CLI di router e switch): un metodo nuovo va nello strato del suo argomento, e uno strato usa solo quelli sotto di sé. Allo stesso modo il simulatore tiene in file a parte eventi, tracce, consegna, guasti, tempesta e modifiche (`events.ts`, `traces.ts`, `delivery.ts`, `faults.ts`, `storm.ts`, `network-changes.ts`).

Un ciclo tra switch produce una tempesta di broadcast, che il simulatore interrompe sospendendosi (`sim.suspended`). Per far avanzare la rete fino alla fine si usa `while (sim.canStep())`, mai la lunghezza della coda: a simulazione sospesa la coda non si svuota.

Ogni frame e ogni attesa portano un `conversationId`: ciò che nasce elaborandoli eredita il loro numero. Il filtro della scheda Eventi lo usa per mostrare solo la conversazione seguita.

### Configurazione e stato di esecuzione

Ogni dispositivo ha una parte di configurazione (indirizzi, porte, salvati nel file) e una di stato di esecuzione (tabelle, pacchetti in attesa, echo in sospeso). Il file contiene la prima e, se chi salva lo chiede, le tabelle ARP e MAC (D-100): il lettore le restituisce a parte (`LoadedFile.tables`) e il simulatore le applica come tabelle di partenza; senza, una rete appena aperta ha le tabelle vuote. `createHost` e `createSwitch` in `model/network.ts` creano un dispositivo "appena acceso" e sono l'unico punto in cui si definisce lo stato iniziale: un campo di stato nuovo va aggiunto lì. Le posizioni sul disegno stanno fuori dal modello del motore (`LoadedFile.positions`).

La configurazione IP di un host si controlla con `checkIpConfig` (`model/ip-config.ts`), che applica le regole di Windows. La usano il lettore dei file e il pannello laterale (attraverso `session.configure`); qualsiasi futuro punto di ingresso della configurazione (la CLI) deve passare da lì.

### Modificare la rete

Aggiungere e togliere dispositivi e cavi, rinominare, configurare: sono azioni come le altre. La logica sta in `src/engine/editing.ts` (e, per interfacce e rotte dei router, in `router-editing.ts`; per accendere e spegnere una porta, in `port-editing.ts`), che cambia solo la configurazione; `applyEdit` in `src/engine/network-changes.ts` la chiama e poi sistema la simulazione (frame persi, attese tolte, segnale ricalcolato, con le funzioni di `faults.ts`). Identificativi, nomi e MAC dei dispositivi nuovi li sceglie il motore. Annulla e ripristina passano da `src/engine/snapshot.ts`: `session` fotografa la configurazione prima di ogni modifica, e l'azione `restore-configuration` ci torna eseguendo le differenze come normali modifiche; un nuovo metodo di `session` che modifica la rete deve registrarsi nella cronologia (`capture` e `remember`). Chi mostra le tracce non può dare per scontato che un dispositivo o un cavo citato esista ancora.

### Aggiungere un protocollo o un dispositivo

L'ordine previsto in `docs/motore.md`: tipo dell'unità dati in `model/`, comportamento in un nuovo file di `protocols/`, collegamento ai dispositivi in `devices/`, test in `tests/engine/`, aggiornamento della tabella delle semplificazioni in `docs/motore.md`.

## Convenzioni

- **Identificatori in inglese, commenti e messaggi in italiano.** I nomi dei campi seguono la teoria e gli standard (`ttl`, `etherType`, `senderMac`). I commenti spiegano il perché e rimandano al concetto di rete.
- **Interfaccia in italiano**, con termini tecnici e comandi in inglese (switch, router, gateway, frame).
- **Un concetto, un file**: `arp.ts` contiene ARP e nient'altro.
- **Funzioni pure dove possibile**, e tra una soluzione breve e una ovvia si sceglie quella ovvia.
- **Come una rete vera** (requisito SIM-8): l'app non avvisa degli errori di configurazione e non spiega perché un frame è stato scartato. Il campo `reason` delle tracce serve solo ai test; l'interfaccia non lo mostra. Due confini, entrambi decisi: ciò che Windows non lascerebbe impostare viene rifiutato all'inserimento (CFG-7), e l'avviso della tempesta di broadcast ne spiega la causa (SIM-15).
- **Test come piccole storie**: costruisco la rete, compio l'azione, controllo tracce o stato. Nomi dei test in italiano, scritti come affermazioni. Le reti di prova stanno in `tests/engine/builders.ts`. La pagina ha pochi test che eseguono percorsi interi in un browser vero (`tests/e2e/`, Playwright, sul sito costruito): la lezione del criterio di accettazione, costruire una rete, i file, inquadratura e presentazione, le lezioni sul router e sulla CLI, la schermata in finestre di grandezze diverse (`responsive.spec.ts`, D-112), i segnali dell'interfaccia (`feedback.spec.ts`, D-113), il pannello laterale (`pannello.spec.ts`, D-114), la coerenza visiva (`coerenza.spec.ts`, D-115), le annotazioni (`annotazioni.spec.ts`, D-117), lo spazio del disegno: fascia e limite dell'ingrandimento automatico (`spazi.spec.ts`, D-118), il criterio degli strumenti dell'editor con l'immagine esportata (`strumenti.spec.ts`, D-119), la finestra di salvataggio e i confini dell'immagine (`esportazione.spec.ts`, D-122), la copia di recupero (`recupero.spec.ts`, D-121), la colonna dei dispositivi (`colonna.spec.ts`, D-129). I contrasti dei colori dei due temi li controlla `tests/ui/contrast.test.ts`: un colore nuovo in `tokens.css` deve farlo passare. Un comportamento nuovo della pagina va aggiunto a uno di quei percorsi, o a uno nuovo; ciò che riguarda l'aspetto va comunque fatto verificare all'utente nel browser, dicendo che cosa guardare e dove.
- Stile grafico e disposizione dei pannelli sono decisioni dichiarate reversibili in `SPEC.md`: icone e colori vanno tenuti in un solo punto, e nulla nel motore deve dipenderne.

## Pubblicazione

Il sito pubblico (https://net-sim.simon-nucifora.workers.dev) è su Cloudflare, collegato al repository, e lo usano le classi. Due rami (D-99): ogni push su `stabile` viene costruito con `npm run build` e pubblicato sul sito; ogni push su `main` diventa solo un'anteprima, a un altro indirizzo. Si lavora su `main`. Prima di ogni push vanno fatti passare `npm test`, `npm run check` e `npm run test:e2e` (che costruisce anche il sito). Si pubblica con `git push origin main:stabile`, solo quando l'utente lo chiede e dopo che GitHub Actions ha dato esito positivo su quel commit. Le prove si fanno sempre con il server locale.

## Git
- Non committare finché non lo chiedo esplicitamente
- Messaggi di commit in italiano, all'imperativo, una funzionalità per commit
- Mai eseguire git push senza conferma

## Documentazione
- Se una modifica cambia comandi, opzioni o comportamento visibile,
  aggiorna README.md nello stesso commit
- Ogni funzione pubblica ha una docstring breve (cosa fa, parametri, eccezioni)
- Le scelte tecniche importanti vanno annotate in SPEC.md, sezione "Decisioni"
