# Formato dei file

**Stato:** proposta, precede il codice.

Una rete si salva in un file locale e si riapre da lì (requisito FILE-1). Il file è testo in formato JSON: si può leggere, confrontare con un altro e distribuire con qualsiasi mezzo.

- **Estensione provvisoria:** `.netsim.json`. Cambierà con il nome definitivo dell'app.
- **Codifica:** UTF-8.

## Che cosa contiene

Il file contiene la **configurazione** della rete: dispositivi, collegamenti, indirizzi, posizioni, annotazioni. Contiene anche poche impostazioni della vista utili a chi prepara una lezione, cioè l'inquadratura e le etichette visibili.

Non contiene lo **stato di esecuzione**: tabelle MAC e ARP, pacchetti in viaggio, tempo simulato. Una rete appena aperta è una rete appena accesa, con le tabelle vuote. *Proposta da confermare:* è la scelta più semplice ed evita file che si comportano in modo diverso a seconda di quando sono stati salvati. Il rovescio è che non si può salvare una simulazione a metà.

## Esempio

Uno switch e due PC nella rete 192.168.1.0/24.

```json
{
  "format": "net-sim",
  "version": 1,
  "network": {
    "devices": [
      {
        "id": "d1",
        "kind": "switch",
        "name": "SW1",
        "position": { "x": 300, "y": 210 },
        "powered": true,
        "ports": [
          { "name": "Fa0/1", "mac": "02:00:00:00:00:01", "enabled": true },
          { "name": "Fa0/2", "mac": "02:00:00:00:00:02", "enabled": true }
        ]
      },
      {
        "id": "d2",
        "kind": "host",
        "name": "PC1",
        "position": { "x": 110, "y": 130 },
        "powered": true,
        "ports": [
          { "name": "Fa0", "mac": "02:00:00:00:00:03", "enabled": true }
        ],
        "ip": "192.168.1.10",
        "mask": "255.255.255.0",
        "gateway": null
      },
      {
        "id": "d3",
        "kind": "host",
        "name": "PC2",
        "position": { "x": 110, "y": 290 },
        "powered": true,
        "ports": [
          { "name": "Fa0", "mac": "02:00:00:00:00:04", "enabled": true }
        ],
        "ip": "192.168.1.11",
        "mask": "255.255.255.0",
        "gateway": null
      }
    ],
    "links": [
      {
        "id": "l1",
        "a": { "deviceId": "d2", "portName": "Fa0" },
        "b": { "deviceId": "d1", "portName": "Fa0/1" },
        "connected": true
      },
      {
        "id": "l2",
        "a": { "deviceId": "d3", "portName": "Fa0" },
        "b": { "deviceId": "d1", "portName": "Fa0/2" },
        "connected": true
      }
    ]
  },
  "annotations": [],
  "view": {
    "center": { "x": 240, "y": 210 },
    "zoom": 1,
    "labels": { "ip": true, "mac": false, "ports": true }
  }
}
```

## Campi

| Campo | Contenuto |
| --- | --- |
| `format` | Sempre `"net-sim"`. Serve a riconoscere il file e a rifiutare un JSON qualsiasi |
| `version` | Numero intero della versione del formato. Parte da 1 |
| `network.devices` | I dispositivi, con la loro configurazione. I campi dipendono da `kind` |
| `network.links` | I collegamenti, ciascuno tra due porte |
| `annotations` | Note e riquadri disegnati sulla topologia (rilascio 2) |
| `view` | Inquadratura ed etichette visibili al momento del salvataggio. Facoltativo |

I campi di dispositivi e collegamenti sono gli stessi del modello dei dati in [motore.md](motore.md), senza la parte di stato di esecuzione e con l'aggiunta della posizione.

Gli identificativi (`id`) sono interni: l'utente vede e modifica i nomi (`name`), che può cambiare senza rompere i collegamenti.

## Versioni

Il numero di versione cresce di uno ogni volta che il formato cambia in modo incompatibile (requisito FILE-2).

- **File più vecchio dell'app:** l'app lo aggiorna in memoria passando da una versione alla successiva, con una funzione di migrazione per ogni salto (da 1 a 2, da 2 a 3). Le migrazioni stanno in `src/storage/` e non si cancellano mai.
- **File più nuovo dell'app:** l'app si rifiuta di aprirlo e dice di aggiornarsi. Può succedere se una copia installata offline è rimasta indietro.

Aggiungere un campo facoltativo non richiede una nuova versione: chi non lo conosce lo ignora.

## Apertura e controlli

Un file può arrivare modificato a mano o danneggiato. All'apertura l'app controlla che:

1. sia JSON valido, con `format` e `version` attesi;
2. ogni dispositivo abbia i campi richiesti dal suo `kind`;
3. ogni collegamento indichi dispositivi e porte esistenti, e nessuna porta abbia più di un collegamento;
4. identificativi e indirizzi MAC siano unici.

Se un controllo fallisce, l'app non apre il file e dice quale controllo è fallito. Non tenta di riparare.

Gli indirizzi IP non vengono controllati: una rete con indirizzi duplicati o maschere incoerenti è una rete valida, anche se non funziona (requisito SIM-8).

## Salvare dal browser

Chrome ed Edge, i browser di riferimento, permettono a una pagina di scrivere direttamente in un file scelto dall'utente (File System Access API). Dopo il primo salvataggio, "Salva" aggiorna lo stesso file senza passare ogni volta dalla cartella dei download.

Dove questa funzione manca, l'app ripiega sullo scaricamento di un nuovo file e sull'apertura tramite selezione.

## Previsto per le tappe successive

Gli esercizi (tappa T1) aggiungeranno una sezione `exercise` con consegna, obiettivi e parte protetta da password. Le verifiche (T4) aggiungeranno una sezione con punteggio e registro delle attività. Entrambe saranno descritte in `esercizi.md`.
