# Motore di simulazione

**Stato:** descrive il codice all'11 ottobre 2026. Le parti non ancora realizzate sono raccolte nella sezione "Previsto".

Il motore è la parte dell'app che fa funzionare la rete: decide che cosa fa un dispositivo quando riceve un frame, tiene le tabelle, fa scorrere il tempo. Non disegna nulla. Sta in `src/engine/` e non dipende da altro (vedi [architettura.md](architettura.md)).

Oggi contiene host e switch, con Ethernet, ARP, IPv4 e ICMP echo.

## L'idea in breve

Il motore è un **simulatore a eventi discreti**. Non fa scorrere il tempo in modo continuo: tiene una coda di fatti futuri, ciascuno con il suo istante, e salta dall'uno all'altro.

1. Un'azione dell'utente (un ping) fa nascere un frame su una porta.
2. Il simulatore mette in coda l'evento "questo frame arriva all'altro capo del cavo tra un tick".
3. Quando si arriva a quell'istante, il simulatore consegna il frame al dispositivo, che reagisce secondo i suoi protocolli. La reazione può far nascere altri frame, cioè altri eventi futuri.
4. Si ripete finché la coda è vuota.

Nella coda non ci sono solo frame in viaggio: ci sono anche le **attese** degli host, per esempio "se entro 20 tick non arriva la risposta ARP, rinuncio".

## Modello dei dati

I tipi stanno in `src/engine/model/`. Qui sono riportati come nel codice, senza i commenti.

### Indirizzi (`addresses.ts`)

```ts
type MacAddress = string;   // "02:00:00:00:00:01"
type Ipv4Address = string;  // "192.168.1.10"

const BROADCAST_MAC: MacAddress = "ff:ff:ff:ff:ff:ff";
```

Tre funzioni fanno i calcoli sugli indirizzi:

| Funzione | Che cosa fa |
| --- | --- |
| `ipToNumber(ip)` | Trasforma un indirizzo nel numero a 32 bit corrispondente. Rifiuta ciò che non è un indirizzo IPv4 |
| `isValidMask(mask)` | Dice se una subnet mask è valida: scritta in binario, tutti i bit a 1 seguiti da tutti i bit a 0 |
| `sameNetwork(a, b, mask)` | Dice se due indirizzi hanno lo stesso indirizzo di rete. Rifiuta una maschera non valida |
| `isLoopbackAddress(ip)` | Dice se un indirizzo è uno dei 127.x.x.x |

### Configurazione IP (`ip-config.ts`)

`checkIpConfig({ ip, mask, gateway })` dice se la configurazione IP di un host è accettabile, e se non lo è restituisce una frase che spiega perché. Le regole sono quelle di Windows (decisione D-28): ciò che Windows non lascerebbe impostare viene rifiutato.

| Regola | Esempio rifiutato |
| --- | --- |
| Indirizzo e maschera si impostano insieme, o nessuno dei due | indirizzo senza maschera |
| Il gateway richiede un indirizzo | gateway su un host non configurato |
| Indirizzo e gateway sono indirizzi IPv4 scritti correttamente | `192.168.1.256` |
| La maschera ha i bit a 1 contigui | `255.0.255.0` |
| Non sono ammessi 0.0.0.0, gli indirizzi 127.x.x.x e quelli da 224 in su | `127.0.0.1`, `224.0.0.5` |
| L'indirizzo non è quello di rete né quello di broadcast della sottorete | `192.168.1.0` e `192.168.1.255` con maschera /24 |

Tutto il resto resta ammesso anche se sbagliato per quella rete: indirizzi duplicati, host della stessa LAN con maschere diverse, un gateway fuori dalla sottorete. Sono errori che lo studente deve saper diagnosticare (requisito SIM-8).

Oggi la funzione è usata dal lettore dei file. La userà anche il pannello di configurazione, quando esisterà.

Gli indirizzi MAC di una rete aperta da file arrivano dal file; quelli di un dispositivo nuovo li sceglie il motore (vedi "Modificare la rete").

### Rete, dispositivi, collegamenti (`network.ts`)

```ts
interface Network {
  devices: Device[];
  links: Link[];
}

interface Port {
  name: string;        // "Fa0/1"
  mac: MacAddress;
}

interface PortRef {    // una porta precisa della rete
  deviceId: string;
  portName: string;
}

interface Link {       // il cavo tra due porte
  id: string;
  a: PortRef;
  b: PortRef;
  connected: boolean;  // false = il cavo è staccato
}

type Device = Host | Switch;
```

Ogni dispositivo ha una parte di **configurazione**, che sta nel file, e una parte di **stato di esecuzione**, che cambia mentre la rete funziona.

