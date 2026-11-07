<script lang="ts">
  // Le righe in alto sul disegno. Tre livelli, sempre in quest'ordine
  // (D-113):
  //
  //   1. la condizione critica: la tempesta di broadcast, che sospende la
  //      simulazione e di cui si spiega la causa (SIM-15);
  //   2. l'operazione rifiutata: ciò che l'utente ha chiesto all'interfaccia
  //      e non si è potuto fare (un cavo senza porte libere, un ping verso
  //      chi non ha un indirizzo, un dato che il motore non accetta). Dice
  //      che cosa non è stato fatto, mai come sistemare la rete (SIM-8);
  //   3. le istruzioni dell'operazione in corso: che cosa sta aspettando
  //      l'app (un clic per posare, la destinazione di un ping, l'altro capo
  //      di un cavo) e come rinunciare.
  //
  // Nessuna sparisce da sola: un'istruzione resta finché l'operazione è in
  // corso, un rifiuto finché non si fa qualcos'altro.
  import { session } from "../session.svelte";

  // Che cosa si sta per posare, a parole.
  const placingName = $derived.by(() => {
    const template = session.placing;
    if (template === null) return "";
    if (template.kind === "host") return "PC";
    if (template.kind === "server") return "Server";
    if (template.kind === "switch") return `Switch a ${template.portCount} porte`;
    return `Router a ${template.interfaceCount} interfacce`;
  });

  const pingSource = $derived(session.view.devices.find((device) => device.id === session.pingFrom));
  const linkSource = $derived(session.view.devices.find((device) => device.id === session.linkFrom));
</script>

<div class="messages">
  {#if session.view.suspended}
    <div class="message storm" role="alert">
      <strong>Simulazione sospesa: tempesta di broadcast.</strong>
      Ci sono {session.view.packets.length} frame che continuano a girare senza fermarsi. La causa
      è un ciclo tra switch: senza spanning tree, un broadcast inoltrato in cerchio non si
      esaurisce mai. Premi "Ricomincia" per ripartire.
    </div>
  {/if}

  {#if session.notice !== null}
    <!-- Il colore non basta: c'è anche la crocetta, come nei campi del
         pannello. -->
    <div class="message refused" role="alert">
      <span class="sign" aria-hidden="true">✕</span>
      <span>{session.notice}</span>
    </div>
  {/if}

  <!-- Una sola regione che c'è sempre, anche vuota: così il lettore di
       schermo annuncia ogni istruzione nuova, una volta. -->
  <div class="instructions" role="status">
    {#if session.placing !== null}
      <div class="message">
        <strong>{placingName}.</strong>
        Fai clic sul disegno per posarne uno; puoi posarne altri. <kbd>Esc</kbd> per finire.
      </div>
    {/if}
    {#if linkSource !== undefined}
      <div class="message">
        <strong>Cavo da {linkSource.name}.</strong> Fai clic sul dispositivo da collegare.
        <kbd>Esc</kbd> per annullare.
      </div>
    {:else if session.cabling}
      <div class="message">
        <strong>Cavo.</strong> Trascina da un dispositivo a un altro, oppure fai clic sul primo e poi
        sul secondo. <kbd>Esc</kbd> per finire.
      </div>
    {/if}
    {#if pingSource !== undefined}
      <div class="message">
        <strong>Ping da {pingSource.name}.</strong> Fai clic sul dispositivo di destinazione.
        <kbd>Esc</kbd> per annullare.
      </div>
    {/if}
  </div>
</div>

<style>
  .messages {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, calc(100% - 28px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .instructions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .message {
    padding: 8px 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-float);
    box-shadow: var(--shadow-float);
  }
  /* Istruzione: il bordo sinistro nel colore d'accento, come ciò che è
     selezionato o premuto. */
  .instructions .message {
    border-left: 4px solid var(--accent);
  }
  kbd {
    padding: 0 5px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 3px;
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: var(--text-small);
  }
  /* Operazione rifiutata: il bordo sinistro rosso e la crocetta. */
  .refused {
    display: flex;
    align-items: baseline;
    gap: 8px;
    border-left: 4px solid var(--down);
  }
  .sign {
    color: var(--down);
    font-weight: 600;
  }
  /* Condizione critica: tutto il bordo rosso, e il titolo in evidenza. */
  .storm {
    border: 2px solid var(--down);
  }
  .storm strong {
    display: block;
    color: var(--down);
  }
</style>
