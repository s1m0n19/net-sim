// L'orologio dell'interfaccia: fa scorrere il tempo a schermo.
//
// Il motore avanza a scatti, da un istante al successivo, e non sa nulla
// di secondi. Qui si decide quanto dura a schermo ciò che succede tra uno
// scatto e l'altro: i pacchetti scivolano lungo i cavi, le attese si
// accorciano, tra un echo e il successivo c'è una breve pausa.

import { session } from "../session.svelte";

// Quanti secondi impiega un pacchetto a percorrere un cavo, a velocità 1×.
export const TICK_SECONDS = 1.4;
// Quanto dura a schermo, al massimo, un'attesa durante la quale non
// viaggia nulla: non si aspettano davvero venti o quaranta tick.
const WAIT_SECONDS = 2.5;
// Pausa tra un echo request e il successivo, in tempo reale.
const ECHO_PAUSE_SECONDS = 0.6;
// Un passo lanciato a mano fa arrivare le buste in questo tempo, qualunque
// sia la velocità scelta per il tempo reale.
const STEP_SECONDS = 0.6;

// true mentre si sta mostrando un passo chiesto a mano.
let stepping = false;
// Fino a quando restare fermi (pausa tra gli echo). Tempo dell'orologio vero.
let holdUntil = 0;
// Da quale tempo simulato è cominciata l'attesa in corso.
let waitStart: number | null = null;
let lastFrame: number | null = null;
let looping = false;
// La rete su cui si stava lavorando: se cambia, si riparte da capo.
let seenGeneration = -1;

// Dimentica passi, pause e attese della rete precedente.
function forgetIfNetworkChanged(): void {
  if (session.generation === seenGeneration) return;
  seenGeneration = session.generation;
  stepping = false;
  holdUntil = 0;
  waitStart = null;
}

/** Fa scorrere il tempo da solo. */
export function start(): void {
  if (session.view.suspended) return;
  session.running = true;
  ensureLoop();
}

/** Ferma il tempo. I pacchetti restano dove sono. */
export function pause(): void {
  session.running = false;
}

/**
 * Avanza di un istante, mostrando i pacchetti che arrivano a destinazione.
 * Non fa nulla se il tempo sta già scorrendo da solo.
 */
export function stepOnce(): void {
  forgetIfNetworkChanged();
  if (session.running || stepping || session.view.nextEvent === null) return;
  stepping = true;
  ensureLoop();
}

function ensureLoop(): void {
  if (looping) return;
  looping = true;
  lastFrame = null;
  requestAnimationFrame(frame);
}

// Un fotogramma: fa avanzare il tempo a schermo e, quando raggiunge il
// prossimo istante, chiede al motore di elaborarlo.
function frame(now: number): void {
  const seconds = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  forgetIfNetworkChanged();

  if (!session.running && !stepping) {
    looping = false;
    return;
  }
  requestAnimationFrame(frame);

  const next = session.view.nextEvent;
  if (next === null) {
    // Non c'è nulla in programma: un passo a mano finisce qui, il tempo
    // reale resta in ascolto del prossimo ping.
    stepping = false;
    if (session.view.suspended) session.running = false;
    return;
  }
  if (now < holdUntil) return;

  const travelling = session.view.packets.length > 0;
  // Tick al secondo: in tempo reale dipende dalla velocità scelta.
  let speed = stepping ? 1 / STEP_SECONDS : session.speed / TICK_SECONDS;

  if (!travelling) {
    // C'è solo un'attesa: a mano si salta subito alla scadenza, in tempo
    // reale la si mostra accorciata.
    if (stepping) {
      session.displayTime = next.time;
    } else {
      waitStart ??= session.displayTime;
      const length = next.time - waitStart;
      speed = Math.max(speed, length / WAIT_SECONDS);
      session.waitProgress = length === 0 ? 1 : (session.displayTime - waitStart) / length;
    }
  }

  session.displayTime = Math.min(next.time, session.displayTime + seconds * speed);
  if (session.displayTime < next.time) return;

  // È il momento: il motore elabora l'istante.
  const traces = session.step();
  waitStart = null;
  const wasStepping = stepping;
  stepping = false;

  // In tempo reale, una pausa separa un echo dal successivo.
  const anotherEchoFollows = traces.some((t) => t.kind === "ping-result" && t.remaining > 0);
  if (!wasStepping && anotherEchoFollows) {
    holdUntil = now + (ECHO_PAUSE_SECONDS * 1000) / session.speed;
  }
}