```ts
interface Host {
  kind: "host";
  id: string;
  name: string;
  ports: Port[];                    // un PC ne ha una sola
  // configurazione
  powered: boolean;                 // false = spento
  ip: Ipv4Address | null;
  mask: Ipv4Address | null;
  gateway: Ipv4Address | null;
  // stato di esecuzione
  linkUp: boolean;                  // la scheda sente il segnale sul cavo?
  arpTable: Map<Ipv4Address, MacAddress>;
  nextEchoSequence: number;         // numero di sequenza del prossimo echo request
  pendingPackets: PendingPacket[];  // pacchetti in attesa della risposta ARP
  awaitedEchoes: AwaitedEcho[];     // echo request non ancora conclusi
}

interface PendingPacket {
  nextHop: Ipv4Address;             // di chi si aspetta il MAC
  packet: Ipv4Packet;
}

interface AwaitedEcho {
  targetIp: Ipv4Address;
  sequence: number;
  remaining: number;                // quanti echo request dello stesso ping devono ancora partire
}

interface Switch {
  kind: "switch";
  id: string;
  name: string;
  ports: Port[];
  powered: boolean;                   // false = spento
  // stato di esecuzione
  macTable: Map<MacAddress, string>;  // MAC -> nome della porta
}
```

`createHost(config)` e `createSwitch(config)` costruiscono un dispositivo appena acceso: la configurazione data, più tabelle vuote e contatori iniziali. `clearRuntimeState(device)` riporta un dispositivo a quello stato: è ciò che succede quando lo si spegne.

### Router (`network.ts`, `router-config.ts`)

Un `Router` ha più **interfacce** (`RouterInterface`): porte che, oltre a nome e MAC, hanno un indirizzo IP, una maschera e uno stato acceso o spento (`enabled`). Su un router le interfacce nascono spente, come su un Cisco (decisione D-70). Ha poi un elenco di rotte statiche (`StaticRoute`: rete, maschera, prossimo salto) e, come stato di esecuzione, una tabella ARP e i pacchetti in attesa del MAC. Lo crea `createRouter`.

`router-config.ts` dice che cosa si può impostare, con lo stesso criterio di `ip-config.ts`: ciò che un apparato vero rifiuterebbe viene rifiutato.

| Funzione | Che cosa controlla |
| --- | --- |
| `checkInterfaceAddress` | L'indirizzo di un'interfaccia, con le regole degli host |
| `checkInterfacesApart` | Che due interfacce dello stesso router non abbiano reti sovrapposte |
| `checkRoute` | Che una rotta abbia indirizzi validi, e una rete coerente con la maschera |

Le reti si confrontano con `networksOverlap` (`addresses.ts`), che guarda la più corta delle due maschere: se con quella i due indirizzi stanno nella stessa rete, la rete più piccola è dentro la più grande. Le maschere possono avere qualsiasi lunghezza: `10.0.0.1/30` e `10.0.0.5/30` sono reti diverse anche se appartengono alla stessa classe A.

### Frame e pacchetti (`frames.ts`)

L'incapsulamento è rappresentato alla lettera: ogni unità contiene quella del livello superiore nel campo `payload`. Il campo `etherType` dice che cosa c'è dentro il frame, come nel frame vero.

```ts
type EthernetFrame =
  | { dstMac: MacAddress; srcMac: MacAddress; etherType: "ARP"; payload: ArpPacket }
  | { dstMac: MacAddress; srcMac: MacAddress; etherType: "IPv4"; payload: Ipv4Packet };

interface ArpPacket {
  operation: "request" | "reply";
  senderMac: MacAddress;
  senderIp: Ipv4Address;
  targetMac: MacAddress | null;   // null nella richiesta: è ciò che si chiede
  targetIp: Ipv4Address;
}

interface Ipv4Packet {
  srcIp: Ipv4Address;
  dstIp: Ipv4Address;
  ttl: number;                    // parte da 128, come su Windows
  protocol: "ICMP";
  payload: IcmpMessage;
}

interface IcmpMessage {
  type: "echo-request" | "echo-reply";
  identifier: number;             // sempre 1, come su Windows
  sequence: number;
}
```

## Tempo, eventi, tracce (`simulator.ts`)

Il simulatore è diviso in più file, uno per argomento:

| File | Contenuto |
| --- | --- |
| `simulator.ts` | La classe `Simulator`: la coda, il tempo, `dispatch`, `step`, la consegna dei frame a host e switch |
| `events.ts` | I tipi di ciò che sta in coda: arrivo di un frame, scadenza di un'attesa |
| `traces.ts` | Il tipo `Trace`, con tutte le tracce possibili, e le conversazioni |
| `faults.ts` | Cavo staccato e dispositivo spento; chi sente il segnale |
| `storm.ts` | Le due soglie della tempesta di broadcast e il controllo |
| `network-changes.ts` | Le modifiche alla rete a simulazione in corso, e il ritorno a una fotografia |

Chi usa il simulatore importa tutto da `simulator.ts`, che ripropone tipi e costanti degli altri file.

### Tempo simulato

Il tempo è un numero intero di **tick**, che parte da zero. Attraversare un collegamento richiede sempre 1 tick. Il tick non corrisponde a una durata reale.

Usare un tempo astratto evita un problema: con i tempi veri, un pacchetto attraversa una LAN in meno di un millisecondo e un ping scade dopo quattro secondi. Rallentando il primo perché sia visibile, il secondo durerebbe più di un'ora.

