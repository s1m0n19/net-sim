# Documentazione tecnica

Questa cartella descrive come è fatto net-sim. I requisiti, cioè che cosa l'app deve fare, stanno in [SPEC.md](../SPEC.md); lo stato di avanzamento è nella sua sezione 9.

**Stato:** ogni documento dice in cima a quale data descrive il codice; il 16 ottobre 2026 sono stati tutti riallineati alla CLI, e il 18 ottobre quelli toccati dalle tabelle nel file. Dove parlano di qualcosa che ancora non esiste lo dicono, con la parola *previsto*. Vanno aggiornati insieme al codice: quando i due divergono, è la documentazione a essere sbagliata.

## Documenti

| Documento | Contenuto |
| --- | --- |
| [architettura.md](architettura.md) | Tecnologie scelte, parti dell'app, struttura delle cartelle, convenzioni del codice |
| [motore.md](motore.md) | Il motore di simulazione: modello dei dati, eventi, tempo, attese, protocolli e loro semplificazioni |
| [formato-file.md](formato-file.md) | Il formato dei file delle reti |
| [interfaccia.md](interfaccia.md) | L'interfaccia: ossatura, comportamento di ogni parte, aspetto, organizzazione del codice e piano con cui è stata costruita |
| [cli.md](cli.md) | La CLI in stile IOS di router e switch: interprete, albero dei comandi, messaggi, differenze da IOS, come aggiungere comandi |

Documenti previsti, da scrivere quando si arriva alla parte corrispondente:

- `esercizi.md`: obiettivi, verifica automatica, protezione dei file (tappa T1).

## A chi si rivolge

A chi sviluppa l'app e agli studenti che ne leggono il codice. Per questo ogni documento parte dal concetto di rete, già noto dalla teoria, e arriva a come il codice lo rappresenta.

## Termini usati

| Termine | Significato in questa documentazione |
| --- | --- |
| Rete | L'insieme di dispositivi e collegamenti |
| Dispositivo | Un host (PC o server), uno switch o un router |
| Porta | Punto di collegamento di un dispositivo, con un nome (per esempio `Fa0/1`, o `Gi0/0` per l'interfaccia di un router) |
| Collegamento | Il cavo tra due porte |
| Configurazione | Ciò che si imposta e che sta nel file: indirizzi, nomi, porte |
| Stato di esecuzione | Ciò che cambia mentre la rete funziona: tabelle MAC e ARP, pacchetti in attesa, echo request in sospeso |
| Tick | L'unità del tempo simulato. Attraversare un collegamento richiede un tick |
| Evento | Un fatto futuro con il suo istante: l'arrivo di un frame a una porta, oppure la scadenza di un'attesa |
| Attesa | Un timer di un host: se scade prima che arrivi ciò che si aspettava, l'host rinuncia |
| Traccia | La registrazione di ciò che è successo, letta dall'interfaccia per disegnare |
| Conversazione | Tutto ciò che un'azione dell'utente provoca: in un ping, la richiesta ARP, gli echo e i loro esiti |
| Esito | Come si conclude un echo request: risposta, richiesta scaduta, host non raggiungibile, trasmissione non riuscita |
