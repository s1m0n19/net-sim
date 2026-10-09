# Motore di simulazione

**Stato:** proposta, precede il codice. Copre il rilascio 1 (PC, switch, ARP, ICMP) e indica dove si innesta il resto.

Il motore è la parte dell'app che fa funzionare la rete: decide che cosa fa un dispositivo quando riceve un frame, tiene le tabelle, fa scorrere il tempo. Non disegna nulla. Sta in `src/engine/` e non dipende da altro (vedi [architettura.md](architettura.md)).

## L'idea in breve

Il motore è un **simulatore a eventi discreti**. Non fa scorrere il tempo in modo continuo: tiene un elenco di fatti futuri, ciascuno con il suo istante, e salta dall'uno all'altro.

1. Un'azione dell'utente (un ping) fa nascere un frame su una porta.
2. Il motore mette in coda l'evento "questo frame arriva all'altro capo del cavo all'istante *t* + 1".
3. Quando si arriva a quell'istante, il motore consegna il frame al dispositivo, che reagisce secondo i suoi protocolli. La reazione può far nascere altri frame, cioè altri eventi futuri.
4. Si ripete finché la coda è vuota.

Tempo reale e passo-passo (requisito SIM-2) sono lo stesso meccanismo: cambia solo chi decide quando passare all'evento successivo, un orologio oppure il clic del docente.

## Modello dei dati

I tipi qui sotto sono uno schizzo: fissano i nomi e la forma, non il codice definitivo.

### Indirizzi

```ts
type MacAddress = string;   // "02:00:00:00:00:01"
type Ipv4Address = string;  // "192.168.1.10"

const BROADCAST_MAC: MacAddress = "ff:ff:ff:ff:ff:ff";
```

Gli indirizzi MAC sono assegnati dal motore in sequenza alla creazione di ogni porta, quindi sono unici e sempre uguali a parità di rete.

### Rete, dispositivi, collegamenti

```ts
interface Network {
  devices: Device[];
  links: Link[];
}

interface Port {
  name: string;        // "Fa0/1"
  mac: MacAddress;
  enabled: boolean;    // false = porta spenta
}

interface Link {
  id: string;
  a: PortRef;          // { deviceId, portName }
  b: PortRef;
  connected: boolean;  // false = cavo staccato
}

type Device = Host | Switch | Router;
```

Ogni dispositivo ha una parte di **configurazione**, impostata dall'utente, e una parte di **stato di esecuzione**, che si riempie mentre la rete funziona.

```ts
interface Host {
  kind: "host";
  id: string;
  name: string;
  powered: boolean;
  ports: Port[];       // un PC ne ha una sola
  // configurazione
  ip: Ipv4Address | null;
  mask: Ipv4Address | null;
  gateway: Ipv4Address | null;
  // stato di esecuzione
  arpTable: Map<Ipv4Address, MacAddress>;
  nextEchoSequence: number;          // numero di sequenza del prossimo ping
  pendingPackets: PendingPacket[];   // in attesa della risposta ARP, ciascuno con il suo prossimo salto
}

interface Switch {
  kind: "switch";
  id: string;
  name: string;
  powered: boolean;
  ports: Port[];
  // stato di esecuzione
  macTable: Map<MacAddress, string>;  // MAC -> nome della porta
}
```

Il router arriva nel rilascio 2: ha più porte, ciascuna con il proprio indirizzo IP, una tabella ARP e una tabella di routing.

### Frame e pacchetti

L'incapsulamento è rappresentato alla lettera: ogni unità contiene quella del livello superiore nel campo `payload`. È la stessa struttura che l'interfaccia mostra a strati annidati (requisito VIS-2).

```ts
interface EthernetFrame {
  dstMac: MacAddress;
  srcMac: MacAddress;
  etherType: "ARP" | "IPv4";
  payload: ArpPacket | Ipv4Packet;
}

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
  ttl: number;
  protocol: "ICMP";               // poi anche "TCP" e "UDP"
  payload: IcmpMessage;
}

interface IcmpMessage {
  type: "echo-request" | "echo-reply";
  identifier: number;
  sequence: number;
}
```

## Tempo, eventi, tracce

### Tempo simulato

