# Formato dei file

**Stato:** descrive il codice al 9 ottobre 2026. Oggi l'app sa solo **leggere** i file, e solo le due reti di esempio della cartella `examples/`. Apertura di un file scelto dall'utente e salvataggio sono *previsti* (requisito FILE-1).

Una rete sta in un file di testo in formato JSON: si può leggere, confrontare con un altro e distribuire con qualsiasi mezzo.

- **Estensione provvisoria:** `.netsim.json`. Cambierà con il nome definitivo dell'app.
- **Codifica:** UTF-8.
- **Lettura:** `loadNetworkFile` in `src/storage/load.ts`.

## Che cosa contiene

Il file contiene la **configurazione** della rete: dispositivi, porte, collegamenti, indirizzi, posizioni sul disegno.

Oggi non contiene nulla dello **stato di esecuzione**: una rete appena aperta è una rete appena accesa, con le tabelle vuote.

La decisione presa per il futuro (D-25) distingue due parti dello stato di esecuzione:

- **Tabelle MAC e ARP**: si potranno includere nel file, se chi salva lo chiede. Servono a preparare una lezione che parte da una rete già calda, o un esercizio con una riga ARP sbagliata.
- **Pacchetti in viaggio o in attesa, attese, tempo simulato**: non si salveranno mai. Una simulazione non si può riprendere a metà.

## Esempio

Due PC collegati da un cavo, nella rete 192.168.1.0/24. È il file `examples/due-pc.netsim.json`.

```json
{
  "format": "net-sim",
  "version": 1,
  "network": {
    "devices": [
      {
        "id": "d1",
        "kind": "host",
        "name": "PC1",
        "position": { "x": 150, "y": 130 },
        "ports": [{ "name": "Fa0", "mac": "02:00:00:00:00:01" }],
        "ip": "192.168.1.10",
        "mask": "255.255.255.0",
        "gateway": null
      },
      {
        "id": "d2",
        "kind": "host",
        "name": "PC2",
        "position": { "x": 550, "y": 130 },
        "ports": [{ "name": "Fa0", "mac": "02:00:00:00:00:02" }],
        "ip": "192.168.1.11",
        "mask": "255.255.255.0",
        "gateway": null
      }
    ],
    "links": [
      {
        "id": "l1",
        "a": { "deviceId": "d1", "portName": "Fa0" },
        "b": { "deviceId": "d2", "portName": "Fa0" }
      }
    ]
  }
}
```

Uno switch si scrive così, come in `examples/lan-switch.netsim.json`:

```json
{
  "id": "s1",
  "kind": "switch",
  "name": "SW1",
  "position": { "x": 350, "y": 150 },
  "ports": [
    { "name": "Fa0/1", "mac": "02:00:00:00:01:01" },
    { "name": "Fa0/2", "mac": "02:00:00:00:01:02" }
  ]
}
```

## Campi

| Campo | Contenuto |
| --- | --- |
| `format` | Sempre `"net-sim"`. Serve a riconoscere il file e a rifiutare un JSON qualsiasi |
| `version` | Numero intero della versione del formato. Oggi vale 1 |
| `network.devices` | I dispositivi, con la loro configurazione |
| `network.links` | I collegamenti, ciascuno tra due porte |

Campi di ogni dispositivo:

| Campo | Contenuto | Presente in |
| --- | --- | --- |
| `id` | Identificativo interno, usato dai collegamenti | tutti |
| `kind` | Il tipo: `"host"` oppure `"switch"` | tutti |
| `name` | Il nome mostrato all'utente | tutti |
| `position` | Coordinate `x` e `y` sul disegno | tutti |
| `ports` | Le porte, ciascuna con `name` e `mac` | tutti |
| `ip`, `mask`, `gateway` | La configurazione IPv4. Ciascuno può essere `null` | solo host |

