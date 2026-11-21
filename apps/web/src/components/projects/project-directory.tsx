"use client";

import Link from "next/link";
import { useState } from "react";
import type { CatalogProject, MembershipRequest, InterestSignal } from "../../lib/projects/integration-contracts";
import { projectFromCatalog } from "../../lib/projects/catalog-contract";
import { projectStatusLabels, requestStateLabels } from "../../lib/projects/presentation";
import { EmptyProjects, ProjectIssue, ProjectMark, ProjectStatusBadge } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectDirectory({ personal = false, projects, ownProjectIds, canAdminister = false, canCreate = false, leadershipProjectIds = [], requests = [], interests = [], participationIssue = null }: {
  personal?: boolean; projects: CatalogProject[]; ownProjectIds: string[]; canAdminister?: boolean; canCreate?: boolean; leadershipProjectIds?: string[]; requests?: MembershipRequest[]; interests?: InterestSignal[]; participationIssue?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const own = new Set(ownProjectIds);
  const source = projects.filter(project => personal ? tab === "admin" ? canAdminister && !own.has(project.id) && project.capabilities.canAccessWorkspace : own.has(project.id) : true);
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const selected = source.filter(project => (!normalized || `${project.name} ${project.summary} ${project.leaderName ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalized)) && (status === "all" || project.status === status) && (availability === "all" || (availability === "open" ? project.acceptingMembers && project.status !== "PAUSADO" && project.status !== "CONCLUIDO" && !project.leadershipVacant : project.capabilities.canExpressInterest))).toSorted((a, b) => sort === "status" ? a.status.localeCompare(b.status) || a.name.localeCompare(b.name, "pt-BR") : a.name.localeCompare(b.name, "pt-BR"));
  const pageCount = Math.max(1, Math.ceil(selected.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = selected.slice(currentPage * 20, (currentPage + 1) * 20);
  const hasActiveFilters = Boolean(normalized) || status !== "all" || availability !== "all";
  function reset() { setQuery(""); setStatus("all"); setAvailability("all"); setPage(0); }
  const latestRequest = (projectId: string) => requests.find(request => request.projectId === projectId);
  const names = new Map(projects.map(project => [project.id, project.name]));
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><h1>{personal ? "Meus projetos" : "Projetos"}</h1></div>{personal ? <Link href="/projetos" className={styles.button}>Explorar projetos ↗</Link> : canCreate && <Link href="/projetos/novo" className={styles.primaryButton}>Novo projeto</Link>}</header>
    <div className={styles.tabs} aria-label="Perspectivas de projetos" role="group">
      <button aria-pressed={tab === "all"} onClick={() => { setTab("all"); setPage(0); }}>{personal ? "Participações vigentes" : "Todos os projetos"}<span>{personal ? ownProjectIds.length : projects.length}</span></button>
      {personal ? canAdminister && <button aria-pressed={tab === "admin"} onClick={() => { setTab("admin"); setPage(0); }}>Acompanhamento administrativo</button> : <button aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>Meus pedidos <span>{requests.length + interests.length}</span></button>}
    </div>
    {personal && tab === "admin" && <p className={styles.contextNote}>Acesso para acompanhamento. Estes projetos não representam participação na equipe.</p>}
    {!personal && tab === "requests" ? <section aria-label="Seus pedidos e interesses">
      {participationIssue ? <ProjectIssue issue={participationIssue}/> : !requests.length && !interests.length ? <EmptyProjects title="Nenhum pedido por aqui" description="Suas solicitações e manifestações de interesse aparecerão aqui."/> : <div className={styles.teamList}>
        {requests.map(request => <article className={styles.requestRow} key={request.id}><div className={styles.requestContent}><h3><Link href={`/projetos/${request.projectId}`}>{names.get(request.projectId) ?? "Projeto indisponível"}</Link></h3><p>{request.message || "Sem mensagem adicionada."}</p>{request.decisionMessage && <p>Resposta: {request.decisionMessage}</p>}<small>{new Date(request.requestedAt).toLocaleDateString("pt-BR")}</small></div><span className={styles.badge}>{requestStateLabels[request.state] ?? request.state}</span></article>)}
        {interests.map(interest => <article className={styles.requestRow} key={interest.id}><div className={styles.requestContent}><h3><Link href={`/projetos/${interest.projectId}`}>{names.get(interest.projectId) ?? "Projeto indisponível"}</Link></h3><p>{interest.message || "Sem mensagem adicionada."}</p></div><span className={styles.badge}>Interesse futuro registrado</span></article>)}
      </div>}
    </section> : <>
    <div className={styles.toolbar}>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar projetos" placeholder="Pesquisar projetos…" maxLength={160} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}/>{query && <button onClick={() => { setQuery(""); setPage(0); }} aria-label="Limpar pesquisa">×</button>}</label>
      <select aria-label="Situação do projeto" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">Todas as situações</option>{Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      {!personal && <select aria-label="Disponibilidade de participação" value={availability} onChange={event => { setAvailability(event.target.value); setPage(0); }}><option value="all">Participação</option><option value="open">Recebendo solicitações</option><option value="interest">Manifestar interesse</option></select>}
      <select aria-label="Ordenar projetos" value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}><option value="name">Nome A–Z</option><option value="status">Situação</option></select>
    </div>
    <div className={styles.resultLine}><span>{selected.length} {selected.length === 1 ? "projeto" : "projetos"}</span><span>{personal ? "≡ Lista" : "▦ Galeria"}</span></div>
    {!selected.length ? <EmptyProjects title={hasActiveFilters ? "Nenhum projeto encontrado" : "Nenhum projeto disponível"} description={hasActiveFilters ? "A pesquisa e os filtros atuais não correspondem a nenhum projeto." : personal && tab === "all" ? "Você ainda não possui participação vigente nos projetos desta lista." : personal ? "Não há projetos para acompanhamento administrativo." : "Nenhum projeto está disponível no catálogo."} reset={hasActiveFilters ? reset : undefined}/> : personal ? <div className={styles.personalLayout}>
      <div className={styles.tableScroll}><table className={styles.projectTable}><thead><tr><th scope="col">Projeto</th><th scope="col">Situação</th><th scope="col">Gestor</th><th scope="col">Seu vínculo</th><th scope="col"><span className={styles.srOnly}>Abrir</span></th></tr></thead><tbody>{visible.map(value => { const project = projectFromCatalog(value); return <tr key={project.id}><td><Link href={`/meus-projetos/${project.id}`} className={styles.projectName}><ProjectMark title={project.title}/><span>{project.title}<small>{project.publicSummary}</small></span></Link></td><td><ProjectStatusBadge project={project}/></td><td className={styles.projectLeader}>{project.leaderName ?? "Liderança vacante"}</td><td>{tab === "admin" ? "Acompanhamento" : leadershipProjectIds.includes(project.id) ? "Gestor do projeto" : "Integrante"}</td><td><Link href={`/meus-projetos/${project.id}`} aria-label={`Abrir workspace de ${project.title}`}>↗</Link></td></tr>; })}</tbody></table></div>
      <aside className={styles.summary}><h2>{tab === "admin" ? "Acompanhamento" : "Seus projetos"}</h2>{Object.entries(projectStatusLabels).map(([value, label]) => <div key={value}><span>{label}</span><strong>{selected.filter(project => project.status === value).length}</strong></div>)}<p>{tab === "admin" ? "Acesso administrativo é diferente de integrar a equipe." : "Apenas participações vigentes compõem esta lista."}</p></aside>
    </div> : <div className={styles.gallery}>{visible.map(value => { const project = projectFromCatalog(value); const request = latestRequest(project.id); return <Link key={project.id} href={`/projetos/${project.id}`} className={styles.projectCard}><div className={styles.cardTop}><ProjectMark title={project.title}/><ProjectStatusBadge project={project}/></div><h2>{project.title}</h2><p>{project.publicSummary}</p><div className={styles.cardProperties}><span>Gestor</span><strong>{project.leaderName ?? "Liderança vacante"}</strong><span>Equipe</span><strong>{project.teamSize} {project.teamSize === 1 ? "integrante" : "integrantes"}</strong></div><footer><span>{own.has(project.id) ? "Você participa" : request ? requestStateLabels[request.state] ?? request.state : interests.some(interest => interest.projectId === project.id) ? "Interesse registrado" : value.capabilities.canRequestMembership ? "Recebendo solicitações" : value.capabilities.canExpressInterest ? "Aberto a interesse futuro" : "Novas participações encerradas"}</span><span aria-hidden="true">↗</span></footer></Link>; })}</div>}
    {pageCount > 1 && <nav className={styles.dialogFooter} aria-label="Paginação de projetos"><button className={styles.button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage + 1} de {pageCount}</span><button className={styles.button} disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button></nav>}
    </>}
  </div>;
}
