"use client";

import { useState } from "react";
import { Dialog } from "../ui/dialog";
import type { VisualRequest } from "../../lib/projects/visual-data";
import { useProjectVisual } from "./project-visual-provider";
import { Avatar, EmptyProjects } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectTeam({ projectId }: { projectId: string }) {
  const { canAdminister, requests, setRequests, workspaces } = useProjectVisual();
  const workspace = workspaces.find(w => w.projectId === projectId)!;
  const [tab, setTab] = useState("members");
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState<{ request: VisualRequest; approve: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const projectRequests = requests.filter(r => r.projectId === projectId);
  const pending = projectRequests.filter(r => r.state === "PENDENTE");
  const people = workspace.people.filter(p => `${p.name} ${p.responsibility}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return <section className={styles.sectionPage}><header className={styles.sectionHeader}><div><h2>Equipe</h2><p>Pessoas que constroem este projeto.</p></div><span className={styles.badge}>{workspace.people.length} integrantes · exemplo</span></header>
    <div className={styles.tabs} role="group" aria-label="Perspectivas da equipe"><button aria-pressed={tab === "members"} onClick={() => setTab("members")}>Integrantes</button>{canAdminister && <button aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>Solicitações <span>{pending.length}</span></button>}</div>
    {tab === "members" ? <><label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar integrantes" value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar integrantes…"/></label><div className={styles.teamList}>{people.map(person => <article className={styles.personRow} key={person.id}><Avatar name={person.name}/><div><h3>{person.name}</h3><p>{person.responsibility}</p></div><span className={styles.badge}>{person.leader ? "Gestor do projeto" : "Integrante"}</span></article>)}</div>{!people.length && <EmptyProjects title="Nenhum integrante encontrado" description="Ajuste a pesquisa para encontrar uma pessoa da equipe." reset={() => setQuery("")}/>}</> : canAdminister && <><div className={styles.sectionHeader}><h3>Solicitações de participação ({pending.length})</h3><span className={styles.muted}>Decisões locais · sem persistência</span></div>{!projectRequests.length && <EmptyProjects title="Nenhuma solicitação" description="Novos pedidos aparecerão aqui quando a integração estiver disponível."/>}{projectRequests.map(request => <article key={request.id} className={styles.requestRow}><Avatar name={request.memberName}/><div className={styles.requestContent}><h3>{request.memberName} <small>Solicitação de participação</small></h3><p>{request.message}</p>{request.decisionMessage && <p>Resposta: {request.decisionMessage}</p>}</div>{request.state === "PENDENTE" ? <div className={styles.rowActions}><button className={styles.primaryButton} onClick={() => { setDecision({ request, approve: true }); setMessage(""); }}>Aprovar</button><button className={styles.button} onClick={() => { setDecision({ request, approve: false }); setMessage(""); }}>Rejeitar</button></div> : <span role="status" className={styles.badge}>{request.state === "APROVADA" ? "Aprovada" : "Rejeitada"} · exemplo</span>}</article>)}</>}
    <Dialog open={decision !== null} onOpenChange={open => { if (!open) setDecision(null); }} title={decision?.approve ? "Aprovar solicitação" : "Rejeitar solicitação"} description={decision?.request.memberName}>
      <form className={styles.dialogBody} onSubmit={event => { event.preventDefault(); if (!decision || !canAdminister) return; setRequests(items => items.map(r => r.id === decision.request.id && r.state === "PENDENTE" ? { ...r, state: decision.approve ? "APROVADA" : "REJEITADA", version: r.version + 1, decisionMessage: message.trim() || null } : r)); setDecision(null); }}><p>A decisão altera somente o pedido fictício nesta sessão. Não adiciona integrantes nem concede acesso real.</p><label className={styles.field}>Resposta opcional<textarea maxLength={2000} rows={4} value={message} onChange={e => setMessage(e.target.value)}/></label><div className={styles.dialogFooter}><button type="button" className={styles.button} onClick={() => setDecision(null)}>Cancelar</button><button className={styles.primaryButton}>Confirmar decisão local</button></div></form>
    </Dialog>
  </section>;
}
