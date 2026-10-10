<script lang="ts">
  // Il pannello laterale mostrerà ciò che è selezionato. Per ora nulla si
  // può selezionare, quindi dice solo che cosa comparirà qui.
</script>

<aside>
  <h2>Nessuna selezione</h2>
  <p>Qui comparirà ciò che selezioni: un dispositivo, un cavo o un pacchetto.</p>
</aside>

<style>
  aside {
    background: var(--surface);
    border-left: 1px solid var(--line);
    padding: 12px;
    min-width: 0;
    overflow: auto;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.1em;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--muted);
  }
</style>
