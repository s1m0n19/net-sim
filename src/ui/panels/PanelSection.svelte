<script lang="ts">
  // Una sezione del pannello laterale: un titolo e il suo contenuto, con una
  // riga sottile che la separa dalla precedente (D-114). Se la sezione è
  // una tabella che si può appuntare sul disegno, accanto al titolo c'è il
  // pulsante, legato alla sezione anche per il lettore di schermo.
  import type { Snippet } from "svelte";

  let {
    title,
    pin,
    children,
  }: {
    title: string;
    // La tabella si appunta sul disegno: se lo è già, e come cambiarlo.
    pin?: { pinned: boolean; toggle: () => void };
    children: Snippet;
  } = $props();

  // Il titolo dà il nome alla sezione e descrive il pulsante.
  const id = $derived(`section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
</script>

<section aria-labelledby={id}>
  <div class="head">
    <h3 {id}>{title}</h3>
    {#if pin !== undefined}
      <!-- Le parole sono quelle di sempre: "appunta", e "appuntata" quando
           la tabella è già sul disegno. -->
      <button class="btn pin" class:on={pin.pinned} aria-pressed={pin.pinned} aria-describedby={id} title={pin.pinned ? "Togli la tabella dal disegno" : "Appunta la tabella sul disegno"} onclick={pin.toggle}>
        {#if pin.pinned}<span class="tick" aria-hidden="true">✓</span>{/if}{pin.pinned ? "appuntata" : "appunta"}
      </button>
    {/if}
  </div>
  {@render children()}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 24px;
  }
  h3 {
    margin: 0;
    font-size: var(--text-small);
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .pin {
    padding: 1px 8px;
    font-size: var(--text-small);
  }
  .tick {
    margin-right: 4px;
  }
  /* Appuntata: il colore d'accento (.btn.on), la spunta e la parola. */
</style>
