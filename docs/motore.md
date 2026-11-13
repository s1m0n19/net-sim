# Motore di simulazione

**Stato:** descrive il codice al 19 ottobre 2026. Le parti non ancora realizzate sono raccolte nella sezione "Previsto".

Il motore è la parte dell'app che fa funzionare la rete: decide che cosa fa un dispositivo quando riceve un frame, tiene le tabelle, fa scorrere il tempo. Non disegna nulla. Sta in `src/engine/` e non dipende da altro (vedi [architettura.md](architettura.md)).

Oggi contiene host (PC e server), switch e router, con Ethernet, ARP, IPv4, ICMP (echo e tre messaggi di errore) e routing statico.

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

La usano il lettore dei file, le modifiche della rete (`editing.ts`) e il pannello di configurazione, che mostra sotto il campo la frase del rifiuto.

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
  ports: SwitchPort[];                // una porta, più `enabled` (false = spenta) e `vlan`
  powered: boolean;                   // false = spento
  vlans: Vlan[];                      // le VLAN configurate, { id, name }; la 1 c'è sempre
  // stato di esecuzione
  macTable: Map<number, Map<MacAddress, string>>;  // VLAN -> MAC -> nome della porta
}
```

`createHost(config)` e `createSwitch(config)` costruiscono un dispositivo appena acceso: la configurazione data, più tabelle vuote e contatori iniziali. `clearRuntimeState(device)` riporta un dispositivo a quello stato: è ciò che succede quando lo si spegne. Le porte di uno switch (`SwitchPort`) si possono spegnere, e nascono accese (decisione D-93): `createSwitch` accende quelle di cui non si dice nulla.

### VLAN (`vlans.ts`)

Uno switch ha le VLAN sulle porte access (requisito DEV-6, prima parte L2-1, decisione D-142). Il modello ha due parti, come su un Cisco:

- il **registro** delle VLAN configurate, `Switch.vlans`: numero (da 1 a 1001) e nome (da 1 a 32 caratteri, senza spazi). La VLAN 1 si chiama `default`, c'è sempre, non si rinomina e non si elimina; una VLAN creata senza nome si chiama `VLAN0010`. Una VLAN può stare nel registro senza porte;
- la **VLAN di ogni porta**, `SwitchPort.vlan`: un numero, 1 se non si dice altro. Il numero resta anche se la VLAN viene eliminata: la porta allora è accesa ma **inattiva**, e non fa passare nulla finché la VLAN non torna o la porta non cambia VLAN. Spenta (`enabled`) e inattiva sono due cose diverse: una porta inattiva porta ancora il segnale, e il PC attaccato lo sente.

`createSwitch` mette la VLAN 1 nel registro anche se la configurazione non la dice, e le porte senza VLAN nella 1: una rete senza VLAN funziona come prima. La tabella MAC è divisa per VLAN, perché ogni VLAN impara per conto suo: lo stesso MAC può stare in due VLAN, su porte diverse. Chi la legge usa le funzioni di `vlans.ts`: `macTableOf(sw, vlan)` la tabella di una VLAN, `macEntries(sw)` tutte le righe con la loro VLAN, `learnMac` e `forgetMacs` per scriverla. `activeVlanOf(sw, porta)` dice la VLAN di una porta, oppure null se è inattiva.

Il frame non porta la VLAN: non c'è il tag 802.1Q, che verrà con le porte trunk (L2-2). Per lo switch la VLAN di un frame è quella della porta da cui è entrato. Gli host non sanno nulla delle VLAN.

### Tabelle di partenza (`tables.ts`)

Una rete può partire con le tabelle già compilate, se il file le contiene (requisito FILE-5, decisione D-100). `tables.ts` tratta la tabella che ogni dispositivo impara (ARP per host e router, MAC per lo switch) come un elenco di coppie di testi, `TableRows`, e una rete intera come `NetworkTables`, per identificativo del dispositivo:

- `copyTables(network)` copia le tabelle di adesso, una per dispositivo, anche vuota;
- `fillTables(network, tables)` aggiunge le righe ai dispositivi, con le regole di sempre: salta un dispositivo spento e le righe di uno switch su una porta che non ha o su una porta inattiva.

Le righe di uno switch sono `[MAC, porta]`, senza la VLAN: con le sole porte access la VLAN di una riga è sempre quella della sua porta, e `fillTables` la mette lì.

Il `Simulator` riceve le tabelle di partenza dal costruttore, le applica subito e le tiene da parte: `reset()` svuota tutto e poi le rimette. `setStartingTables(tables)` le cambia senza toccare quelle di adesso; l'interfaccia lo chiama dopo un salvataggio con le tabelle. Eliminando un dispositivo si tolgono anche le sue, perché un dispositivo nuovo che ne prende l'identificativo non le erediti. Dopo le tabelle il simulatore ricalcola il segnale, e uno switch dimentica subito le righe di una porta senza segnale. Le tabelle di partenza non sono configurazione: annulla e ripristina non le toccano.

### PC e server

Un `Host` ha un ruolo, `role`: `"pc"` oppure `"server"`. Per la rete non cambia nulla: un server è un host con un indirizzo, risponde ad ARP e al ping come un PC. Cambiano il nome che riceve alla creazione (`SRV1` invece di `PC1`) e l'icona con cui viene disegnato. I servizi che un server ospita (DHCP, DNS, web) sono previsti in una tappa successiva.

### Router (`network.ts`, `router-config.ts`)

Un `Router` ha più **interfacce** (`RouterInterface`): porte che, oltre a nome e MAC, hanno un indirizzo IP, una maschera e uno stato acceso o spento (`enabled`). Su un router le interfacce nascono spente, come su un Cisco (decisione D-70). Ha poi un elenco di rotte statiche (`StaticRoute`: rete, maschera, prossimo salto) e, come stato di esecuzione, una tabella ARP e i pacchetti in attesa del MAC. Lo crea `createRouter`.

`router-config.ts` dice che cosa si può impostare, con lo stesso criterio di `ip-config.ts`: ciò che un apparato vero rifiuterebbe viene rifiutato.

| Funzione | Che cosa controlla |
| --- | --- |
| `checkInterfaceAddress` | L'indirizzo di un'interfaccia, con le regole degli host |
| `checkInterfacesApart` | Che due interfacce dello stesso router non abbiano reti sovrapposte |
| `checkRoute` | Che una rotta abbia indirizzi validi, e una rete coerente con la maschera |
| `nextHopIsOwnAddress` | Se il prossimo salto di una rotta è un indirizzo del router stesso. La CLI e il pannello rifiutano una rotta così mentre la si scrive; il motore e i file la ammettono, perché l'indirizzo può arrivare su un'interfaccia dopo la rotta |

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
| `simulator.ts` | La classe `Simulator`: la coda, il tempo, `dispatch`, `step`, e le tre operazioni che servono alla consegna (mettere un frame sul cavo, avviare e annullare un'attesa) |
| `launching.ts` | Far nascere il traffico: che cosa fa un host o un router quando gli si chiede un ping, un tracert o una richiesta ARP |
| `delivery.ts` | La consegna: che cosa succede quando un frame arriva a un host, a uno switch o a un router, e quando scade un'attesa. Esegue ciò che il dispositivo ha chiesto |
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
| `ping(deviceId, targetIp, count, ttl)` | L'host o il router manda `count` echo request, uno alla volta. Se `count` manca, quattro. `ttl`, facoltativo, è il TTL di partenza di un host: 128 se manca. Per un router non conta: parte sempre da 255 |
| `tracert(deviceId, targetIp, maxHops)` | L'host o il router traccia la strada verso un indirizzo, una sonda per salto. Se `maxHops` manca, trenta |
| `resolveAddress(deviceId, targetIp)` | L'host manda una richiesta ARP. Nella realtà nessuno lancia un ARP a mano: serve a provare ARP da solo nei test |
| `disconnectLink(linkId)`, `connectLink(linkId)` | Stacca o riattacca un cavo |
| `powerOff(deviceId)`, `powerOn(deviceId)` | Spegne o accende un dispositivo |
| `addHost()`, `addServer()`, `addSwitch(portCount)`, `addRouter(interfaceCount)` | Aggiunge un PC, un server, uno switch con quel numero di porte, o un router con quel numero di interfacce |
| `duplicateDevice(deviceId)` | Aggiunge una copia di un dispositivo, accesa e senza cavi (vedi «Duplicare») |
| `removeDevice(deviceId)` | Toglie un dispositivo, con i cavi che gli erano attaccati |
| `addLink(a, b)`, `removeLink(linkId)` | Collega due porte con un cavo nuovo, o toglie un cavo |
| `moveLinkEnd(linkId, end, portName)` | Sposta un capo di un cavo su un'altra porta dello stesso dispositivo |
| `renameDevice(deviceId, name)` | Cambia il nome di un dispositivo |
| `configureHost(deviceId, config)` | Cambia indirizzo, maschera e gateway di un host |
| `configureInterface(deviceId, portName, ip, mask)` | Cambia l'indirizzo di un'interfaccia di un router; con `null` lo toglie |
| `enableInterface(deviceId, portName)`, `disableInterface(deviceId, portName)` | Accende o spegne un'interfaccia di un router o una porta di uno switch (su un Cisco: `no shutdown` e `shutdown`). La scheda di un host non si spegne: l'azione viene rifiutata |
| `addRoute(deviceId, route)`, `removeRoute(deviceId, route)` | Aggiunge o toglie una rotta statica di un router |
| `addVlan(deviceId, vlan, name)`, `renameVlan(deviceId, vlan, name)`, `removeVlan(deviceId, vlan)` | Crea, rinomina o elimina una VLAN di uno switch. Creare una VLAN che c'è già non cambia nulla; la VLAN 1 non si rinomina e non si elimina |
| `setPortVlan(deviceId, portName, vlan)` | Mette una porta di uno switch in una VLAN, anche se la VLAN non esiste: allora la porta è inattiva |

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
| `device-added`, `device-removed`, `link-added`, `link-removed`, `device-renamed`, `host-configured`, `vlan-changed`, `port-vlan-changed` | La rete è stata modificata. Le tracce di ciò che è stato tolto ne portano il nome, perché dopo non lo si può più leggere dalla rete |

Il campo `reason` di un frame scartato serve ai test. L'interfaccia mostra che il frame è stato scartato, ma non ne spiega la causa: l'app si comporta come una rete vera (requisito SIM-8).

### Conversazioni

Ogni azione dell'utente riceve un numero di conversazione. Tutto ciò che nasce elaborando un frame o un'attesa eredita il numero di quel frame o di quell'attesa. Così la richiesta ARP causata da un ping, i suoi quattro echo e i loro esiti appartengono alla stessa conversazione. Servirà all'interfaccia per mostrare solo quella (requisito VIS-5).

Un'eccezione, decisa in D-133: i pacchetti che aspettano il MAC del prossimo salto. Quando un dispositivo ne mette uno in attesa (`pendingPackets`), il simulatore ci scrive il numero della conversazione che l'ha fatto nascere (`PendingPacket.conversationId`; il dispositivo non conosce le conversazioni). Quando la risposta ARP lo fa partire, o l'attesa scade, ciò che lo riguarda (il frame che parte, l'esito «irraggiungibile», lo scarto, gli echo successivi della stessa serie) resta della sua conversazione: il dispositivo lo restituisce in `onBehalfOf`, e il simulatore lo esegue con quel numero. L'ARP resta di chi l'ha chiesta. Così due ping che aspettano la stessa risposta ARP, uno dalla barretta e uno dal terminale, hanno ciascuno il suo esito; vale anche per i pacchetti che un router inoltra.

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

Il comportamento di un host è diviso in quattro file, per argomento:

| File | Contenuto |
| --- | --- |
| `devices/host.ts` | Che cosa fa l'host con un frame che arriva (ARP, IP) e con un'attesa che scade. È il punto da cui cominciare a leggere, e ripropone ciò che sta negli altri tre |
| `devices/host-sending.ts` | Spedire un pacchetto IP: prossimo salto, tabella ARP, pacchetti in attesa del MAC |
| `devices/host-ping.ts` | Ping e tracert: gli echo request in sospeso e come si concludono |
| `devices/host-output.ts` | I tipi di ciò che un host chiede al simulatore: `HostOutput`, attese, esiti |

Le funzioni di un host:

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

### Router (`devices/router.ts`, `protocols/routing.ts`)

Il router unisce reti diverse: riceve un pacchetto IP da un'interfaccia e lo fa uscire da un'altra.

Come l'host, è diviso in file per argomento:

| File | Contenuto |
| --- | --- |
| `devices/router.ts` | Che cosa fa il router con un frame che arriva e con un'attesa che scade. Ripropone ciò che sta negli altri due |
| `devices/router-sending.ts` | Spedire un pacchetto IP: rotta, MAC del prossimo salto, pacchetti in attesa, avvisi ICMP. E i tipi di ciò che un router chiede al simulatore (`RouterOutput`) |
| `devices/router-ping.ts` | Ping e traceroute lanciati dal router |

**La tabella di routing** (`routingTableOf`) si ricalcola ogni volta che serve, e contiene:

- le reti **collegate**: una per ogni interfaccia accesa, con un indirizzo, e che sente il segnale sul cavo. Staccando il cavo, la rete sparisce;
- le rotte **statiche** impostate. Una rotta statica serve solo se il suo prossimo salto sta su una rete collegata: da lì si ricava l'interfaccia di uscita. Altrimenti resta in tabella, senza interfaccia, e non viene mai scelta.

**La scelta della rotta** (`lookupRoute`): tra le rotte utilizzabili la cui rete contiene la destinazione vince la maschera più lunga; a parità, la prima della tabella. La rotta di default, 0.0.0.0 con maschera 0.0.0.0, contiene tutto e quindi vince solo quando non c'è di meglio.

**Quando riceve un frame** (`receiveFrameOnRouter`):

1. Lo considera solo se è indirizzato al MAC di quell'interfaccia, o in broadcast.
2. A una richiesta ARP risponde solo se chiede l'indirizzo dell'interfaccia su cui è arrivata, e impara il MAC di chi chiede. Non risponde per conto di altri.
3. Un pacchetto IP per uno dei suoi indirizzi lo tiene per sé: a un echo request risponde, dall'indirizzo interrogato.
4. Ogni altro pacchetto IP lo inoltra.

**Quando inoltra**:

1. Toglie 1 al TTL. Se era già a 1, scarta il pacchetto: è ciò che ferma un pacchetto finito in un ciclo tra router.
2. Sceglie la rotta. Se non ce n'è, scarta.
3. Il prossimo salto è la destinazione stessa su una rete collegata, altrimenti il vicino indicato dalla rotta.
4. Se ne conosce il MAC spedisce. Altrimenti manda una richiesta ARP dall'interfaccia di uscita e tiene il pacchetto in attesa, con la scadenza degli host (20 tick); se la risposta non arriva, rinuncia.
5. Il frame che riparte ha come sorgente il MAC dell'interfaccia di uscita e come destinazione il MAC del prossimo salto. Gli indirizzi IP non cambiano.

**Quando non può consegnare** un pacchetto, il router lo scarta e avvisa il mittente con un messaggio ICMP di errore (`makeIcmpError`, in `protocols/icmp.ts`):

| Situazione | Messaggio | Esito del ping |
| --- | --- | --- |
| Il TTL si è esaurito | `time-exceeded` | `ttl-expired` |
| Nessuna rotta verso la destinazione | `destination-unreachable`, codice `net` | `net-unreachable` |
| La destinazione, o il prossimo salto, non risponde ad ARP | `destination-unreachable`, codice `host` | `host-unreachable` |

L'avviso parte dall'indirizzo dell'interfaccia su cui il pacchetto era arrivato e viene instradato come ogni altro pacchetto; se non trova la strada, viene scartato in silenzio. Riporta indirizzi, tipo e numero di sequenza del pacchetto scartato: è così che l'host riconosce a quale echo request si riferisce e lo chiude subito, senza aspettare la scadenza. Su un messaggio di errore non si manda mai un altro errore.

L'esito del ping riporta anche chi ha risposto (`from`: la destinazione, oppure il router che ha avvisato) e, per un echo reply, il TTL con cui è arrivato (`ttl`): 128 meno i router attraversati al ritorno.

Come gli host, il router non spedisce e non misura il tempo: restituisce i frame da inviare, ciascuno con la sua interfaccia, e le attese da avviare o annullare.

Dal punto di vista di un host non cambia nulla: `nextHopFor` consegna al gateway ciò che non è della propria rete, e l'host chiede con ARP il MAC del gateway, non quello della destinazione.

### Tracert (`devices/host-ping.ts`)

`startTracert` scopre i router sulla strada verso un indirizzo usando il TTL al contrario del solito: lo imposta troppo basso apposta.

1. La prima **sonda** è un echo request con TTL 1. Il primo router la ferma e avvisa con «time exceeded»: così dice chi è.
2. La seconda parte con TTL 2 e arriva un router più in là. E così via.
3. Quando risponde la destinazione con un echo reply, la strada è finita.

Una sonda alla volta: la successiva parte quando la precedente si è conclusa. Ogni conclusione è una traccia `trace-hop`, con il numero del salto, chi ha risposto e se tracert finisce lì.

| Che cosa succede alla sonda | Esito del salto | Tracert |
| --- | --- | --- |
| Un router la ferma per il TTL | `hop` | prosegue |
| Risponde la destinazione | `reached` | finisce |
| Nessuno risponde in tempo | `timeout` | prosegue, fino al limite dei salti |
| Un router avvisa che non si passa | `net-unreachable`, `host-unreachable` | finisce |
| L'host non trova a chi consegnarla, o non può spedirla | `unreachable`, `transmit-failed` | finisce |

Lo stesso meccanismo serve a `ping -i`: `startPing` accetta un TTL di partenza, e tutti gli echo request di quel ping partono con quello.

### Ping e traceroute dal router (`devices/router-ping.ts`, `devices/echo-series.ts`)

Anche un router può fare ping e tracciare una strada: lo si chiede dalla sua CLI, e nel motore sono le stesse azioni `ping` e `tracert`, rivolte a un router. Gli esiti sono le stesse tracce `ping-result` e `trace-hop`.

La logica della serie è una sola per host e router, e sta in `echo-series.ts`: `conclude` dice che cosa si conclude quando un echo request finisce (un esito di ping, o un salto di tracert) e quale echo request parte dopo. È una funzione che decide soltanto; a spedire pensano `host-ping.ts` e `router-ping.ts`, ciascuno a modo suo.

Per il router cambiano tre cose:

- **L'indirizzo sorgente** è quello dell'interfaccia da cui il pacchetto esce, perché un router non ha un solo indirizzo.
- **La strada** la sceglie la tabella di routing, non un gateway. Senza una rotta l'echo request non parte (`transmit-failed`).
- **Il TTL di partenza** è 255 (`ROUTER_TTL`), come su IOS, invece dei 128 di Windows.

Un echo reply o un avviso ICMP indirizzato a uno degli indirizzi del router viene consegnato a `router-ping.ts`; se il router non lo stava aspettando, viene ignorato.

### Switch

Per ogni frame ricevuto su una porta:

1. **VLAN.** La VLAN del frame è quella della porta di arrivo. Se la VLAN non esiste più, la porta è inattiva: il frame viene scartato (`inactive-vlan`) e lo switch non impara nulla.
2. **Apprendimento.** Registra nella tabella MAC di quella VLAN che l'indirizzo sorgente si raggiunge da quella porta. Se il MAC era già noto su un'altra porta, vale l'informazione più recente.
3. **Decisione**, presa da `chooseOutputPorts`, che non modifica nulla e guarda solo la stessa VLAN:
   - destinazione broadcast, oppure sconosciuta nella VLAN: tutte le porte della stessa VLAN tranne quella di arrivo (flooding);
   - destinazione nota su un'altra porta: solo quella, che è della stessa VLAN perché è lì che lo switch l'ha imparata;
   - destinazione nota sulla porta di arrivo: nessuna, il frame viene scartato.

Una riga della tabella di una VLAN indica sempre una porta di quella VLAN: lo switch impara solo dalla porta di arrivo, e quando una porta cambia VLAN dimentica le sue righe nella VLAN di prima. Due switch uniti da porte access si passano frame senza VLAN, e ciascuno li mette nella VLAN della sua porta: se i due capi hanno VLAN diverse, le due VLAN diventano una rete sola.

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
| TTL | Diminuisce a ogni router | Diminuisce a ogni router. Quando si esaurisce il router scarta il pacchetto e avvisa il mittente |
| Rotta statica con prossimo salto non collegato | Il router cerca a sua volta una rotta per il prossimo salto | La rotta resta in tabella ma non viene usata |
| Più rotte equivalenti | Il traffico viene diviso tra le rotte | Vince la prima della tabella |
| Proxy ARP | Su molti router si può attivare | Assente: il router risponde solo per l'indirizzo dell'interfaccia interrogata |
| Messaggi ICMP di errore | Molti tipi e codici; riportano l'intestazione IP e i primi 8 byte del pacchetto scartato | Tre: TTL scaduto, rete non raggiungibile, host non raggiungibile. Riportano indirizzi, tipo e numero di sequenza del pacchetto scartato |
| Statistiche di `ping` | Windows conta come ricevute anche le risposte di errore | Lo stesso: dopo un `Destination net unreachable` le statistiche dicono `Lost = 0` |
| Ciclo di routing | Il pacchetto gira in pochi millisecondi e `ping` stampa `TTL expired in transit` | Con il TTL solito il giro dura 127 tick, più della scadenza del ping (40): `ping` stampa `Request timed out`. Per vederlo si parte con un TTL piccolo, `ping -i 6` (D-83) |
| `tracert` | Tre sonde per salto, in UDP o ICMP secondo il sistema; cerca anche i nomi | Una sonda ICMP per salto (D-73); solo indirizzi |
| Primo ping di un router verso un vicino mai visto | Il primo echo request va perso mentre parte l'ARP: `.!!!!` | Il pacchetto aspetta la risposta ARP e parte: `!!!!!` (D-97) |
| `traceroute` di un router | Tre sonde per salto, in UDP | Una sonda ICMP per salto, come `tracert` |
| Tabella ARP del router | Una voce è legata all'interfaccia su cui è stata imparata | Una tabella sola per tutto il router |
| Spanning tree | Elimina i cicli tra switch | Assente: un ciclo produce una tempesta di broadcast, che il simulatore interrompe sospendendosi. Lo spanning tree è previsto in una tappa futura (requisito DEV-11). Con le VLAN la tempesta resta nella VLAN del ciclo |
| Trunk e tag 802.1Q | Un cavo tra switch porta più VLAN, distinte dal tag | Non ancora: solo porte access, una VLAN per cavo (previsti in L2-2) |
| VLAN diverse ai due capi di un cavo tra switch | CDP lo segnala, e le due VLAN si uniscono | Le due VLAN si uniscono, senza avvisi |
| VTP, DTP | Propagano le VLAN e negoziano i trunk | Assenti: ogni switch ha le sue VLAN |
| VLAN 1002–1005 e intervallo esteso (1006–4094) | Esistono | Non disponibili: si usano i numeri da 1 a 1001 |
| Nomi delle VLAN | Due VLAN non possono avere lo stesso nome | Il nome non si controlla contro gli altri |

## Guasti

I guasti sono due: il **cavo staccato** e il **dispositivo spento**. Un collegamento ha il campo `connected`, un dispositivo il campo `powered`; le azioni `disconnectLink`, `connectLink`, `powerOff` e `powerOn` li cambiano.

### Il segnale sul cavo

Il concetto su cui si regge tutto è il **segnale sul cavo**. Una porta sente il segnale se le è attaccato un cavo, il cavo non è staccato, i dispositivi ai due capi sono entrambi accesi e nessuna delle due porte è spenta: si spengono le interfacce dei router e le porte degli switch. Il simulatore lo ricalcola dopo ogni guasto o riparazione, e aggiorna ciò che i dispositivi sanno:

- **Host.** Il campo `linkUp` dice se la scheda sente il segnale. Senza segnale l'host sa di non poter trasmettere: un ping finisce subito con "trasmissione non riuscita", senza che parta nulla. È ciò che fa un PC vero con il cavo staccato, o collegato a uno switch spento.
- **Switch.** Dimentica i MAC che aveva imparato sulla porta rimasta senza segnale, e su quella porta non inoltra più nulla.

Una **porta spenta** (`enabled: false`) si comporta quindi come un cavo staccato, visto da quella porta: chi è collegato lì perde il segnale, i frame in viaggio su quel cavo vanno persi, lo switch dimentica i MAC che vi aveva imparato. La differenza è che non è un guasto ma configurazione: la si imposta con un comando (`shutdown`), si salva nel file e si annulla con Ctrl+Z.

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

*Previsto:* spegnere la scheda di un host (ciò che resta del requisito SIM-7).

## Modificare la rete

Le modifiche stanno in `src/engine/editing.ts`, quelle che riguardano solo i router (indirizzi delle interfacce, rotte statiche) in `src/engine/router-editing.ts`, accendere e spegnere una porta in `src/engine/port-editing.ts`, e le VLAN degli switch in `src/engine/vlan-editing.ts`: funzioni che cambiano la configurazione della rete e nient'altro. Non sanno nulla di frame in viaggio, attese o tracce. A tenere in ordine la simulazione attorno a ogni modifica pensa `src/engine/network-changes.ts` (`applyEdit`), chiamato dal simulatore: i frame che viaggiavano su un cavo tolto vanno persi, chi cambia configurazione riparte da capo, e ogni dispositivo torna a sapere quali cavi ha.

### Tornare a una configurazione di prima

`src/engine/snapshot.ts` serve ad annullare e ripristinare. `takeSnapshot` fotografa la configurazione: dispositivi con nome, porte, indirizzi e VLAN, e cavi. Niente tabelle, niente pacchetti.

L'azione `restore-configuration` riporta la rete a una fotografia. Non sostituisce la rete: `stepsToRestore` confronta la rete di adesso con la fotografia e restituisce le modifiche che le separano, e il simulatore le esegue una alla volta come farebbe con quelle dell'utente. Nell'ordine: via i cavi e i dispositivi che nella fotografia non ci sono, poi tornano i dispositivi tolti e gli altri riprendono nome e indirizzi, infine tornano i cavi.

| Caso | Che cosa succede |
| --- | --- |
| Un dispositivo torna | È quello di prima (identificativo, nome, MAC, indirizzi), ma appena acceso: tabelle vuote |
| Un dispositivo non è cambiato | Tiene il suo stato di esecuzione |
| La configurazione IP di un host torna quella di prima | L'host dimentica tabella ARP e attese, come per ogni cambio di configurazione (D-48) |
| Un cavo ha solo cambiato porta | Viene spostato, non tolto e rimesso |
| Interfacce e rotte di un router | Indirizzo, stato acceso o spento e rotte tornano quelli della fotografia. Lo stato di un'interfaccia è configurazione, non un guasto: su un router si imposta |
| Porte di uno switch | Lo stato acceso o spento torna quello della fotografia, per la stessa ragione |
| VLAN di uno switch | Tornano il registro e la VLAN di ogni porta. Prima si creano le VLAN che mancano, poi le porte tornano nella loro VLAN, poi si correggono i nomi, per ultime si eliminano le VLAN in più |
| Guasti | Non sono modifiche: ciò che c'è da entrambe le parti resta acceso o spento, collegato o staccato, com'è adesso. Ciò che torna, torna com'era nella fotografia |

La fotografia deve venire dalla stessa rete, in un momento precedente o successivo della stessa serie di modifiche: è ciò che garantisce che nomi e porte da rimettere siano liberi.

### Ciò che il motore sceglie da solo

Chi aggiunge un dispositivo dice solo che cosa vuole: un PC, uno switch con un certo numero di porte, oppure un router con un certo numero di interfacce. Il resto lo sceglie il motore, sempre allo stesso modo:

| Che cosa | Come viene scelto | Esempio |
| --- | --- | --- |
| Identificativo | Il primo libero della serie | `d1`, `d2` per gli host; `s1` per gli switch; `r1` per i router; `l1` per i cavi |
| Nome | Il primo libero della serie | `PC1`, `PC2`; `SRV1`; `SW1`; `R1` |
| Porte | Una per un PC, numerate per uno switch e per un router | `Fa0`; `Fa0/1` … `Fa0/24`; `Gi0/0` … `Gi0/7` |
| Indirizzi MAC | I primi non ancora usati nella rete | `02:00:00:00:00:01`, `02:00:00:00:00:02` |

I MAC cominciano per `02`, il prefisso degli indirizzi assegnati localmente e non da un produttore. Un nome liberato da un dispositivo eliminato viene riusato.

Un PC nuovo nasce acceso, senza cavi e senza configurazione IP. Uno switch nuovo nasce acceso e con tutte le porte accese. Un router nuovo nasce acceso, ma con tutte le interfacce spente e senza indirizzo, e senza rotte.

### Duplicare

`duplicateDevice` (`duplicating.ts`, requisito ED-6, decisione D-101) aggiunge un dispositivo nuovo dello stesso tipo e della stessa grandezza, con identificativo, nome e MAC scelti come sopra, e gli passa una parte della configurazione dell'originale:

| Originale | Che cosa prende la copia |
| --- | --- |
| PC o server | Maschera e gateway, e il primo indirizzo libero della stessa sottorete dopo quello dell'originale. Libero vuol dire non usato da un host né da un'interfaccia di router, diverso dal gateway, e accettato da `checkIpConfig` (quindi non il broadcast). Se non ce n'è, o se l'originale non è configurato, la copia nasce non configurata |
| Switch | Il numero di porte, quali sono spente, le VLAN e la VLAN di ogni porta |
| Router | Solo il numero di interfacce: nascono spente e senza indirizzi, e non ci sono rotte. Copiare gli indirizzi produrrebbe soltanto conflitti |

La copia nasce accesa, senza cavi e con le tabelle vuote, come ogni dispositivo nuovo; la traccia è quella di un dispositivo aggiunto (`device-added`). L'indirizzo successivo lo calcola `nextFreeAddress`, che scorre gli indirizzi come numeri con `ipToNumber` e `numberToIp` (`model/addresses.ts`). Dove mettere la copia sul disegno lo decide l'interfaccia.

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
| Creare una VLAN, spostare una porta | Il numero non è un intero da 1 a 1001, il nome non va bene, la porta non esiste o il dispositivo non è uno switch |
| Rinominare o eliminare una VLAN | È la VLAN 1, o lo switch non ha quella VLAN |

Una modifica rifiutata non cambia nulla: la rete resta com'era.

### Che cosa succede alla simulazione

Si può modificare la rete mentre il traffico viaggia.

- **Togliere un cavo**, o spostarne un capo: i frame che ci stavano viaggiando vanno persi.
- **Togliere un dispositivo**: vanno persi i frame da lui e verso di lui, spariscono le sue attese e i suoi cavi. Un ping che aveva in corso finisce lì, senza esito.
- **Configurare un host**: l'host riparte da capo, come dopo un riavvio della scheda. Dimentica la tabella ARP e ciò che stava aspettando. Gli altri host invece ricordano ancora il suo vecchio indirizzo: un ping verso quello parte, arriva, e viene scartato.
- **Spegnere un'interfaccia di un router**: è come staccarne il cavo. I frame che ci viaggiavano vanno persi e il segnale sparisce dai due capi.
- **Cambiare l'indirizzo di un'interfaccia**: il router dimentica la tabella ARP e ciò che stava aspettando, come un host.
- **Spostare una porta in un'altra VLAN**: lo switch dimentica le righe di quella porta nella VLAN di prima, e solo quelle. Un frame già sul cavo verso la porta, arrivando, appartiene alla VLAN nuova.
- **Eliminare una VLAN**: lo switch dimentica tutte le sue righe; le porte restano assegnate al suo numero, inattive. I frame già sul cavo arrivano, e lo switch li scarta. Ricreando la VLAN, le porte tornano attive.
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

- **Scheda di un host spenta** (ciò che resta del requisito SIM-7).
- **Le VLAN nel pannello** (L2-1D): oggi si configurano dalla CLI degli switch (D-144) o da un file scritto a mano (formato 3, D-143).
- **Spanning tree** (DEV-11) e gli altri protocolli: trunk 802.1Q e routing tra VLAN, TCP e UDP, DHCP, DNS, e così via, nelle tappe indicate in [SPEC.md](../SPEC.md).

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
  expect(macTableOf(sw).get(PC1_MAC)).toBe("Fa0/1");
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
| `switch-ports.test.ts` | Porta di switch spenta e riaccesa |
| `vlan.test.ts` | VLAN sulle porte access: isolamento, tabella MAC per VLAN, VLAN eliminate, due switch, ciclo in una VLAN, annulla e duplica, invarianti |
| `editing.test.ts` | Aggiungere, collegare, togliere, rinominare, configurare |
| `duplicating.test.ts` | Duplicare un PC, un server, uno switch e un router; l'indirizzo libero successivo |
| `router-model.test.ts` | Il router nel modello: controlli su interfacce e rotte, reti sovrapposte, segnale |
| `router-editing.test.ts` | Aggiungere un router, interfacce, rotte, e annullare |
| `routing.test.ts` | Tabella di routing e scelta della rotta |
| `router-forwarding.test.ts` | Ping attraverso uno e due router: ARP sui due lati, MAC, TTL, rotte mancanti, ciclo di routing |
| `icmp-errors.test.ts` | I tre messaggi ICMP di errore, chi li manda e che cosa ne fa l'host; TTL della risposta |
| `router-ping.test.ts` | Ping e traceroute lanciati da un router: sorgente, TTL, rotte mancanti, scadenze |
| `tracert.test.ts` | Tracert con uno e due router, salti muti, cicli; ping con TTL a scelta |
| `server.test.ts` | Il server: un host con il suo ruolo e il suo nome, nella rete, nei file e in annulla e ripristina |
| `reset.test.ts` | Ricominciare la simulazione |
| `starting-tables.test.ts` | Partire con le tabelle già compilate, e tornarci ricominciando |
| `snapshot.test.ts` | Fotografare la configurazione e tornarci |

I titoli dei test sono affermazioni in italiano: letti di seguito, sono un elenco delle regole che il motore rispetta.
