<script lang="ts">
  // La conferma prima di buttare via le modifiche non salvate, quando Nuova
  // rete o Apri rete sostituirebbero la rete aperta (D-137). È un dialogo
  // modale dell'app, non quello del browser: il resto della pagina è
  // inerte finché non si risponde, e non riceve clic né tasti.
  //
  // Annulla è la risposta di partenza: ha il fuoco all'apertura, e Esc vale
  // Annulla. Scarta modifiche si distingue anche senza colore: ha il
  // cestino e dice che cosa fa.
  import { onMount } from "svelte";
  import Icon from "../theme/Icon.svelte";

  let {
    action,
    onanswer,
    fallbackFocus,
  }: {
    // L'operazione che sostituirebbe la rete.
    action: "new" | "open";
    // La risposta: true se le modifiche si scartano. Arriva una volta sola.
    onanswer: (discard: boolean) => void;
    // Dove riportare il fuoco se il comando che ha aperto il dialogo non
    // c'è più (una voce del menu, che si è chiuso).
    fallbackFocus: () => HTMLElement | null;
  } = $props();

  let dialog: HTMLDialogElement;
  let cancelButton: HTMLButtonElement;
  // Il comando che aveva il fuoco quando è stata chiesta la conferma.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let answered = false;

  const MESSAGES = {
    new: "Hai modificato la rete senza salvarla. Creando una nuova rete, queste modifiche andranno perse.",
    open: "Hai modificato la rete senza salvarla. Aprendo un'altra rete, queste modifiche andranno perse.",
  };

  onMount(() => {
    dialog.showModal();
    cancelButton.focus();
  });

  function answer(discard: boolean) {
    // Un doppio clic o un Invio ripetuto non rispondono due volte.
    if (answered) return;
    answered = true;
    dialog.close();
    const target = opener?.isConnected ? opener : fallbackFocus();
    target?.focus();
    onanswer(discard);
  }

  // I tasti premuti nel dialogo non arrivano alle scorciatoie della pagina
  // (Canc, Ctrl+Z, i tasti della presentazione); Ctrl+S non apre il
  // salvataggio della pagina del browser.
  function onKey(event: KeyboardEvent) {
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") event.preventDefault();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="discard-title"
  aria-describedby="discard-text"
  oncancel={(event) => {
    // Esc vale Annulla; il dialogo lo chiude answer.
    event.preventDefault();
    answer(false);
  }}
  onkeydown={onKey}
>
  <h2 id="discard-title">Modifiche non salvate</h2>
  <p id="discard-text">{MESSAGES[action]}</p>
  <div class="buttons">
    <button class="btn" bind:this={cancelButton} onclick={() => answer(false)}>Annulla</button>
    <button class="btn danger" onclick={() => answer(true)}><Icon name="trash" size={15} />Scarta modifiche</button>
  </div>
</dialog>

<style>
  dialog {
    box-sizing: border-box;
    width: min(460px, calc(100vw - 32px));
    padding: 20px 22px 18px;
    border: 1px solid var(--line);
    border-radius: var(--radius-float);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-menu);
  }
  dialog::backdrop {
    background: rgba(15, 23, 35, 0.35);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 1.05rem;
    font-weight: 600;
  }
  p {
    margin: 0 0 18px;
    line-height: 1.45;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .buttons .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
  }
  /* Distruttivo anche senza colore: il cestino, la scritta, e il bordo
     sempre nel colore del pericolo, non solo al passaggio. */
  .buttons .danger {
    border-color: var(--down);
  }
</style>
