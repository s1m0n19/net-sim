# La CLI di router e switch

**Stato:** descrive il codice al 14 ottobre 2026. La CLI del rilascio 2 è completa; i comandi dei protocolli di routing dinamico (RIP, OSPF) sono *previsti* per la tappa T5.

Su un router o uno switch il terminale non è il prompt di Windows dei PC, ma una riga di comando in stile Cisco IOS: si entra per gradi in modalità diverse, si scrivono comandi abbreviati, si chiede aiuto con `?`. È ciò che gli studenti troveranno sugli apparati veri e nei libri.

Requisiti e decisioni stanno in [SPEC.md](../SPEC.md): CFG-4 e CFG-5, la tabella dei comandi della sezione 3.3, le decisioni da D-89 a D-98. Come si presenta a schermo è descritto in [interfaccia.md](interfaccia.md), sezione «La CLI di router e switch».

## Dove sta il codice

L'interprete è in `src/shell/ios/`, accanto al prompt dei PC (`src/shell/windows.ts`). Come quello, è **solo testo**: non conosce lo schermo e non comanda il simulatore. Riceve una riga, e restituisce che cosa stampare e che cosa andrebbe fatto alla rete.

| File | Contenuto |
| --- | --- |
| `modes.ts` | Le quattro modalità e il prompt di ciascuna |
| `grammar.ts` | Di che cosa è fatto un comando: parole chiave e argomenti; i tipi `Command` e `CommandNode` |
| `commands.ts` | L'albero dei comandi, modalità per modalità, scritto come dati |
| `interface-names.ts` | I nomi delle interfacce: brevi nel modello (`Gi0/0`), per esteso nell'output (`GigabitEthernet0/0`), abbreviati quando si scrivono (`gi0/0`, `g 0/0`) |
| `parser.ts` | Dalla riga al comando: si percorre l'albero una parola alla volta |
| `help.ts` | Il punto interrogativo e il tasto Tab |
| `interpreter.ts` | Il punto d'ingresso: `interpret(dispositivo, modalità, riga)` |
| `configure.ts` | Dai comandi di configurazione alle azioni del motore, con i rifiuti di IOS |
| `show.ts` | I comandi `show`: leggono la rete e la scrivono come IOS |
| `ping.ts` | `ping` e `traceroute` dal router: dagli esiti al testo |

A collegarlo allo schermo e al motore è il quinto strato della sessione, `src/ui/session-cli.svelte.ts`.

## Il percorso di una riga

1. **La scheda** (`TerminalTab.svelte`) passa la riga a `session.execute`.
2. **L'interprete** (`interpret`) la confronta con l'albero dei comandi della modalità in cui si trova il terminale. Ne escono la nuova modalità, le righe da stampare e, se c'è, il comando da eseguire.
3. **I comandi di modalità** (`enable`, `configure terminal`, `interface`, `exit`, `end`, `disable`) e i comandi di salvataggio li esegue l'interprete da sé: non toccano la rete.
4. **Gli altri comandi** li esegue la sessione:
   - un comando di configurazione passa da `configure`, che propone un'**azione del motore** oppure un rifiuto. Sono le stesse azioni del pannello laterale: per questo pannello e CLI restano sincronizzati (CFG-5), e ogni comando che cambia qualcosa diventa un passo della cronologia;
   - un `show` passa da `show`, che legge la rete e restituisce le righe;
   - `ping` e `traceroute` diventano le azioni `ping` e `tracert` del motore, rivolte al router. Il terminale ricorda la conversazione e ne legge gli esiti man mano che la simulazione avanza; `ping.ts` li scrive.

## Modalità

| Prompt | Modalità | Ci si arriva con | Che cosa si può fare |
| --- | --- | --- | --- |
| `R1>` | utente | aprendo la scheda | guardare (`show`, senza la configurazione), `ping`, `traceroute` |
| `R1#` | privilegiata | `enable` | guardare tutto, salvare, entrare in configurazione |
| `R1(config)#` | configurazione globale | `configure terminal` | `hostname`, `interface`, `ip route` |
| `R1(config-if)#` | configurazione di un'interfaccia | `interface gi0/0` | `ip address`, `shutdown` e, come su IOS, anche i comandi globali |

