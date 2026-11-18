"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlanningCard, PlanningForm, TaskBoard, TaskTable, TaskEditor, StatsPanel, movePreviewTask } from "../activity-planning-preview/activity-planning-preview";
import { Dialog } from "../ui/dialog";
import { visualCatalog, type VisualTask } from "../../lib/projects/visual-data";
import { useProjectVisual } from "./project-visual-provider";
import { EmptyProjects } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectActivities({ projectId }: { projectId: string }) {
  const { workspaces, setWorkspaces } = useProjectVisual();
  const workspace = workspaces.find(w => w.projectId === projectId)!;
  const params = useSearchParams();
  const selectedId = params.get("planejamento");
  const planning = workspace.plannings.find(p => p.id === selectedId);
  const view = params.get("view") === "table" ? "table" : params.get("view") === "priority" ? "priority" : "status";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todas");
  const [sort, setSort] = useState("title");
  const [editing, setEditing] = useState<VisualTask | null | undefined>(undefined);
  const [newPlanning, setNewPlanning] = useState(false);
  const base = `/meus-projetos/${projectId}/atividades`;
  const href = (id: string, nextView = view) => `${base}?planejamento=${encodeURIComponent(id)}&view=${nextView}`;
  const tasks = (planning?.tasks ?? []).filter(t => `${t.title} ${t.description}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")) && (status === "Todas" || t.status === status)).toSorted((a, b) => sort === "due" ? a.due.localeCompare(b.due) : a.title.localeCompare(b.title, "pt-BR"));
  function updateTasks(update: (tasks: VisualTask[]) => VisualTask[]) {
    setWorkspaces(items => items.map(w => w.projectId === projectId ? { ...w, plannings: w.plannings.map(p => p.id === planning?.id ? { ...p, tasks: update(p.tasks) } : p) } : w));
  }
  return <section className={styles.sectionPage}>
    <header className={styles.sectionHeader}><div>{planning && <Link className={styles.textLink} href={base}>← Planejamentos do projeto</Link>}<h2>{planning?.title ?? "Atividades e planejamento"}</h2><p>{planning?.description ?? "Organize o trabalho em planejamentos, com tarefas vinculadas a este projeto."}</p></div><button className={styles.primaryButton} onClick={() => planning ? setEditing(null) : setNewPlanning(true)}>+ {planning ? "Nova tarefa" : "Novo planejamento"}</button></header>
    {selectedId && !planning ? <EmptyProjects title="Planejamento indisponível" description="Selecione um planejamento deste projeto na listagem."/> : !planning ? <div className={styles.planningGrid}>{workspace.plannings.map(p => <PlanningCard key={p.id} href={href(p.id)} planning={{ id: p.id, title: p.title, description: p.description, tasks: p.tasks, project: visualCatalog.find(p => p.id === projectId)?.title ?? projectId, updated: "Dados temporários" }}/>)}</div> : <>
      <div className={styles.taskViews}><nav aria-label="Visualização das tarefas">{([{ id: "status", label: "▦ Por situação" }, { id: "priority", label: "▥ Por prioridade" }, { id: "table", label: "▤ Tabela" }] as const).map(v => <Link key={v.id} aria-current={view === v.id ? "page" : undefined} href={href(planning.id, v.id)}>{v.label}</Link>)}</nav><span className={styles.muted}>Somente este projeto</span></div>
      <div className={styles.toolbar}><label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar tarefas do projeto" placeholder="Pesquisar tarefas…" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Situação da tarefa" value={status} onChange={e => setStatus(e.target.value)}>{["Todas", "Planejada", "Em andamento", "Concluída", "Cancelada"].map(s => <option key={s}>{s}</option>)}</select><select aria-label="Ordenar tarefas" value={sort} onChange={e => setSort(e.target.value)}><option value="title">Título</option><option value="due">Prazo</option></select></div>
      <div className={styles.taskLayout}><div className={styles.tasks}>{view === "table" ? <TaskTable tasks={tasks} onEdit={setEditing} onAdd={taskTitle => { updateTasks(items => [...items, { id: crypto.randomUUID(), title: taskTitle, description: "", status: "Planejada", priority: "Sem prioridade", owner: workspace.people[0]?.name ?? "Sem responsável", ownerId: workspace.people[0]?.id, start: "Sem data", due: "Sem prazo" }]); }}/> : <TaskBoard tasks={tasks} grouping={view} onEdit={setEditing} onMove={(id, grouping, group) => updateTasks(items => movePreviewTask(items, id, grouping, group))} onAdd={(taskTitle, grouping, group) => { const id = crypto.randomUUID(); updateTasks(items => movePreviewTask([...items, { id, title: taskTitle, description: "", status: "Planejada", priority: "Sem prioridade", owner: workspace.people[0]?.name ?? "Sem responsável", ownerId: workspace.people[0]?.id, start: "Sem data", due: "Sem prazo" }], id, grouping, group)); }}/>}</div><StatsPanel tasks={planning.tasks} showOptions={false}/></div>
      {editing !== undefined && <TaskEditor key={editing?.id ?? "new"} task={editing} onClose={() => setEditing(undefined)} ownerOptions={workspace.people} initialOwnerId={workspace.people[0]?.id} initialOwnerName={workspace.people[0]?.name} collaboratorOptions={workspace.people} initialCollaboratorIds={editing?.collaboratorIds} persistenceNotice="Dados de exemplo. Salvar altera somente esta sessão; nenhuma tarefa real é modificada." onUpdate={(id, changes) => updateTasks(items => items.map(t => t.id === id ? { ...t, ...changes } : t))} onCreate={draft => updateTasks(items => [...items, { ...draft, id: crypto.randomUUID() }])} onCreateServer={async values => { const owner = workspace.people.find(p => p.id === values.ownerId); if (!owner) return "Selecione um responsável do projeto."; if (values.startOn && values.dueOn && values.dueOn < values.startOn) return "O prazo deve ser igual ou posterior ao início."; updateTasks(items => [...items, { id: crypto.randomUUID(), title: values.title, description: values.description, status: values.status, priority: values.priority, ownerId: owner.id, owner: owner.name, collaboratorIds: values.collaboratorIds, start: values.startOn ?? "Sem data", due: values.dueOn ?? "Sem prazo" }]); return null; }} onSave={async values => { if (!editing) return "Tarefa indisponível."; if (values.startOn && values.dueOn && values.dueOn < values.startOn) return "O prazo deve ser igual ou posterior ao início."; const owner = workspace.people.find(p => p.id === values.ownerId); updateTasks(items => items.map(t => t.id === editing.id ? { ...t, title: values.title, description: values.description, status: values.status, priority: values.priority, collaboratorIds: values.collaboratorIds, ownerId: owner?.id ?? t.ownerId, owner: owner?.name ?? t.owner, start: values.startOn ?? "Sem data", due: values.dueOn ?? "Sem prazo" } : t)); return null; }}/>}<p className={styles.contextNote}>As alterações nas tarefas ficam somente nesta sessão e não são enviadas.</p>
    </>}
    <Dialog open={newPlanning} onOpenChange={setNewPlanning} title="Novo planejamento" description="Vinculado a este projeto · dados temporários"><p className={styles.contextNote}>A criação altera somente esta sessão da interface.</p><PlanningForm fixedProject={{ id: projectId, title: visualCatalog.find(p => p.id === projectId)?.title ?? projectId }} onClose={() => setNewPlanning(false)} onCreate={draft => { setWorkspaces(items => items.map(w => w.projectId === projectId ? { ...w, plannings: [...w.plannings, { id: crypto.randomUUID(), projectId, title: draft.title, description: draft.description, tasks: [] }] } : w)); setNewPlanning(false); }}/></Dialog>
  </section>;
}

