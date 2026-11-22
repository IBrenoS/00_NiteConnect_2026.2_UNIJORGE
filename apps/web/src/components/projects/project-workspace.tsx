"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { WorkspaceOverview, ProjectTeamMember } from "../../lib/projects/integration-contracts";
import type { ActivityStatistics } from "../../lib/activities/contracts";
import { workspaceProject, projectIssueText } from "../../lib/projects/presentation";
import { setProjectAvailabilityAction } from "../../lib/projects/actions";
import { Avatar, ProjectBreadcrumb, ProjectIssue, ProjectMark, ProjectProperties, ProjectStatusBadge } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectWorkspaceShell({ workspace, participates, children }: { workspace: WorkspaceOverview; participates: boolean | null; children: ReactNode }) {
  const project = workspaceProject(workspace);
  const pathname = usePathname();
  const base = `/meus-projetos/${project.id}`;
  const tabs = [{ path: "", label: "Visão geral", allowed: true }, { path: "/atividades", label: "Atividades e planejamento", allowed: workspace.capabilities.canViewActivities }, { path: "/equipe", label: "Equipe", allowed: true }, { path: "/documentos", label: "Documentos", allowed: workspace.capabilities.canViewDocuments }];
  return <div className={styles.workspace}><div className={styles.workspaceTop}><ProjectBreadcrumb personal/><header className={styles.workspaceHeader}><ProjectMark title={project.title}/><h1>{project.title}</h1><ProjectStatusBadge project={project}/>{workspace.capabilities.canManageMembers && <details className={styles.projectMenu}><summary aria-label="Opções do projeto">•••</summary><div><Link href={`/projetos/${project.id}/administrar`}>{participates === false ? "Administrar institucionalmente" : "Administrar projeto"}</Link></div></details>}</header><nav className={styles.workspaceTabs} aria-label="Áreas do projeto">{tabs.filter(tab => tab.allowed).map(tab => <Link key={tab.path} href={base + tab.path} aria-current={pathname === base + tab.path || (tab.path === "/documentos" && pathname.startsWith(`${base}/documentos/`)) ? "page" : undefined}>{tab.label}</Link>)}</nav></div>{children}</div>;
}
export function ProjectOverview({ workspace, members, statistics = null, statsIssue = null, teamIssue = null }: { workspace: WorkspaceOverview; members: ProjectTeamMember[]; statistics?: ActivityStatistics | null; statsIssue?: string | null; teamIssue?: string | null }) {
  const project = workspaceProject(workspace);
  const base = `/meus-projetos/${project.id}`;
  return <div className={styles.overviewLayout}><article className={styles.overviewMain}>
    <section className={styles.editorial}><h2>Sobre o projeto</h2><p style={{ whiteSpace: "pre-line" }}>{workspace.description || "Nenhuma descrição cadastrada."}</p></section>
    <section className={styles.editorial}><header className={styles.sectionHeader}><h2>Pessoas e responsabilidades</h2><Link href={`${base}/equipe`}>Ver equipe →</Link></header>{teamIssue ? <ProjectIssue issue={teamIssue}/> : !members.length ? <p>Nenhum integrante vigente.</p> : <div className={styles.peopleSummary}>{members.slice(0, 3).map(person => <div key={person.id}><Avatar name={person.memberName ?? "Integrante"} memberId={person.memberId}/><span><strong>{person.memberName ?? "Integrante indisponível"}</strong><small>{person.memberId === workspace.leaderId ? "Gestor do projeto · " : ""}{person.responsibility}</small></span></div>)}</div>}</section>
    <section className={styles.overviewPanel}><header><h2>O trabalho em perspectiva</h2></header><div className={styles.overviewStats}><div><strong>{statistics?.total ?? workspace.activityCount}</strong><span>{(statistics?.total ?? workspace.activityCount) === 1 ? "Tarefa no projeto" : "Tarefas no projeto"}</span></div><div><strong>{statistics?.inProgress ?? "—"}</strong><span>{statistics?.inProgress === 1 ? "Tarefa em andamento" : "Tarefas em andamento"}</span></div><div><strong>{statistics?.completed ?? "—"}</strong><span>{statistics?.completed === 1 ? "Tarefa concluída" : "Tarefas concluídas"}</span></div></div>{statsIssue && <ProjectIssue issue={statsIssue}/>}<footer><span>{statistics ? statistics.completionDenominator > 0 ? `${statistics.completionRate}% das tarefas não canceladas concluídas` : "Sem tarefas elegíveis para calcular o progresso" : "Contagem de atividades do workspace"}</span>{workspace.capabilities.canViewActivities && <Link href={`${base}/atividades`}>Ver planejamento →</Link>}</footer></section>
  </article><aside className={styles.overviewAside} aria-label="Situação do projeto" tabIndex={0}><h2>Situação do projeto</h2><ProjectProperties project={project}/>{workspace.capabilities.canManageAvailability && <ProjectAvailability workspace={workspace}/>}</aside></div>;
}
export function ProjectAvailability({ workspace }: { workspace: WorkspaceOverview }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  if (!workspace.capabilities.canManageAvailability) return null;
  const canOpen = workspace.status !== "CONCLUIDO" && workspace.status !== "PAUSADO" && !workspace.leadershipVacant;
  const receivingRequests = workspace.acceptingMembers && canOpen;
  return <div className={styles.asideNote}><h3>Disponibilidade de ingresso</h3><p>{receivingRequests ? "Recebendo solicitações" : workspace.acceptingMembers ? "Solicitações habilitadas, mas indisponíveis no estado atual do projeto." : "Fechada para novas solicitações"}</p><button className={styles.button} disabled={pending || (!workspace.acceptingMembers && !canOpen)} onClick={() => { setNotice(null); startTransition(async () => { const result = await setProjectAvailabilityAction(workspace.projectId, { acceptingMembers: !workspace.acceptingMembers, expectedVersion: workspace.version }); setNotice(result.issue ? result.issueText ?? projectIssueText(result.issue) : "Disponibilidade atualizada."); router.refresh(); }); }}>{pending ? "Salvando…" : workspace.acceptingMembers ? "Desativar solicitações" : "Receber solicitações"}</button>{notice && <p role="status">{notice}</p>}</div>;
}
