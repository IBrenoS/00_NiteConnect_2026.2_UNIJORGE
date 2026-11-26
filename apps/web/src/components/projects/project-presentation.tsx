"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CatalogProject, MembershipRequest, ProjectTeamMember, WorkspaceOverview } from "../../lib/projects/integration-contracts";
import { projectFromCatalog } from "../../lib/projects/catalog-contract";
import { projectIssueText, projectStatusLabels } from "../../lib/projects/presentation";
import { requestProjectMembershipAction } from "../../lib/projects/actions";
import { ProjectEditDialog } from "./project-administration-contexts";
import { ProjectContextMenu } from "./project-context-menu";
import { Avatar, ProjectIssue } from "./project-ui";
import { Button, buttonClassName } from "../ui/button";
import { Dialog } from "../ui/dialog";
import styles from "./project-administration-layout.module.css";

function formatDate(value: string | null): string {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Não definida";
}

export function ProjectPresentation({ project: value, requests, participates = false, participationIssue = null, members = [], memberIssue = null, workspace = null, editOpen = false }: {
  project: CatalogProject; requests: MembershipRequest[]; participates?: boolean; participationIssue?: string | null; members?: ProjectTeamMember[]; memberIssue?: string | null; workspace?: WorkspaceOverview | null; editOpen?: boolean;
}) {
  const project = projectFromCatalog(value);
  const router = useRouter();
  const [requestOpen, setRequestOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pendingRequest = requests.find(item => item.projectId === project.id && item.state === "PENDENTE") ?? null;
  const hasPendingRequest = Boolean(pendingRequest) || value.membershipRequestState === "PENDENTE";
  const canViewTeam = value.capabilities.canAccessWorkspace || value.capabilities.canManageMembers || value.capabilities.canDecideRequests || Boolean(workspace?.capabilities.canTransferLeadership);
  const canConfigure = value.capabilities.canEditProject || value.capabilities.canManageAvailability || value.capabilities.canManageMembers;
  const canRequest = value.capabilities.canRequestMembership && !participates && value.status !== "CONCLUIDO";
  const visibleMembers = members.slice(0, 4);

  function closeEdit() {
    router.replace(`/projetos/${encodeURIComponent(project.id)}`, { scroll: false });
  }

  return <div className={styles.content}>
    <div className={styles.presentationTop}>
      <div><span className={styles.eyebrow}>PROJETO</span><h1>{project.title}</h1></div>
      <ProjectContextMenu projectId={project.id} name={project.title} canEdit={value.capabilities.canEditProject} canManageTeam={value.capabilities.canManageMembers || value.capabilities.canDecideRequests || Boolean(workspace?.capabilities.canTransferLeadership)} canConfigure={canConfigure} canDelete={value.capabilities.canDeleteProject}/>
    </div>
    <div className={styles.projectHero} aria-label={`Capa de ${project.title}`}>
      {project.imageUrl ? <Image src={project.imageUrl} alt="" fill sizes="(max-width: 700px) 100vw, 1180px" unoptimized className={styles.heroImage}/> : null}
      <span className={styles.heroKicker}>NITE CONNECT <i>·</i> PROJETO</span><strong>{project.publicSummary}</strong><span className={styles.heroArtwork} aria-hidden="true" />
    </div>
    <div className={styles.presentationGrid}>
      <article className={styles.projectDetails}>
        <div className={styles.projectStatusLine}><span className={`${styles.statusDot} ${styles[`statusDot_${project.status}`]}`} /> {projectStatusLabels[project.status]} <span className={styles.detailDivider}>·</span> {project.teamSize} {project.teamSize === 1 ? "integrante" : "integrantes"}</div>
        <section className={styles.projectPeople}><h2>Equipe</h2>{memberIssue ? <ProjectIssue issue={memberIssue}/> : canViewTeam ? <>{members.length ? visibleMembers.map(member => <span className={styles.teamAvatar} key={member.id} title={member.memberName ?? "Integrante indisponível"}><Avatar name={member.memberName ?? "Integrante indisponível"} memberId={member.memberId}/></span>) : <span className={styles.teamCount}>{project.teamSize}</span>}{members.length > visibleMembers.length ? <span className={styles.teamCount}>+{members.length - visibleMembers.length}</span> : null}<Link href={`/projetos/${project.id}/equipe`}>Ver equipe <span aria-hidden="true">→</span></Link></> : <span className={styles.teamCount}>{project.teamSize}</span>}</section>
        <section className={styles.participationSection}>
          <h2>{participates ? "Você faz parte deste projeto" : "Participação no projeto"}</h2>
          {hasPendingRequest ? <p>Solicitação enviada. A equipe responsável ainda precisa analisar o pedido.</p> : participationIssue ? <ProjectIssue issue={participationIssue}/> : participates ? <p>Acesse as áreas disponíveis para acompanhar sua participação.</p> : canRequest ? <><p>Envie uma solicitação formal para participar da equipe.</p><Button size="compact" onClick={() => { setRequestOpen(true); setSuccess(false); setError(null); }}>Solicitar participação</Button></> : <p>{project.status === "CONCLUIDO" ? "Projetos concluídos não recebem novos pedidos de participação." : !project.acceptingMembers ? "O projeto não está recebendo solicitações de participação." : "Solicitações de participação indisponíveis para esta conta."}</p>}
          {participates && value.capabilities.canAccessWorkspace ? <Link className={buttonClassName({ size: "compact", variant: "primary" })} href={`/meus-projetos/${project.id}`}>Abrir workspace</Link> : null}
          {hasPendingRequest ? <Link className={styles.requestFollowup} href="/projetos?tab=requests">Acompanhar em Meus pedidos</Link> : null}
        </section>
      </article>
      <aside className={styles.projectAside}><h2>Informações do projeto</h2><dl>
        <div><dt>Liderança do projeto</dt><dd>{project.leaderName ?? "Sem gestor definido"}</dd></div>
        <div><dt>Integrantes</dt><dd>{project.teamSize}</dd></div>
        <div><dt>Data de início</dt><dd>{formatDate(project.startsOn)}</dd></div>
        <div><dt>Previsão de término</dt><dd>{formatDate(project.endsOn)}</dd></div>
      </dl><Link href="/projetos">Voltar ao catálogo <span aria-hidden="true">→</span></Link></aside>
    </div>
    {workspace && value.capabilities.canEditProject ? <ProjectEditDialog key={`${workspace.projectId}-${workspace.version}`} workspace={workspace} imageUrl={project.imageUrl} open={editOpen} onClose={closeEdit}/> : null}
    <Dialog open={requestOpen} onOpenChange={open => { if (!pending) setRequestOpen(open); }} title={success ? "Solicitação enviada" : "Solicitar participação"} description={project.title} footer={success ? <Button type="button" onClick={() => setRequestOpen(false)}>Concluir</Button> : <><Button variant="secondary" type="button" disabled={pending} onClick={() => setRequestOpen(false)}>Cancelar</Button><Button type="submit" form="project-membership-request-form" disabled={pending}>{pending ? "Enviando…" : "Enviar solicitação"}</Button></>}>
      {success ? <p role="status">O pedido foi enviado e pode ser acompanhado em Meus pedidos.</p> : <form id="project-membership-request-form" className={styles.requestDialogForm} onSubmit={event => { event.preventDefault(); if (!canRequest || pending) return; setError(null); startTransition(async () => { const result = await requestProjectMembershipAction(project.id, message); if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); return; } setSuccess(true); router.refresh(); }); }}><label className={styles.field}>Mensagem para a equipe <small>Opcional · até 2.000 caracteres</small><textarea maxLength={2000} rows={4} value={message} disabled={pending} onChange={event => setMessage(event.target.value)}/></label>{error ? <p role="alert" className={styles.formFeedback}>{error}</p> : null}</form>}
    </Dialog>
  </div>;
}
