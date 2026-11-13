// L'albero dei comandi della CLI, modalità per modalità.
//
// È scritto come dati: ogni riga dice una parola, la sua descrizione e che
// cosa può seguirla. Per aggiungere un comando basta aggiungere un ramo;
// il resto dell'interprete (abbreviazioni, errori, `?`, Tab) lo trova da sé.
// I comandi dei protocolli di routing (RIP, OSPF) arriveranno così: una
// modalità in più e i suoi rami.
//
// Le descrizioni sono in inglese, come sugli apparati.

import { argument, keyword, type Command, type CommandNode, type ShowTopic } from "./grammar";
import type { Mode } from "./modes";

const show = (topic: ShowTopic) => (): Command => ({ kind: "show", topic });
const save = (): Command => ({ kind: "save" });

// `show ...`. In modalità utente la configurazione non si può leggere.
function showCommands(withConfiguration: boolean): CommandNode {
  const configuration = [
    keyword("running-config", "Configuration in use", { command: show("running-config") }),
    keyword("startup-config", "Configuration saved for the next startup", { command: show("startup-config") }),
  ];
  return keyword("show", "Display information about the device", {
    next: [
      ...(withConfiguration ? configuration : []),
      keyword("ip", "IP information", {
        next: [
          keyword("interface", "Interfaces with their addresses", {
            next: [keyword("brief", "One line per interface", { command: show("ip-interface-brief") })],
          }),
          keyword("route", "Routing table", { command: show("ip-route"), only: "router" }),
        ],
      }),
      keyword("arp", "ARP table", { command: show("arp") }),
      keyword("interfaces", "Status of the interfaces", { command: show("interfaces") }),
      keyword("mac", "MAC addresses", {
        only: "switch",
        next: [keyword("address-table", "MAC address table", { command: show("mac-address-table") })],
      }),
      keyword("vlan", "VLAN status", {
        only: "switch",
        next: [keyword("brief", "One line per VLAN", { command: show("vlan-brief") })],
      }),
    ],
  });
}

// `ping` e `traceroute`, che partono dal router.
const PROBES: CommandNode[] = [
  keyword("ping", "Send echo requests", {
    only: "router",
    next: [argument("address", "Destination address", { command: ([target]) => ({ kind: "ping", target }) })],
  }),
  keyword("traceroute", "Trace the route to a destination", {
    only: "router",
    next: [argument("address", "Destination address", { command: ([target]) => ({ kind: "traceroute", target }) })],
  }),
];

// `copy running-config startup-config` e `write memory`: l'abitudine di
// salvare. Qui non c'è una configurazione di avvio separata (D-92).
const SAVING: CommandNode[] = [
  keyword("copy", "Copy a configuration", {
    next: [
      keyword("running-config", "Copy from the configuration in use", {
        next: [keyword("startup-config", "Copy to the startup configuration", { command: save })],
      }),
    ],
  }),
  keyword("write", "Save the configuration in use", {
    command: save,
    next: [keyword("memory", "Save to the startup configuration", { command: save })],
  }),
];

const EXIT = keyword("exit", "Go back to the previous mode", { command: () => ({ kind: "exit" }) });
const END = keyword("end", "Go back to privileged mode", { command: () => ({ kind: "end" }) });

const USER: CommandNode[] = [
  keyword("enable", "Enter privileged mode", { command: () => ({ kind: "enable" }) }),
  keyword("exit", "Leave the command line", { command: () => ({ kind: "exit" }) }),
  ...PROBES,
  showCommands(false),
];

const PRIVILEGED: CommandNode[] = [
  keyword("configure", "Enter configuration mode", {
    next: [keyword("terminal", "Configure from this terminal", { command: () => ({ kind: "configure" }) })],
  }),
  ...SAVING,
  keyword("disable", "Go back to user mode", { command: () => ({ kind: "disable" }) }),
  keyword("enable", "Enter privileged mode", { command: () => ({ kind: "enable" }) }),
  keyword("exit", "Leave the command line", { command: () => ({ kind: "exit" }) }),
  ...PROBES,
  showCommands(true),
];

// `do`: un comando della modalità privilegiata, senza uscire dalla
// configurazione. Non quelli che cambiano modalità.
const DO = keyword("do", "Run a privileged command from here", {
  next: [...SAVING, ...PROBES, showCommands(true)],
});

// rete, maschera, prossimo salto: gli argomenti di una rotta statica.
function routeArguments(kind: "ip-route" | "no-ip-route"): CommandNode[] {
  const command = ([network, mask, nextHop]: string[]): Command => ({ kind, network, mask, nextHop });
  return [
    argument("address", "Destination network", {
      next: [argument("address", "Network mask", { next: [argument("address", "Next hop address", { command })] })],
    }),
  ];
}

const CONFIG: CommandNode[] = [
  DO,
  END,
  EXIT,
  keyword("hostname", "Set the name of the device", {
    next: [argument("word", "Name of the device", { command: ([name]) => ({ kind: "hostname", name }) })],
  }),
  keyword("interface", "Select an interface to configure", {
    next: [argument("interface", "", { command: ([name]) => ({ kind: "interface", name }) })],
  }),
  keyword("ip", "IP configuration", {
    only: "router",
    next: [keyword("route", "Add a static route", { next: routeArguments("ip-route") })],
  }),
  // `vlan 10`: crea la VLAN, se non c'è, e porta a configurarla.
  keyword("vlan", "Create a VLAN and configure it", {
    only: "switch",
    next: [argument("vlan-id", "VLAN number", { command: ([id]) => ({ kind: "vlan", id: Number(id) }) })],
  }),
  keyword("no", "Remove a setting", {
    next: [
      keyword("ip", "IP configuration", {
        only: "router",
        next: [keyword("route", "Remove a static route", { next: routeArguments("no-ip-route") })],
      }),
      keyword("vlan", "Delete a VLAN", {
        only: "switch",
        next: [argument("vlan-id", "VLAN number", { command: ([id]) => ({ kind: "no-vlan", id: Number(id) }) })],
      }),
    ],
  }),
];

