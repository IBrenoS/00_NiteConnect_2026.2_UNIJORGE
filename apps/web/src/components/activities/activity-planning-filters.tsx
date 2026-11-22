"use client";

import { useRouter } from "next/navigation";
import { FilterSelect, SearchField, Button } from "../ui";
import { FilterToolbar } from "../patterns/filter-toolbar";

export function ActivityPlanningFilters({ query, projectId, projects }: { query: string; projectId: string; projects: readonly { id: string; title: string }[] }) {
  const router = useRouter();
  const labels = Object.fromEntries(projects.map((project) => [project.id, project.title]));
  labels[""] = "Todos os projetos";
  function changeProject(value: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (value) params.set("projectId", value);
    router.push(`/atividades${params.size ? `?${params}` : ""}`);
  }
  return <FilterToolbar compact action="/atividades" method="get" actions={<Button size="compact" type="submit" variant="secondary">Buscar</Button>}>
    <SearchField id="planning-search" aria-label="Buscar atividades" name="q" minLength={2} maxLength={160} defaultValue={query} placeholder="Buscar atividades"/>
    {projectId ? <input type="hidden" name="projectId" value={projectId}/> : null}
    <FilterSelect aria-label="Filtrar por projeto" value={projectId} onChange={event => changeProject(event.target.value)}>{["", ...projects.map(project => project.id)].map(value => <option key={value} value={value}>{labels[value]}</option>)}</FilterSelect>
  </FilterToolbar>;
}
