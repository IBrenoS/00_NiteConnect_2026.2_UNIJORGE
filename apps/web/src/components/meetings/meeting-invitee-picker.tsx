"use client";

import { useEffect, useState } from "react";
import { searchMeetingInviteesAction } from "../../lib/meetings/actions";
import type { MeetingCandidate, MeetingPage } from "../../lib/meetings/contracts";
import { Button } from "../ui/button";
import { TextField } from "../ui/text-field";

type Props = {
  selected: MeetingCandidate[];
  onChange: (selected: MeetingCandidate[]) => void;
  excludedId?: string;
  previewCandidates?: MeetingCandidate[];
};
const noPreviewCandidates: MeetingCandidate[] = [];

export function MeetingInviteePicker({ selected, onChange, excludedId, previewCandidates = noPreviewCandidates }: Props) {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<{ query: string; page: MeetingPage<MeetingCandidate> | null; issue: boolean } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const normalizedQuery = query.trim();
  const currentSearch = normalizedQuery.length >= 2 && searchState?.query === normalizedQuery ? searchState : null;
  const previewMatches = previewCandidates?.filter((candidate) => candidate.id !== excludedId && candidate.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery.toLocaleLowerCase("pt-BR"))) ?? null;
  const page = previewCandidates ? normalizedQuery.length >= 2 ? { items: previewMatches ?? [], page: 0, size: 20, total: previewMatches?.length ?? 0 } : null : currentSearch?.page ?? null;
  const loading = !previewCandidates && normalizedQuery.length >= 2 && currentSearch === null;
  const issue = !previewCandidates && (currentSearch?.issue ?? false);

  useEffect(() => {
    if (previewCandidates || normalizedQuery.length < 2) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      void searchMeetingInviteesAction(normalizedQuery, 0).then((result) => {
        if (!active) return;
        setSearchState({ query: normalizedQuery, page: result.data, issue: result.issue !== null });
      }).catch(() => {
        if (!active) return;
        setSearchState({ query: normalizedQuery, page: null, issue: true });
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [normalizedQuery, previewCandidates]);

  function toggle(candidate: MeetingCandidate) {
    const exists = selected.some((member) => member.id === candidate.id);
    onChange(exists ? selected.filter((member) => member.id !== candidate.id) : [...selected, candidate]);
  }

  async function loadMore() {
    if (previewCandidates || !page || pageLoading || (page.page + 1) * page.size >= page.total) return;
    setPageLoading(true);
    const result = await searchMeetingInviteesAction(normalizedQuery, page.page + 1);
    if (result.data) setSearchState({ query: normalizedQuery, page: { ...result.data, items: [...page.items, ...result.data.items] }, issue: false });
    else setSearchState({ query: normalizedQuery, page, issue: true });
    setPageLoading(false);
  }

  return <section aria-labelledby="meeting-invitees-heading" className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="meeting-invitees-heading" className="text-type-label font-medium text-nite-text-primary">Convidados <span className="font-normal text-nite-text-muted">(opcional)</span></h3>
      <span className="text-type-metadata text-nite-text-secondary">{selected.length} selecionado{selected.length === 1 ? "" : "s"}</span>
    </div>
    {selected.length ? <ul aria-label="Integrantes selecionados" className="flex flex-wrap gap-2">
      {selected.map((member) => <li key={member.id} className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-pill border border-nite-border-soft bg-nite-surface-subtle py-1 pl-3 pr-1.5 text-type-metadata text-nite-text-primary">
        <span className="max-w-52 truncate">{member.name}</span>
        <button type="button" onClick={() => toggle(member)} aria-label={`Remover ${member.name}`} className="grid size-7 shrink-0 place-items-center rounded-full text-nite-text-muted hover:bg-nite-surface hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-nite-focus"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="size-3.5"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>
      </li>)}
    </ul> : null}
    <label className="grid min-w-0 gap-1.5 text-type-metadata text-nite-text-secondary" htmlFor="meeting-invitee-search">Buscar integrantes ativos
      <TextField id="meeting-invitee-search" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} maxLength={160} placeholder="Digite ao menos 2 caracteres" autoComplete="off" />
    </label>
    <div aria-live="polite" className="min-h-8 text-type-body-compact text-nite-text-secondary">
      {query.trim().length < 2 ? <p>A busca considera integrantes ativos do NITE Connect.</p> : loading ? <p>Buscando integrantes…</p> : issue ? <p role="alert">Não foi possível buscar agora. Tente novamente.</p> : page?.items.filter((candidate) => candidate.id !== excludedId).length ? <ul className="max-h-48 divide-y divide-nite-border-soft overflow-y-auto rounded-panel border border-nite-border-soft">
        {page.items.filter((candidate) => candidate.id !== excludedId).map((candidate) => {
          const checked = selected.some((member) => member.id === candidate.id);
          return <li key={candidate.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">
              <input type="checkbox" checked={checked} onChange={() => toggle(candidate)} className="size-4 shrink-0 accent-nite-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus" />
              <span className="min-w-0 truncate">{candidate.name}</span>
              {checked ? <span className="ml-auto text-type-metadata text-nite-brand-primary">Selecionado</span> : null}
            </label>
          </li>;
        })}
      </ul> : <p>Nenhum integrante encontrado.</p>}
    </div>
    {!previewCandidates && page && (page.page + 1) * page.size < page.total && normalizedQuery.length >= 2 ? <Button type="button" variant="quiet" onClick={() => void loadMore()} loading={pageLoading} className="justify-self-start">Ver mais integrantes</Button> : null}
  </section>;
}
