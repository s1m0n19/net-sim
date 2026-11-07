<script lang="ts">
  // Una tabella a due colonne del pannello laterale: la tabella ARP
  // (indirizzo IP e MAC) o la tabella MAC di uno switch (indirizzo e porta).
  // Mostra le righe così come sono, senza giudicarle (D-114).
  let {
    columns,
    rows,
    empty = "Vuota.",
  }: {
    columns: [string, string];
    rows: [string, string][];
    empty?: string;
  } = $props();
</script>

{#if rows.length === 0}
  <p class="empty">{empty}</p>
{:else}
  <table>
    <thead>
      <tr><th scope="col">{columns[0]}</th><th scope="col">{columns[1]}</th></tr>
    </thead>
    <tbody>
      {#each rows as [first, second] (first)}
        <tr><td>{first}</td><td>{second}</td></tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .empty {
    margin: 0;
    color: var(--muted);
    font-style: italic;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-family: var(--font-mono);
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
  }
  th {
    padding: 0 8px 4px 0;
    border-bottom: 1px solid var(--muted);
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--text-small);
    font-weight: 500;
    text-align: left;
  }
  td {
    padding: 4px 8px 4px 0;
    border-bottom: 1px solid var(--line);
    overflow-wrap: anywhere;
  }
  th:last-child,
  td:last-child {
    padding-right: 0;
  }
</style>
