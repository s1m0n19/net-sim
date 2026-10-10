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

L'interfaccia definitiva è progettata in `docs/interfaccia.md` e va costruita in nove passaggi; è fatto il primo (ossatura, temi, disegno della rete, apertura di un file). La pagina provvisoria di prima sta in `src/ui/provisional/`, si apre all'indirizzo `/#provvisoria` ed è ancora l'unico posto da cui lanciare ping e guasti: non va rifinita, e si cancella quando la nuova la sostituisce.

Il prossimo traguardo è il rilascio 1 descritto in `SPEC.md` (lezione su ARP e ping in una LAN con switch). Non ci sono difetti noti aperti.

## Comandi

```sh
npm run dev      # server di sviluppo su http://localhost:5173
npm test         # tutti i test, una sola esecuzione
npm run check    # controllo dei tipi (TypeScript e componenti Svelte)
npm run build    # sito statico in dist/

npx vitest run tests/engine/arp.test.ts    # un solo file di test
npx vitest run -t "la richiesta parte"     # i test il cui nome contiene il testo
npx vitest                                 # test in ascolto sulle modifiche
```

Non c'è un linter. `npm run check` deve chiudersi senza errori né avvisi.

Per vedere davvero la pagina, con il server di sviluppo acceso:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1400,860 --virtual-time-budget=4000 --screenshot=/percorso/uscita.png \
  "http://localhost:5173/?esempio=lan-switch"
```

`?esempio=nome` apre `examples/nome.netsim.json` ed esiste solo in sviluppo. Aggiungere `--blink-settings=preferredColorScheme=1` forza il tema chiaro. Lo screenshot va fatto e guardato prima di dire all'utente che una modifica a schermo funziona. Se il server serve una versione vecchia di un file spostato o ricreato, va riavviato.

TypeScript è fermo alla versione 6 perché `svelte-check` non supporta ancora la 7.

## Architettura

Due parti che non si mescolano:

- **Motore** (`src/engine/`): tutta la logica di rete, in TypeScript puro senza dipendenze.
- **Interfaccia** (`src/ui/`): componenti Svelte 5 (rune) che mostrano e comandano il motore.

Accanto a queste, `src/storage/` legge i file di rete e, in futuro, `src/shell/` conterrà gli interpreti dei comandi (prompt Windows, CLI IOS).

### Regola di dipendenza

Il motore non importa mai da `ui/`, da Svelte o dal browser. Dentro `src/engine/` sono vietati `document`, `window`, `setTimeout`, `Date.now()` e `Math.random()`: la simulazione deve essere deterministica, così i test sono ripetibili.

### Flusso

1. L'interfaccia invia un'**azione** (`src/engine/actions.ts`) con `Simulator.dispatch()`. Le azioni sono l'unico modo di comandare il motore.
2. Il `Simulator` (`src/engine/simulator.ts`) è a eventi discreti: tiene una coda ordinata di arrivi di frame e di scadenze di attese, ciascuno con il suo istante in **tick** (un tick per collegamento attraversato). `step()` salta al prossimo istante ed elabora **tutti** gli eventi di quell'istante, uno alla volta dalla testa della coda.
3. I dispositivi (`src/engine/devices/`) non spediscono nulla e non misurano il tempo: restituiscono un elenco di cose da fare (`HostOutput`: frame da inviare, attese da avviare o annullare, esiti dei ping), più l'eventuale scarto e il cambio di tabella. È il simulatore a eseguirle.
4. `dispatch()` e `step()` restituiscono le **tracce** di ciò che è successo; l'elenco completo resta in `sim.traces`.
5. L'interfaccia non osserva il simulatore: dopo ogni comando ne copia lo stato in una variabile `$state.raw` e disegna quella. Nella nuova interfaccia lo fa `session` (`src/ui/session.svelte.ts`), unico punto di contatto con il simulatore, usando `buildView` (`src/ui/view.ts`); i componenti leggono `session.view` e non fanno calcoli.

Un ciclo tra switch produce una tempesta di broadcast, che il simulatore interrompe sospendendosi (`sim.suspended`). Per far avanzare la rete fino alla fine si usa `while (sim.canStep())`, mai la lunghezza della coda: a simulazione sospesa la coda non si svuota.

Ogni frame e ogni attesa portano un `conversationId`: ciò che nasce elaborandoli eredita il loro numero. Servirà a mostrare solo la conversazione seguita.

### Configurazione e stato di esecuzione

Ogni dispositivo ha una parte di configurazione (indirizzi, porte, salvati nel file) e una di stato di esecuzione (tabelle, pacchetti in attesa, echo in sospeso). Il file contiene solo la prima: una rete appena aperta ha le tabelle vuote. `createHost` e `createSwitch` in `model/network.ts` creano un dispositivo "appena acceso" e sono l'unico punto in cui si definisce lo stato iniziale: un campo di stato nuovo va aggiunto lì. Le posizioni sul disegno stanno fuori dal modello del motore (`LoadedFile.positions`).

La configurazione IP di un host si controlla con `checkIpConfig` (`model/ip-config.ts`), che applica le regole di Windows. Oggi la usa il lettore dei file; qualsiasi futuro punto di ingresso della configurazione (pannello, CLI) deve passare da lì.

### Aggiungere un protocollo o un dispositivo

L'ordine previsto in `docs/motore.md`: tipo dell'unità dati in `model/`, comportamento in un nuovo file di `protocols/`, collegamento ai dispositivi in `devices/`, test in `tests/engine/`, aggiornamento della tabella delle semplificazioni in `docs/motore.md`.

## Convenzioni

- **Identificatori in inglese, commenti e messaggi in italiano.** I nomi dei campi seguono la teoria e gli standard (`ttl`, `etherType`, `senderMac`). I commenti spiegano il perché e rimandano al concetto di rete.
- **Interfaccia in italiano**, con termini tecnici e comandi in inglese (switch, router, gateway, frame).
- **Un concetto, un file**: `arp.ts` contiene ARP e nient'altro.
- **Funzioni pure dove possibile**, e tra una soluzione breve e una ovvia si sceglie quella ovvia.
- **Come una rete vera** (requisito SIM-8): l'app non avvisa degli errori di configurazione e non spiega perché un frame è stato scartato. Il campo `reason` delle tracce serve solo ai test; l'interfaccia non lo mostra. Due confini, entrambi decisi: ciò che Windows non lascerebbe impostare viene rifiutato all'inserimento (CFG-7), e l'avviso della tempesta di broadcast ne spiega la causa (SIM-15).
- **Test come piccole storie**: costruisco la rete, compio l'azione, controllo tracce o stato. Nomi dei test in italiano, scritti come affermazioni. Le reti di prova stanno in `tests/engine/builders.ts`. La pagina non ha test automatici: ciò che cambia a schermo va fatto verificare all'utente nel browser, dicendo che cosa guardare e dove.
- Stile grafico e disposizione dei pannelli sono decisioni dichiarate reversibili in `SPEC.md`: icone e colori vanno tenuti in un solo punto, e nulla nel motore deve dipenderne.

## Git
- Non committare finché non lo chiedo esplicitamente
- Messaggi di commit in italiano, all'imperativo, una funzionalità per commit
- Mai eseguire git push senza conferma

## Documentazione
- Se una modifica cambia comandi, opzioni o comportamento visibile,
  aggiorna README.md nello stesso commit
- Ogni funzione pubblica ha una docstring breve (cosa fa, parametri, eccezioni)
- Le scelte tecniche importanti vanno annotate in SPEC.md, sezione "Decisioni"