`exit` torna indietro di un passo, `end` (o Ctrl+Z) torna a `R1#`. Non c'è password. La modalità è di ciascun terminale e torna a `R1>` chiudendo la scheda, con Ricomincia, o spegnendo il dispositivo. Un router o uno switch spento non ha CLI: finché resta spento la scheda non accetta comandi, né `?`, Tab e Ctrl+Z, e la configurazione non si cambia da lì (D-109).

Router e switch non hanno gli stessi comandi: un nodo dell'albero può essere riservato a un tipo di dispositivo (campo `only`). Sullo switch non esistono `ip address`, `ip route`, `ping`, `traceroute` e `show ip route`; c'è in più `show mac address-table`.

## L'albero dei comandi

Un comando è una fila di parole, e dopo ogni parola ne possono seguire solo alcune: i comandi formano un albero. In `commands.ts` l'albero è scritto con due funzioni, `keyword` e `argument`:

```ts
keyword("ip", "IP configuration", {
  next: [keyword("route", "Add a static route", { next: routeArguments("ip-route") })],
})
```

Ogni nodo porta la descrizione che compare dopo `?`. Un nodo che ha `command` può chiudere la riga: dagli argomenti incontrati lungo la strada costruisce il `Command`.

Il parser (`walk` in `parser.ts`) percorre l'albero:

- una **parola chiave** si può abbreviare, purché l'abbreviazione valga per una sola parola tra quelle possibili lì; scritta per intero vince sempre;
- un **argomento** è un indirizzo (`A.B.C.D`), un testo (`WORD`) o un'interfaccia del dispositivo. Il tipo e il numero dell'interfaccia possono essere staccati (`gigabitEthernet 0/0`).

Lo stesso percorso serve all'aiuto: `?` elenca i nodi possibili nel punto raggiunto, Tab completa l'unica parola che comincia così.

## Messaggi

| Situazione | Messaggio |
| --- | --- |
| Una parola che lì non può stare | `% Invalid input detected at '^' marker.`, con `^` sotto il primo carattere sbagliato |
| Un'abbreviazione che vale per più parole | `% Ambiguous command:  "co t"` |
| Una riga giusta ma non finita | `% Incomplete command.` |
| `?` dopo qualcosa che non è un comando | `% Unrecognized command` |
| Maschera con i bit non contigui | `Bad mask 0xFF00FF00 for address 10.0.0.1` |
| Indirizzo di rete o di broadcast | `Bad mask /24 for address 192.168.1.0` |
| Indirizzo che non può essere di un dispositivo | `Not a valid host address - 127.0.0.1` |
| Rete sovrapposta a un'altra interfaccia | `% 192.168.1.0 overlaps with GigabitEthernet0/0` |
| Rotta con rete e maschera che non vanno d'accordo | `%Inconsistent address and mask` |
| Prossimo salto che è il router stesso | `%Invalid next hop address (it's this router)` |
| Rotta da togliere che non c'è | `%No matching route to delete` |
| Nome non valido, o già usato | `% Hostname contains one or more illegal characters.`, `% Hostname "R2" is already in use` |

L'ultimo messaggio non esiste su IOS, che non conosce gli altri dispositivi: è nostro, perché nell'app i nomi sono unici. Dopo `shutdown` e `no shutdown` compaiono le righe `%LINK-5-CHANGED` e `%LINEPROTO-5-UPDOWN` (la seconda solo se dall'altra parte del cavo c'è segnale).

## Differenze da IOS

Come per il motore ([motore.md](motore.md), «Semplificazioni»), la CLI è fedele dove serve alla lezione e più semplice altrove.

