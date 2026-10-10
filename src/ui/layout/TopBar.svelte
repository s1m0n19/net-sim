<script lang="ts">
  import { pickNetworkFile } from "../../storage/browser-files";
  import { preferences } from "../preferences.svelte";
  import { session } from "../session.svelte";

  async function open() {
    const file = await pickNetworkFile();
    if (file !== null) session.open(file.name, file.text);
  }
</script>

<header>
  <span class="name">net-sim</span>

  <button class="btn" onclick={() => session.clear()}>Nuova</button>
  <button class="btn" onclick={open}>Apri</button>
  <button class="btn" disabled title="Non ancora disponibile">Salva</button>
  <button class="btn" disabled title="Non ancora disponibile" aria-label="Annulla">↶</button>
  <button class="btn" disabled title="Non ancora disponibile" aria-label="Ripristina">↷</button>

  {#if session.fileName !== null}
    <span class="file mono">{session.fileName}</span>
  {:else}
    <span class="file">senza nome</span>
  {/if}

  <span class="spacer"></span>

  <span class="label">Etichette</span>
  <button class="btn" class:on={preferences.labels.ip} aria-pressed={preferences.labels.ip} onclick={() => (preferences.labels.ip = !preferences.labels.ip)}>IP</button>
  <button class="btn" class:on={preferences.labels.mac} aria-pressed={preferences.labels.mac} onclick={() => (preferences.labels.mac = !preferences.labels.mac)}>MAC</button>
  <button class="btn" class:on={preferences.labels.ports} aria-pressed={preferences.labels.ports} onclick={() => (preferences.labels.ports = !preferences.labels.ports)}>Porte</button>

  <button class="btn" onclick={() => preferences.toggleTheme()}>Tema</button>
  <button class="btn primary" disabled title="Non ancora disponibile">Presenta</button>
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
  .spacer {
    flex: 1;
  }
  .label {
    color: var(--muted);
  }
</style>
