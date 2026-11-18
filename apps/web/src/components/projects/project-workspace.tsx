"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { visualCatalog, visualParticipationIds } from "../../lib/projects/visual-data";
import { useProjectVisual } from "./project-visual-provider";
import { Avatar, ProjectBreadcrumb, ProjectMark, ProjectProperties, ProjectStatusBadge, TemporaryNotice } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectWorkspaceShell({ projectId, children }: { projectId: string; children: ReactNode }) {
  const project = visualCatalog.find(p => p.id === projectId)!;
  const pathname = usePathname();
  const base = `/meus-projetos/${projectId}`;
  return <div className={styles.workspace}><div className={styles.workspaceTop}><ProjectBreadcrumb title={project.title} personal/><TemporaryNotice/><header className={styles.workspaceHeader}><ProjectMark title={project.title}/><h1>{project.title}</h1><ProjectStatusBadge project={project}/><Link className={styles.button} href={`/projetos/${projectId}`}>Apresentação pública ↗</Link><details className={styles.projectMenu}><summary aria-label="Opções do projeto">•••</summary><div><Link href={`/projetos/${projectId}`}>Consultar apresentação pública</Link><Link href="/meus-projetos">Voltar para Meus projetos</Link></div></details></header><nav className={styles.workspaceTabs} aria-label="Áreas do projeto">{[{ path: "", label: "Visão geral" }, { path: "/atividades", label: "Atividades e planejamento" }, { path: "/equipe", label: "Equipe" }, { path: "/documentos", label: "Documentos" }].map(tab => <Link key={tab.path} href={base + tab.path} aria-current={pathname === base + tab.path ? "page" : undefined}>{tab.label}</Link>)}</nav></div>{!visualParticipationIds.includes(projectId) && <p className={styles.adminNotice}>Acompanhamento administrativo · acesso ao workspace sem participação na equipe.</p>}{children}</div>;
}
export function ProjectOverview({ projectId }: { projectId: string }) {
  const { workspaces } = useProjectVisual();
  const project = visualCatalog.find(p => p.id === projectId)!;
  const workspace = workspaces.find(w => w.projectId === projectId)!;
  const tasks = workspace.plannings.flatMap(p => p.tasks);
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "Concluída").length;
  const base = `/meus-projetos/${projectId}`;
  return <div className={styles.overviewLayout}><article className={styles.overviewMain}>
    <section className={styles.overviewPanel}><header><h2>O trabalho em perspectiva</h2><span className={styles.muted}>Dados de exemplo</span></header><div className={styles.overviewStats}><div><strong>{workspace.plannings.length}</strong><span>Planejamentos</span></div><div><strong>{total}</strong><span>Tarefas no projeto</span></div><div><strong>{done}</strong><span>Concluídas</span></div></div><footer><span>{total ? `${done} de ${total} tarefas concluídas` : "Nenhuma tarefa neste projeto"}</span><Link href={`${base}/atividades`}>Ver planejamento →</Link></footer></section>
    <section className={styles.editorial}><h2>Sobre o projeto</h2><p>{workspace.description}</p></section>
    <section className={styles.editorial}><h2>Objetivos</h2><ul className={styles.objectives}>{workspace.objectives.map(goal => <li key={goal}><span aria-hidden="true">◇</span>{goal}</li>)}</ul></section>
    <section className={styles.editorial}><header className={styles.sectionHeader}><h2>Pessoas e responsabilidades</h2><Link href={`${base}/equipe`}>Ver equipe →</Link></header><div className={styles.peopleSummary}>{workspace.people.slice(0, 3).map(person => <div key={person.id}><Avatar name={person.name}/><span><strong>{person.name}</strong><small>{person.leader ? "Gestor do projeto" : person.responsibility}</small></span></div>)}</div></section>
    <section className={styles.editorial}><h2>Recursos do projeto</h2><Link href={`${base}/documentos`} className={styles.resourceLink}><span aria-hidden="true">▱</span><span><strong>Documentos compartilhados</strong><small>Biblioteca do projeto</small></span><span aria-hidden="true">↗</span></Link></section>
  </article><aside className={styles.overviewAside}><h2>Situação do projeto</h2><ProjectStatusBadge project={project}/><ProjectProperties project={project}/><div className={styles.asideNote}><h3>Próximos passos</h3><p>{tasks.find(t => t.status === "Em andamento")?.title ?? "Organize o próximo ciclo no planejamento do projeto."}</p><Link href={`${base}/atividades`}>Abrir atividades →</Link></div></aside></div>;
}
