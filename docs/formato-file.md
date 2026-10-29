# Formato dei file

**Stato:** descrive il codice al 29 ottobre 2026. L'app legge e scrive i file (requisito FILE-1), anche con le tabelle (FILE-5) e con le annotazioni del disegno (ED-9; a schermo ancora *previste*), nelle versioni 1 e 2 del formato (FILE-2, vedi «Versioni»).

Una rete sta in un file di testo in formato JSON: si può leggere, confrontare con un altro e distribuire con qualsiasi mezzo.

- **Estensione provvisoria:** `.netsim.json`. Cambierà con il nome definitivo dell'app.
- **Codifica:** UTF-8.
- **Lettura:** `loadNetworkFile` in `src/storage/load.ts`.
- **Scrittura:** `serializeNetwork` in `src/storage/save.ts`. Ciò che scrive, il lettore lo rilegge uguale: i test salvano e riaprono le tre reti di esempio.
- **Sul disco:** `src/storage/browser-files.ts` fa scegliere il file all'utente e lo legge o lo scrive.

## Che cosa contiene

Il file contiene la **configurazione** della rete: dispositivi, porte, collegamenti, indirizzi, posizioni sul disegno, e i guasti, cioè quali dispositivi sono spenti e quali cavi sono staccati. Ne fa parte anche lo stato, acceso o spento, delle porte degli switch e delle interfacce dei router.

Dello **stato di esecuzione** le decisioni D-25 e D-100 distinguono due parti:

- **Tabelle MAC e ARP**: sono nel file solo se chi salva lo chiede, con l'interruttore Tabelle. Servono a preparare una lezione che parte da una rete già calda, o un esercizio con una riga ARP sbagliata. Vedi «Tabelle», più sotto. Un file senza tabelle si apre come una rete appena accesa, con le tabelle vuote.
- **Pacchetti in viaggio o in attesa, attese, tempo simulato**: non si salvano mai. Una simulazione non si può riprendere a metà.

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
| `version` | Numero intero della versione del formato: 1, oppure 2 se il file ha annotazioni (vedi «Versioni») |
| `annotations` | Solo nella versione 2: riquadri e note del disegno (vedi «Annotazioni») |
| `network.devices` | I dispositivi, con la loro configurazione |
| `network.links` | I collegamenti, ciascuno tra due porte |

Campi di ogni dispositivo:

| Campo | Contenuto | Presente in |
| --- | --- | --- |
| `id` | Identificativo interno, usato dai collegamenti | tutti |
| `kind` | Il tipo: `"host"` (un PC), `"server"`, `"switch"` oppure `"router"` | tutti |
| `name` | Il nome mostrato all'utente | tutti |
| `position` | Coordinate `x` e `y` sul disegno | tutti |
| `ports` | Le porte, ciascuna con `name` e `mac` | tutti |
| `ports[].enabled` | `false` se la porta è spenta. Facoltativo: se manca, è accesa, e nel file si scrive solo quando è spenta. Per le interfacce di un router la regola è diversa, vedi sotto | switch |
| `ip`, `mask`, `gateway` | La configurazione IPv4. Ciascuno può essere `null` | host e server |
| `powered` | `false` se il dispositivo è spento. Facoltativo: se manca, è acceso | tutti |
| `arpTable` | La tabella ARP, solo se salvata con le tabelle (vedi «Tabelle») | host, server e router |
| `macTable` | La tabella MAC, solo se salvata con le tabelle | switch |

Campi di ogni collegamento:

| Campo | Contenuto |
| --- | --- |
| `id` | Identificativo interno |
| `a`, `b` | I due capi, ciascuno con `deviceId` e `portName` |
| `connected` | `false` se il cavo è staccato. Facoltativo: se manca, è collegato |

I due campi dei guasti sono facoltativi, quindi i file scritti prima che esistessero restano validi e non è servito cambiare il numero di versione. Un cavo staccato resta nel file: c'è, ma non porta nulla. Così una rete può essere preparata con un guasto già presente, per un esercizio di ricerca guasti.

Gli identificativi (`id`) sono interni: i collegamenti si riferiscono a quelli, così un dispositivo potrà cambiare nome senza rompere nulla.

La posizione riguarda il disegno, non la rete: il lettore la restituisce a parte (`LoadedFile.positions`), fuori dal modello del motore.

## Server

Un server (dal rilascio 2) si scrive come un PC, con `"kind": "server"` al posto di `"host"`: stessi campi, stessi controlli. Per il motore i due sono lo stesso tipo di dispositivo, un host, con un ruolo diverso.

## Router

