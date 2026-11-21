"use client";

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
  const request = requests.find(item => item.projectId === project.id && item.state === "PENDENTE");
  const interest = interests.find(item => item.projectId === project.id);
  const action = project.status === "CONCLUIDO" || participates ? null : value.capabilities.canRequestMembership ? "request" : value.capabilities.canExpressInterest ? "interest" : null;
  const previous = requests.filter(item => item.projectId === project.id && item.state !== "PENDENTE");
  return <div className={styles.page}><ProjectBreadcrumb/>
    <div className={styles.presentationLayout}><article className={styles.presentation}>
      <div className={styles.presentationActions}><ProjectMark title={project.title} large/>{value.capabilities.canManageMembers && <Link className={styles.button} href={`/projetos/${project.id}/administrar`}>Administrar projeto</Link>}</div>
      <h1>{project.title}</h1><p className={styles.lead}>{project.publicSummary}</p>
      <div className={styles.inlineProperties}><ProjectStatusBadge project={project}/><span>{project.leaderName ?? "Liderança vacante"}</span><span>{project.teamSize} {project.teamSize === 1 ? "integrante" : "integrantes"}</span></div>
      <section className={styles.participationPanel}><h2>{participates ? "Você faz parte deste projeto" : project.status === "CONCLUIDO" ? "Um ciclo concluído" : "Participação no projeto"}</h2>
        <p>{participates ? "Acompanhe as atividades, a equipe e os documentos no workspace." : action === "interest" ? "O interesse futuro fica registrado, sem criar participação ou acesso ao projeto." : action === "request" ? "Sua solicitação será analisada pela gestão autorizada do projeto." : "Este projeto não recebe novas solicitações de participação neste momento."}</p>
        {value.capabilities.canAccessWorkspace && <Link className={styles.primaryButton} href={`/meus-projetos/${project.id}`}>Abrir workspace ↗</Link>}
        {participationIssue ? <ProjectIssue issue={participationIssue}/> : action && !request && !(action === "interest" && interest) && <button className={styles.primaryButton} onClick={() => { setOpen(true); setSuccess(false); setError(null); }}>{action === "interest" ? "Manifestar interesse" : "Solicitar participação"}</button>}
        {request && <div className={styles.requestTracking}><strong>Solicitação aguardando decisão</strong><p>{request.message || "Sem mensagem adicionada."}</p></div>}
        {interest && <div className={styles.requestTracking}><strong>Interesse futuro registrado</strong><p>{interest.message || "Sem mensagem adicionada."}</p></div>}
        {previous.map(item => <div className={styles.requestTracking} key={item.id}><strong>Solicitação {requestStateLabels[item.state]?.toLocaleLowerCase("pt-BR") ?? item.state}</strong>{item.decisionMessage && <p>{item.decisionMessage}</p>}</div>)}
      </section>
      <section className={styles.editorial}><h2>Sobre o projeto</h2><p>{project.publicSummary}</p><div className={styles.privacyNote}><span aria-hidden="true">◇</span><p>Esta apresentação reúne as informações públicas do projeto. Atividades, equipe nominal e documentos dependem de acesso autorizado ao workspace.</p></div></section>
    </article><aside className={styles.propertyPanel}><h2>Informações do projeto</h2><ProjectProperties project={project}/><Link className={styles.textLink} href="/projetos">← Voltar ao catálogo</Link></aside></div>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }} title={success ? action === "interest" ? "Interesse registrado" : "Solicitação enviada" : action === "interest" ? "Manifestar interesse" : "Solicitar participação"} description={project.title}>
      {success ? <div className={styles.dialogBody}><div className={styles.successMark} aria-hidden="true">✓</div><p>{action === "interest" ? "Seu interesse foi registrado. Isso não cria participação nem concede acesso ao workspace." : "Sua solicitação foi enviada e aguarda a decisão da gestão."}</p><button className={styles.primaryButton} onClick={() => setOpen(false)}>Concluir</button></div> : <form className={styles.dialogBody} onSubmit={event => { event.preventDefault(); if (!action || pending) return; setError(null); startTransition(async () => { const result = action === "interest" ? await expressProjectInterestAction(project.id, message) : await requestProjectMembershipAction(project.id, message); if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); router.refresh(); return; } setSuccess(true); router.refresh(); }); }}>
        <label className={styles.field}>Mensagem para a gestão <span>Opcional · até 2.000 caracteres</span><textarea autoFocus value={message} disabled={pending} maxLength={2000} rows={5} onChange={event => setMessage(event.target.value)}/></label>
        {error && <p role="alert">{error}</p>}<div className={styles.dialogFooter}><button type="button" className={styles.button} disabled={pending} onClick={() => setOpen(false)}>Cancelar</button><button className={styles.primaryButton} disabled={pending}>{pending ? "Enviando…" : action === "interest" ? "Confirmar interesse" : "Enviar solicitação"}</button></div>
      </form>}
    </Dialog>
  </div>;
}
