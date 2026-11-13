// Le modalità della CLI in stile IOS.
//
// Su un router o uno switch non tutti i comandi valgono sempre: si entra
// per gradi, e il prompt dice a che punto si è.
//
//   R1>              modalità utente: si guarda soltanto
//   R1#              modalità privilegiata (`enable`): si guarda tutto
//   R1(config)#      configurazione globale (`configure terminal`)
//   R1(config-if)#   configurazione di un'interfaccia (`interface ...`)
//   SW1(config-vlan)# configurazione di una VLAN di uno switch (`vlan 10`)

export type Mode = "user" | "privileged" | "config" | "config-if" | "config-vlan";

// A che punto è una sessione della CLI.
export interface CliState {
  mode: Mode;
  // L'interfaccia che si sta configurando, con il nome breve del modello
  // ("Gi0/0"); null fuori dalla modalità config-if.
  interfaceName: string | null;
  // La VLAN che si sta configurando; c'è solo nella modalità config-vlan.
  vlanId?: number;
}

// Una sessione appena aperta: modalità utente, senza password.
export const INITIAL_STATE: CliState = { mode: "user", interfaceName: null };

/**
 * Scrive il prompt di una modalità.
 *
 * @param deviceName - il nome del dispositivo, quello impostato con `hostname`
 * @param mode - la modalità in cui si trova la sessione
 * @returns il prompt, senza spazio finale: per esempio "R1(config)#"
 */
export function promptOf(deviceName: string, mode: Mode): string {
  switch (mode) {
    case "user":
      return `${deviceName}>`;
    case "privileged":
      return `${deviceName}#`;
    case "config":
      return `${deviceName}(config)#`;
    case "config-if":
      return `${deviceName}(config-if)#`;
    case "config-vlan":
      return `${deviceName}(config-vlan)#`;
  }
}