Gli identificativi (`id`) sono interni: i collegamenti si riferiscono a quelli, così un dispositivo potrà cambiare nome senza rompere nulla.

La posizione riguarda il disegno, non la rete: il lettore la restituisce a parte (`LoadedFile.positions`), fuori dal modello del motore.

## Controlli all'apertura

Un file può arrivare modificato a mano o danneggiato. Se un controllo fallisce, il lettore non apre il file e dice che cosa non va. Non tenta di riparare.

Controlli che il lettore fa oggi:

| Controllo | Messaggio |
| --- | --- |
| Il testo è JSON valido | «Il file non è JSON valido.» |
| `format` vale `"net-sim"` | «Il file non è una rete di net-sim.» |
| `version` è quella conosciuta | «Versione del file non supportata: …» |
| Ogni dispositivo ha un `kind` conosciuto | «Tipo di dispositivo non supportato: …» |
| La subnet mask di ogni host è valida | «PC1 ha una subnet mask non valida: …» |
| Ogni collegamento indica un dispositivo e una porta che esistono | «Il collegamento l1 indica una porta inesistente: …» |

Una subnet mask è valida se, scritta in binario, ha tutti i bit a 1 seguiti da tutti i bit a 0. Una maschera come 255.0.255.0 fa rifiutare il file (decisione D-17).

Controlli decisi (D-28, requisiti CFG-7 e FILE-4) e **non ancora fatti**:

| Controllo | Oggi |
| --- | --- |
| Ogni dispositivo ha tutti i campi richiesti, del tipo giusto | Un campo mancante può produrre un errore poco chiaro |
| Gli identificativi sono unici | Non controllato |
| Gli indirizzi MAC sono unici | Non controllato |
| Nessuna porta ha più di un collegamento | Non controllato |
| `ip` e `gateway` sono indirizzi IPv4 scritti correttamente | Non controllato: l'errore compare al primo calcolo |
| `ip` e `mask` sono presenti entrambi, o nessuno dei due | Non controllato |
| `ip` e `gateway` non sono indirizzi che Windows rifiuterebbe: indirizzo di rete o di broadcast della sottorete, 0.0.0.0, 127.x.x.x, da 224 in su | Non controllato |

Gli indirizzi MAC sono assegnati dall'app e l'utente non li cambia: due uguali indicano un file danneggiato, non una rete da diagnosticare.

Ciò che **non** verrà mai controllato: la coerenza della configurazione IP tra dispositivi. Una rete con indirizzi IP duplicati, con host nella stessa LAN ma con maschere diverse, o con un gateway fuori dalla sottorete, è una rete valida, anche se non funziona (requisito SIM-8).

## Previsto

- **Aprire un file scelto dall'utente e salvare.** Chrome ed Edge, i browser di riferimento, permettono a una pagina di scrivere direttamente in un file scelto dall'utente (File System Access API): dopo il primo salvataggio, "Salva" aggiornerà lo stesso file. Dove questa funzione manca, si ripiegherà sullo scaricamento.
- **Versioni.** Il numero di versione crescerà di uno ogni volta che il formato cambia in modo incompatibile (requisito FILE-2). Un file più vecchio verrà aggiornato in memoria con una funzione di migrazione per ogni salto di versione; un file più nuovo dell'app verrà rifiutato con l'invito ad aggiornarla. Aggiungere un campo facoltativo non richiederà una nuova versione.
- **Tabelle MAC e ARP**, facoltative (D-25, requisito FILE-5): ogni dispositivo potrà portare con sé le proprie tabelle già compilate.
- **Campi dei guasti**: dispositivo acceso o spento, porta attiva o spenta, cavo collegato o staccato.
- **Annotazioni e vista**: note e riquadri sul disegno, inquadratura ed etichette visibili al momento del salvataggio.
- **Esercizi e verifiche**: una sezione con consegna, obiettivi e parte protetta da password (tappa T1), e una con punteggio e registro delle attività (tappa T4).
