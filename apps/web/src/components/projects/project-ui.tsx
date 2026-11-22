"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectDisplay } from "../../lib/projects/presentation";
import { projectStatusLabels, projectIssueText } from "../../lib/projects/presentation";
import styles from "./projects.module.css";
import { MemberAvatar } from "../ui/member-avatar";

export function TemporaryNotice() {
  return <p className={styles.temporary}><span aria-hidden="true">◌</span> Dados de exemplo · As alterações ficam apenas nesta sessão da interface e não são enviadas.</p>;
}
export function ProjectMark({ title, large = false }: { title: string; large?: boolean }) {
  return <span aria-hidden="true" className={`${styles.mark} ${large ? styles.markLarge : ""}`}>{title.split(" ").slice(0, 2).map(word => word[0]).join("")}</span>;
}
export function Avatar({ name, memberId }: { name: string; memberId?: string | null }) {
  return <MemberAvatar name={name} memberId={memberId} className={styles.avatar}/>;
}
export function ProjectStatusBadge({ project }: { project: ProjectDisplay }) {
  return <span className={styles.projectStatus} data-status={project.status}>{projectStatusLabels[project.status]}</span>;
}
export function EmptyProjects({ title, description, reset, resetLabel = "Limpar filtros" }: { title: string; description: string; reset?: () => void; resetLabel?: string }) {
  return <div className={styles.empty}><span aria-hidden="true">▦</span><h2>{title}</h2><p>{description}</p>{reset && <button className={styles.button} onClick={reset}>{resetLabel}</button>}</div>;
}
export function ProjectProperties({ project }: { project: ProjectDisplay }) {
  const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "Não definido";
  return <dl className={styles.properties}>
    <div><dt>Situação</dt><dd><ProjectStatusBadge project={project}/></dd></div>
    <div><dt>Gestor</dt><dd>{project.leaderName ? <><Avatar name={project.leaderName} memberId={project.leaderId}/>{project.leaderName}</> : "Liderança vacante"}</dd></div>
    <div><dt>Integrantes</dt><dd>{project.teamSize} {project.teamSize === 1 ? "integrante" : "integrantes"}</dd></div>
    <div><dt>Início</dt><dd>{date(project.startsOn)}</dd></div>
    <div><dt>Previsão de término</dt><dd>{date(project.endsOn)}</dd></div>
    <div><dt>Ingresso</dt><dd>{project.canRequestMembership ? "Recebendo solicitações" : project.canExpressInterest ? "Aberto a manifestações de interesse" : project.canRequestMembership === false || project.canExpressInterest === false ? "Indisponível no momento" : project.acceptingMembers && project.status !== "CONCLUIDO" && project.status !== "PAUSADO" && !project.leadershipVacant ? "Recebendo solicitações" : "Indisponível no momento"}</dd></div>
  </dl>;
}
export function ProjectBreadcrumb({ personal = false }: { title?: string; personal?: boolean }) {
  return <nav aria-label="Caminho de navegação" className={styles.breadcrumb}><Link href={personal ? "/meus-projetos" : "/projetos"}>{personal ? "Meus projetos" : "Projetos"}</Link></nav>;
}

export function ProjectIssue({ issue }: { issue: string }) {
  const router = useRouter();
  return <div className={styles.contextNote}><p role="alert">{projectIssueText(issue)}</p>{issue === "unauthenticated" ? <Link href="/login" className={styles.button}>Entrar novamente</Link> : issue === "unavailable" || issue === "invalid" ? <button className={styles.button} onClick={() => router.refresh()}>Tentar novamente</button> : null}</div>;
}
