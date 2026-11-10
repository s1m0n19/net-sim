// Le misure di un dispositivo sul disegno, e di ciò che gli sta attorno:
// riquadro, icona, scritte, pallini del segnale, nomi delle porte,
// indirizzi dei router, buste in viaggio, barretta delle azioni.
//
// Stanno tutte qui perché dipendono l'una dall'altra: un pallino del
// segnale sta appena fuori dal riquadro, un nome di porta appena dopo il
// pallino. Cambiare la grandezza dei dispositivi è cambiare questo file.
//
// Ci sono due serie di misure. Nell'editor i dispositivi sono compatti,
// perché il disegno respiri anche con una rete piccola; in presentazione
// restano quelli di prima, più grandi, perché si leggano dal fondo
// dell'aula (e lì crescono ancora con l'ingrandimento).

/** Le misure di un dispositivo, in unità del disegno (prima dell'ingrandimento). */
export interface DeviceShape {
  /** Metà della larghezza del riquadro di un PC o di un server. */
  hostHalfWidth: number;
  /** Metà della larghezza del riquadro di uno switch o di un router, un po' più largo. */
  otherHalfWidth: number;
  /** Metà dell'altezza del riquadro, uguale per tutti. */
  halfHeight: number;
  /** Il raggio degli angoli del riquadro. */
  cornerRadius: number;
  /** Di quanto si riduce l'icona, disegnata per il riquadro grande. */
  iconScale: number;
  /** Lo spazio tra il riquadro e il contorno della selezione. */
  selectionMargin: number;
  /** La linea di base del nome, sotto il riquadro. */
  nameY: number;
  /** La grandezza del nome, in pixel. */
  nameSize: number;
  /** La linea di base della prima scritta sotto il nome (l'indirizzo IP di un host). */
  firstLineY: number;
  /** Di quanto scende ogni scritta successiva (il MAC). */
  lineStep: number;
  /** Quanto dista dal centro del dispositivo il pallino del segnale, lungo il cavo. */
  signalDistance: number;
  /** Quanto dista dal centro il nome della porta, lungo il cavo. */
  portLabelDistance: number;
  /** Quanto dista dal centro del router l'inizio del suo indirizzo, lungo il cavo. */
  addressDistance: number;
  /** Da quanto lontano dal centro parte e arriva una busta, per non coprire l'icona. */
  packetEdge: number;
  /** Dove sta l'indicatore di attesa, rispetto al centro: in alto a destra. */
  waitOffset: { x: number; y: number };
  /** Dove si appoggia la barretta delle azioni sopra il dispositivo (il bordo della selezione). */
  barTop: number;
  /** Dove si appoggia la barretta sotto il dispositivo, sotto le sue scritte. */
  barBottom: number;
}

/**
 * Le misure dell'editor (D-127): PC largo 44, switch e router larghi 50,
 * tutti alti 44. Le distanze attorno si accorciano quanto il riquadro.
 */
export const EDITOR_SHAPE: DeviceShape = {
  hostHalfWidth: 22,
  otherHalfWidth: 25,
  halfHeight: 22,
  cornerRadius: 9,
  iconScale: 0.85,
  selectionMargin: 5,
  nameY: 41,
  nameSize: 13,
  firstLineY: 56,
  lineStep: 15,
  signalDistance: 36,
  portLabelDistance: 54,
  addressDistance: 46,
  packetEdge: 40,
  waitOffset: { x: 30, y: -26 },
  barTop: -27,
  barBottom: 60,
};

/**
 * Le misure della presentazione: quelle di prima, PC largo 52, switch e
 * router larghi 60, tutti alti 52. L'ingrandimento le fa crescere ancora.
 */
export const PRESENTATION_SHAPE: DeviceShape = {
  hostHalfWidth: 26,
  otherHalfWidth: 30,
  halfHeight: 26,
  cornerRadius: 10,
  iconScale: 1,
  selectionMargin: 6,
  nameY: 46,
  nameSize: 14,
  firstLineY: 62,
  lineStep: 16,
  signalDistance: 42,
  portLabelDistance: 62,
  addressDistance: 52,
  packetEdge: 46,
  waitOffset: { x: 34, y: -30 },
  barTop: -32,
  barBottom: 66,
};

/**
 * Le misure in uso.
 *
 * @param presenting - true in presentazione
 */
export function deviceShape(presenting: boolean): DeviceShape {
  return presenting ? PRESENTATION_SHAPE : EDITOR_SHAPE;
}