const noIpAddress = (): Command => ({ kind: "no-ip-address" });

// I comandi che valgono solo dentro un'interfaccia.
const INTERFACE_ONLY: CommandNode[] = [
  keyword("ip", "IP configuration", {
    only: "router",
    next: [
      keyword("address", "Set the address of the interface", {
        next: [
          argument("address", "IP address", {
            next: [argument("address", "Subnet mask", { command: ([ip, mask]) => ({ kind: "ip-address", ip, mask }) })],
          }),
        ],
      }),
    ],
  }),
  keyword("no", "Remove a setting", {
    next: [
      keyword("ip", "IP configuration", {
        only: "router",
        next: [
          // L'indirizzo da togliere si può scrivere oppure no.
          keyword("address", "Remove the address of the interface", {
            command: noIpAddress,
            next: [
              argument("address", "IP address", {
                next: [argument("address", "Subnet mask", { command: noIpAddress })],
              }),
            ],
          }),
        ],
      }),
      keyword("shutdown", "Turn the interface on", { command: () => ({ kind: "no-shutdown" }) }),
      keyword("switchport", "Set the VLAN of a switch port", {
        only: "switch",
        next: [
          keyword("access", "Settings of an access port", {
            next: [
              keyword("vlan", "Put the port back in VLAN 1", {
                command: () => ({ kind: "no-switchport-access-vlan" }),
              }),
            ],
          }),
        ],
      }),
    ],
  }),
  keyword("shutdown", "Turn the interface off", { command: () => ({ kind: "shutdown" }) }),
  // Le porte di uno switch sono tutte access: `switchport mode access` si
  // accetta, ma non cambia nulla. Le porte trunk non ci sono ancora.
  keyword("switchport", "Set the VLAN of a switch port", {
    only: "switch",
    next: [
      keyword("mode", "Set the mode of the port", {
        next: [keyword("access", "Access port, in a single VLAN", { command: () => ({ kind: "switchport-mode-access" }) })],
      }),
      keyword("access", "Settings of an access port", {
        next: [
          keyword("vlan", "Set the VLAN of the port", {
            next: [
              argument("vlan-id", "VLAN number", {
                command: ([id]) => ({ kind: "switchport-access-vlan", id: Number(id) }),
              }),
            ],
          }),
        ],
      }),
    ],
  }),
];

// Dentro un'interfaccia valgono anche i comandi della configurazione
// globale: si può passare a un'altra interfaccia, o aggiungere una rotta,
// senza prima uscire.
const CONFIG_IF: CommandNode[] = merge(INTERFACE_ONLY, CONFIG);

// I comandi che valgono solo dentro una VLAN (`vlan 10`). Come dentro
// un'interfaccia, valgono anche quelli della configurazione globale.
const VLAN_ONLY: CommandNode[] = [
  keyword("name", "Set the name of the VLAN", {
    next: [argument("word", "Name of the VLAN, up to 32 characters", { command: ([name]) => ({ kind: "vlan-name", name }) })],
  }),
  keyword("no", "Remove a setting", {
    next: [keyword("name", "Give the VLAN back its default name", { command: () => ({ kind: "no-vlan-name" }) })],
  }),
];

const CONFIG_VLAN: CommandNode[] = merge(VLAN_ONLY, CONFIG);

/**
 * Dice quali comandi si possono scrivere in una modalità.
 *
 * @param mode - la modalità
 * @returns le parole con cui una riga può cominciare, ciascuna con ciò
 *   che può seguirla; comprende i nodi riservati a un tipo di dispositivo
 */
export function commandsFor(mode: Mode): CommandNode[] {
  switch (mode) {
    case "user":
      return USER;
    case "privileged":
      return PRIVILEGED;
    case "config":
      return CONFIG;
    case "config-if":
      return CONFIG_IF;
    case "config-vlan":
      return CONFIG_VLAN;
  }
}

// Unisce due elenchi di nodi in uno, in ordine alfabetico come li elenca
// `?`. Una parola chiave presente in entrambi ("ip", "no") diventa un nodo
// solo, che porta con sé ciò che la seguiva nell'uno e nell'altro.
function merge(first: CommandNode[], second: CommandNode[]): CommandNode[] {
  const merged = [...first];
  for (const node of second) {
    const index = merged.findIndex((other) => sameKeyword(other, node));
    if (index === -1) {
      merged.push(node);
      continue;
    }
    const other = merged[index];
    merged[index] = { ...other, next: merge(other.next, node.next), command: other.command ?? node.command };
  }
  return merged.sort((a, b) => wordOf(a).localeCompare(wordOf(b)));
}

function sameKeyword(a: CommandNode, b: CommandNode): boolean {
  return a.token.kind === "keyword" && b.token.kind === "keyword" && a.token.word === b.token.word;
}

function wordOf(node: CommandNode): string {
  return node.token.kind === "keyword" ? node.token.word : "";
}
