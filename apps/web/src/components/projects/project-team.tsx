"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../ui/dialog";
import type { WorkspaceOverview, ProjectTeamMember, MembershipRequest } from "../../lib/projects/integration-contracts";
import { decideProjectMembershipAction } from "../../lib/projects/actions";
import { projectIssueText, requestStateLabels } from "../../lib/projects/presentation";
import { Avatar, EmptyProjects, ProjectIssue } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectTeam({ workspace, members, requests, requestsIssue = null }: { workspace: WorkspaceOverview; members: ProjectTeamMember[]; requests: MembershipRequest[]; requestsIssue?: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState("members");
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState<{ request: MembershipRequest; approve: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canDecide = workspace.capabilities.canDecideRequests;
  const pendingRequests = requests.filter(request => request.state === "PENDENTE");
  const people = members.filter(person => `${person.memberName ?? ""} ${person.responsibility}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return <section className={styles.sectionPage}><header className={styles.sectionHeader}><h2>Equipe</h2><span className={styles.badge}>{members.length} integrantes</span></header>
    <div className={styles.tabs} role="group" aria-label="Perspectivas da equipe"><button aria-pressed={tab === "members"} onClick={() => setTab("members")}>Integrantes</button>{canDecide && <button aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>Solicitações <span>{pendingRequests.length}</span></button>}</div>
    {tab === "members" ? <><label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar integrantes" value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar integrantes…"/></label><div className={styles.teamList}>{people.map(person => <article className={styles.personRow} key={person.id}><Avatar name={person.memberName ?? "Integrante"}/><div><h3>{person.memberName ?? "Integrante indisponível"}</h3><p>{person.responsibility}</p></div><span className={styles.badge}>{person.memberId === workspace.leaderId ? "Gestor do projeto" : "Integrante"}</span></article>)}</div>{!people.length && <EmptyProjects title="Nenhum integrante encontrado" description="Nenhuma participação vigente corresponde à pesquisa." reset={() => setQuery("")}/>}</> : canDecide && <>
      <div className={styles.sectionHeader}><h3>Solicitações de participação ({pendingRequests.length})</h3></div>{requestsIssue ? <ProjectIssue issue={requestsIssue}/> : !requests.length ? <EmptyProjects title="Nenhuma solicitação" description="Os pedidos de participação deste projeto aparecerão aqui."/> : requests.map(request => <article key={request.id} className={styles.requestRow}><Avatar name={request.memberName ?? "Integrante"}/><div className={styles.requestContent}><h3>{request.memberName ?? `Integrante ${request.memberId}`} <small>Solicitação de participação</small></h3><p>{request.message || "Sem mensagem adicionada."}</p>{request.decisionMessage && <p>Resposta: {request.decisionMessage}</p>}</div>{request.state === "PENDENTE" ? <div className={styles.rowActions}><button className={styles.primaryButton} onClick={() => { setDecision({ request, approve: true }); setMessage(""); setError(null); }}>Aprovar</button><button className={styles.button} onClick={() => { setDecision({ request, approve: false }); setMessage(""); setError(null); }}>Rejeitar</button></div> : <span role="status" className={styles.badge}>{requestStateLabels[request.state] ?? request.state}</span>}</article>)}
    </>}
    <Dialog open={decision !== null} onOpenChange={open => { if (!open && !pending) setDecision(null); }} title={decision?.approve ? "Aprovar solicitação" : "Rejeitar solicitação"} description={decision?.request.memberName ?? undefined}>
      <form className={styles.dialogBody} onSubmit={event => { event.preventDefault(); if (!decision || !canDecide || pending) return; setError(null); startTransition(async () => { const result = await decideProjectMembershipAction(workspace.projectId, decision.request.id, { approve: decision.approve, message, expectedVersion: decision.request.version }); if (result.issue) setError(result.issueText ?? projectIssueText(result.issue)); else setDecision(null); router.refresh(); }); }}><p>{decision?.approve ? "A aprovação cria uma participação vigente na equipe do projeto." : "A rejeição encerra este pedido sem criar participação."}</p><label className={styles.field}>Resposta opcional<textarea disabled={pending} maxLength={2000} rows={4} value={message} onChange={event => setMessage(event.target.value)}/></label>{error && <p role="alert">{error}</p>}<div className={styles.dialogFooter}><button type="button" disabled={pending} className={styles.button} onClick={() => setDecision(null)}>Cancelar</button><button disabled={pending} className={styles.primaryButton}>{pending ? "Salvando…" : "Confirmar decisão"}</button></div></form>
    </Dialog>
  </section>;
}
