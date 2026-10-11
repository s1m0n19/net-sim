# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Il progetto

net-sim (nome provvisorio) è un simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle superiori. È un sito statico: nessun server, nessun account.

Il codice è anche materiale didattico: gli studenti leggeranno il motore di simulazione. La leggibilità vale più della concisione.

Documenti di riferimento, da leggere prima di lavorare su una parte e da aggiornare insieme al codice:

- `SPEC.md`: requisiti numerati (ED-1, SIM-2, ...) con il rilascio in cui arrivano, criterio di accettazione del rilascio 1, punti aperti (sezione 7), registro delle decisioni (sezione 8), stato di avanzamento (sezione 9).
- `docs/architettura.md`, `docs/motore.md`, `docs/formato-file.md`: come è fatto il codice.
- `docs/interfaccia.md`: il progetto dell'interfaccia definitiva, deciso con l'utente, con il piano di costruzione in nove passaggi. Va seguito: le scelte di aspetto e di interazione non si cambiano senza chiederlo.

I documenti in `docs/` descrivono il codice com'è e indicano come *previsto* ciò che ancora non esiste. Quando una modifica li rende falsi vanno corretti nello stesso lavoro; lo stesso vale per la sezione 9 di `SPEC.md`.

## Stato attuale

Il motore del rilascio 1 è completo: host, switch di livello 2, ARP, IPv4 e ping (quattro echo request in serie, ARP automatico, pacchetti in attesa, scadenze, quattro esiti distinti, loopback), guasti (cavo staccato, dispositivo spento), sospensione della tempesta di broadcast, in passo-passo.

L'interfaccia definitiva è progettata in `docs/interfaccia.md` ed è stata costruita in nove passaggi, tutti fatti: ossatura e temi; barra della simulazione e tempo reale; selezione, barretta e pannello laterale; scheda Eventi; tabelle appuntate; terminale degli host; editor (posare, collegare, configurare, annullare); file, zoom e spostamento della vista; modalità presentazione con scorciatoie. Resta da provarla in aula, su LIM e con reti grandi.

Il rilascio 1 descritto in `SPEC.md` (lezione su ARP e ping in una LAN con switch) è costruito e va provato in aula. Il rilascio 2 è cominciato dal router, secondo il piano in sette passaggi di `SPEC.md`, sezione 5: è fatto il passaggio 1 (router nel modello e nei file, con i controlli di `model/router-config.ts`, e le azioni per aggiungerlo e configurarlo; a schermo solo in lettura). È fatto anche il passaggio 2, l'inoltro: `devices/router.ts` (che cosa fa il router con un frame) e `protocols/routing.ts` (tabella di routing e scelta della rotta, funzioni pure). È fatto anche il passaggio 3: i messaggi ICMP di errore (`makeIcmpError` in `protocols/icmp.ts`), che il router manda quando non può consegnare e che l'host trasforma in esiti del ping. È fatto anche il passaggio 4: `tracert` e `ping -i` (sonde con TTL crescente in `devices/host.ts`, righe in `shell/windows.ts`). Il motore del routing è completo; manca tutta la parte a schermo (passaggi 5, 6 e 7). Non ci sono difetti noti aperti.

## Comandi

```sh
npm run dev      # server di sviluppo su http://localhost:5173
npm test         # tutti i test, una sola esecuzione
npm run check    # controllo dei tipi (TypeScript e componenti Svelte)
npm run build    # sito statico in dist/
npm run test:e2e # test della pagina in un browser vero (costruisce il sito e lo prova)

npx vitest run tests/engine/arp.test.ts    # un solo file di test
npx vitest run -t "la richiesta parte"     # i test il cui nome contiene il testo
npx vitest                                 # test in ascolto sulle modifiche
npx playwright test lezione                # un solo file dei test della pagina
npx playwright install chromium            # una volta sola: scarica il browser dei test
```

Non c'è un linter. `npm run check` deve chiudersi senza errori né avvisi. A ogni push GitHub Actions (`.github/workflows/controlli.yml`) esegue test, controllo dei tipi e test della pagina e segna l'esito sul commit: dopo un push va controllato, insieme alla costruzione di Cloudflare.

Per vedere davvero la pagina, con il server di sviluppo acceso:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1400,860 --virtual-time-budget=4000 --screenshot=/percorso/uscita.png \
  "http://localhost:5173/?esempio=lan-switch"
