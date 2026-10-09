# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Il progetto

net-sim (nome provvisorio) è un simulatore di reti per la didattica, pensato per sostituire Cisco Packet Tracer nelle lezioni di sistemi e reti delle superiori. È un sito statico: nessun server, nessun account.

Il codice è anche materiale didattico: gli studenti leggeranno il motore di simulazione. La leggibilità vale più della concisione.

Documenti di riferimento, da leggere prima di lavorare su una parte e da aggiornare insieme al codice:

- `SPEC.md`: requisiti numerati (ED-1, SIM-2, ...) con il rilascio in cui arrivano, criterio di accettazione del rilascio 1, punti aperti.
- `docs/architettura.md`, `docs/motore.md`, `docs/formato-file.md`: impostazione tecnica.

I documenti in `docs/` sono nati prima del codice e in alcuni punti lo precedono (per esempio i campi `powered`, `enabled`, `connected` dei guasti non sono ancora nel modello). Quando codice e documenti divergono, segnalarlo e riallinearli.

## Stato attuale

Esiste solo lo scheletro: host, switch di livello 2, ARP e ping (quattro echo request in serie, con ARP automatico, pacchetti in attesa, scadenze ed esito di ciascuno), in passo-passo. Mancano i guasti, tempo reale, editor, salvataggio, stile grafico. Il prossimo traguardo è il rilascio 1 descritto in `SPEC.md` (lezione su ARP e ping in una LAN con switch).

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
2. Il `Simulator` (`src/engine/simulator.ts`) è a eventi discreti: tiene una coda di arrivi di frame, ciascuno con il suo istante in **tick** (un tick per collegamento attraversato). `step()` salta al prossimo istante ed elabora **tutti** gli eventi di quell'istante.
3. I dispositivi (`src/engine/devices/`) non spediscono nulla da soli: ricevono un frame e restituiscono una reazione (frame da inviare, eventuale scarto, tabella cambiata). È il simulatore a mettere i frame sul cavo.
4. `dispatch()` e `step()` restituiscono le **tracce** di ciò che è successo; l'elenco completo resta in `sim.traces`.
5. L'interfaccia non osserva il simulatore: dopo ogni comando ne copia lo stato in una variabile `$state.raw` (`readState()` in `App.svelte`) e disegna quella.

Ogni frame porta un `conversationId`: ciò che nasce elaborando un frame eredita il suo numero. Servirà a mostrare solo la conversazione seguita.

### Configurazione e stato di esecuzione

Ogni dispositivo ha una parte di configurazione (indirizzi, impostati dall'utente e salvati nel file) e una di stato di esecuzione (tabelle ARP, che si riempiono funzionando). Il file contiene solo la prima: una rete appena aperta ha le tabelle vuote. Le posizioni sul disegno stanno fuori dal modello del motore (`LoadedFile.positions`).

### Aggiungere un protocollo o un dispositivo

L'ordine previsto in `docs/motore.md`: tipo dell'unità dati in `model/`, comportamento in un nuovo file di `protocols/`, collegamento ai dispositivi in `devices/`, test in `tests/engine/`, aggiornamento della tabella delle semplificazioni in `docs/motore.md`.

## Convenzioni

- **Identificatori in inglese, commenti e messaggi in italiano.** I nomi dei campi seguono la teoria e gli standard (`ttl`, `etherType`, `senderMac`). I commenti spiegano il perché e rimandano al concetto di rete.
- **Interfaccia in italiano**, con termini tecnici e comandi in inglese (switch, router, gateway, frame).
- **Un concetto, un file**: `arp.ts` contiene ARP e nient'altro.
- **Funzioni pure dove possibile**, e tra una soluzione breve e una ovvia si sceglie quella ovvia.
- **Come una rete vera** (requisito SIM-8): l'app non avvisa degli errori di configurazione e non spiega perché un frame è stato scartato. Il campo `reason` delle tracce serve solo ai test; l'interfaccia non lo mostra.
- **Test come piccole storie**: costruisco la rete, compio l'azione, controllo tracce o stato. Nomi dei test in italiano, scritti come affermazioni.
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