Un router (dal rilascio 2) è un dispositivo di tipo `"router"`. Le sue porte sono **interfacce**: oltre a nome e MAC hanno un indirizzo e uno stato. In più il router ha l'elenco delle rotte statiche. È il file `examples/due-lan-router.netsim.json`.

```json
{
  "id": "r1",
  "kind": "router",
  "name": "R1",
  "position": { "x": 460, "y": 200 },
  "ports": [
    { "name": "Gi0/0", "mac": "02:00:00:00:03:01", "ip": "192.168.1.1", "mask": "255.255.255.0", "enabled": true },
    { "name": "Gi0/1", "mac": "02:00:00:00:03:02", "ip": null, "mask": null, "enabled": false }
  ],
  "routes": [
    { "network": "10.0.0.0", "mask": "255.0.0.0", "nextHop": "192.168.1.254" }
  ]
}
```

| Campo | Contenuto |
| --- | --- |
| `ports[].ip`, `ports[].mask` | L'indirizzo dell'interfaccia. Entrambi `null`, o assenti, se non ne ha |
| `ports[].enabled` | `true` se l'interfaccia è accesa. Se manca vale `false`: su un router le interfacce nascono spente |
| `routes` | Le rotte statiche, ciascuna con `network`, `mask` e `nextHop`. Facoltativo: se manca, nessuna |

Sono campi nuovi di un tipo nuovo: i file scritti prima restano validi, e il numero di versione non cambia.

Controlli all'apertura, oltre a quelli comuni:

| Controllo | Esempio di ciò che viene rifiutato |
| --- | --- |
| L'indirizzo di ogni interfaccia segue le regole degli host: indirizzo e maschera insieme, validi, né rete né broadcast | `192.168.1.255` con `255.255.255.0` |
| Due interfacce dello stesso router non hanno reti sovrapposte. Conta la maschera, di qualsiasi lunghezza, non la classe | `192.168.1.1/24` e `192.168.1.129/25`; invece `10.0.0.1/30` e `10.0.0.5/30` vanno bene |
| In una rotta, rete e maschera vanno d'accordo | `192.168.2.5` con `255.255.255.0` |
| Nessuna rotta è ripetuta | due rotte con la stessa rete, maschera e prossimo salto |

Non viene controllato che il prossimo salto di una rotta sia raggiungibile: è un errore che lo studente deve saper diagnosticare.

## Annotazioni

Le annotazioni del disegno (requisito ED-9, decisione D-103) sono di due tipi: **riquadri** colorati con un'etichetta, per mostrare una sottorete o un'area, e **note** di testo, per scrivere una consegna. Non fanno parte della rete, come le posizioni dei dispositivi: stanno nel campo `annotations`, accanto a `network`, e il lettore le restituisce a parte (`LoadedFile.annotations`). Il campo si scrive solo se il disegno ne ha almeno una, e allora il file è di versione 2: le versioni dell'app che non conoscono le annotazioni lo rifiutano, invece di aprirlo senza e perderle al salvataggio. Un file senza annotazioni resta di versione 1, com'era. Lettura e scrittura stanno in `src/storage/annotations-file.ts`.

```json
"annotations": [
  { "kind": "box", "id": "a1", "x": 40, "y": 60, "width": 500, "height": 300, "color": "green", "label": "LAN 192.168.1.0/24" },
  { "kind": "note", "id": "a2", "x": 600, "y": 80, "color": "yellow", "text": "Consegna: fai ping da PC1 a PC3" }
]
```

| Campo | Contenuto |
| --- | --- |
| `kind` | `"box"` per un riquadro, `"note"` per una nota |
| `id` | Identificativo interno: `a1`, `a2`… |
| `x`, `y` | L'angolo in alto a sinistra, in coordinate del disegno |
| `width`, `height` | Solo per un riquadro: la grandezza, maggiore di zero |
| `color` | Uno dei cinque colori: `blue`, `green`, `yellow`, `red`, `purple`. Nel file c'è il nome; la tinta la decide il tema |
| `label` | Solo per un riquadro: l'etichetta nell'angolo, anche vuota |
| `text` | Solo per una nota: il testo, anche su più righe, anche vuoto |

All'apertura si rifiutano un tipo o un colore sconosciuto, un campo mancante, sconosciuto o del tipo sbagliato, una grandezza non positiva e un identificativo ripetuto (per esempio «Annotazione a1: colore sconosciuto: fucsia.»). Un file di versione 1 che contiene annotazioni non viene dall'app, e si rifiuta: «Le annotazioni richiedono la versione 2 del formato.»

## Tabelle

Un file salvato con l'interruttore **Tabelle** acceso (requisito FILE-5, decisione D-100) porta con sé la tabella che ogni dispositivo aveva in quel momento: `arpTable` per host, server e router, `macTable` per gli switch. Il campo c'è per ogni dispositivo, anche quando la tabella è vuota. Lettura e scrittura stanno in `src/storage/tables-file.ts`.

