"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { PlanningCard, PlanningForm } from "../activity-planning-preview/activity-planning-preview";
import { ActivityPlanningWorkspace } from "../activities/activity-planning-workspace";
import { createPlanningAction } from "../../lib/activities/planning-actions";
import type { ActivityPlanning, ActivityStatistics } from "../../lib/activities/contracts";
import { Dialog } from "../ui/dialog";
import { EmptyProjects } from "./project-ui";
import styles from "./projects.module.css";

export type ProjectActivitiesProps = {
  projectId: string; projectTitle: string; canCreatePlanning: boolean;
  plannings: ActivityPlanning[]; statistics: Record<string, ActivityStatistics | null>;
  page: number; total: number; size: number; query: string;
  selected?: ComponentProps<typeof ActivityPlanningWorkspace>;
};
export function ProjectActivities({ projectId, projectTitle, canCreatePlanning, plannings, statistics, page, total, size, query, selected }: ProjectActivitiesProps) {
  const router = useRouter();
  const [newPlanning, setNewPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/meus-projetos/${projectId}/atividades`;
  async function create(draft: { title: string; description: string }) {
    setError(null);
    const result = await createPlanningAction({ title: draft.title, description: draft.description, projectId });
    if (result.issue) { setError(result.issue === "conflict" ? "O contexto mudou. Atualize a página e tente novamente." : result.issue === "unauthenticated" ? "Sua sessão expirou. Entre novamente." : result.issue === "access" || result.issue === "forbidden" ? "Você não tem permissão para criar um planejamento neste projeto." : "Não foi possível criar o planejamento. Tente novamente."); return; }
    setNewPlanning(false);
    router.push(`${base}?planejamento=${encodeURIComponent(result.data.id)}`);
    router.refresh();
  }
  const pageHref = (next: number) => `${base}?${new URLSearchParams({ page: String(next), ...(query ? { q: query } : {}) })}`;
  if (selected) return <ActivityPlanningWorkspace key={`${selected.planning.id}:${selected.view}:${selected.tasks.map(({ activity }) => `${activity.id}:${activity.version}`).join(",")}`} {...selected} projectContext={{ id: projectId, title: projectTitle, basePath: base }}/>;
  return <section className={styles.sectionPage}>
    <header className={styles.sectionHeader}><div><h2>Atividades e planejamento</h2><p>Organize o trabalho em planejamentos, com tarefas vinculadas a este projeto.</p></div>{canCreatePlanning ? <button type="button" className={styles.primaryButton} onClick={() => setNewPlanning(true)}>+ Novo planejamento</button> : null}</header>
    <form className={styles.toolbar} action={base}><label className={styles.search}><span aria-hidden="true">⌕</span><input name="q" aria-label="Pesquisar planejamentos do projeto" placeholder="Pesquisar planejamentos…" defaultValue={query}/></label><button className={styles.button} type="submit">Pesquisar</button></form>
    {plannings.length ? <div className={styles.planningGrid}>{plannings.map(planning => <PlanningCard key={planning.id} href={`${base}?planejamento=${encodeURIComponent(planning.id)}`} planning={{ ...planning, project: projectTitle, tasks: [], updated: new Date(planning.updatedAt).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }) }} stats={statistics[planning.id] ?? null}/>)}</div> : <EmptyProjects title="Nenhum planejamento encontrado" description="Os planejamentos deste projeto aparecerão aqui."/>}
    {total > size ? <nav aria-label="Paginação" className={styles.toolbar}>{page > 0 ? <Link className={styles.textLink} href={pageHref(page - 1)}>Anterior</Link> : null}<span>Página {page + 1} de {Math.ceil(total / size)}</span>{(page + 1) * size < total ? <Link className={styles.textLink} href={pageHref(page + 1)}>Próxima</Link> : null}</nav> : null}
    <Link className={styles.textLink} href="/atividades?view=legacy">Tarefas sem planejamento em Minhas tarefas</Link>
    <Dialog open={newPlanning} onOpenChange={setNewPlanning} title="Novo planejamento" description={`Vinculado a ${projectTitle}`}><PlanningForm fixedProject={{ id: projectId, title: projectTitle }} onClose={() => setNewPlanning(false)} onCreate={create}/>{error ? <p role="alert" className={styles.contextNote}>{error}</p> : null}</Dialog>
  </section>;
}
