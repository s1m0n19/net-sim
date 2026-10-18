<script lang="ts">
  import {
    canChooseWhereToSave,
    pickNetworkFile,
    writeNetworkFile,
    type FileHandle,
  } from "../../storage/browser-files";
  import { preferences } from "../preferences.svelte";
  import { enterPresentation, exitPresentation } from "../presentation";
  import { FILE_EXTENSION, session } from "../session.svelte";

  // Il file su disco da cui viene la rete, quando il browser lo lascia
  // tenere: Salva ci scrive senza richiedere dove.
  let handle: FileHandle = null;

  // Prima di buttare via una rete con modifiche non salvate si chiede conferma.
  function mayDiscard(): boolean {
    return !session.dirty || window.confirm("La rete ha modifiche non salvate, che andranno perse. Continuare?");
  }

  function startNew() {
    if (!mayDiscard()) return;
    handle = null;
    session.clear();
  }

  async function open() {
    if (!mayDiscard()) return;
    const file = await pickNetworkFile();
    if (file === null) return;
    session.open(file.name, file.text);
    // Un file rifiutato non diventa quello su cui si salva.
    if (session.error === null) handle = file.handle;
  }

  // Salva scrive nel file da cui la rete viene, se c'è. Salva con nome
  // chiede sempre dove, e da lì in poi il file della rete è quello nuovo.
  async function save(askWhere = false) {
    if (session.isEmpty()) return;
    const draft = session.draftSave();
    let name = session.fileName ?? "rete";
    if (askWhere && !canChooseWhereToSave()) {
      // Dove il file si può solo scaricare, il nome si chiede qui.
      const typed = window.prompt("Nome del file", name)?.trim();
      if (!typed) return;
      name = typed.replace(/(\.netsim)?\.json$/i, "");
    }
    try {
      const saved = await writeNetworkFile(draft.text, `${name}${FILE_EXTENSION}`, askWhere ? null : handle);
      if (saved === null) return;
      handle = saved.handle;
      session.markSaved(saved.name, draft);
    } catch {
      session.notice = "Non è stato possibile salvare il file.";
    }
  }

  function onKey(event: KeyboardEvent) {
    // In presentazione i comandi di file non ci sono, nemmeno da tastiera.
    if (preferences.presenting) return;
    // Ctrl+S (Cmd+S su Mac) salva, invece di salvare la pagina; con
    // Maiusc, salva con nome.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save(event.shiftKey);
    }
  }

  // Chiudendo o ricaricando la pagina con modifiche non salvate, il
  // browser chiede conferma.
  function onLeave(event: BeforeUnloadEvent) {
    if (session.dirty) event.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} onbeforeunload={onLeave} />

<header>
  <span class="name">net-sim</span>

  {#if !preferences.presenting}
    <button class="btn" onclick={startNew}>Nuova</button>
    <button class="btn" onclick={open}>Apri</button>
    <button class="btn" disabled={session.isEmpty()} title="Salva la rete in un file (Ctrl+S)" onclick={() => save()}>Salva</button>
    <button class="btn" disabled={session.isEmpty()} title="Salva la rete in un altro file (Ctrl+Maiusc+S)" onclick={() => save(true)}>Salva con nome</button>
    <!-- Salvare anche le tabelle ARP e MAC, per una rete che riparte "già calda" (FILE-5). -->
    <button class="btn" class:on={session.saveTables} aria-pressed={session.saveTables} title="Salva anche le tabelle ARP e MAC; Ricomincia torna a quelle salvate" onclick={() => (session.saveTables = !session.saveTables)}>Tabelle</button>
    <button class="btn" disabled={!session.canUndo} title="Annulla l'ultima modifica (Ctrl+Z)" aria-label="Annulla" onclick={() => session.undo()}>↶</button>
    <button class="btn" disabled={!session.canRedo} title="Ripristina la modifica annullata (Ctrl+Maiusc+Z)" aria-label="Ripristina" onclick={() => session.redo()}>↷</button>
  {/if}

  {#if session.fileName !== null}
    <span class="file mono">{session.fileName}</span>
  {:else}
    <span class="file">senza nome</span>
  {/if}
  {#if session.dirty}
    <span class="dirty" title="Ci sono modifiche non salvate">● modificata</span>
  {/if}

  <span class="spacer"></span>

  {#if preferences.presenting}
    <!-- Quanto ingrandire tutto, da regolare guardando dal fondo dell'aula. -->
    <span class="label">Ingrandimento</span>
    <button class="btn" title="Rimpicciolisci testo e disegno" aria-label="Rimpicciolisci testo e disegno" disabled={preferences.magnification <= 1} onclick={() => preferences.magnify(-1)}>A−</button>
    <span class="mono">{Math.round(preferences.magnification * 100)}%</span>
    <button class="btn" title="Ingrandisci testo e disegno" aria-label="Ingrandisci testo e disegno" disabled={preferences.magnification >= 2} onclick={() => preferences.magnify(1)}>A+</button>
  {:else}
    <span class="label">Etichette</span>
    <button class="btn" class:on={preferences.labels.ip} aria-pressed={preferences.labels.ip} onclick={() => (preferences.labels.ip = !preferences.labels.ip)}>IP</button>
    <button class="btn" class:on={preferences.labels.mac} aria-pressed={preferences.labels.mac} onclick={() => (preferences.labels.mac = !preferences.labels.mac)}>MAC</button>
    <button class="btn" class:on={preferences.labels.ports} aria-pressed={preferences.labels.ports} onclick={() => (preferences.labels.ports = !preferences.labels.ports)}>Porte</button>
  {/if}

  <button class="btn" onclick={() => preferences.toggleTheme()}>Tema</button>
  {#if preferences.presenting}
    <button class="btn primary" title="Esci dalla presentazione (Esc)" onclick={exitPresentation}>Esci</button>
  {:else}
    <button class="btn primary" title="Modalità presentazione: per proiettare in aula" onclick={enterPresentation}>Presenta</button>
  {/if}
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-inline: 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    min-width: 0;
  }
  .name {
    font-weight: 600;
    font-size: 1.15em;
    margin-right: 6px;
  }
  .file {
    color: var(--muted);
    margin-inline: 8px;
  }
  .dirty {
    color: var(--muted);
    font-size: 0.92em;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .label {
    color: var(--muted);
  }
</style>
