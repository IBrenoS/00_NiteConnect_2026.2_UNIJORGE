"use client";

import { useId, useState } from "react";
import { TextField } from "../ui/text-field";
import { searchManagementPeople } from "../../lib/activities/management-actions";
import type { ActivityCandidate, Page } from "../../lib/activities/contracts";
import type { ApiResult } from "../../lib/api/contracts";

export function ManagementPersonFilter({ label, name, initialId, initialName, projectId, lookupFailed }: {
  label: string; name: string; initialId?: string; initialName?: string; projectId?: string; lookupFailed?: boolean;
}) {
  const inputId = useId();
  const [selected, setSelected] = useState(initialId ? { id: initialId, name: initialName ?? (lookupFailed ? "Nome não carregado" : "Integrante indisponível") } : null);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult<Page<ActivityCandidate>> | null>(null);

  async function search(page: number) {
    setLoading(true);
    try {
      setResult(await searchManagementPeople(term, page, projectId));
    } catch {
      setResult({ data: null, issue: "unavailable" });
    } finally {
      setLoading(false);
    }
  }

  return <div className="grid min-w-0 content-start gap-1 text-type-metadata text-nite-text-secondary">
    <input type="hidden" name={name} value={selected?.id ?? ""}/>
    <label htmlFor={inputId}>{label}</label>
    <div className="flex gap-2">
      <TextField id={inputId} type="search" placeholder="Pesquisar pelo nome" value={term} maxLength={160} autoComplete="off" disabled={loading}
        onChange={event => { setTerm(event.currentTarget.value); setResult(null); }}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (Array.from(term.trim()).length >= 2 && !loading) void search(0); } }}/>
      <button type="button" className="underline" disabled={loading || Array.from(term.trim()).length < 2} onClick={() => void search(0)}>Buscar</button>
    </div>
    {selected && <div className="flex gap-2"><span>{selected.name}</span><button type="button" className="underline" aria-label={`Limpar seleção: ${label}`} onClick={() => setSelected(null)}>Limpar</button></div>}
    {loading ? <p role="status">Buscando integrantes…</p> : result?.issue ? <p role="alert">{result.issue === "access" || result.issue === "not-found" ? "Pesquisa indisponível neste contexto." : "Não foi possível buscar integrantes."}</p> : result?.data && <>
      {result.data.items.length ? <ul className="max-h-40 overflow-auto rounded-control border border-nite-border-soft">{result.data.items.map(person => <li key={person.id}>
        <button type="button" className="w-full px-2 py-1 text-left hover:bg-nite-surface-subtle" onClick={() => { setSelected(person); setTerm(""); setResult(null); }}>{person.name}</button>
      </li>)}</ul> : <p role="status">Nenhum integrante encontrado.</p>}
      <div className="flex gap-2">
        {result.data.page > 0 && <button type="button" className="underline" onClick={() => void search(result.data.page - 1)}>Anterior</button>}
        {(result.data.page + 1) * result.data.size < result.data.total && <button type="button" className="underline" onClick={() => void search(result.data.page + 1)}>Mais resultados</button>}
      </div>
    </>}
  </div>;
}
