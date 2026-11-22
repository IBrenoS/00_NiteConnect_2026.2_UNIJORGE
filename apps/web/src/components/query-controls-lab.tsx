"use client";

import { useState } from "react";
import { Button, DatePicker, DateRangePicker, FilterSelect, SearchField } from "./ui";
import { FilterToolbar } from "./patterns/filter-toolbar";

/** Development-only specimen; no business data or API writes. */
export function QueryControlsLab() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("2026-11-22");
  const [submitted, setSubmitted] = useState("");
  return <section aria-labelledby="query-controls-heading" className="grid min-w-0 gap-4 rounded-panel border border-nite-border-soft bg-nite-surface p-4">
    <div><h2 id="query-controls-heading" className="font-display text-type-section-title">Pesquisa e filtros</h2><p className="mt-1 text-type-body-compact text-nite-text-secondary">Controles compactos com formulários nativos, calendário e filtros avançados.</p></div>
    <FilterToolbar compact aria-label="Exemplo de consulta" hasActiveFilters={Boolean(query || status)} onClear={() => { setQuery(""); setStatus(""); }} actions={<Button size="compact" type="submit">Aplicar</Button>} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); setSubmitted(JSON.stringify(Object.fromEntries(data))); }} advanced={<DateRangePicker from={{ name: "from", defaultValue: "2026-11-01" }} to={{ name: "to" }}/> }>
      <SearchField name="q" aria-label="Pesquisar no exemplo" placeholder="Pesquisar atividades…" value={query} onChange={event => setQuery(event.currentTarget.value)} onClear={() => setQuery("")}/>
      <FilterSelect name="status" aria-label="Situação no exemplo" value={status} onChange={event => setStatus(event.currentTarget.value)}><option value="">Todas as situações</option><option value="planned">Planejada</option><option value="active">Em execução</option><option value="done">Concluída</option><option value="unavailable" disabled>Indisponível</option></FilterSelect>
      <label className="grid min-w-0 gap-1 text-type-metadata text-nite-text-secondary">Data controlada<DatePicker name="date" aria-label="Data controlada" value={date} onChange={event => setDate(event.currentTarget.value)} min="2026-01-01" max="2027-12-31"/></label>
    </FilterToolbar>
    <output aria-label="Valor da data" className="text-type-metadata text-nite-text-secondary">{date}</output>
    <output aria-label="Consulta enviada" className="break-all text-type-metadata text-nite-text-secondary">{submitted}</output>
    {query ? <p role="status" className="py-5 text-center text-type-body-compact text-nite-text-secondary">Nenhum resultado demonstrativo para “{query}”.</p> : null}
    <div className="flex flex-wrap items-center gap-2"><Button size="compact" type="button">Primário</Button><Button size="compact" variant="secondary" type="button">Secundário</Button><Button size="compact" variant="quiet" type="button">Contextual</Button><Button size="compact" disabled type="button">Indisponível</Button><Button size="compact" loading type="button">Carregando</Button></div>
  </section>;
}
