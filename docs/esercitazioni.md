# Le reti di esempio: guida per il docente

**Stato:** descrive gli esempi al 16 novembre 2026.

Le reti di esempio stanno in `examples/` e si aprono con **Apri**, come qualsiasi file. Questo documento è per chi insegna: dice a che cosa serve ciascuna rete e, per le esercitazioni, dove sono gli errori. L'app non lo mostra mai, e i file delle esercitazioni non contengono la soluzione.

| File | A che cosa serve |
| --- | --- |
| `due-pc.netsim.json` | Due PC e un cavo: il primo ping, ARP |
| `lan-switch.netsim.json` | Una LAN con uno switch: la tabella MAC, il flooding |
| `anello-switch.netsim.json` | Tre switch ad anello: la tempesta di broadcast |
| `due-lan-router.netsim.json` | Due LAN e un router: il gateway |
| `tre-reti-due-router.netsim.json` | Tre reti e due router: le rotte statiche |
| `vlan-due-gruppi.netsim.json` | Uno switch diviso in VLAN 10 e 20, da mostrare alla LIM |
| `vlan-esercitazione.netsim.json` | La stessa rete senza VLAN, con la consegna in una nota: da dividere |
| `trunk-due-switch.netsim.json` | Due switch uniti da un trunk 802.1Q che porta le VLAN 10 e 20, da mostrare alla LIM |
| `trunk-esercitazione.netsim.json` | La stessa rete con due errori di configurazione, da trovare e correggere |

## Trunk tra due switch (`trunk-due-switch`)

SW1 e SW2, da 24 porte, sono uniti tra le Fa0/24. PC1 (192.168.1.10) e PC3 (192.168.1.12) stanno nella VLAN 10 STUDENTI, sulle Fa0/1; PC2 (192.168.1.11) e PC4 (192.168.1.13) nella VLAN 20 DOCENTI, sulle Fa0/2. Le Fa0/24 sono trunk con la VLAN nativa 1 e le sole VLAN 10 e 20 consentite.

Che cosa mostrare:

- `ping` da PC1 a PC3 risponde, da PC1 a PC4 no: stessa sottorete IP, VLAN diverse;
- con **Passo** e un clic sui pacchetti: l'ARP di PC1 esce senza tag, sul cavo tra gli switch ha la riga «Tag 802.1Q · VLAN 10», verso PC3 è di nuovo senza tag. Negli eventi, «SW1: invia ARP request dalla porta Fa0/24 con tag VLAN 10»;
- su SW1, `show interfaces trunk`: le VLAN consentite (10,20) e quelle consentite e configurate; `show mac address-table` dopo i ping: Fa0/24 compare nella VLAN 10 e nella 20;
- nel pannello dello switch: la porta Fa0/24 «Trunk 802.1Q», e i dettagli con nativa, VLAN consentite e VLAN che passano davvero.

## Esercitazione sui trunk (`trunk-esercitazione`)

La rete è la stessa, e la consegna nella nota dice che cosa deve funzionare: PC1 ↔ PC3 nella VLAN 10, PC2 ↔ PC4 nella VLAN 20, le due VLAN isolate. Ci sono **due errori indipendenti**, entrambi su SW2. Si possono trovare e correggere in qualsiasi ordine, e correggere uno solo lascia visibile l'altro.

### Errore 1: la VLAN 20 non è consentita sul trunk di SW2

- **Configurazione sbagliata:** su SW2, `switchport trunk allowed vlan 10` sulla Fa0/24 (SW1 consente 10 e 20).
- **Sintomo:** PC2 non raggiunge PC4 (`Destination host unreachable`). L'ARP di PC2 parte da SW1 sul trunk con il tag VLAN 20, e SW2 lo scarta.
- **Diagnosi:** su SW2 `show interfaces trunk` mostra «Vlans allowed on trunk: 10» e, nel blocco successivo, solo la 10; confrontato con SW1, che consente 10 e 20. Anche `show running-config` (` switchport trunk allowed vlan 10`) o il pannello di SW2 («trunk · nativa 1 · VLAN 10»). Negli eventi SW2 «scarta ARP request» appena arriva il frame con il tag 20.
- **Correzione:** su SW2, `interface fa0/24`, `switchport trunk allowed vlan add 20` (oppure `allowed vlan 10,20`), o nei dettagli del trunk la casella «20 · DOCENTI».
- **Perché funziona:** un trunk lascia passare, nei due sensi, solo le VLAN consentite; ora la 20 è consentita ai due capi.

### Errore 2: la porta di PC3 è nella VLAN sbagliata

- **Configurazione sbagliata:** su SW2 la Fa0/1, dove sta PC3, è access nella VLAN 20 invece che nella 10.
- **Sintomo:** PC1 non raggiunge PC3. In più PC3 raggiunge PC4, che dovrebbe stare in un'altra VLAN; e, corretto l'errore 1, PC3 raggiunge anche PC2: le VLAN non sono isolate come chiede la consegna.
- **Diagnosi:** su SW2 `show vlan brief` elenca Fa0/1 e Fa0/2 nella VLAN 20 e nessuna porta nella 10; `show interfaces fa0/1 switchport` dice «Access Mode VLAN: 20 (DOCENTI)». Dopo un ping da PC3, `show mac address-table` mostra il MAC di PC3 nella VLAN 20. Nel pannello di SW2 la sezione VLAN dice per la 10 «nessuna porta».
- **Correzione:** su SW2, `interface fa0/1`, `switchport access vlan 10`, oppure nel pannello l'elenco della Fa0/1 su «10 · STUDENTI».
- **Perché funziona:** una porta access mette i frame del PC nella sua VLAN; PC3 torna nella VLAN di PC1.

### Verifica finale

Con le due correzioni: PC1 → PC3 e PC2 → PC4 rispondono; PC1 → PC2, PC1 → PC4, PC3 → PC2 e PC3 → PC4 no. In `show mac address-table` di SW1, dopo i ping, Fa0/24 compare con il MAC di PC3 nella VLAN 10 e con quello di PC4 nella VLAN 20. Nessun'altra modifica è necessaria: lo verifica `tests/storage/examples-trunk.test.ts`.
