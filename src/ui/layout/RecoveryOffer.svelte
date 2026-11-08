<script lang="ts">
  // La proposta di ripristinare il lavoro non salvato dell'ultima volta
  // (D-120): una riga sotto la barra in alto, finché non si sceglie.
  // Riprendi riapre la rete della copia di recupero, che resta da salvare;
  // Scarta la lascia andare. Non si chiama «Ripristina»: è già il nome del
  // pulsante che rifà una modifica annullata.
  import { session } from "../session.svelte";
  import Icon from "../theme/Icon.svelte";

  const copy = $derived(session.recoveryOffer);

  // «alle 10:42 di sabato 8 novembre»: quando è stata lasciata.
  const when = $derived.by(() => {
    if (copy === null) return "";
    const date = new Date(copy.savedAt);
    const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const day = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    return `alle ${time} di ${day}`;
  });
</script>

{#if copy !== null}
  <div class="recovery" role="status">
    <span>
      <strong>C'è una rete non salvata dell'ultima volta</strong>
      {copy.fileName === null ? "(senza nome)" : `(«${copy.fileName}»)`}, lasciata {when}. Vuoi riprenderla?
    </span>
    <span class="actions">
      <button class="btn primary" aria-label="Riprendi la rete non salvata" onclick={() => session.restoreRecovery()}>
        <Icon name="open" size={15} />Riprendi
      </button>
      <button class="btn" aria-label="Scarta la rete non salvata" onclick={() => session.discardRecovery()}>Scarta</button>
    </span>
  </div>
{/if}

<style>
  .recovery {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    padding: 8px 12px;
    background: var(--surface);
    border-bottom: 2px solid var(--accent);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
</style>
