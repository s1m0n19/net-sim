<script lang="ts">
  // I dettagli di trunk di una porta di switch (D-156): la VLAN nativa, le
  // VLAN consentite, quelle che il trunk porterebbe davvero e il segnale
  // sul cavo. Si aprono dalla riga della porta, in SwitchPorts.
  //
  // Valgono anche per una porta access che conserva nativa e consentite
  // diverse da quelle di partenza: lì sono memorizzate, come nella CLI, e
  // non hanno effetto finché la porta non torna trunk.
  //
  // Ogni scelta è un'azione del motore, la stessa della CLI, e un passo
  // della cronologia. Qui resta solo ciò che riguarda l'interazione: una
  // scelta di «Solo queste» non ancora tradotta in un elenco.
  import { formatVlanList } from "../../engine/model/trunks";
  import { session } from "../session.svelte";
  import type { SwitchPortView, VlanView } from "../view";
  import ConfigField from "./ConfigField.svelte";

  let { deviceId, port, vlans }: { deviceId: string; port: SwitchPortView; vlans: VlanView[] } = $props();

  const key = $derived(`${deviceId}-${port.name}`.replace(/[^\w-]/g, "-"));

  // Le tre scelte delle VLAN consentite. «Solo queste» scelta mentre sono
  // tutte (o nessuna) non cambia ancora nulla: mostra le caselle, tutte
  // spuntate (o nessuna), e la prima casella toccata decide l'elenco. Così
  // il passaggio da «Tutte» a un elenco non toglie in silenzio le VLAN che
  // lo switch non ha.
  let pendingSome = $state(false);
  const allowedKey = $derived(JSON.stringify(port.allowedVlans));
  $effect(() => {
    void allowedKey;
    pendingSome = false;
  });
  const choice = $derived(
    pendingSome ? "some" : port.allowedVlans === "all" ? "all" : port.allowedVlans.length === 0 ? "none" : "some",
  );

  // L'elenco da cui partono le caselle: quello della porta, oppure, se
  // «Solo queste» è appena stata scelta, tutte le VLAN dello switch o nessuna.
  const base = $derived(port.allowedVlans === "all" ? vlans.map((vlan) => vlan.id) : port.allowedVlans);
  // Le caselle: le VLAN dello switch, e quelle consentite che lo switch non
  // ha, con il loro numero, perché non si perdano.
  const boxes = $derived([
    ...vlans.map((vlan) => ({ id: vlan.id, label: `${vlan.id} · ${vlan.name}` })),
    ...base.filter((id) => !vlans.some((vlan) => vlan.id === id)).map((id) => ({ id, label: `${id} · non configurata` })),
  ].sort((a, b) => a.id - b.id));

  let problem = $state<string | null>(null);

  function chooseAll() {
    pendingSome = false;
    problem = session.setAllowedVlans(deviceId, port.name, "all");
  }

  function chooseNone() {
    pendingSome = false;
    problem = session.setAllowedVlans(deviceId, port.name, []);
  }

  function chooseSome() {
    if (choice !== "some") pendingSome = true;
  }

  function toggle(id: number, checked: boolean) {
    const next = checked ? [...base, id] : base.filter((other) => other !== id);
    problem = session.setAllowedVlans(deviceId, port.name, next);
  }

  const allowedText = (vlansList: number[]) => (vlansList.length === 0 ? "nessuna" : formatVlanList(vlansList).replaceAll(",", ", "));
</script>

