// I nomi delle interfacce, come si scrivono e come si leggono.
//
// Nel modello un'interfaccia ha un nome breve: "Gi0/0", "Fa0/1". IOS la
// stampa per esteso (GigabitEthernet0/0) e la lascia scrivere abbreviata,
// con o senza spazio prima del numero: gi0/0, g0/0, gigabitEthernet 0/0.

// I tipi di interfaccia: nome per esteso, sigla del modello, descrizione.
const TYPES = [
  { full: "GigabitEthernet", short: "Gi", help: "Gigabit Ethernet interface" },
  { full: "FastEthernet", short: "Fa", help: "Fast Ethernet interface" },
];

// Che cosa si è capito di un nome di interfaccia scritto dall'utente.
export type InterfaceMatch =
  // È un'interfaccia del dispositivo: `name` è il nome breve.
  | { ok: true; name: string }
  // Non lo è: `offset` dice a quale carattere del testo comincia l'errore.
  | { ok: false; offset: number };

/**
 * Riconosce un nome di interfaccia scritto dall'utente.
 *
 * @param text - il testo, senza spazi: "gi0/0", "GigabitEthernet0/1", "fa0/3"
 * @param interfaces - i nomi brevi delle interfacce che il dispositivo ha
 * @returns il nome breve dell'interfaccia, oppure il punto in cui il testo
 *   smette di essere giusto: il tipo, se non esiste, o il numero, se il
 *   dispositivo non ha quell'interfaccia
 */
export function matchInterface(text: string, interfaces: string[]): InterfaceMatch {
  const parts = /^([a-z]+)(\d[\d/]*)?$/.exec(text.toLowerCase());
  if (parts === null) return { ok: false, offset: 0 };
  const [, letters, number] = parts;

  const types = TYPES.filter((type) => type.full.toLowerCase().startsWith(letters));
  if (types.length !== 1) return { ok: false, offset: 0 };

  const name = `${types[0].short}${number ?? ""}`;
  if (!interfaces.includes(name)) return { ok: false, offset: letters.length };
  return { ok: true, name };
}

/**
 * Scrive per esteso il nome di un'interfaccia, come fa IOS quando la stampa.
 *
 * @param name - il nome breve del modello, per esempio "Gi0/0"
 * @returns il nome per esteso, "GigabitEthernet0/0"; il nome com'è, se il
 *   tipo non è tra quelli conosciuti
 */
export function fullInterfaceName(name: string): string {
  const type = TYPES.find((t) => name.startsWith(t.short));
  return type === undefined ? name : `${type.full}${name.slice(type.short.length)}`;
}

/**
 * Elenca i tipi di interfaccia che un dispositivo ha: è ciò che l'aiuto
 * propone dopo `interface ?`.
 *
 * @param interfaces - i nomi brevi delle interfacce del dispositivo
 * @returns per ogni tipo presente, il nome per esteso e la descrizione
 */
export function interfaceTypesOf(interfaces: string[]): { full: string; help: string }[] {
  return TYPES.filter((type) => interfaces.some((name) => name.startsWith(type.short))).map(
    ({ full, help }) => ({ full, help }),
  );
}
