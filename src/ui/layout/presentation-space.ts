// Lo spazio della rete in presentazione quando si apre la fascia in basso
// (C-1 del collaudo UX 5.6, D-140).
//
// Alla LIM, su uno schermo di 1366 × 768 e ad alto ingrandimento, aprire la
// fascia toglie al disegno metà dell'altezza. Se intanto il pannello
// laterale è aperto (in presentazione si apre selezionando qualcosa), il
// disegno è anche stretto, la barra della simulazione va a capo e copre i
// dispositivi. Qui si decide soltanto se la rete è coperta: che cosa fare
// lo decide il disegno, una volta, nel momento in cui la fascia si apre.

/** Un rettangolo sullo schermo, in pixel. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlaps = (a: ScreenRect, b: ScreenRect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Dice se la rete è coperta: un dispositivo è sotto uno dei comandi del
 * disegno (la barra della simulazione, lo zoom) oppure è fuori dal disegno,
 * anche solo in parte. La barretta delle azioni non conta: sta accanto a
 * ciò che è selezionato, e coprire un vicino è il suo modo di stare vicina.
 *
 * @param devices - il riquadro di ogni dispositivo
 * @param controls - i comandi sopra il disegno
 * @param canvas - il disegno
 * @returns true se almeno un dispositivo non si vede per intero
 */
export function networkCovered(devices: ScreenRect[], controls: ScreenRect[], canvas: ScreenRect): boolean {
  return devices.some((device) => {
    const inside =
      device.x >= canvas.x && device.y >= canvas.y && device.x + device.width <= canvas.x + canvas.width && device.y + device.height <= canvas.y + canvas.height;
    return !inside || controls.some((control) => overlaps(device, control));
  });
}
