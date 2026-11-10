<script module lang="ts">
  // Le icone dell'interfaccia, tutte nello stesso stile: tratto di 1,8,
  // angoli arrotondati, disegnate su un riquadro di 24. Stanno qui, in un
  // solo punto, come colori e caratteri (NF-7).
  const PATHS = {
    // Un foglio con un più: una rete nuova.
    new: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M12 11v6M9 14h6",
    // Una cartella aperta.
    open: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M3 7v11a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L22 12H7.4a2 2 0 0 0-1.9 1.4L3 20",
    // Un dischetto: salvare.
    save: "M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM8 3v5h7V3M8 21v-7h8v7",
    // Un foglio con una freccia verso il basso: salvare in un altro file.
    saveAs: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M12 11v6M9 14l3 3 3-3",
    // Una cornice con un paesaggio: un'immagine da esportare.
    image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9h.01",
    // Le frecce curve di annulla e ripristina.
    undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
    redo: "M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
    chevron: "M6 9l6 6 6-6",
    check: "M5 12.5l4.5 4.5L19 7.5",
    // Un occhio: che cosa si vede sul disegno.
    view: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
    sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
    // Uno schermo da proiezione: la modalità presentazione.
    present: "M3 4h18M4.5 4v10.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V4M12 15.5V19M8.5 21l3.5-2 3.5 2",
    // Una porta con una freccia: uscire.
    exit: "M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10",
    // Le azioni della barretta accanto a ciò che è selezionato.
    power: "M12 3v8M7 6.5a7 7 0 1 0 10 0",
    // Due punti, una freccia che va e una che torna: c'è risposta? (D-130)
    ping: "M4.5 9.5a2 2 0 1 0 0 .01M19.5 14.5a2 2 0 1 0 0 .01M8 8h9.5M15 5.5l2.5 2.5-2.5 2.5M16 16H6.5M9 13.5L6.5 16 9 18.5",
    // Un cavo con un connettore a ogni capo.
    link: "M7.5 16.5c6 0 3-9 9-9M4 15h3.5v4H4zM16.5 5H20v4h-3.5z",
    duplicate: "M8 8h11v11H8zM5 16V5h11",
    terminal: "M5 7l5 5-5 5M12 17h7",
    // Una tabella: righe e colonne.
    table: "M4 5h16v14H4zM4 10h16M4 14.5h16M10 10v9",
    // Il cavo interrotto e il cavo intero.
    unplug: "M3 12h5M16 12h5M8 7v10M16 7v10",
    replug: "M3 12h18M10 7v10M14 7v10",
    trash: "M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6",
    // Tre punti: altre azioni.
    more: "M5 12h.01M12 12h.01M19 12h.01",
    // I comandi della simulazione, come quelli di un lettore video (D-115).
    // Una freccia che torna indietro in cerchio: ricominciare.
    restart: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9",
    // Il triangolo: far scorrere il tempo.
    play: "M8 5.5v13l10-6.5z",
    // Due barre: fermarlo.
    pause: "M9 6v12M15 6v12",
    // Il triangolo con una barra: un passo solo.
    step: "M6.5 6v12l8-6zM17.5 6v12",
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" class:dots={name === "more"} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  <path d={PATHS[name]} />
</svg>

<style>
  .icon {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .icon.dots {
    stroke-width: 3.2;
  }
</style>