| Aspetto | Su IOS | Qui |
| --- | --- | --- |
| Testi di marca | Intestazioni, versioni, nome del prodotto | Nessuno (D-90) |
| Password | `enable secret`, password di console | Nessuna |
| Configurazione di avvio | Separata da quella in uso | Una sola: `copy running-config startup-config` e `write memory` rispondono `[OK]` e la rete si salva con il file (D-92) |
| Indirizzi MAC | `0200.0000.0301` | `02:00:00:00:03:01`, come nel resto dell'app (D-96) |
| `show ip route` | Righe `L`, intestazioni «is subnetted» | Solo `C` e `S` e il gateway di ultima istanza (D-96) |
| `show interfaces` | Una ventina di righe di contatori | Stato, MAC, indirizzo |
| `show arp` | Età vera delle righe | `-` per gli indirizzi del router, `0` per quelli imparati |
| Primo ping verso un vicino mai visto | `.!!!!`: il primo echo si perde durante l'ARP | `!!!!!`: il pacchetto aspetta l'ARP (D-97) |
| Intestazione di `ping` | `Type escape sequence to abort.`, `timeout is 2 seconds` | Senza la prima riga, con la scadenza vera: `timeout is 40 ms` |
| `traceroute` | Tre sonde UDP per salto | Una sonda ICMP per salto |
| Una parola sconosciuta in modalità utente | Viene presa per un nome di computer da cercare | Errore con il segno `^` (D-94) |
| `--More--` | L'output lungo si ferma a ogni schermata | Esce tutto insieme |
| `?` dopo un tipo di interfaccia scritto per intero | Elenca i numeri possibili | `% Unrecognized command` (`int ?` e `int gi?` funzionano) |
| Descrizioni dell'aiuto | Testi di IOS | In inglese, con parole nostre |

## Aggiungere un comando o una modalità

**Un comando.** Si aggiunge un ramo all'albero in `commands.ts`, nella modalità giusta, e se serve una voce a `Command` in `grammar.ts`. Abbreviazioni, `?`, Tab ed errori lo trovano da soli. Poi si dice che cosa fa: un comando che cambia la rete va in `configure.ts`, e deve diventare un'azione del motore, la stessa che userebbe il pannello; un comando che guarda va in `show.ts`. I test stanno in `tests/shell/ios-*.test.ts`.

**Una modalità.** È ciò che servirà per il routing dinamico (*previsto*, tappa T5). `router rip` e `router ospf 1` portano su IOS a `R1(config-router)#`, dove si scrivono `version 2`, `network 192.168.1.0` e simili. Serviranno:

1. una modalità `config-router` in `modes.ts`, con il suo prompt;
2. il suo albero in `commands.ts`, e i rami `router rip` e `router ospf` nella configurazione globale;
3. in `interpreter.ts`, il passaggio alla modalità nuova, come già avviene per `interface`;
4. le azioni del motore per configurare il protocollo, e i loro casi in `configure.ts`.

Parser e aiuto non cambiano.

## Test

| File | Che cosa prova |
| --- | --- |
| `tests/shell/ios-modes.test.ts` | Modalità, prompt, comandi validi solo nella loro modalità, `do`, salvataggio |
| `tests/shell/ios-parsing.test.ts` | Abbreviazioni, argomenti, errori e posizione del `^`, nomi delle interfacce, differenze tra router e switch |
| `tests/shell/ios-help.test.ts` | `?` e Tab |
| `tests/shell/ios-configure.test.ts` | I comandi di configurazione sulla rete vera, e la lezione sul routing statico configurata dal terminale |
| `tests/shell/ios-show.test.ts` | Ogni comando `show` |
| `tests/shell/ios-ping.test.ts` | Il testo di `ping` e `traceroute` |
| `tests/engine/router-ping.test.ts` | Ping e traceroute lanciati da un router, nel motore |
| `tests/ui/cli.test.ts` | La CLI nella sessione: prompt, cronologia, pannello, ping che cresce con la simulazione |
| `tests/e2e/cli.spec.ts` | La lezione del criterio di accettazione, in un browser vero |