| Costante | Valore | Significato |
| --- | --- | --- |
| `LINK_TRANSIT_TICKS` | 1 | Tempo per attraversare un collegamento |
| `STORM_LAPS` | 3 | Quante volte il numero degli switch un frame può essere inoltrato prima che la simulazione si sospenda |
| `STORM_FRAME_LIMIT` | 200 | Quanti frame possono essere in viaggio prima che la simulazione si sospenda |
| `ARP_TIMEOUT_TICKS` | 20 | Quanto un host aspetta la risposta ARP |
| `ECHO_TIMEOUT_TICKS` | 40 | Quanto un host aspetta l'echo reply |
| `DEFAULT_PING_COUNT` | 4 | Quanti echo request manda un ping, se non si chiede altro |

L'attesa dell'echo è più lunga di quella ARP: così, se il problema è un MAC che non si trova, lo si scopre prima.

### Eventi

```ts
type SimEvent =
  | { time: number; kind: "frame-arrival"; frameId: number; from: PortRef; to: PortRef;
      frame: EthernetFrame; conversationId: number; hops: number }
  | { time: number; kind: "timer"; deviceId: string; timer: HostTimer; conversationId: number };

type HostTimer =
  | { kind: "arp-timeout"; ip: Ipv4Address }       // attesa della risposta ARP per un indirizzo
  | { kind: "echo-timeout"; sequence: number };    // attesa dell'echo reply con quel numero di sequenza
```

La coda è tenuta ordinata per istante. A parità di istante vale l'ordine di inserimento, così il risultato è sempre lo stesso.

### Un passo

`step()` porta il tempo al prossimo istante in cui c'è un evento ed elabora **tutti gli eventi di quell'istante**, non uno solo. Quando uno switch inoltra un broadcast su tre porte, i tre frame viaggiano insieme e arrivano insieme.

Gli eventi dell'istante si elaborano uno alla volta, prendendoli dalla testa della coda. Così un evento può annullarne uno successivo dello stesso istante: una risposta ARP che arriva proprio quando l'attesa sta per scadere la annulla.

Se nella coda resta solo un'attesa, il passo salta direttamente alla sua scadenza: da tick 2 a tick 20, per esempio.

`canStep()` dice se c'è ancora qualcosa da far avanzare: la coda non è vuota e la simulazione non è sospesa. Chi fa avanzare la rete "fino alla fine" deve usare questa funzione, non la lunghezza della coda: una simulazione sospesa ha ancora frame in coda, ma non li muoverà più.

### Azioni

`dispatch(action)` esegue un'azione arrivata dall'esterno, senza far avanzare il tempo.

| Azione | Che cosa fa |
| --- | --- |
| `ping(deviceId, targetIp, count)` | L'host manda `count` echo request, uno alla volta. Se `count` manca, quattro |
| `resolveAddress(deviceId, targetIp)` | L'host manda una richiesta ARP. Nella realtà nessuno lancia un ARP a mano: serve a provare ARP da solo nei test |
| `disconnectLink(linkId)`, `connectLink(linkId)` | Stacca o riattacca un cavo |
| `powerOff(deviceId)`, `powerOn(deviceId)` | Spegne o accende un dispositivo |
| `addHost()`, `addSwitch(portCount)`, `addRouter(interfaceCount)` | Aggiunge un PC, uno switch con quel numero di porte, o un router con quel numero di interfacce |
| `removeDevice(deviceId)` | Toglie un dispositivo, con i cavi che gli erano attaccati |
| `addLink(a, b)`, `removeLink(linkId)` | Collega due porte con un cavo nuovo, o toglie un cavo |
| `moveLinkEnd(linkId, end, portName)` | Sposta un capo di un cavo su un'altra porta dello stesso dispositivo |
| `renameDevice(deviceId, name)` | Cambia il nome di un dispositivo |
| `configureHost(deviceId, config)` | Cambia indirizzo, maschera e gateway di un host |
| `configureInterface(deviceId, portName, ip, mask)` | Cambia l'indirizzo di un'interfaccia di un router; con `null` lo toglie |
| `enableInterface(deviceId, portName)`, `disableInterface(deviceId, portName)` | Accende o spegne un'interfaccia di un router (su un Cisco: `no shutdown` e `shutdown`) |
| `addRoute(deviceId, route)`, `removeRoute(deviceId, route)` | Aggiunge o toglie una rotta statica di un router |

Un ping rivolto a uno switch o lanciato da un host spento, e qualsiasi azione su un dispositivo o un collegamento inesistente, vengono rifiutati con un errore. Così anche qualsiasi azione a simulazione sospesa. Lo stesso vale per un ping verso un testo che non è un indirizzo IPv4, o con un numero di richieste che non è un intero positivo.

### Tracce

Mentre lavora, il simulatore registra ciò che accade. `dispatch()` e `step()` restituiscono le tracce appena prodotte; l'elenco completo resta in `sim.traces`.