Il tempo è un numero intero di **tick**, che parte da zero. Attraversare un collegamento richiede sempre 1 tick. Il tick non corrisponde a una durata reale: è l'interfaccia a decidere quanto dura sullo schermo (per esempio un secondo a velocità normale), ed è così che si regola la velocità (SIM-3).

Usare un tempo astratto evita un problema: con i tempi veri, un pacchetto attraversa una LAN in meno di un millisecondo e un ping scade dopo quattro secondi. Rallentando il primo perché sia visibile, il secondo durerebbe più di un'ora.

### Eventi

Un evento è un fatto futuro con il suo istante.

```ts
type SimEvent =
  | { time: number; kind: "frame-arrival"; to: PortRef; frame: EthernetFrame; conversationId: number }
  | { time: number; kind: "timer"; deviceId: string; timer: TimerKind };
```

- `frame-arrival`: un frame arriva a una porta.
- `timer`: scade un'attesa, per esempio quella di una risposta ARP o di un echo reply.

La coda è ordinata per istante. A parità di istante vale l'ordine di inserimento, così il risultato è sempre lo stesso.

### Un passo

Un passo elabora **tutti gli eventi del prossimo istante**, non uno solo. Quando uno switch inoltra un broadcast su tre porte, i tre frame viaggiano insieme e arrivano insieme: in passo-passo il docente li vede muoversi nello stesso clic, come accade nella realtà.

### Tracce

Mentre elabora un passo, il motore registra ciò che accade in un elenco di tracce. L'interfaccia le legge per animare i pacchetti, aggiornare le tabelle e riempire l'elenco degli eventi (VIS-9).

```ts
type Trace =
  | { time: number; kind: "frame-sent"; from: PortRef; to: PortRef; frame: EthernetFrame; conversationId: number }
  | { time: number; kind: "frame-received"; at: PortRef; frame: EthernetFrame; conversationId: number }
  | { time: number; kind: "frame-dropped"; at: PortRef; frame: EthernetFrame; reason: DropReason; conversationId: number }
  | { time: number; kind: "table-changed"; deviceId: string; table: "mac" | "arp" };
```

Il campo `reason` di un frame scartato serve ai test. L'interfaccia mostra che il frame è stato scartato, ma non ne spiega la causa: l'app si comporta come una rete vera (requisito SIM-8).

### Conversazioni

Ogni azione dell'utente che genera traffico riceve un numero di conversazione. Tutto ciò che nasce elaborando un frame eredita il numero di quel frame. Così la richiesta ARP causata da un ping appartiene alla stessa conversazione del ping, e l'interfaccia può mostrare solo quella (VIS-5).

## Comportamento dei dispositivi

### Host: inviare un pacchetto IP

1. La destinazione è nella mia stessa rete? Si confrontano indirizzo e maschera.
   - Sì: il prossimo salto è la destinazione stessa.
   - No, e ho un gateway: il prossimo salto è il gateway.
   - No, e non ho un gateway: l'invio fallisce subito e non parte alcun frame.
2. Conosco il MAC del prossimo salto? Si guarda la tabella ARP.
   - Sì: si incapsula il pacchetto in un frame e lo si invia.
   - No: il pacchetto va in attesa, parte una richiesta ARP in broadcast e si avvia un timer.
3. Arriva la risposta ARP: si aggiorna la tabella e si inviano i pacchetti in attesa.
4. Scade il timer senza risposta: i pacchetti in attesa vengono scartati.

### Host: ricevere un frame

1. Il MAC di destinazione è il mio o è il broadcast? Altrimenti il frame viene scartato.
2. Se contiene ARP:
   - richiesta per il mio IP: registro il mittente nella tabella ARP e rispondo, in unicast;
   - richiesta per un altro IP: scarto;
   - risposta: aggiorno la tabella ARP.
3. Se contiene IPv4 destinato al mio indirizzo:
   - echo request: rispondo con un echo reply;
   - echo reply: lo consegno al ping che lo aspettava.

### Ping

Il comando `ping` invia quattro echo request, uno dopo l'altro, come su Windows. Per ciascuno attende l'echo reply fino allo scadere di un timer, poi stampa l'esito e passa al successivo.

