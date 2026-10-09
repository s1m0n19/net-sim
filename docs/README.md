# Documentazione tecnica

Questa cartella descrive come è fatto net-sim. I requisiti, cioè che cosa l'app deve fare, stanno in [SPEC.md](../SPEC.md).

**Stato:** bozza di progetto. I documenti precedono il codice e descrivono l'impostazione proposta. Vanno aggiornati insieme al codice: quando i due divergono, è la documentazione a essere sbagliata.

## Documenti

| Documento | Contenuto |
| --- | --- |
| [architettura.md](architettura.md) | Tecnologie scelte, parti dell'app, struttura delle cartelle, convenzioni del codice |
| [motore.md](motore.md) | Il motore di simulazione: modello dei dati, eventi, tempo, protocolli e loro semplificazioni |
| [formato-file.md](formato-file.md) | Il formato dei file in cui si salvano le reti |

Documenti previsti, da scrivere quando si arriva alla parte corrispondente:

- `interfaccia.md`: componenti, disposizione, stile grafico (rilascio 1).
- `cli.md`: interprete dei comandi IOS e terminale degli host (rilascio 2).
- `esercizi.md`: obiettivi, verifica automatica, protezione dei file (tappa T1).

## A chi si rivolge

A chi sviluppa l'app e agli studenti che ne leggono il codice. Per questo ogni documento parte dal concetto di rete, già noto dalla teoria, e arriva a come il codice lo rappresenta.

## Termini usati

| Termine | Significato in questa documentazione |
| --- | --- |
| Rete | L'insieme di dispositivi e collegamenti costruito dall'utente |
| Dispositivo | PC, server, switch o router |
| Porta | Punto di collegamento di un dispositivo, con un nome (per esempio `Fa0/1`) |
| Collegamento | Il cavo tra due porte |
| Configurazione | Ciò che l'utente imposta e che viene salvato nel file: indirizzi, rotte, nomi |
| Stato di esecuzione | Ciò che la rete impara funzionando: tabelle MAC e ARP, pacchetti in viaggio |
| Evento | Un fatto che avviene in un istante del tempo simulato, per esempio l'arrivo di un frame a una porta |
| Traccia | La registrazione di ciò che un evento ha prodotto, letta dall'interfaccia per disegnare |
| Conversazione | Il traffico generato da un'azione dell'utente, più tutto il traffico che esso provoca |