| Traccia | Significato |
| --- | --- |
| `frame-sent` | Un frame è partito da una porta verso l'altro capo del cavo |
| `frame-received` | Un dispositivo ha accettato un frame |
| `frame-dropped` | Un dispositivo ha scartato un frame. Contiene il motivo (`reason`) |
| `table-changed` | È cambiata una tabella, `arp` o `mac` |
| `packet-dropped` | Un host ha rinunciato a un pacchetto che teneva in attesa |
| `ping-result` | Un echo request si è concluso. Contiene l'esito e quanti ne restano |
| `frame-lost` | Un frame in viaggio è andato perso: il cavo è stato staccato, o il dispositivo a cui era diretto è stato spento |
| `link-changed` | Un cavo è stato staccato o riattaccato |
| `power-changed` | Un dispositivo è stato spento o acceso |
| `simulation-suspended` | Il simulatore si è fermato per una tempesta di broadcast. Contiene quanti frame erano in viaggio |
| `device-added`, `device-removed`, `link-added`, `link-removed`, `device-renamed`, `host-configured` | La rete è stata modificata. Le tracce di ciò che è stato tolto ne portano il nome, perché dopo non lo si può più leggere dalla rete |

Il campo `reason` di un frame scartato serve ai test. L'interfaccia mostra che il frame è stato scartato, ma non ne spiega la causa: l'app si comporta come una rete vera (requisito SIM-8).

### Conversazioni

Ogni azione dell'utente riceve un numero di conversazione. Tutto ciò che nasce elaborando un frame o un'attesa eredita il numero di quel frame o di quell'attesa. Così la richiesta ARP causata da un ping, i suoi quattro echo e i loro esiti appartengono alla stessa conversazione. Servirà all'interfaccia per mostrare solo quella (requisito VIS-5).

Un caso limite: se due ping aspettano la stessa risposta ARP, quando arriva partono entrambi con il numero di conversazione del primo.

## Come un dispositivo parla con il simulatore

I dispositivi non spediscono nulla e non misurano il tempo. Le loro funzioni restituiscono un elenco di cose da fare, e il simulatore le esegue.

```ts
interface HostOutput {
  send: EthernetFrame[];          // frame da mettere sul cavo
  startTimers: TimerRequest[];    // attese da avviare: { delay, timer }
  cancelTimers: HostTimer[];      // attese che non servono più
  pingResults: PingResult[];      // echo request arrivati a una conclusione
}
```

Le funzioni di un host (`devices/host.ts`):

| Funzione | Quando viene chiamata | Che cosa restituisce in più |
| --- | --- | --- |
| `startPing(host, targetIp, count)` | All'azione `ping` | — |
| `startArpResolution(host, targetIp)` | All'azione `resolve-address` | Solo il frame, o `null` |
| `receiveFrame(host, frame)` | All'arrivo di un frame | Il motivo dell'eventuale scarto, e se la tabella ARP è cambiata |
| `timerExpired(host, timer)` | Alla scadenza di un'attesa | I pacchetti a cui l'host rinuncia |

Queste funzioni modificano lo stato dell'host (tabella ARP, pacchetti in attesa, echo in sospeso), ma tutto ciò che riguarda il cavo e il tempo passa dal simulatore.

Lo switch (`devices/switch.ts`) è più semplice: `receiveFrameOnSwitch(sw, inPort, frame)` restituisce le porte su cui inoltrare, il motivo dell'eventuale scarto e se la tabella MAC è cambiata.

## Comportamento dei dispositivi

### Host: spedire un pacchetto IP

1. **A chi lo consegno sulla mia LAN?** È il *prossimo salto*, deciso da `nextHopFor` in `protocols/ipv4.ts`.
   - La destinazione è nella mia rete (stesso indirizzo di rete, data la mia maschera): il prossimo salto è la destinazione.
   - È in un'altra rete e ho un gateway: il prossimo salto è il gateway.
   - È in un'altra rete e non ho un gateway, oppure non ho indirizzo o maschera: non c'è un prossimo salto, il pacchetto non può partire.

   Prima ancora: se la scheda non sente il segnale sul cavo, il pacchetto non può partire.
2. **Conosco il MAC del prossimo salto?** Si guarda la tabella ARP.
   - Sì: il pacchetto viene incapsulato in un frame e parte.
   - No: il pacchetto va in attesa. Se per quell'indirizzo non c'è già una richiesta ARP in corso, ne parte una, insieme a un'attesa di 20 tick.
3. **Arriva la risposta ARP:** la tabella si aggiorna, i pacchetti in attesa di quel MAC partono, l'attesa viene annullata.
4. **L'attesa scade:** i pacchetti in attesa di quel MAC vengono scartati. La richiesta ARP non viene ripetuta.

### Host: ricevere un frame

1. Il MAC di destinazione è il mio o è il broadcast? Altrimenti il frame viene scartato.
2. Se contiene **ARP**:
   - richiesta per il mio IP: registro il mittente nella tabella ARP e rispondo, in unicast;
   - richiesta per un altro IP: scarto;
   - risposta: aggiorno la tabella ARP.
