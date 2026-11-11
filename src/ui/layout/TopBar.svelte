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
  import Icon from "../theme/Icon.svelte";
  import DiscardDialog from "./DiscardDialog.svelte";
  import Menu, { type MenuItem } from "./Menu.svelte";
  import { exportImage } from "../topology/export-image";

  // Il file su disco da cui viene la rete, quando il browser lo lascia
  // tenere: Salva ci scrive senza richiedere dove.
  let handle: FileHandle = null;

  // La conferma in corso, se c'è: per quale operazione, e a chi dare la
  // risposta. Una alla volta: finché c'è, Nuova rete e Apri rete non
  // fanno nulla.
  let asking = $state<{ action: "new" | "open"; resolve: (discard: boolean) => void } | null>(null);
  let projectMenu: HTMLElement | undefined = $state();

  // Prima di buttare via una rete con modifiche non salvate si chiede
  // conferma, con il dialogo dell'app (D-137). Senza modifiche si va avanti.
  function mayDiscard(action: "new" | "open"): Promise<boolean> {
    if (!session.dirty) return Promise.resolve(true);
    return new Promise((resolve) => (asking = { action, resolve }));
  }

  function answer(discard: boolean) {
    const resolve = asking?.resolve;
    asking = null;
    resolve?.(discard);
  }

  async function startNew() {
    if (asking !== null) return;
    if (!(await mayDiscard("new"))) return;
    handle = null;
    session.clear();
  }

  // Prima si sceglie il file e poi, se serve, si conferma: il browser apre
  // la finestra dei file solo subito dopo un clic, e dopo un dialogo non
  // lo sarebbe più. Fino alla conferma la rete aperta e il file su cui si
  // salva restano quelli di prima; un file che non si può aprire non fa
  // nemmeno chiedere.
  async function open() {
    if (asking !== null) return;
    const file = await pickNetworkFile();
    if (file === null || asking !== null) return;
    if (!session.checkFile(file.text)) return;
    if (!(await mayDiscard("open"))) return;
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

  // Esporta il disegno come immagine PNG (ED-8, D-119): sempre con il tema
  // chiaro, a doppia risoluzione, senza buste in viaggio.
  async function exportPicture() {
    try {
      await exportImage();
    } catch {
      session.notice = "Non è stato possibile esportare l'immagine.";
    }
  }

  // Il menu Progetto: i comandi di file meno frequenti di Salva, che resta
  // fuori, sempre a portata di mano.
  const projectItems: MenuItem[] = $derived([
    // In testa, il nome intero del file e lo stato: nella barra un nome
    // lungo si accorcia, qui si legge per intero, anche senza mouse.
    {
      kind: "heading",
      label: session.fileName === null ? "Senza nome" : `${session.fileName}${FILE_EXTENSION}`,
      detail: session.dirty ? "Modifiche non salvate" : session.fileName === null ? "Mai salvata" : "Tutto salvato",
    },
    { kind: "separator" },
    { kind: "action", label: "Nuova rete", icon: "new", run: startNew },
    { kind: "action", label: "Apri rete…", icon: "open", run: open },
    {
      kind: "action",
      label: "Salva con nome…",
      icon: "saveAs",
      shortcut: "Ctrl+Maiusc+S",
      disabled: session.isEmpty(),
      run: () => save(true),
    },
    {
      kind: "action",
      label: "Esporta immagine…",
      icon: "image",
      description: "Un'immagine PNG di tutta la rete, con il tema chiaro, per le slide e le verifiche su carta",
      // Serve qualcosa da fotografare: un dispositivo o un'annotazione.
      disabled: session.isEmpty() && session.view.annotations.length === 0,
      run: exportPicture,
    },
    { kind: "separator" },
    {
      kind: "check",
      label: "Salva anche le tabelle ARP e MAC",
      description: "Il file conserva ciò che i dispositivi hanno imparato: riaperta, la rete riparte già calda, e Ricomincia torna a quelle tabelle.",
      checked: session.saveTables,
      toggle: () => (session.saveTables = !session.saveTables),
    },
  ]);

  const dark = $derived(preferences.currentTheme() === "dark");

  // Il menu Visualizza: che cosa è scritto sul disegno, la griglia e il tema.
  const viewItems: MenuItem[] = $derived([
    { kind: "check", label: "Indirizzi IP", checked: preferences.labels.ip, toggle: () => (preferences.labels.ip = !preferences.labels.ip) },
    { kind: "check", label: "Indirizzi MAC", checked: preferences.labels.mac, toggle: () => (preferences.labels.mac = !preferences.labels.mac) },
    {
      kind: "check",
      label: "Nomi delle porte",
      checked: preferences.labels.ports,
      toggle: () => (preferences.labels.ports = !preferences.labels.ports),
    },
    { kind: "separator" },
    {
      kind: "check",
      label: "Griglia magnetica",
      description: "Posando e trascinando, i dispositivi si allineano.",
      checked: session.grid,
      toggle: () => (session.grid = !session.grid),
    },
    { kind: "separator" },
    {
      kind: "check",
      label: "Tema scuro",
      description: "All'apertura il tema segue l'impostazione del computer.",
      checked: dark,
      toggle: () => preferences.toggleTheme(),
    },
  ]);

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

{#if asking !== null}
  <DiscardDialog
    action={asking.action}
    onanswer={answer}
    fallbackFocus={() => projectMenu?.querySelector<HTMLElement>("button") ?? null}
  />
{/if}

<header>
  <!-- A. Identità e progetto. -->
  <div class="brand">
    <svg class="logo" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M7.2 8.4l3.6 7.2M16.8 8.4l-3.6 7.2M8 6h8" />
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="18" cy="6" r="2.6" />
      <circle cx="12" cy="18" r="2.6" />
    </svg>
    <span class="wordmark">net-sim</span>
  </div>

  <div class="project">
    {#if session.fileName !== null}
      <span class="file mono" title={session.fileName}>{session.fileName}</span>
    {:else}
      <span class="file untitled">Senza nome</span>
    {/if}
    {#if session.dirty}
      <span class="dirty" title="Ci sono modifiche non salvate"><span class="dot" aria-hidden="true"></span>Da salvare</span>
    {/if}
  </div>

  {#if !preferences.presenting}
    <div class="group">
      <span class="menu-slot" bind:this={projectMenu}><Menu label="Progetto" items={projectItems} /></span>
      <!-- Salva è l'azione principale di chi lavora: l'unico pulsante pieno. -->
      <button class="tb primary" disabled={session.isEmpty()} title="Salva la rete in un file (Ctrl+S)" onclick={() => save()}>
        <Icon name="save" /><span>Salva</span>
      </button>
      {#if session.saveTables}
        <span class="tag" title="Salvando, nel file vanno anche le tabelle ARP e MAC (menu Progetto)">con tabelle</span>
      {/if}
    </div>

    <!-- B. Modifica. -->
    <span class="divider" aria-hidden="true"></span>
    <div class="group">
      <button class="tb icon-only" disabled={!session.canUndo} title="Annulla l'ultima modifica (Ctrl+Z)" aria-label="Annulla" onclick={() => session.undo()}>
        <Icon name="undo" />
      </button>
      <button class="tb icon-only" disabled={!session.canRedo} title="Ripristina la modifica annullata (Ctrl+Maiusc+Z)" aria-label="Ripristina" onclick={() => session.redo()}>
        <Icon name="redo" />
      </button>
    </div>
  {/if}

  <span class="spacer"></span>

  {#if preferences.presenting}
    <!-- Quanto ingrandire tutto, da regolare guardando dal fondo dell'aula. -->
    <div class="group">
      <span class="label">Ingrandimento</span>
      <button class="tb" title="Rimpicciolisci testo e disegno" aria-label="Rimpicciolisci testo e disegno" disabled={preferences.magnification <= 1} onclick={() => preferences.magnify(-1)}>A−</button>
      <span class="mono">{Math.round(preferences.magnification * 100)}%</span>
      <button class="tb" title="Ingrandisci testo e disegno" aria-label="Ingrandisci testo e disegno" disabled={preferences.magnification >= 2} onclick={() => preferences.magnify(1)}>A+</button>
    </div>
  {:else}
    <!-- C. Visualizzazione. -->
    <Menu label="Visualizza" icon="view" items={viewItems} align="end" />
  {/if}

  <!-- D. Presentazione. Il tema sta nel menu Visualizza; in presentazione,
       dove quel menu non c'è, resta un pulsante a sé. -->
  <span class="divider" aria-hidden="true"></span>
  {#if preferences.presenting}
    <button
      class="tb icon-only"
      title={dark ? "Passa al tema chiaro" : "Passa al tema scuro"}
      aria-label={dark ? "Passa al tema chiaro" : "Passa al tema scuro"}
      onclick={() => preferences.toggleTheme()}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
    <button class="tb primary" title="Esci dalla presentazione (Esc)" onclick={exitPresentation}><Icon name="exit" /><span>Esci</span></button>
  {:else}
    <!-- Secondario: serve al docente, e non deve dominare la barra di chi lavora. -->
    <button class="tb present" title="Modalità presentazione: per proiettare in aula" onclick={enterPresentation}><Icon name="present" /><span>Presenta</span></button>
  {/if}
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-inline: 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    min-width: 0;
    /* Le regole per gli schermi stretti guardano la larghezza della barra,
       non della finestra: in presentazione la barra è ingrandita, e conta
       quanto spazio ha davvero (D-112). */
    container: topbar / inline-size;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    margin-right: 6px;
  }
  .logo {
    color: var(--accent);
    fill: var(--surface);
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .wordmark {
    font-weight: 600;
    font-size: 15px;
    letter-spacing: -0.01em;
  }
  .project {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 0 1 auto;
    padding-left: 12px;
    margin-right: 6px;
    border-left: 1px solid var(--line);
  }
  .file {
    /* Si accorcia, ma resta riconoscibile: il nome intero è nel menu
       Progetto e nel suggerimento. */
    min-width: 6ch;
    max-width: 28ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .untitled {
    color: var(--muted);
    font-style: italic;
  }
  /* Le modifiche non salvate: una pastiglia con il punto e la scritta, non
     il solo colore. */
  .dirty {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    padding: 2px 9px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    font-size: var(--text-small);
    white-space: nowrap;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  /* Solo per ritrovare il pulsante del menu Progetto: non conta nella disposizione. */
  .menu-slot {
    display: contents;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
  }
  .divider {
    flex: none;
    width: 1px;
    height: 22px;
    margin-inline: 6px;
    background: var(--line);
  }
  .spacer {
    flex: 1;
    min-width: 8px;
  }
  .label {
    color: var(--muted);
    margin-right: 4px;
  }
  .tag {
    flex: none;
    padding: 2px 8px;
    border: 1px solid var(--accent);
    border-radius: 999px;
    color: var(--accent);
    font-size: var(--text-small);
    white-space: nowrap;
  }

  /* I pulsanti della barra: più alti di quelli dei pannelli, con l'icona
     accanto alla scritta. */
  .tb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: var(--bar-control);
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: var(--surface);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.12s ease, border-color 0.12s ease;
  }
  .tb:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--muted);
  }
  .tb:active:not(:disabled) {
    background: var(--line);
  }
  .tb:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .tb:disabled {
    opacity: var(--disabled-opacity);
    cursor: default;
  }
  .tb.icon-only {
    width: var(--bar-control);
    padding: 0;
    border-color: transparent;
    background: none;
  }
  .tb.icon-only:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .tb.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }
  .tb.primary:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    filter: brightness(1.08);
  }
  /* Presenta: contorno e testo nel colore d'accento, fondo neutro. */
  .tb.present {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  @media (prefers-reduced-motion: reduce) {
    .tb {
      transition: none;
    }
  }

  /* Su uno schermo stretto il nome del file si accorcia per primo. */
  @container topbar (max-width: 1180px) {
    .file {
      max-width: 18ch;
    }
  }
  @container topbar (max-width: 1060px) {
    .wordmark {
      display: none;
    }
    .file {
      max-width: 14ch;
    }
  }
  /* Solo in presentazione, molto ingrandita: prima va via la scritta
     "Ingrandimento" (A− e A+ hanno la loro descrizione), poi il nome del
     file; i comandi restano tutti. */
  @container topbar (max-width: 760px) {
    .label {
      display: none;
    }
  }
  @container topbar (max-width: 470px) {
    .project {
      display: none;
    }
  }
</style>
