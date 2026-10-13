// Di che cosa è fatto un comando della CLI.
//
// Un comando è una fila di parole: parole chiave ("show", "ip", "route") e
// argomenti (un indirizzo, un nome, un'interfaccia). Dopo ogni parola ne
// possono seguire solo alcune: i comandi formano quindi un albero, che si
// percorre una parola alla volta. È lo stesso albero a rispondere a `?`
// e a completare con Tab.
//
// Qui ci sono i tipi; l'albero vero e proprio sta in commands.ts.

// Che cosa l'interprete deve sapere del dispositivo su cui gira.
export interface DeviceInfo {
  kind: "router" | "switch";
  name: string;
  // I nomi brevi delle sue interfacce: "Gi0/0", "Fa0/1".
  interfaces: string[];
}

// Che cosa si può guardare con `show`.
export type ShowTopic =
  | "running-config"
  | "startup-config"
  | "ip-interface-brief"
  | "ip-route"
  | "arp"
  | "interfaces"
  | "mac-address-table";

// Che cosa l'utente ha chiesto, una volta capita la riga.
export type Command =
  // Cambi di modalità.
  | { kind: "enable" }
  | { kind: "disable" }
  | { kind: "configure" }
  | { kind: "interface"; name: string } // nome breve: "Gi0/0"
  | { kind: "exit" }
  | { kind: "end" }
  // Configurazione.
  | { kind: "hostname"; name: string }
  | { kind: "ip-address"; ip: string; mask: string }
  | { kind: "no-ip-address" }
  | { kind: "shutdown" }
  | { kind: "no-shutdown" }
  | { kind: "ip-route"; network: string; mask: string; nextHop: string }
  | { kind: "no-ip-route"; network: string; mask: string; nextHop: string }
  // Guardare e provare.
  | { kind: "show"; topic: ShowTopic }
  | { kind: "ping"; target: string }
  | { kind: "traceroute"; target: string }
  // `copy running-config startup-config` e `write memory`.
  | { kind: "save" };

// Una parola di un comando.
export type Token =
  // Una parola fissa, che si può abbreviare.
  | { kind: "keyword"; word: string }
  // Un indirizzo IPv4 o una maschera: quattro numeri separati da punti.
  | { kind: "address" }
  // Un testo qualsiasi senza spazi, per esempio un nome.
  | { kind: "word" }
  // Un'interfaccia del dispositivo.
  | { kind: "interface" };

// Un nodo dell'albero dei comandi: una parola, e ciò che può seguirla.
export interface CommandNode {
  token: Token;
  // La descrizione che compare dopo `?`.
  help: string;
  // Le parole che possono seguire questa.
  next: CommandNode[];
  // Se c'è, la riga può finire qui: costruisce il comando dagli argomenti
  // incontrati lungo la strada, nell'ordine in cui sono stati scritti.
  command?: (values: string[]) => Command;
  // Se c'è, il nodo esiste solo su quel tipo di dispositivo.
  only?: DeviceInfo["kind"];
}

// Ciò che di un nodo si può non dire, quando lo si scrive nell'albero.
type Rest = Partial<Pick<CommandNode, "next" | "command" | "only">>;

/**
 * Crea il nodo di una parola chiave.
 *
 * @param word - la parola, in minuscolo
 * @param help - la descrizione che compare dopo `?`
 * @param rest - che cosa può seguire, il comando se la riga può finire
 *   qui, e l'eventuale tipo di dispositivo a cui il nodo è riservato
 */
export function keyword(word: string, help: string, rest: Rest = {}): CommandNode {
  return { token: { kind: "keyword", word }, help, next: [], ...rest };
}

/**
 * Crea il nodo di un argomento.
 *
 * @param kind - che cosa ci si aspetta: un indirizzo, un testo, un'interfaccia
 * @param help - la descrizione che compare dopo `?`
 * @param rest - come per `keyword`
 */
export function argument(kind: Exclude<Token["kind"], "keyword">, help: string, rest: Rest = {}): CommandNode {
  return { token: { kind }, help, next: [], ...rest };
}