```

`?esempio=nome` apre `examples/nome.netsim.json` ed esiste solo in sviluppo, come `&ping=PC1>192.168.1.11`, `&richieste=4`, `&passi=3`, `&avanti=0.5` (sposta le buste di mezzo tratto), `&seleziona=PC1` (o un cavo come `l2`, o `pacchetto`), `&appunta=SW1,PC1`, `?posa=PC@200,150;SW8@450,150;R4@700,150` (posa dispositivi su un foglio vuoto), `?scegli`, `&collega=PC1>SW1;PC2>SW1` (tira cavi tra i dispositivi posati), `&cavo`, `&da=PC1`, `&porta=2b` (elenco delle porte del secondo cavo, capo b), `&scrivi=ip:192.168.1.10;name:Aula` (scrive nei campi del pannello e conferma), `&annulla=2`, `&ripristina=1`, `&vista=100,50,400,250` (inquadra quel rettangolo), `&adatta`, `&presenta` e `&ingrandimento=1.8` (solo con `?esempio=`), `&terminale=PC1&comando=arp%20-a` (con `&poi=8` per avanzare dopo i comandi), `&stacca`, `&mira` e `&avvia` (vedi `src/main.ts`). Aggiungere `--blink-settings=preferredColorScheme=1` forza il tema chiaro. Chrome senza finestra non fa scorrere le animazioni: lo screenshot mostra sempre un istante fermo, quindi una situazione va preparata con `passi` e `avanti`. Il movimento si verifica con i test dell'orologio (`tests/ui/playback.test.ts`), che usano un orologio finto. Lo screenshot va fatto e guardato prima di dire all'utente che una modifica a schermo funziona. Se il server serve una versione vecchia di un file spostato o ricreato, va riavviato.

TypeScript è fermo alla versione 6 perché `svelte-check` non supporta ancora la 7.

## Architettura

Due parti che non si mescolano:

- **Motore** (`src/engine/`): tutta la logica di rete, in TypeScript puro senza dipendenze.
- **Interfaccia** (`src/ui/`): componenti Svelte 5 (rune) che mostrano e comandano il motore.

Accanto a queste, `src/storage/` legge e scrive i file di rete (`load.ts`, `save.ts`, e `browser-files.ts` per la scelta del file nel browser) e `src/shell/` contiene gli interpreti dei comandi: oggi il prompt Windows degli host (`windows.ts`, solo testo: non conosce né il simulatore né lo schermo), in futuro la CLI IOS.

### Regola di dipendenza

Il motore non importa mai da `ui/`, da Svelte o dal browser. Dentro `src/engine/` sono vietati `document`, `window`, `setTimeout`, `Date.now()` e `Math.random()`: la simulazione deve essere deterministica, così i test sono ripetibili.

### Flusso

1. L'interfaccia invia un'**azione** (`src/engine/actions.ts`) con `Simulator.dispatch()`. Le azioni sono l'unico modo di comandare il motore.
2. Il `Simulator` (`src/engine/simulator.ts`) è a eventi discreti: tiene una coda ordinata di arrivi di frame e di scadenze di attese, ciascuno con il suo istante in **tick** (un tick per collegamento attraversato). `step()` salta al prossimo istante ed elabora **tutti** gli eventi di quell'istante, uno alla volta dalla testa della coda.
3. I dispositivi (`src/engine/devices/`) non spediscono nulla e non misurano il tempo: restituiscono un elenco di cose da fare (`HostOutput`: frame da inviare, attese da avviare o annullare, esiti dei ping), più l'eventuale scarto e il cambio di tabella. È il simulatore a eseguirle.
4. `dispatch()` e `step()` restituiscono le **tracce** di ciò che è successo; l'elenco completo resta in `sim.traces`.
5. L'interfaccia non osserva il simulatore: dopo ogni comando ne copia lo stato in una variabile `$state.raw` e disegna quella. Lo fa `session` (`src/ui/session.svelte.ts`), unico punto di contatto con il simulatore, usando `buildView` (`src/ui/view.ts`); i componenti leggono `session.view` e non fanno calcoli. `session` è fatta di tre classi una sopra l'altra, ciascuna nel suo file (`session-core`: rete, simulazione, file, selezione; `session-demo`: guasti, terminali, tabelle, filtro; `session-editing`: modifiche e cronologia): un metodo nuovo va nello strato del suo argomento, e uno strato usa solo quelli sotto di sé. Allo stesso modo il simulatore tiene in file a parte eventi, tracce, guasti, tempesta e modifiche (`events.ts`, `traces.ts`, `faults.ts`, `storm.ts`, `network-changes.ts`).

Un ciclo tra switch produce una tempesta di broadcast, che il simulatore interrompe sospendendosi (`sim.suspended`). Per far avanzare la rete fino alla fine si usa `while (sim.canStep())`, mai la lunghezza della coda: a simulazione sospesa la coda non si svuota.

Ogni frame e ogni attesa portano un `conversationId`: ciò che nasce elaborandoli eredita il loro numero. Il filtro della scheda Eventi lo usa per mostrare solo la conversazione seguita.

### Configurazione e stato di esecuzione

Ogni dispositivo ha una parte di configurazione (indirizzi, porte, salvati nel file) e una di stato di esecuzione (tabelle, pacchetti in attesa, echo in sospeso). Il file contiene solo la prima: una rete appena aperta ha le tabelle vuote. `createHost` e `createSwitch` in `model/network.ts` creano un dispositivo "appena acceso" e sono l'unico punto in cui si definisce lo stato iniziale: un campo di stato nuovo va aggiunto lì. Le posizioni sul disegno stanno fuori dal modello del motore (`LoadedFile.positions`).

La configurazione IP di un host si controlla con `checkIpConfig` (`model/ip-config.ts`), che applica le regole di Windows. La usano il lettore dei file e il pannello laterale (attraverso `session.configure`); qualsiasi futuro punto di ingresso della configurazione (la CLI) deve passare da lì.

### Modificare la rete

Aggiungere e togliere dispositivi e cavi, rinominare, configurare: sono azioni come le altre. La logica sta in `src/engine/editing.ts`, che cambia solo la configurazione; `applyEdit` in `src/engine/network-changes.ts` la chiama e poi sistema la simulazione (frame persi, attese tolte, segnale ricalcolato, con le funzioni di `faults.ts`). Identificativi, nomi e MAC dei dispositivi nuovi li sceglie il motore. Annulla e ripristina passano da `src/engine/snapshot.ts`: `session` fotografa la configurazione prima di ogni modifica, e l'azione `restore-configuration` ci torna eseguendo le differenze come normali modifiche; un nuovo metodo di `session` che modifica la rete deve registrarsi nella cronologia (`capture` e `remember`). Chi mostra le tracce non può dare per scontato che un dispositivo o un cavo citato esista ancora.

### Aggiungere un protocollo o un dispositivo

L'ordine previsto in `docs/motore.md`: tipo dell'unità dati in `model/`, comportamento in un nuovo file di `protocols/`, collegamento ai dispositivi in `devices/`, test in `tests/engine/`, aggiornamento della tabella delle semplificazioni in `docs/motore.md`.

## Convenzioni

- **Identificatori in inglese, commenti e messaggi in italiano.** I nomi dei campi seguono la teoria e gli standard (`ttl`, `etherType`, `senderMac`). I commenti spiegano il perché e rimandano al concetto di rete.
- **Interfaccia in italiano**, con termini tecnici e comandi in inglese (switch, router, gateway, frame).
- **Un concetto, un file**: `arp.ts` contiene ARP e nient'altro.
- **Funzioni pure dove possibile**, e tra una soluzione breve e una ovvia si sceglie quella ovvia.
- **Come una rete vera** (requisito SIM-8): l'app non avvisa degli errori di configurazione e non spiega perché un frame è stato scartato. Il campo `reason` delle tracce serve solo ai test; l'interfaccia non lo mostra. Due confini, entrambi decisi: ciò che Windows non lascerebbe impostare viene rifiutato all'inserimento (CFG-7), e l'avviso della tempesta di broadcast ne spiega la causa (SIM-15).
- **Test come piccole storie**: costruisco la rete, compio l'azione, controllo tracce o stato. Nomi dei test in italiano, scritti come affermazioni. Le reti di prova stanno in `tests/engine/builders.ts`. La pagina ha pochi test che eseguono percorsi interi in un browser vero (`tests/e2e/`, Playwright, sul sito costruito): la lezione del criterio di accettazione, costruire una rete, i file, inquadratura e presentazione. Un comportamento nuovo della pagina va aggiunto a uno di quei percorsi, o a uno nuovo; ciò che riguarda l'aspetto va comunque fatto verificare all'utente nel browser, dicendo che cosa guardare e dove.
- Stile grafico e disposizione dei pannelli sono decisioni dichiarate reversibili in `SPEC.md`: icone e colori vanno tenuti in un solo punto, e nulla nel motore deve dipenderne.

## Pubblicazione

Il sito pubblico (https://net-sim.simon-nucifora.workers.dev) è su Cloudflare, collegato al repository: ogni push su `main` viene costruito con `npm run build` e pubblicato da solo. Un push è quindi una pubblicazione: prima vanno fatti passare `npm test`, `npm run check` e `npm run test:e2e` (che costruisce anche il sito). Le prove si fanno sempre con il server locale.

## Git
- Non committare finché non lo chiedo esplicitamente
- Messaggi di commit in italiano, all'imperativo, una funzionalità per commit
- Mai eseguire git push senza conferma

## Documentazione
- Se una modifica cambia comandi, opzioni o comportamento visibile,
  aggiorna README.md nello stesso commit
- Ogni funzione pubblica ha una docstring breve (cosa fa, parametri, eccezioni)
- Le scelte tecniche importanti vanno annotate in SPEC.md, sezione "Decisioni"
