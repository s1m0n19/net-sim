<script lang="ts">
  // Le righe in alto sul disegno: che cosa sta aspettando l'app (un clic
  // per posare, la destinazione di un ping, l'altro capo di un cavo), i
  // comandi rifiutati, e l'avviso della tempesta di broadcast.
  import { session } from "../session.svelte";

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
  {#if session.placing !== null}
    <div class="message" role="status">
      <strong>{session.placing.kind === "host" ? "PC" : `Switch a ${session.placing.portCount} porte`}.</strong>
      Fai clic sul disegno per posarne uno; puoi posarne altri. Esc per finire.
    </div>
  {/if}
  {#if linkSource !== undefined}
    <div class="message" role="status">
      <strong>Cavo da {linkSource.name}.</strong> Fai clic sul dispositivo da collegare. Esc per
      annullare.
    </div>
  {:else if session.cabling}
    <div class="message" role="status">
      <strong>Cavo.</strong> Trascina da un dispositivo a un altro, oppure fai clic sul primo e poi
      sul secondo. Esc per finire.
    </div>
  {/if}
  {#if pingSource !== undefined}
    <div class="message" role="status">
      <strong>Ping da {pingSource.name}.</strong> Fai clic sul dispositivo di destinazione. Esc per
      annullare.
    </div>
  {/if}
  {#if session.notice !== null}
    <div class="message" role="alert">{session.notice}</div>
  {/if}
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
  .message {
    padding: 8px 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
  }
  .message[role="alert"] {
    border-left-color: var(--down);
  }
  .storm {
    border: 2px solid var(--down);
  }
  .storm strong {
    display: block;
    color: var(--down);
  }
</style>