<div class="trunk">
  {#if port.mode === "access"}
    <p class="note">Memorizzati per il trunk: valgono quando la porta torna trunk.</p>
  {/if}

  <div class="native">
    <ConfigField
      label="VLAN nativa"
      name="native-{key}"
      value={String(port.nativeVlan)}
      ariaLabel="VLAN nativa della porta {port.name}"
      apply={(text) => session.setNativeVlan(deviceId, port.name, text)}
    />
    <span class="hint">
      {#if port.nativeName === null}VLAN {port.nativeVlan} · non configurata{:else}{port.nativeVlan} · {port.nativeName}{/if}
    </span>
  </div>

  <fieldset>
    <legend>VLAN consentite</legend>
    <div class="choices">
      <label><input type="radio" name="allowed-{key}" checked={choice === "all"} onchange={chooseAll} />Tutte</label>
      <label><input type="radio" name="allowed-{key}" checked={choice === "some"} onchange={chooseSome} />Solo queste</label>
      <label><input type="radio" name="allowed-{key}" checked={choice === "none"} onchange={chooseNone} />Nessuna</label>
    </div>
    {#if choice === "some"}
      {#if pendingSome}
        <p class="note">
          {port.allowedVlans === "all" ? "Ancora tutte: togli le VLAN da non far passare." : "Ancora nessuna: scegli le VLAN da far passare."}
        </p>
      {/if}
      <ul class="boxes" aria-label="VLAN consentite sulla porta {port.name}">
        {#each boxes as box (box.id)}
          <li>
            <label>
              <input type="checkbox" checked={base.includes(box.id)} onchange={(event) => toggle(box.id, event.currentTarget.checked)} />
              {box.label}
            </label>
          </li>
        {/each}
      </ul>
      {#if port.allowedVlans !== "all"}
        <!-- Un numero che lo switch non ha si aggiunge da qui, con gli
             intervalli della CLI: il campo si svuota quando l'elenco cambia. -->
        <div class="add">
          {#key allowedKey}
            <ConfigField
              label="Aggiungi"
              name="allowed-add-{key}"
              value={null}
              placeholder="30,40-45"
              ariaLabel="Aggiungi VLAN consentite alla porta {port.name}"
              apply={(text) => (text.trim() === "" ? null : session.addAllowedVlans(deviceId, port.name, text))}
            />
          {/key}
        </div>
      {/if}
    {/if}
    {#if problem !== null}
      <p class="problem" role="alert"><span aria-hidden="true">✕</span> {problem}</p>
    {/if}
  </fieldset>

  <!-- Configurate e consentite non vuol dire che passino: serve anche il
       cavo con il segnale, e l'altro capo configurato. -->
  <p class="carried">
    {#if port.carriedVlans.length === 0}Nessuna VLAN configurata e consentita{:else}VLAN configurate e consentite: {allowedText(port.carriedVlans)}{/if}
  </p>
  <p class="link">
    Collegamento: {#if !port.enabled}porta spenta{:else if port.signal}con segnale{:else}senza segnale{/if}
  </p>
</div>

<style>
  .trunk {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 2px 0 4px;
    padding: 6px 8px 8px;
    border-left: 3px solid var(--accent);
    border-radius: 0 var(--radius) var(--radius) 0;
    background: var(--surface-2);
    min-width: 0;
  }
  .note,
  .carried,
  .link {
    margin: 0;
    font-size: var(--text-small);
  }
  .note,
  .link {
    color: var(--muted);
  }
  .carried {
    font-weight: 600;
  }
  /* Etichetta e campo su una riga, il nome della VLAN sotto il campo. */
  .native,
  .add {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: 8px;
    align-items: start;
  }
  .hint {
    grid-column: 2;
    color: var(--muted);
    font-size: var(--text-small);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  legend {
    padding: 0;
    margin-bottom: 2px;
    color: var(--muted);
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
  }
  .boxes {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9em, 1fr));
    gap: 0 10px;
  }
  /* Bersagli comodi anche con il dito: ogni scelta alta almeno 28 pixel. */
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    min-width: 0;
    overflow-wrap: anywhere;
    cursor: pointer;
  }
  input[type="radio"],
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin: 0;
    flex: none;
    accent-color: var(--accent);
  }
  .problem {
    margin: 0;
    color: var(--down);
    font-size: var(--text-small);
    font-weight: 600;
  }
</style>