```json
"arpTable": [
  { "ip": "192.168.1.11", "mac": "02:00:00:00:00:02" }
]
```

```json
"macTable": [
  { "mac": "02:00:00:00:00:01", "port": "Fa0/1" },
  { "mac": "02:00:00:00:00:02", "port": "Fa0/2" }
]
```

Aprendo il file, le tabelle non entrano nei dispositivi letti: il lettore le restituisce a parte (`LoadedFile.tables`, null se il file non ne ha), e il simulatore le usa come **tabelle di partenza**. Le applica subito, e ci torna con Ricomincia. Valgono le regole di sempre: un dispositivo spento non sa nulla, e uno switch dimentica le righe di una porta senza segnale.

All'apertura si controlla solo che le righe siano scritte bene. Una riga sbagliata per quella rete (un indirizzo di un'altra sottorete, il MAC di un altro PC) è ammessa: è proprio ciò che serve a un esercizio.

| Controllo | Esempio di messaggio |
| --- | --- |
| Ogni dispositivo ha solo la tabella del suo tipo | «SW1: uno switch non ha il campo "arpTable".» |
| La tabella è un elenco | «PC1: il campo "arpTable" deve essere un elenco.» |
| Ogni riga ha i suoi due campi | «PC1, tabella ARP, riga n. 1: il campo "mac" manca o non è un testo.» |
| Indirizzi IP e MAC sono scritti correttamente | «PC1, tabella ARP, riga n. 1: indirizzo IP non valido: 192.168.1.300.» |
| Una riga di uno switch indica una sua porta | «SW1, tabella MAC, riga n. 1: indica una porta inesistente: Fa0/9.» |
| Nessun indirizzo è ripetuto nella stessa tabella | «PC1: indirizzo ripetuto nella tabella ARP: 192.168.1.11.» |

Sono campi facoltativi: i file scritti prima restano validi, e il numero di versione non cambia.

## Controlli all'apertura

Un file può arrivare modificato a mano o danneggiato. Se un controllo fallisce, il lettore non apre il file e dice che cosa non va, nominando il dispositivo o il collegamento. Non tenta di riparare.

| Controllo | Esempio di messaggio |
| --- | --- |
| Il testo è JSON valido | «Il file non è JSON valido.» |
| `format` vale `"net-sim"` | «Il file non è una rete di net-sim.» |
| `version` è un intero positivo | «Versione del file non valida: 0.» |
| `version` non è più recente dell'app | «Il file è stato salvato con una versione più recente di net-sim (formato 3). Ricarica la pagina per aggiornare l'app.» |
| Nessun oggetto ha campi sconosciuti: file, rete, dispositivi, posizioni, porte, rotte, cavi e loro capi, righe delle tabelle, annotazioni | «PC1: campo sconosciuto: "vlan".» |
| Ci sono l'elenco dei dispositivi e quello dei collegamenti | «Il file non contiene l'elenco dei dispositivi e dei collegamenti.» |
| Ogni dispositivo ha tutti i campi richiesti, del tipo giusto | «PC1: il campo "gateway" manca o non è un testo.» |
| Ogni dispositivo ha un `kind` conosciuto | «Tipo di dispositivo non supportato: tostapane.» |
| Ogni dispositivo ha almeno una porta | «PC1: deve avere almeno una porta.» |
| Ogni indirizzo MAC è scritto correttamente e non è il broadcast | «PC1 Fa0: indirizzo MAC non valido: 02:00:00:00:00.» |
| I nomi delle porte di un dispositivo sono diversi tra loro | «SW1: nome di porta duplicato: Fa0/1.» |
| Gli identificativi dei dispositivi sono unici | «Identificativo di dispositivo duplicato: d1.» |
| Gli indirizzi MAC sono unici in tutta la rete | «Indirizzo MAC duplicato: 02:00:00:00:00:01.» |
| La configurazione IP di ogni host è accettabile (vedi sotto) | «PC1: subnet mask non valida: 255.0.255.0.» |
| Ogni collegamento ha i due capi, e indicano porte che esistono | «Collegamento l1: indica una porta inesistente: d2 Fa9.» |
| Nessun collegamento unisce una porta a se stessa | «Il collegamento l1 unisce una porta a se stessa.» |
| Gli identificativi dei collegamenti sono unici | «Identificativo di collegamento duplicato: l1.» |
| Nessuna porta ha più di un collegamento | «La porta Fa0/1 di SW1 ha più di un collegamento.» |
| `powered` e `connected`, se presenti, valgono `true` o `false` | «PC1: il campo "powered" deve valere true o false.» |

