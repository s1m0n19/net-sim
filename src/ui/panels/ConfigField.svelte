<script lang="ts">
  // Un campo della configurazione nel pannello laterale. Ha effetto quando
  // lo si conferma, con Invio o uscendo dal campo; se il valore viene
  // rifiutato il campo si segna in rosso, con il motivo scritto sotto, e
  // la rete conserva il valore di prima.
  let {
    label,
    name,
    value,
    apply,
    mono = true,
    placeholder = "",
    onproblem,
  }: {
    label: string;
    // Nome del campo nella pagina: serve a ritrovarlo, e a dare un id.
    name: string;
    // Il valore che la rete ha adesso; null se non è impostato.
    value: string | null;
    // Prova ad applicare il testo scritto: restituisce il motivo del
    // rifiuto, oppure null se è andata bene.
    apply: (text: string) => string | null;
    mono?: boolean;
    placeholder?: string;
    // Chiamata quando il motivo del rifiuto compare o sparisce: chi contiene
    // il campo può segnalarlo anche quando il campo non si vede (D-131).
    onproblem?: (problem: string | null) => void;
  } = $props();

  let draft = $state("");
  let problem = $state<string | null>(null);

  // Quando la rete cambia valore (anche per un altro campo, come la
  // maschera proposta) il campo lo mostra. Si passa da un valore derivato
  // perché cambia solo se il valore è davvero diverso: altrimenti ogni
  // aggiornamento del disegno cancellerebbe ciò che si sta scrivendo, e
  // il motivo di un rifiuto.
  const current = $derived(value ?? "");
  $effect(() => {
    draft = current;
    problem = null;
  });

  // Chi lo chiede sa sempre se il campo ha un valore rifiutato: dopo un
  // rifiuto, una correzione accettata, Esc, o un nuovo valore della rete.
  $effect(() => {
    onproblem?.(problem);
  });

  function confirm() {
    // Uscire dal campo senza aver cambiato nulla non fa nulla.
    if (draft.trim() === current) {
      draft = current;
      problem = null;
      return;
    }
    problem = apply(draft);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter") {
      confirm();
    } else if (event.key === "Escape") {
      // Esc rimette il valore della rete, e non toglie la selezione.
      event.stopPropagation();
      draft = current;
      problem = null;
    }
  }
</script>

<label for="field-{name}">{label}</label>
<div class="field">
  <input
    id="field-{name}"
    data-field={name}
    class:mono
    class:invalid={problem !== null}
    type="text"
    autocomplete="off"
    spellcheck="false"
    {placeholder}
    aria-invalid={problem !== null}
    aria-describedby={problem !== null ? `problem-${name}` : undefined}
    bind:value={draft}
    onkeydown={onKey}
    onblur={confirm}
  />
  {#if problem !== null}
    <!-- Rosso più un segno: il colore da solo non basta. -->
    <p id="problem-{name}" class="problem" role="alert"><span aria-hidden="true">✕</span> {problem}</p>
  {/if}
</div>

<style>
  label {
    color: var(--muted);
    align-self: start;
    padding-top: 5px;
  }
  .field {
    min-width: 0;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 7px;
    font: inherit;
    color: var(--ink);
    background: var(--canvas);
    border: 1px solid var(--field-border);
    border-radius: var(--radius);
  }
  input.mono {
    font-family: var(--font-mono);
  }
  /* Il segnaposto dice che il valore manca: in corsivo e attenuato, perché
     non sembri un valore scritto. */
  input::placeholder {
    color: var(--muted);
    font-style: italic;
    font-family: var(--font-ui);
  }
  input:hover:not(:focus) {
    border-color: var(--muted);
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  input.invalid {
    border-color: var(--down);
    border-width: 2px;
    padding: 3px 6px;
  }
  /* Il motivo del rifiuto, sotto il campo: la crocetta e il testo, con il
     rientro allineato al testo del campo. */
  .problem {
    margin: 4px 0 0;
    padding-left: 7px;
    color: var(--down);
    font-size: var(--text-small);
    line-height: 1.35;
  }
  /* Nel pannello stretto (in presentazione, su uno schermo piccolo) ogni
     etichetta va sopra il suo campo: gli indirizzi restano interi (D-112). */
  @container panel (max-width: 250px) {
    .field {
      margin-bottom: 6px;
    }
    /* Ogni pixel serve all'indirizzo: meno spazio ai lati del testo. */
    input {
      padding-inline: 5px;
    }
    input.invalid {
      padding-inline: 4px;
    }
  }
</style>
