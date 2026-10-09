// Gli indirizzi sono semplici stringhe, scritte come sul libro di testo.

export type MacAddress = string; // "02:00:00:00:00:01"
export type Ipv4Address = string; // "192.168.1.10"

// Un frame con questo MAC di destinazione è diretto a tutti i dispositivi della LAN.
export const BROADCAST_MAC: MacAddress = "ff:ff:ff:ff:ff:ff";