Gli indirizzi MAC sono assegnati dall'app e l'utente non li cambia: due uguali indicano un file danneggiato, non una rete da diagnosticare. Il confronto non distingue maiuscole e minuscole.

Un cavo tra due porte dello stesso switch è ammesso: è un ciclo, ma è una rete possibile.

### Configurazione IP degli host

La configurazione IP è accettata o rifiutata come farebbe Windows (decisione D-28, requisito CFG-7). Il controllo è la funzione `checkIpConfig` in `src/engine/model/ip-config.ts`, che servirà anche al pannello di configurazione.

| Regola | Esempio rifiutato |
| --- | --- |
| `ip` e `mask` sono presenti entrambi, oppure sono entrambi `null` | indirizzo senza maschera |
| `gateway` può esserci solo se c'è `ip` | gateway su un host non configurato |
| `ip` e `gateway` sono indirizzi IPv4 scritti correttamente | `192.168.1.256` |
| `mask` ha i bit a 1 contigui | `255.0.255.0` |
| `ip` e `gateway` non sono 0.0.0.0, né 127.x.x.x, né da 224 in su | `127.0.0.1`, `224.0.0.5` |
| `ip` non è l'indirizzo di rete né quello di broadcast della propria sottorete | `192.168.1.0` e `192.168.1.255` con maschera /24 |
| `gateway`, se sta nella sottorete dell'host, non ne è l'indirizzo di rete né di broadcast | `192.168.1.255` |

Con le maschere /31 e /32 la regola su rete e broadcast non si applica: quelle sottoreti non li hanno.

Ciò che **non** viene controllato, di proposito: la coerenza della configurazione IP tra dispositivi. Una rete con indirizzi IP duplicati, con host nella stessa LAN ma con maschere diverse, o con un gateway fuori dalla sottorete, è una rete valida, anche se non funziona. Sono errori che lo studente deve saper diagnosticare (requisito SIM-8).

## Salvare

`serializeNetwork` scrive dispositivi, cavi, posizioni e guasti. I campi facoltativi dei guasti (`powered`, `connected`) compaiono solo quando valgono `false`. Le tabelle si scrivono solo se chieste (il terzo parametro, `withTables`); il resto dello stato di esecuzione mai.

Chrome ed Edge, i browser di riferimento, permettono a una pagina di scrivere in un file scelto dall'utente (File System Access API): la prima volta Salva chiede dove, poi aggiorna lo stesso file, e lo stesso vale per un file aperto con Apri. Salva con nome chiede sempre dove. Dove questa funzione manca, il file viene scaricato ogni volta (D-57).

## Versioni

Il formato ha un numero di versione (requisito FILE-2, decisione D-108). Le versioni e il passaggio dall'una all'altra stanno in `src/storage/migrations.ts`.

| Versione | Che cosa aggiunge |
| --- | --- |
| 1 | La rete, le posizioni, i guasti e, se chieste, le tabelle |
| 2 | Le annotazioni del disegno |

Tre regole tengono al sicuro i file passati da una versione dell'app all'altra:

- **Il numero sale quando una versione precedente perderebbe dati.** Ogni versione dell'app, dalla prima, rifiuta un numero di versione che non conosce: un file più recente non può essere aperto a metà e poi risalvato senza ciò che non capisce. Per questo, quando il formato acquista qualcosa che una versione precedente scarterebbe, il numero sale.
- **L'app scrive la versione più bassa che basta.** Un file senza annotazioni resta di versione 1, e lo aprono anche le versioni precedenti dell'app; solo un file con annotazioni è di versione 2.
- **I campi sconosciuti fanno rifiutare il file.** Se un giorno la prima regola venisse dimenticata, il file verrebbe rifiutato invece di perdere in silenzio il campo nuovo. Lo stesso vale per un file modificato a mano con un campo in più.

Aprendo un file di una versione precedente, l'app lo porta all'ultima un passo alla volta (`migrateToLatest`), prima dei controlli. Il passo da 1 a 2 non cambia il contenuto. Un file più recente dell'app viene rifiutato con l'invito a ricaricare la pagina.

I test lo verificano anche con file salvati dalla versione dell'app pubblicata il 18 ottobre 2026, generati con il suo stesso codice (`tests/storage/fixtures/stabile/`): si aprono, e risalvati restano identici, riga per riga.

## Previsto

- **Scheda di un host spenta** (ciò che resta del requisito SIM-7).
- **Vista**: inquadratura ed etichette visibili al momento del salvataggio.
- **Esercizi e verifiche**: una sezione con consegna, obiettivi e parte protetta da password (tappa T1), e una con punteggio e registro delle attività (tappa T4).