3. Se contiene **IPv4**:
   - destinato a un altro IP: scarto. Un host non è un router;
   - echo request: rispondo con un echo reply, a indirizzi scambiati. La risposta segue la stessa strada di ogni pacchetto IP, compresa l'eventuale attesa del MAC;
   - echo reply che stavo aspettando: il ping ha avuto risposta;
   - echo reply che non stavo aspettando (arrivato dopo la scadenza): ricevuto e ignorato.

### Ping

Un ping è una serie di echo request, quattro se non si chiede altro, mandati **uno alla volta**: il successivo parte nell'istante in cui il precedente si conclude. Ogni echo request ha un numero di sequenza più alto del precedente, e un'attesa di 40 tick.

Ogni echo request si conclude con uno di quattro esiti, gli stessi che stampa il comando `ping` di Windows:

| Esito | Nel codice | Quando |
| --- | --- | --- |
| Risposta | `reply` | È arrivato l'echo reply |
| Richiesta scaduta | `timeout` | L'echo request è partito, ma dopo 40 tick non è tornato nulla |
| Host di destinazione non raggiungibile | `unreachable` | C'era un prossimo salto, ma non ha risposto all'ARP entro 20 tick |
| Trasmissione non riuscita | `transmit-failed` | L'host non ha nemmeno potuto provarci: non sente il segnale sul cavo, oppure non c'era un prossimo salto |

Gli ultimi due si distinguono apposta: il primo indica un problema altrove sulla propria LAN, il secondo un problema del PC stesso, cioè il suo cavo, la sua configurazione IP o le sue rotte.

**Ping a se stessi (loopback).** Se la destinazione è l'host stesso, cioè il suo indirizzo oppure un qualsiasi 127.x.x.x, l'echo request non passa dalla rete: l'esito è subito "risposta" e sul cavo non esce nulla. Per gli indirizzi 127.x.x.x vale anche su un host senza configurazione IP. È il primo controllo di ogni diagnosi: se fallisce questo, il problema è nel PC e non nella rete.

Durate tipiche, nella LAN di esempio con uno switch:

| Caso | Durata |
| --- | --- |
| Un echo request, tabelle vuote | 8 tick: 4 di ARP, 4 di echo |
| Un echo request, tabelle piene | 4 tick |
| Quattro echo request, tabelle vuote | 20 tick |
| Quattro echo request verso un indirizzo che nessuno ha | 80 tick: ognuno ripete l'ARP e aspetta 20 tick |
| Quattro echo request senza una strada | 0 tick: quattro esiti immediati, nessun frame |
| Quattro echo request a se stessi | 0 tick: quattro risposte immediate, nessun frame |

### Switch

Per ogni frame ricevuto su una porta:

1. **Apprendimento.** Registra nella tabella MAC che l'indirizzo sorgente si raggiunge da quella porta. Se il MAC era già noto su un'altra porta, vale l'informazione più recente.
2. **Decisione**, presa da `chooseOutputPorts`, che non modifica nulla:
   - destinazione broadcast, oppure sconosciuta: tutte le porte tranne quella di arrivo (flooding);
   - destinazione nota su un'altra porta: solo quella;
   - destinazione nota sulla porta di arrivo: nessuna, il frame viene scartato.

Lo switch inoltra il frame così com'è, senza modificarlo, e non guarda che cosa contiene: gli bastano i due indirizzi MAC. Per questo l'aggiunta di IPv4 e ICMP non ha richiesto di toccarlo.

Un frame inoltrato su una porta senza cavo non parte.

## Semplificazioni

Il motore segue il comportamento normale dei protocolli e tralascia il resto. Questo elenco va tenuto aggiornato: dice agli studenti dove la simulazione si allontana dalla realtà.

| Che cosa | Nella realtà | In net-sim |
| --- | --- | --- |
| Tabella ARP | Le voci scadono dopo qualche minuto, e Windows le cancella se il cavo viene staccato | Non scadono mai, nemmeno a cavo staccato |
| Tabella MAC | Le voci scadono dopo 5 minuti, e spariscono subito se la porta perde il segnale | Non scadono mai, ma spariscono se la porta perde il segnale |
| Richiesta ARP ricevuta da chi non è il destinatario | Può aggiornare una voce già presente | Viene scartata senza effetti |
| Richiesta ARP senza risposta | Viene ripetuta alcune volte, poi i pacchetti in attesa sono scartati | Non viene ripetuta: dopo 20 tick i pacchetti in attesa sono scartati |
| ARP gratuito, rilevamento di indirizzi duplicati | Presenti | Assenti |
| Ping | Windows manda quattro echo request, a un secondo l'uno dall'altro | Quattro echo request senza pausa nel motore: il successivo parte quando il precedente si conclude. In tempo reale l'interfaccia aggiunge una breve pausa a schermo (decisione D-29) |
| Identificativo ICMP | Varia secondo il sistema | Sempre 1 |
| Checksum e FCS | Calcolati e verificati | Assenti: i frame non si corrompono |
| Collisioni, velocità, duplex | Dipendono dal mezzo fisico | Assenti: ogni collegamento è punto-punto e senza errori |
| Dimensione dei frame, MTU, frammentazione | Presenti | Assenti |
| Durata dei percorsi | Variabile | 1 tick per collegamento |
| TTL | Diminuisce a ogni router | Resta 128: non esistono ancora router |
| Spanning tree | Elimina i cicli tra switch | Assente: un ciclo produce una tempesta di broadcast, che il simulatore interrompe sospendendosi. Lo spanning tree è previsto in una tappa futura (requisito DEV-11) |

