"use client";

import { buttonClassName } from "../ui/button";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../ui/dialog";
import type { CatalogProject, MembershipRequest, InterestSignal } from "../../lib/projects/integration-contracts";
import { projectFromCatalog } from "../../lib/projects/catalog-contract";
import { projectIssueText, requestStateLabels } from "../../lib/projects/presentation";
import { requestProjectMembershipAction, expressProjectInterestAction } from "../../lib/projects/actions";
import { ProjectBreadcrumb, ProjectIssue, ProjectMark, ProjectProperties, ProjectStatusBadge } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectPresentation({ project: value, requests, interests, participates = false, participationIssue = null }: { project: CatalogProject; requests: MembershipRequest[]; interests: InterestSignal[]; participates?: boolean; participationIssue?: string | null }) {
  const project = projectFromCatalog(value);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const request = requests.filter(item => item.projectId === project.id).toSorted((a,b)=>b.requestedAt.localeCompare(a.requestedAt))[0];
  const interest = interests.find(item => item.projectId === project.id);
  const pendingRequest = request?.state === "PENDENTE" || value.membershipRequestState === "PENDENTE";
  const action = project.status === "CONCLUIDO" || participates ? null : value.capabilities.canRequestMembership ? "request" : value.capabilities.canExpressInterest ? "interest" : null;
  const previous = requests.filter(item => item.projectId === project.id && item.state !== "PENDENTE");
  const unavailableReason = participates ? "Você já participa deste projeto." : project.status === "CONCLUIDO" ? "Projetos concluídos não recebem novas solicitações." : !project.acceptingMembers ? "A gestão fechou o recebimento de solicitações." : "As solicitações não estão disponíveis para sua conta neste momento.";
  return <div className={styles.page}><ProjectBreadcrumb/>
    <div className={`${styles.detailLayout} ${styles.presentationLayout}`}><article className={styles.presentation}>
      <div className={styles.presentationActions}><ProjectMark title={project.title} detail imageUrl={project.imageUrl}/>{value.capabilities.canManageMembers && <Link className={buttonClassName({ size: "compact", variant: "secondary" })} href={`/projetos/${project.id}/administrar`}>Administrar projeto</Link>}</div>
      <h1>{project.title}</h1><p className={styles.lead}>{project.publicSummary}</p>
      <div className={styles.inlineProperties}><ProjectStatusBadge project={project}/><span>{project.leaderName ?? "Sem gestor definido"}</span><span>{project.teamSize} {project.teamSize === 1 ? "integrante" : "integrantes"}</span></div>
      <section className={styles.participationPanel}><h2>{participates ? "Você faz parte deste projeto" : project.status === "CONCLUIDO" ? "Um ciclo concluído" : "Participação no projeto"}</h2>
        <p>{participates ? "Acompanhe as atividades, a equipe e os documentos no workspace." : action === "interest" ? "A manifestação histórica não cria participação nem acesso ao projeto." : action === "request" ? "Sua solicitação será analisada pela gestão autorizada do projeto, mesmo que o projeto esteja pausado ou sem gestor definido." : unavailableReason}</p>
        {value.capabilities.canAccessWorkspace && <Link className={buttonClassName({ size: "compact", variant: "primary" })} href={`/meus-projetos/${project.id}`}>Abrir workspace ↗</Link>}
        {participationIssue ? <ProjectIssue issue={participationIssue}/> : action && !pendingRequest && !(action === "interest" && interest) && <button className={buttonClassName({ size: "compact", variant: "primary" })} onClick={() => { setOpen(true); setSuccess(false); setError(null); }}>{action === "interest" ? "Registrar interesse futuro" : "Solicitar acesso"}</button>}
        {pendingRequest && <div className={styles.requestTracking}><strong>Pedido aguardando análise</strong><p>{request?.message || "A equipe responsável ainda precisa analisar o seu pedido."} <Link href="/projetos?tab=requests">Acompanhar em Meus pedidos</Link></p></div>}
        {interest && <div className={styles.requestTracking}><strong>{interest.withdrawnAt ? "Manifestação histórica retirada" : "Manifestação de interesse registrada"}</strong><p>Este registro não é uma solicitação formal e não cria participação.{interest.message ? ` ${interest.message}` : ""}</p></div>}
        {previous.map(item => <div className={styles.requestTracking} key={item.id}><strong>Solicitação {requestStateLabels[item.state]?.toLocaleLowerCase("pt-BR") ?? item.state}</strong>{item.decisionMessage && <p>{item.decisionMessage}</p>}</div>)}
      </section>
      <section className={styles.editorial}><h2>Sobre o projeto</h2><p>{project.publicSummary}</p></section>
    </article><aside className={styles.propertyPanel}><h2>Informações do projeto</h2><ProjectProperties project={project} participates={participates}/><Link className={styles.textLink} href="/projetos">← Voltar ao catálogo</Link></aside></div>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }} title={success ? action === "interest" ? "Interesse registrado" : "Pedido enviado" : action === "interest" ? "Registrar interesse futuro" : "Solicitar acesso"} description={project.title}>
      {success ? <div className={styles.dialogBody}><div className={styles.successMark} aria-hidden="true">✓</div><p>{action === "interest" ? "A manifestação foi registrada como histórico e não cria participação nem concede acesso ao workspace." : "Seu pedido foi enviado e pode ser acompanhado em Meus pedidos."}</p><button className={buttonClassName({ size: "compact", variant: "primary" })} onClick={() => setOpen(false)}>Concluir</button></div> : <form className={styles.dialogBody} onSubmit={event => { event.preventDefault(); if (!action || pending) return; setError(null); startTransition(async () => { const result = action === "interest" ? await expressProjectInterestAction(project.id, message) : await requestProjectMembershipAction(project.id, message); if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); router.refresh(); return; } setSuccess(true); router.refresh(); }); }}>
        <label className={styles.field}>Mensagem para a gestão <span>Opcional · até 2.000 caracteres</span><textarea autoFocus value={message} disabled={pending} maxLength={2000} rows={5} onChange={event => setMessage(event.target.value)}/></label>
        {error && <p role="alert">{error}</p>}<div className={styles.dialogFooter}><button type="button" className={buttonClassName({ size: "compact", variant: "secondary" })} disabled={pending} onClick={() => setOpen(false)}>Cancelar</button><button className={buttonClassName({ size: "compact", variant: "primary" })} disabled={pending}>{pending ? "Enviando…" : action === "interest" ? "Registrar interesse" : "Enviar pedido"}</button></div>
      </form>}
    </Dialog>
  </div>;
}
