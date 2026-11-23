"use client";

import { buttonClassName } from "../ui/button";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectDisplay } from "../../lib/projects/presentation";
import { projectStatusLabels, projectIssueText } from "../../lib/projects/presentation";
import styles from "./projects.module.css";
import { MemberAvatar } from "../ui/member-avatar";
import Image from "next/image";

export function TemporaryNotice() {
  return <p className={styles.temporary}><span aria-hidden="true">◌</span> Dados de exemplo · As alterações ficam apenas nesta sessão da interface e não são enviadas.</p>;
}
export function ProjectMark({ title, detail = false, imageUrl = null }: { title: string; detail?: boolean; imageUrl?: string | null }) {
  return <span aria-hidden="true" className={`${styles.mark} ${detail ? styles.detailMark : ""}`}>{imageUrl ? <Image src={imageUrl} alt="" width={400} height={250} unoptimized/> : title.split(" ").slice(0, 2).map(word => word[0]).join("").toLocaleUpperCase("pt-BR")}</span>;
}
export function Avatar({ name, memberId }: { name: string; memberId?: string | null }) {
  return <MemberAvatar name={name} memberId={memberId} className={styles.avatar}/>;
}
export function ProjectStatusBadge({ project }: { project: ProjectDisplay }) {
  return <span className={styles.projectStatus} data-status={project.status}>{projectStatusLabels[project.status]}</span>;
}
export function EmptyProjects({ title, description, reset, resetLabel = "Limpar filtros" }: { title: string; description: string; reset?: () => void; resetLabel?: string }) {
  return <div className={styles.empty}><span aria-hidden="true">▦</span><h2>{title}</h2><p>{description}</p>{reset && <button className={buttonClassName({ size: "compact", variant: "secondary" })} onClick={reset}>{resetLabel}</button>}</div>;
}
export function ProjectProperties({ project, participates = false }: { project: ProjectDisplay; participates?: boolean }) {
  const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "Não definido";
  return <dl className={styles.properties}>
    <div><dt>Situação</dt><dd><ProjectStatusBadge project={project}/></dd></div>
      <div><dt>Gestor</dt><dd>{project.leaderName ? <><Avatar name={project.leaderName} memberId={project.leaderId}/>{project.leaderName}</> : "Sem gestor definido"}</dd></div>
    <div><dt>Integrantes</dt><dd>{project.teamSize} {project.teamSize === 1 ? "integrante" : "integrantes"}</dd></div>
    <div><dt>Início</dt><dd>{date(project.startsOn)}</dd></div>
    <div><dt>Previsão de término</dt><dd>{date(project.endsOn)}</dd></div>
    <div><dt>Ingresso</dt><dd>{participates ? "Você já participa deste projeto" : project.canRequestMembership ? project.status === "PAUSADO" ? "Recebendo pedidos durante a pausa" : "Recebendo pedidos de acesso" : project.canExpressInterest ? "Aceita manifestações futuras" : project.status === "CONCLUIDO" ? "Projeto concluído" : !project.acceptingMembers ? "Fechado pela gestão" : "Indisponível para sua conta"}</dd></div>
  </dl>;
}
export function ProjectBreadcrumb({ personal = false }: { title?: string; personal?: boolean }) {
  return <nav aria-label="Caminho de navegação" className={styles.breadcrumb}><Link href={personal ? "/meus-projetos" : "/projetos"}>{personal ? "Meus projetos" : "Projetos"}</Link></nav>;
}

export function ProjectIssue({ issue }: { issue: string }) {
  const router = useRouter();
  return <div className={styles.contextNote}><p role="alert">{projectIssueText(issue)}</p>{issue === "unauthenticated" ? <Link href="/login" className={buttonClassName({ size: "compact", variant: "secondary" })}>Entrar novamente</Link> : issue === "unavailable" || issue === "invalid" ? <button className={buttonClassName({ size: "compact", variant: "secondary" })} onClick={() => router.refresh()}>Tentar novamente</button> : null}</div>;
}