## Guasti

I guasti sono due: il **cavo staccato** e il **dispositivo spento**. Un collegamento ha il campo `connected`, un dispositivo il campo `powered`; le azioni `disconnectLink`, `connectLink`, `powerOff` e `powerOn` li cambiano.

### Il segnale sul cavo

Il concetto su cui si regge tutto è il **segnale sul cavo**. Una porta sente il segnale se le è attaccato un cavo, il cavo non è staccato, i dispositivi ai due capi sono entrambi accesi e, se una delle due porte è un'interfaccia di router, questa non è spenta. Il simulatore lo ricalcola dopo ogni guasto o riparazione, e aggiorna ciò che i dispositivi sanno:

- **Host.** Il campo `linkUp` dice se la scheda sente il segnale. Senza segnale l'host sa di non poter trasmettere: un ping finisce subito con "trasmissione non riuscita", senza che parta nulla. È ciò che fa un PC vero con il cavo staccato, o collegato a uno switch spento.
- **Switch.** Dimentica i MAC che aveva imparato sulla porta rimasta senza segnale, e su quella porta non inoltra più nulla.

I frame che stavano viaggiando su un cavo al momento del distacco vanno persi (traccia `frame-lost`).

### Spegnere un dispositivo

Un dispositivo spento:

- non riceve più nulla: i frame in viaggio verso di lui vanno persi;
- non aspetta più nulla: le sue attese vengono tolte dalla coda. Un ping che aveva in corso finisce lì, senza alcun esito;
- dimentica tutto: tabella ARP o MAC, pacchetti in attesa, numero di sequenza dei ping. Riacceso, riparte da zero;
- toglie il segnale ai vicini.

Un host spento non può fare ping: l'azione viene rifiutata.

### Che cosa vede chi fa il ping

Un guasto produce esiti diversi secondo dove sta e che cosa sanno i dispositivi:

| Situazione | Esito | Perché |
| --- | --- | --- |
| Chi fa il ping ha il cavo staccato, o è collegato a un dispositivo spento | Trasmissione non riuscita | Il PC non sente il segnale e non prova nemmeno |
| La destinazione è staccata o spenta, e chi fa il ping non ne conosce il MAC | Host di destinazione non raggiungibile | La richiesta ARP parte, ma nessuno risponde |
| La destinazione è staccata o spenta, e chi fa il ping ne conosce già il MAC | Richiesta scaduta | L'echo request parte, lo switch non sa più dove mandarlo e lo inoltra agli altri, che lo scartano |

Le attese di un host acceso non vengono toccate da un guasto altrui: il suo ping si conclude comunque, con l'esito che gli spetta.

I guasti fanno parte della configurazione: un file può contenere un dispositivo spento o un cavo staccato, e la rete parte già così (vedi [formato-file.md](formato-file.md)). Nella pagina si provocano con un clic sul cavo o sul dispositivo.

*Previsto:* porta spenta (requisito SIM-7, rilascio 2).

## Modificare la rete

Le modifiche stanno in `src/engine/editing.ts`: funzioni che cambiano la configurazione della rete e nient'altro. Non sanno nulla di frame in viaggio, attese o tracce. A tenere in ordine la simulazione attorno a ogni modifica pensa `src/engine/network-changes.ts` (`applyEdit`), chiamato dal simulatore: i frame che viaggiavano su un cavo tolto vanno persi, chi cambia configurazione riparte da capo, e ogni dispositivo torna a sapere quali cavi ha.

### Tornare a una configurazione di prima

`src/engine/snapshot.ts` serve ad annullare e ripristinare. `takeSnapshot` fotografa la configurazione: dispositivi con nome, porte e indirizzi, e cavi. Niente tabelle, niente pacchetti.

L'azione `restore-configuration` riporta la rete a una fotografia. Non sostituisce la rete: `stepsToRestore` confronta la rete di adesso con la fotografia e restituisce le modifiche che le separano, e il simulatore le esegue una alla volta come farebbe con quelle dell'utente. Nell'ordine: via i cavi e i dispositivi che nella fotografia non ci sono, poi tornano i dispositivi tolti e gli altri riprendono nome e indirizzi, infine tornano i cavi.

