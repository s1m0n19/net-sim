<script lang="ts">
  // Il prompt dei comandi di un host. Mostra ciò che i comandi hanno
  // stampato e, quando l'host non è occupato, la riga in cui scrivere.
  import { PROMPT } from "../../shell/windows";
  import { session, type Terminal } from "../session.svelte";

  let { terminal }: { terminal: Terminal } = $props();

  const host = $derived(session.view.devices.find((device) => device.id === terminal.deviceId));
  const busy = $derived(session.isBusy(terminal));

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

  // Appena il terminale è pronto, si può scrivere senza cliccare.
  $effect(() => {
    if (!busy) input?.focus();
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    session.execute(terminal.deviceId, line);
    line = "";
    recalled = -1;
  }

  // Freccia su e freccia giù richiamano i comandi già scritti.
  function onKey(event: KeyboardEvent) {
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
</script>

<!-- Un clic in qualsiasi punto dello schermo porta il cursore sulla riga di comando. -->
<div class="screen mono" bind:this={screen} onclick={() => input?.focus()} role="presentation">
  {#each terminal.entries as entry}
    <div class="command">{PROMPT}{entry.command}</div>
    {#each session.outputOf(terminal.deviceId, entry) as output}
      <div class="output">{output}</div>
    {/each}
    <div class="output"></div>
  {/each}

  {#if host !== undefined && !host.powered}
    <div class="notice">{host.name} è spento.</div>
  {:else if !busy}
    <form onsubmit={submit}>
      <label for="terminal-{terminal.deviceId}">{PROMPT}</label>
      <input
        id="terminal-{terminal.deviceId}"
        bind:this={input}
        bind:value={line}
        onkeydown={onKey}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Riga di comando di {host?.name ?? 'questo host'}"
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
  .notice {
    color: var(--muted);
    font-family: var(--font-ui);
    font-style: italic;
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
