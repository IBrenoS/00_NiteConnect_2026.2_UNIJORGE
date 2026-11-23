"use client";

import Link from "next/link";
import { useState } from "react";
import type { CatalogProject, InterestSignal, MembershipRequest, ProjectRequestEvent } from "../../lib/projects/integration-contracts";
import { projectFromCatalog } from "../../lib/projects/catalog-contract";
import { projectStatusLabels, requestStateLabels } from "../../lib/projects/presentation";
import { withdrawProjectMembershipAction } from "../../lib/projects/actions";
import { AlertDialog } from "../ui/alert-dialog";
import { EmptyProjects, ProjectIssue, ProjectMark, ProjectStatusBadge } from "./project-ui";
import { Button, FilterSelect, SearchField, buttonClassName } from "../ui";
import { FilterToolbar } from "../patterns/filter-toolbar";
import styles from "./projects.module.css";

export function ProjectDirectory({ personal = false, projects, ownProjectIds, canAdminister = false, canCreate = false, leadershipProjectIds = [], requests = [], interests = [], requestEvents = [], requestHistoryIssue = null, participationIssue = null, initialTab = "all" }: {
  personal?: boolean; projects: CatalogProject[]; ownProjectIds: string[]; canAdminister?: boolean; canCreate?: boolean; leadershipProjectIds?: string[];
  requests?: MembershipRequest[]; interests?: InterestSignal[]; requestEvents?: ProjectRequestEvent[]; requestHistoryIssue?: string | null; participationIssue?: string | null; initialTab?: "all" | "requests";
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [tab, setTab] = useState<"all" | "admin" | "requests">(initialTab);
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const [withdrawal, setWithdrawal] = useState<MembershipRequest | null>(null);
  const [withdrawalPending, setWithdrawalPending] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const own = new Set(ownProjectIds);
  const source = projects.filter(project => personal ? tab === "admin" ? canAdminister && !own.has(project.id) && project.capabilities.canAccessWorkspace : own.has(project.id) : true);
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const selected = source.filter(project => (!normalized || `${project.name} ${project.summary} ${project.leaderName ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalized)) && (status === "all" || project.status === status) && (availability === "all" || (availability === "open" ? project.capabilities.canRequestMembership : project.capabilities.canExpressInterest))).toSorted((a, b) => sort === "status" ? a.status.localeCompare(b.status) || a.name.localeCompare(b.name, "pt-BR") : a.name.localeCompare(b.name, "pt-BR"));
  const pageCount = Math.max(1, Math.ceil(selected.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = selected.slice(currentPage * 20, (currentPage + 1) * 20);
  const hasActiveFilters = Boolean(normalized) || status !== "all" || availability !== "all";
  function reset() { setQuery(""); setStatus("all"); setAvailability("all"); setPage(0); }
  const latestRequest = (projectId: string) => requests.filter(request => request.projectId === projectId).toSorted((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
  const names = new Map(projects.map(project => [project.id, project.name]));
  const requestState = (request: MembershipRequest) => request.state === "ENCERRADA" && requestEvents.some(event => event.requestId === request.id && event.type === "DESISTIDA") ? "DESISTIDA" : request.state;
  async function withdraw() {
    if (!withdrawal || withdrawalPending) return;
    setWithdrawalPending(true); setWithdrawalError(null);
    const result = await withdrawProjectMembershipAction(withdrawal.projectId, withdrawal.id, withdrawal.version);
    setWithdrawalPending(false);
    if (result.issue) { setWithdrawalError(result.issueText ?? "Não foi possível desistir deste pedido."); return; }
    setWithdrawal(null); setNotice("Pedido encerrado. A equipe do projeto não foi alterada.");
  }
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><h1>{personal ? "Meus projetos" : "Projetos"}</h1></div>{personal ? <Link href="/projetos" className={buttonClassName({ size: "compact", variant: "secondary" })}>Explorar projetos ↗</Link> : canCreate && <Link href="/projetos/novo" className={buttonClassName({ size: "compact", variant: "primary" })}>Novo projeto</Link>}</header>
    <div className={styles.tabs} aria-label="Perspectivas de projetos" role="group">
      <button aria-pressed={tab === "all"} onClick={() => { setTab("all"); setPage(0); }}>{personal ? "Participações vigentes" : "Todos os projetos"}<span>{personal ? ownProjectIds.length : projects.length}</span></button>
      {personal ? canAdminister && <button aria-pressed={tab === "admin"} onClick={() => { setTab("admin"); setPage(0); }}>Acompanhamento administrativo</button> : <button aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>Meus pedidos <span>{requests.length + interests.length}</span></button>}
    </div>
    {!personal && tab === "requests" ? <section aria-label="Seus pedidos e manifestações">
      {participationIssue ? <ProjectIssue issue={participationIssue}/> : !requests.length && !interests.length ? <EmptyProjects title="Nenhum pedido por aqui" description="Solicitações formais e manifestações antigas aparecem separadas nesta lista."/> : <div className={styles.requestCards}>
        {notice && <p role="status" className={styles.formFeedback}>{notice}</p>}
        {requestHistoryIssue && requests.some(request => request.state === "ENCERRADA") && <p role="status" className={styles.contextNote}>O histórico detalhado não carregou. Os pedidos encerrados aparecem com o estado disponível no cadastro.</p>}
        {requests.map(request => {
          const state = requestState(request);
          const project = projects.find(item => item.id === request.projectId);
          const nextStep = state === "PENDENTE" ? "A gestão responsável ainda precisa analisar o pedido." : state === "APROVADA" ? "A participação foi criada. A situação do projeto continua independente da aprovação." : state === "REJEITADA" ? "Leia a resposta da gestão. Consulte o catálogo para verificar se o ingresso continua aberto." : state === "DESISTIDA" ? "Se quiser tentar novamente, confira no catálogo se o projeto recebe novas solicitações." : "Consulte a gestão do projeto se precisar de orientação.";
          return <article className={styles.requestCard} key={request.id}>
            <div className={styles.requestCardHeader}><div><span className={styles.sectionEyebrow}>Solicitação de acesso</span><h3><Link href={`/projetos/${request.projectId}`}>{names.get(request.projectId) ?? "Projeto indisponível"}</Link></h3></div><span className={styles.badge} data-request-state={state}>{requestStateLabels[state] ?? state}</span></div>
            <dl className={styles.requestMeta}><div><dt>Enviada em</dt><dd>{new Date(request.requestedAt).toLocaleString("pt-BR")}</dd></div>{request.decidedAt && <div><dt>Atualizada em</dt><dd>{new Date(request.decidedAt).toLocaleString("pt-BR")}</dd></div>}{project && <div><dt>Situação do projeto</dt><dd>{projectStatusLabels[project.status]}</dd></div>}</dl>
            {request.message && <p className={styles.requestMessage}>{request.message}</p>}{request.decisionMessage && <p className={styles.requestDecision}><strong>Resposta:</strong> {request.decisionMessage}</p>}
            <p className={styles.requestNext}><strong>Próximo passo</strong><span>{nextStep}</span></p>
            <footer><Link href={`/projetos/${request.projectId}`}>Ver projeto</Link>{request.state === "PENDENTE" && <button type="button" onClick={() => { setWithdrawal(request); setWithdrawalError(null); }}>Desistir do pedido</button>}</footer>
            {withdrawalError && withdrawal?.id === request.id && <p role="alert" className={styles.formFeedback}>{withdrawalError}</p>}
          </article>;
        })}
        {interests.map(interest => <article className={styles.requestCard} key={interest.id}><div className={styles.requestCardHeader}><div><span className={styles.sectionEyebrow}>Registro histórico</span><h3><Link href={`/projetos/${interest.projectId}`}>{names.get(interest.projectId) ?? "Projeto indisponível"}</Link></h3></div><span className={styles.badge}>{interest.withdrawnAt ? "Manifestação retirada" : "Manifestação de interesse"}</span></div><p className={styles.requestMessage}>Este registro não é uma solicitação formal e não cria participação.{interest.message ? ` ${interest.message}` : ""}</p><small>{new Date(interest.withdrawnAt ?? interest.createdAt).toLocaleString("pt-BR")}</small><footer><Link href={`/projetos/${interest.projectId}`}>Ver projeto</Link></footer></article>)}
      </div>}
    </section> : <>
      <FilterToolbar compact onSubmit={event => event.preventDefault()}>
        <SearchField aria-label="Pesquisar projetos" placeholder="Pesquisar projetos…" maxLength={160} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} onClear={() => { setQuery(""); setPage(0); }}/>
        <FilterSelect aria-label="Situação do projeto" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">Todas as situações</option>{Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</FilterSelect>
        {!personal && <FilterSelect aria-label="Disponibilidade de participação" value={availability} onChange={event => { setAvailability(event.target.value); setPage(0); }}><option value="all">Participação</option><option value="open">Recebendo solicitações</option><option value="interest">Aceita manifestação futura</option></FilterSelect>}
        <FilterSelect aria-label="Ordenar projetos" value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}><option value="name">Nome A–Z</option><option value="status">Situação</option></FilterSelect>
      </FilterToolbar>
      <div className={styles.resultLine}><span>{selected.length} {selected.length === 1 ? "projeto" : "projetos"}</span><span>{personal ? "≡ Lista" : "▦ Galeria"}</span></div>
      {!selected.length ? <EmptyProjects title={hasActiveFilters ? "Nenhum projeto encontrado" : "Nenhum projeto disponível"} description={hasActiveFilters ? "A pesquisa e os filtros atuais não correspondem a nenhum projeto." : personal && tab === "all" ? "Você ainda não possui participação vigente nos projetos desta lista." : personal ? "Não há projetos para acompanhamento administrativo." : "Nenhum projeto está disponível no catálogo."} reset={hasActiveFilters ? reset : undefined}/> : personal ? <div className={styles.personalLayout}>
        <div className={styles.tableScroll}><table className={styles.projectTable}><thead><tr><th scope="col">Projeto</th><th scope="col">Situação</th><th scope="col">Gestor</th><th scope="col">Seu vínculo</th><th scope="col"><span className={styles.srOnly}>Abrir</span></th></tr></thead><tbody>{visible.map(value => { const project = projectFromCatalog(value); return <tr key={project.id}><td><Link href={`/meus-projetos/${project.id}`} className={styles.projectName}><ProjectMark title={project.title} imageUrl={project.imageUrl}/><span>{project.title}<small>{project.publicSummary}</small></span></Link></td><td><ProjectStatusBadge project={project}/></td><td className={styles.projectLeader}>{project.leaderName ?? "Sem gestor definido"}</td><td>{tab === "admin" ? "Acompanhamento" : leadershipProjectIds.includes(project.id) ? "Gestor do projeto" : "Integrante"}</td><td><Link href={`/meus-projetos/${project.id}`} aria-label={`Abrir workspace de ${project.title}`}>↗</Link></td></tr>; })}</tbody></table></div>
        <aside className={styles.summary}><h2>{tab === "admin" ? "Acompanhamento" : "Seus projetos"}</h2>{Object.entries(projectStatusLabels).map(([value, label]) => <div key={value}><span>{label}</span><strong>{selected.filter(project => project.status === value).length}</strong></div>)}<p>{tab === "admin" ? "Acesso administrativo é diferente de integrar a equipe." : "Apenas participações vigentes compõem esta lista."}</p></aside>
      </div> : <div className={styles.gallery}>{visible.map(value => { const project = projectFromCatalog(value); const request = latestRequest(project.id); const interest = interests.some(item => item.projectId === project.id); const state = value.membershipRequestState ?? request?.state; return <Link key={project.id} href={`/projetos/${project.id}`} className={styles.projectCard}><div className={styles.cardTop}><ProjectMark title={project.title} imageUrl={project.imageUrl}/><ProjectStatusBadge project={project}/></div><h2>{project.title}</h2><p>{project.publicSummary}</p><div className={styles.cardProperties}><span>Gestor</span><strong>{project.leaderName ?? "Sem gestor definido"}</strong><span>Equipe</span><strong>{project.teamSize} {project.teamSize === 1 ? "integrante" : "integrantes"}</strong></div><footer><span>{own.has(project.id) ? "Você participa" : state ? requestStateLabels[state] ?? state : interest ? "Manifestação registrada" : value.capabilities.canRequestMembership ? "Recebendo solicitações" : value.capabilities.canExpressInterest ? "Aceita manifestação futura" : "Novas solicitações encerradas"}</span><span aria-hidden="true">↗</span></footer></Link>; })}</div>}
      {pageCount > 1 && <nav className={styles.dialogFooter} aria-label="Paginação de projetos"><Button size="compact" variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span>Página {currentPage + 1} de {pageCount}</span><Button size="compact" variant="secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</Button></nav>}
    </>}
    <AlertDialog open={withdrawal !== null} onOpenChange={open => { if (!open && !withdrawalPending) setWithdrawal(null); }} title="Desistir da solicitação?" description="A solicitação será encerrada. Isso não altera a equipe nem a situação do projeto." confirmLabel="Desistir do pedido" pending={withdrawalPending} onConfirm={() => void withdraw()}/>
  </div>;
}
