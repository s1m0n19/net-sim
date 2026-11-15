<script lang="ts">
  // Una tabella del pannello laterale: la tabella ARP (indirizzo IP e MAC)
  // o la tabella MAC di uno switch (VLAN, indirizzo e porta). Le colonne
  // sono quante ne dà chi la usa. Mostra le righe così come sono, senza
  // giudicarle (D-114).
  let {
    columns,
    rows,
    empty = "Vuota.",
  }: {
    columns: string[];
    rows: string[][];
    empty?: string;
  } = $props();
</script>

{#if rows.length === 0}
  <p class="empty">{empty}</p>
{:else}
  <table>
    <thead>
      <tr>
        {#each columns as column (column)}<th scope="col">{column}</th>{/each}
      </tr>
    </thead>
    <tbody>
      <!-- Una riga si riconosce da tutte le sue celle: lo stesso MAC può
           stare in due VLAN. -->
      {#each rows as row (row.join(" "))}
        <tr>
          {#each row as cell, index (index)}<td>{cell}</td>{/each}
        </tr>
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