| Caso | Che cosa succede |
| --- | --- |
| Un dispositivo torna | È quello di prima (identificativo, nome, MAC, indirizzi), ma appena acceso: tabelle vuote |
| Un dispositivo non è cambiato | Tiene il suo stato di esecuzione |
| La configurazione IP di un host torna quella di prima | L'host dimentica tabella ARP e attese, come per ogni cambio di configurazione (D-48) |
| Un cavo ha solo cambiato porta | Viene spostato, non tolto e rimesso |
| Interfacce e rotte di un router | Indirizzo, stato acceso o spento e rotte tornano quelli della fotografia. Lo stato di un'interfaccia è configurazione, non un guasto: su un router si imposta |
| Guasti | Non sono modifiche: ciò che c'è da entrambe le parti resta acceso o spento, collegato o staccato, com'è adesso. Ciò che torna, torna com'era nella fotografia |

La fotografia deve venire dalla stessa rete, in un momento precedente o successivo della stessa serie di modifiche: è ciò che garantisce che nomi e porte da rimettere siano liberi.

### Ciò che il motore sceglie da solo

Chi aggiunge un dispositivo dice solo che cosa vuole: un PC, uno switch con un certo numero di porte, oppure un router con un certo numero di interfacce. Il resto lo sceglie il motore, sempre allo stesso modo:

| Che cosa | Come viene scelto | Esempio |
| --- | --- | --- |
| Identificativo | Il primo libero della serie | `d1`, `d2` per gli host; `s1` per gli switch; `r1` per i router; `l1` per i cavi |
| Nome | Il primo libero della serie | `PC1`, `PC2`; `SW1`; `R1` |
| Porte | Una per un PC, numerate per uno switch e per un router | `Fa0`; `Fa0/1` … `Fa0/24`; `Gi0/0` … `Gi0/7` |
| Indirizzi MAC | I primi non ancora usati nella rete | `02:00:00:00:00:01`, `02:00:00:00:00:02` |

I MAC cominciano per `02`, il prefisso degli indirizzi assegnati localmente e non da un produttore. Un nome liberato da un dispositivo eliminato viene riusato.

Un PC nuovo nasce acceso, senza cavi e senza configurazione IP. Un router nuovo nasce acceso, ma con tutte le interfacce spente e senza indirizzo, e senza rotte.

### Che cosa viene rifiutato

| Modifica | Rifiutata se |
| --- | --- |
| Aggiungere un cavo | Una porta non esiste, è già occupata, o i due capi sono la stessa porta |
| Spostare un capo | La nuova porta non esiste o è occupata |
| Rinominare | Il nome è vuoto, o un altro dispositivo si chiama già così (senza distinguere maiuscole e minuscole) |
| Configurare un host | La configurazione non supera `checkIpConfig`, o il dispositivo è uno switch |
| Dare un indirizzo a un'interfaccia | L'indirizzo non supera le regole degli host, o la sua rete si sovrappone a quella di un'altra interfaccia dello stesso router |
| Aggiungere una rotta | Indirizzi o maschera sono scritti male, rete e maschera non vanno d'accordo, o il router ha già la stessa rotta |
| Togliere una rotta | Il router non ha quella rotta |

Una modifica rifiutata non cambia nulla: la rete resta com'era.

### Che cosa succede alla simulazione

Si può modificare la rete mentre il traffico viaggia.

- **Togliere un cavo**, o spostarne un capo: i frame che ci stavano viaggiando vanno persi.
- **Togliere un dispositivo**: vanno persi i frame da lui e verso di lui, spariscono le sue attese e i suoi cavi. Un ping che aveva in corso finisce lì, senza esito.
- **Configurare un host**: l'host riparte da capo, come dopo un riavvio della scheda. Dimentica la tabella ARP e ciò che stava aspettando. Gli altri host invece ricordano ancora il suo vecchio indirizzo: un ping verso quello parte, arriva, e viene scartato.
- **Spegnere un'interfaccia di un router**: è come staccarne il cavo. I frame che ci viaggiavano vanno persi e il segnale sparisce dai due capi.
- **Cambiare l'indirizzo di un'interfaccia**: il router dimentica la tabella ARP e ciò che stava aspettando, come un host.
- Dopo ogni modifica ogni dispositivo torna a sapere quali cavi ha: gli host se sentono il segnale, gli switch quali MAC dimenticare.

A simulazione sospesa le modifiche sono rifiutate, come ogni altra azione.

## Tempesta di broadcast

Senza spanning tree, un ciclo tra switch fa girare un broadcast all'infinito: ogni switch lo inoltra al successivo, che lo inoltra al successivo, fino a tornare al primo. È ciò che accade davvero, e il motore lo lascia accadere, perché vederlo fa capire a che cosa serve lo spanning tree. Poi però si ferma da solo, altrimenti la simulazione non finirebbe mai.

Le tempeste sono di due tipi, e il simulatore le riconosce con due segnali diversi. Li controlla alla fine di ogni passo.

| Tipo | Esempio | Segnale | Costante |
| --- | --- | --- | --- |
| Il frame gira in tondo | Tre switch ad anello: il broadcast percorre l'anello nei due versi, senza aumentare | Un frame è stato inoltrato dagli switch più di 3 volte il numero degli switch della rete | `STORM_LAPS` = 3 |
| I frame si moltiplicano | Due switch uniti da tre cavi: ogni frame che arriva riparte su altri due | I frame in viaggio sono più di 200 | `STORM_FRAME_LIMIT` = 200 |

