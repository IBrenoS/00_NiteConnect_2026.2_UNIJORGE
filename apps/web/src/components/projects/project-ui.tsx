"use client";

import Link from "next/link";
import type { CatalogProject } from "../../lib/projects/visual-data";
import { projectStatusLabels } from "../../lib/projects/visual-data";
import styles from "./projects.module.css";

export function TemporaryNotice() {
  return <p className={styles.temporary}><span aria-hidden="true">◌</span> Dados de exemplo · As alterações ficam apenas nesta sessão da interface e não são enviadas.</p>;
}
export function ProjectMark({ title, large = false }: { title: string; large?: boolean }) {
  return <span aria-hidden="true" className={`${styles.mark} ${large ? styles.markLarge : ""}`}>{title.split(" ").slice(0, 2).map(word => word[0]).join("")}</span>;
}
export function Avatar({ name }: { name: string }) {
  return <span aria-hidden="true" className={styles.avatar}>{name.split(" ").slice(0, 2).map(word => word[0]).join("")}</span>;
}
export function ProjectStatusBadge({ project }: { project: CatalogProject }) {
  return <span className={styles.badge} data-status={project.status}><span aria-hidden="true">●</span> {projectStatusLabels[project.status]}</span>;
}
export function EmptyProjects({ title, description, reset }: { title: string; description: string; reset?: () => void }) {
  return <div className={styles.empty}><span aria-hidden="true">▦</span><h2>{title}</h2><p>{description}</p>{reset && <button className={styles.button} onClick={reset}>Limpar filtros</button>}</div>;
}
export function ProjectProperties({ project }: { project: CatalogProject }) {
  const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "Não definido";
  return <dl className={styles.properties}>
    <div><dt>Situação</dt><dd><ProjectStatusBadge project={project}/></dd></div>
    <div><dt>Gestor</dt><dd>{project.leaderName ? <><Avatar name={project.leaderName}/>{project.leaderName}</> : "Liderança vacante"}</dd></div>
    <div><dt>Integrantes</dt><dd>{project.teamSize} integrantes</dd></div>
    <div><dt>Início</dt><dd>{date(project.startsOn)}</dd></div>
    <div><dt>Previsão de término</dt><dd>{date(project.endsOn)}</dd></div>
    <div><dt>Novas participações</dt><dd>{project.acceptingMembers && project.status !== "CONCLUIDO" && project.status !== "PAUSADO" && !project.leadershipVacant ? "Recebendo solicitações" : "Indisponíveis no momento"}</dd></div>
  </dl>;
}
export function ProjectBreadcrumb({ title, personal = false }: { title?: string; personal?: boolean }) {
  return <nav aria-label="Caminho de navegação" className={styles.breadcrumb}><Link href={personal ? "/meus-projetos" : "/projetos"}>{personal ? "Meus projetos" : "Projetos"}</Link>{title && <><span aria-hidden="true">/</span><span>{title}</span></>}</nav>;
}
