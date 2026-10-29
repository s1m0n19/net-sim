<script lang="ts">
  // Un terminale: il prompt dei comandi di un host, oppure la CLI di un
  // router o di uno switch. Mostra ciò che i comandi hanno stampato e,
  // quando il dispositivo non è occupato, la riga in cui scrivere.
  import { session, type Terminal } from "../session.svelte";

  let { terminal }: { terminal: Terminal } = $props();

  const host = $derived(session.view.devices.find((device) => device.id === terminal.deviceId));
  const busy = $derived(session.isBusy(terminal));
  // La CLI di un router o di uno switch; altrimenti il prompt di Windows.
  const isCli = $derived(terminal.cli !== null);
  const prompt = $derived(session.promptOf(terminal));

  let line = $state("");
  // Quale comando della cronologia si sta richiamando; -1 = nessuno.
  let recalled = $state(-1);

  let screen: HTMLDivElement | undefined = $state();
  let input: HTMLInputElement | undefined = $state();

  // A ogni riga nuova lo schermo scorre fino in fondo.
  const printed = $derived(
    terminal.entries.reduce((total, entry) => total + 1 + session.outputOf(terminal.deviceId, entry).length, 0),
  );
  $effect(() => {
    printed;
    busy;
    screen?.scrollTo({ top: screen.scrollHeight });
  });

  // Appena il terminale è pronto, si può scrivere senza cliccare. Ma solo
  // se chi lo usa è rimasto lì: se mentre il comando era in corso ha fatto
  // clic altrove (sul disegno, su un pulsante), il cursore non gli viene
  // tolto. Altrimenti, finito un ping, i tasti premuti per comandare la
  // simulazione finirebbero scritti nel terminale.
  let wantsFocus = true;
  $effect(() => {
    if (!busy && wantsFocus) input?.focus();
  });

  function onPointerDown(event: PointerEvent) {
    wantsFocus = screen !== undefined && event.target instanceof Node && screen.contains(event.target);
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    wantsFocus = true;
    session.execute(terminal.deviceId, line);
    line = "";
    recalled = -1;
  }

  // Freccia su e freccia giù richiamano i comandi già scritti. Nella CLI,
  // in più: Tab completa la parola, il punto interrogativo risponde
  // subito senza Invio, Ctrl+Z lascia la configurazione come `end`.
  function onKey(event: KeyboardEvent) {
    if (isCli && cliKey(event)) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const history = terminal.history;
    if (history.length === 0) return;
    if (event.key === "ArrowUp") {
      recalled = recalled === -1 ? history.length - 1 : Math.max(0, recalled - 1);
    } else {
      recalled = recalled === -1 || recalled === history.length - 1 ? -1 : recalled + 1;
    }
    line = recalled === -1 ? "" : history[recalled];
  }

  // I tasti speciali della CLI. Restituisce true se il tasto è stato usato.
  function cliKey(event: KeyboardEvent): boolean {
    if (event.key === "Tab") {
      event.preventDefault();
      line = session.complete(terminal.deviceId, line);
      return true;
    }
    if (event.key === "?") {
      event.preventDefault();
      session.help(terminal.deviceId, line);
      return true;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      // Qui Ctrl+Z non annulla: per annullare restano le frecce in alto.
      event.preventDefault();
      event.stopPropagation();
      session.endConfiguration(terminal.deviceId);
      line = "";
      return true;
    }
    return false;
  }
</script>

<svelte:window onpointerdown={onPointerDown} />

<!-- Un clic in qualsiasi punto dello schermo porta il cursore sulla riga di comando. -->
<div class="screen mono" class:off={host !== undefined && !host.powered} bind:this={screen} onclick={() => input?.focus()} role="presentation">
  {#each terminal.entries as entry}
    <div class="command">{entry.prompt}{entry.command}</div>
    {#each session.outputOf(terminal.deviceId, entry) as output}
      <div class="output">{output}</div>
    {/each}
    <!-- Windows lascia una riga vuota dopo ogni comando; IOS no. -->
    {#if !isCli}<div class="output"></div>{/if}
  {/each}

  {#if host !== undefined && !host.powered}
    <!-- Un dispositivo spento non ha un prompt: al posto della riga di
         comando, un avviso dell'interfaccia, non un output del terminale. -->
    <div class="off-notice" role="status">
      <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true"><path d="M16 9V16M11 12a7 7 0 1 0 10 0" /></svg>
      <span><strong>{host.name} è spento.</strong> Il terminale torna disponibile quando lo riaccendi.</span>
    </div>
  {:else if !busy}
    <form onsubmit={submit}>
      <label for="terminal-{terminal.deviceId}">{prompt}</label>
      <input
        id="terminal-{terminal.deviceId}"
        bind:this={input}
        bind:value={line}
        onkeydown={onKey}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Riga di comando di {host?.name ?? 'questo dispositivo'}"
      />
    </form>
  {/if}
</div>

<style>
  .screen {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--surface-2);
    padding: 8px 12px;
    font-size: 1em;
    cursor: text;
  }
  .command,
  .output {
    white-space: pre;
    min-height: 1.4em;
  }
  /* Spento, l'output di prima resta leggibile ma passa in secondo piano. */
  .screen.off .command,
  .screen.off .output {
    opacity: 0.5;
  }
  .off-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--ink);
    font-family: var(--font-ui);
  }
  .off-notice path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  form {
    display: flex;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: none;
    color: inherit;
    font: inherit;
  }
</style>