Il primo segnale non può sbagliare. In una rete senza cicli un frame passa da ogni switch al massimo una volta: se è stato inoltrato più volte di quanti sono gli switch, un ciclo c'è di sicuro. Per contare, ogni frame in viaggio porta con sé il numero di switch da cui è già passato (`hops`): zero quando parte da un host, uno in più a ogni inoltro.

Quando scatta uno dei due segnali:

- il simulatore diventa **sospeso** (`sim.suspended`), e registra una traccia `simulation-suspended`;
- `step()` non fa più nulla, e i frame restano dove sono;
- `dispatch()` rifiuta nuove azioni con un errore;
- `canStep()` risponde di no.

Non si può riprendere: bisogna ricominciare. L'interfaccia mostra un avviso che dice che c'è una tempesta di broadcast e che la causa è un ciclo tra switch. È l'unico caso in cui l'app spiega una causa (decisione D-26): senza spiegazione sembrerebbe un difetto dell'app.

La rete di esempio `examples/anello-switch.netsim.json` ha tre switch ad anello e serve a mostrarlo: un ping tra i due PC si sospende dopo dieci passi.

## Previsto

Non ancora nel codice:

- **Porta spenta** (requisito SIM-7, rilascio 2).
- **Tabelle caricate da file** (FILE-5): un file potrà contenere tabelle MAC e ARP già compilate.
- **Inoltro sul router** (rilascio 2, in costruzione): ARP per interfaccia, tabella di routing, decremento del TTL, riscrittura dei MAC, messaggi ICMP di errore, `tracert`. Il router esiste già nel modello e nei file, ma per ora scarta ogni frame che riceve (traccia `frame-dropped` con motivo provvisorio `router-not-forwarding`).
- **Spanning tree** (DEV-11) e gli altri protocolli: VLAN, TCP e UDP, DHCP, DNS, e così via, nelle tappe indicate in [SPEC.md](../SPEC.md).

## Come si aggiunge un protocollo

L'ordine è quello seguito per IPv4 e ICMP, e vale per chi estenderà il motore:

1. Si definisce il tipo dell'unità dati in `model/frames.ts`.
2. Si scrive il comportamento in un nuovo file di `protocols/`, con funzioni che costruiscono e decidono senza modificare nulla.
3. Si collega il protocollo ai dispositivi che lo usano, in `devices/`.
4. Si scrivono i test in `tests/engine/`, prima i mattoni isolati e poi gli scenari.
5. Si aggiorna la tabella delle semplificazioni qui sopra.

## Come si prova

Ogni test costruisce una rete, compie un'azione e controlla le tracce o lo stato finale. `tests/engine/builders.ts` fornisce quattro reti pronte: `buildTwoHosts()`, due PC collegati da un cavo; `buildLan()`, uno switch con tre PC; `buildRing()`, tre switch ad anello; `buildTripleLink()`, due switch uniti da tre cavi.

```ts
test("lo switch impara il MAC di chi chiede e inoltra la richiesta a tutti gli altri", () => {
  const { sim, sw } = lan();
  sim.dispatch(resolveAddress("d1", "192.168.1.11"));

  const traces = sim.step(); // la richiesta arriva allo switch

  expect(sim.time).toBe(1);
  expect(sw.macTable.get(PC1_MAC)).toBe("Fa0/1");
  expect(sentBySwitchTo(traces)).toEqual(["d2", "d3"]); // non verso PC1, non su Fa0/4
});
```

I file di test, uno per argomento:

| File | Argomento |
| --- | --- |
| `arp.test.ts` | Scambio ARP tra due PC |
| `switch.test.ts` | Apprendimento e inoltro dello switch, isolati |
| `lan.test.ts` | Scambio ARP attraverso lo switch |
| `ipv4.test.ts` | Indirizzi, maschere, stessa rete, prossimo salto |
| `ip-config.test.ts` | Configurazioni IP accettate e rifiutate |
| `ping.test.ts` | Ping a caldo e a freddo, casi in cui non parte o non arriva |
| `timers.test.ts` | Attesa della risposta ARP |
| `ping-results.test.ts` | I quattro esiti |
| `ping-series.test.ts` | Più echo request per ping |
| `loopback.test.ts` | Ping al proprio indirizzo e a 127.x.x.x |
| `storm.test.ts` | Tempesta di broadcast e sospensione |
| `link-faults.test.ts` | Cavo staccato |
| `power-faults.test.ts` | Dispositivo spento |
| `editing.test.ts` | Aggiungere, collegare, togliere, rinominare, configurare |
| `router-model.test.ts` | Il router nel modello: controlli su interfacce e rotte, reti sovrapposte, segnale |
| `router-editing.test.ts` | Aggiungere un router, interfacce, rotte, e annullare |
| `reset.test.ts` | Ricominciare la simulazione |
| `snapshot.test.ts` | Fotografare la configurazione e tornarci |

I titoli dei test sono affermazioni in italiano: letti di seguito, sono un elenco delle regole che il motore rispetta.
