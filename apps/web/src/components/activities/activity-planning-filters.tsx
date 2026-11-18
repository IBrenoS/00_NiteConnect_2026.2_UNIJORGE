"use client";

import { useRouter } from "next/navigation";
import { ProjectFilter } from "../activity-planning-preview/activity-planning-preview";

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
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
    <form action="/atividades" method="get" className="flex min-h-9 w-full max-w-sm items-center gap-2 rounded-control border border-nite-border-soft bg-nite-surface px-3 text-type-body-compact text-nite-text-muted">
      <span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="planning-search">Buscar atividades</label>
      <input id="planning-search" type="search" name="q" minLength={2} maxLength={160} defaultValue={query} placeholder="Buscar atividades" className="min-w-0 flex-1 bg-transparent text-type-body-compact text-nite-text-primary outline-none placeholder:text-nite-text-muted"/>
      {projectId ? <input type="hidden" name="projectId" value={projectId}/> : null}
      <button type="submit" className="sr-only">Buscar</button>
    </form>
    <ProjectFilter options={["", ...projects.map((project) => project.id)]} labels={labels} value={projectId} onChange={changeProject}/>
  </div>;
}