### Switch

Per ogni frame ricevuto su una porta:

1. **Apprendimento.** Registra nella tabella MAC che l'indirizzo sorgente si raggiunge da quella porta.
2. **Decisione.**
   - Destinazione broadcast, oppure sconosciuta: inoltra su tutte le porte attive tranne quella di arrivo (flooding).
   - Destinazione nota su un'altra porta: inoltra solo lì.
   - Destinazione nota sulla porta di arrivo: scarta.

La decisione è una funzione pura: riceve il frame, la porta di arrivo e la tabella, restituisce l'elenco delle porte di uscita.

### Guasti

- **Cavo staccato o porta spenta:** un frame inviato su quella porta non parte. Un frame già in viaggio su un cavo che viene staccato va perso.
- **Dispositivo spento:** non invia e non riceve. Alla riaccensione le sue tabelle sono vuote.

## Semplificazioni

Il motore segue il comportamento normale dei protocolli e tralascia il resto. Questo elenco va tenuto aggiornato: dice agli studenti dove la simulazione si allontana dalla realtà.

| Che cosa | Nella realtà | In net-sim |
| --- | --- | --- |
| Tabella ARP | Le voci scadono dopo qualche minuto | Restano finché il dispositivo è acceso |
| Tabella MAC | Le voci scadono dopo 5 minuti | Restano finché lo switch è acceso o il cavo è collegato |
| Richiesta ARP ricevuta da chi non è il destinatario | Può aggiornare una voce già presente | Viene scartata senza effetti |
| ARP gratuito, rilevamento di indirizzi duplicati | Presenti | Assenti |
| Checksum e FCS | Calcolati e verificati | Assenti: i frame non si corrompono |
| Collisioni, velocità, duplex | Dipendono dal mezzo fisico | Assenti: ogni collegamento è punto-punto e senza errori |
| Dimensione dei frame, MTU, frammentazione | Presenti | Assenti |
| Durata dei percorsi | Variabile | 1 tick per collegamento |
| Ping | Windows manda quattro echo request, a un secondo l'uno dall'altro | Un solo echo request |
| Richiesta ARP senza risposta | Viene ripetuta alcune volte, poi i pacchetti in attesa sono scartati | Non viene ripetuta: dopo 20 tick i pacchetti in attesa sono scartati |
| Spanning tree | Elimina i cicli tra switch | Assente (vedi sotto) |

### Cicli tra switch

Senza spanning tree, due switch collegati ad anello fanno girare un broadcast all'infinito e lo moltiplicano. È ciò che accade davvero, e mostrarlo ha valore didattico, ma non deve bloccare l'app.

Proposta: lasciare che la tempesta di broadcast avvenga e sospendere la simulazione quando i frame in viaggio superano una soglia, segnalando la sospensione. *Punto aperto.*

## Come si aggiunge un protocollo

L'ordine è sempre lo stesso, ed è quello che seguirà chi estende il motore con VLAN, TCP o IPv6:

1. Si definisce il tipo dell'unità dati in `model/`.
2. Si scrive il comportamento in un nuovo file di `protocols/`.
3. Si collega il protocollo ai dispositivi che lo usano, in `devices/`.
4. Si scrivono i test in `tests/engine/`.
5. Si aggiorna la tabella delle semplificazioni qui sopra.

## Come si prova

Ogni test costruisce una rete, compie un'azione e controlla le tracce o lo stato finale. Schizzo:

```ts
test("lo switch inoltra in flooding quando non conosce la destinazione", () => {
  const net = buildLan({ hosts: 3 });        // SW1 con PC1, PC2, PC3
  const sim = createSimulator(net);

  sim.dispatch(ping("PC1", "192.168.1.11"));
  sim.step();                                // la richiesta ARP arriva a SW1, che la inoltra subito

  expect(framesSentBy(sim, "SW1")).toHaveLength(2);     // verso PC2 e PC3, non verso PC1
  expect(macTableOf(sim, "SW1")).toContainEntry(macOf("PC1"), "Fa0/1");
});
```

Il criterio di accettazione del rilascio 1 in [SPEC.md](../SPEC.md) diventa, passo per passo, una serie di test di questo tipo.
