"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { ProjectDetails, ProjectStatusEvent, ProjectPeriod, ProjectCandidate } from "../../lib/projects/administration-contracts";
import { projectTransitions, isProjectStatus } from "../../lib/projects/administration-contracts";
import type { WorkspaceOverview, ProjectTeamMember, ProjectStatus } from "../../lib/projects/integration-contracts";
import { createProjectAction, updateProjectAction, changeProjectStatusAction, transferProjectLeadershipAction, manageProjectMemberAction } from "../../lib/projects/administration-actions";
import type { ProjectActionResult } from "../../lib/projects/actions";
import { projectStatusLabels } from "../../lib/projects/presentation";
import { ProjectIssue, Avatar } from "./project-ui";
import { ProjectAvailability } from "./project-workspace";
import styles from "./projects.module.css";

function Reason() { return <label className={styles.field}>Motivo administrativo<textarea name="reason" required maxLength={1000} rows={2}/><span>Obrigatório · registrado no histórico ou na auditoria.</span></label>; }
function MutationForm({ children, submit, label, onSubmit }: { children: ReactNode; submit: string; label: string; onSubmit: (data: FormData) => Promise<ProjectActionResult<unknown>> }) {
 const router = useRouter();
 const [pending,start] = useTransition();
 const [result,setResult] = useState<{ issue: string | null; text: string } | null>(null);
 return <form aria-label={label} className={styles.adminForm} onSubmit={event => {
  event.preventDefault(); if (pending) return;
  const form = event.currentTarget; const data = new FormData(form); setResult(null);
  start(async () => { const next = await onSubmit(data); setResult({ issue: next.issue, text: next.issueText ?? "Alteração salva." }); if (!next.issue) { form.reset(); router.refresh(); } });
 }}><fieldset disabled={pending} className={styles.adminFieldset}>{children}<Reason/><button className={styles.primaryButton}>{pending ? "Salvando…" : submit}</button></fieldset>
 {result && <div role={result.issue ? "alert" : "status"}><p>{result.text}</p>{result.issue && <button type="button" className={styles.button} onClick={() => router.refresh()}>Atualizar dados</button>}</div>}</form>;
}
export function ProjectDetailsForm({ project }: { project?: ProjectDetails }) {
 const router = useRouter();
 return <MutationForm label={project ? "Editar dados do projeto" : "Criar projeto"} submit={project ? "Salvar dados" : "Criar projeto"} onSubmit={async data => {
  const input = { title: String(data.get("title") ?? ""), description: String(data.get("description") ?? ""), startsOn: String(data.get("startsOn") ?? "") || null, endsOn: String(data.get("endsOn") ?? "") || null, reason: String(data.get("reason") ?? "") };
  const result = project ? await updateProjectAction(project.id, { ...input, expectedVersion: project.version }) : await createProjectAction(input);
  if (!project && !result.issue && result.data) router.push(`/projetos/${result.data.id}`);
  return result;
 }}>
  <label className={styles.field}>Título<input name="title" required maxLength={200} defaultValue={project?.title}/></label>
  <label className={styles.field}>Descrição<textarea name="description" required maxLength={10000} rows={6} defaultValue={project?.description}/></label>
  <div className={styles.adminDates}><label className={styles.field}>Data de início <span>Opcional</span><input type="date" name="startsOn" defaultValue={project?.startsOn ?? ""}/></label><label className={styles.field}>Data de término <span>Opcional</span><input type="date" name="endsOn" defaultValue={project?.endsOn ?? ""}/></label></div>
  {!project && <p className={styles.contextNote}>O projeto começa em Planejamento, com ingresso fechado. Criar o projeto não cria participação nem liderança para você.</p>}
 </MutationForm>;
}
export function ProjectAdministration({ workspace, members, candidates, statusHistory, participationHistory, leadershipHistory, canChangeStatus, issues, candidateSearch = "" }: {
 workspace: WorkspaceOverview; members: ProjectTeamMember[]; candidates: ProjectCandidate[]; statusHistory: ProjectStatusEvent[]; participationHistory: ProjectPeriod[]; leadershipHistory: ProjectPeriod[]; canChangeStatus: boolean; issues: string[]; candidateSearch?: string;
}) {
 const w = workspace;
 const project: ProjectDetails = { id: w.projectId, title: w.name, description: w.description, startsOn: w.startsOn, endsOn: w.endsOn, status: w.status, version: w.version };
 const base = { expectedVersion: w.version };
 const names = new Map([...candidates.map(m => [m.id,m.name] as const), ...members.map(m => [m.memberId,m.memberName ?? m.memberId] as const)]);
 function reason(data: FormData) { return String(data.get("reason") ?? ""); }
 const labels: Record<ProjectStatus,string> = { PLANEJAMENTO: "Planejar", ATIVO: "Ativar", PAUSADO: "Pausar", CONCLUIDO: "Concluir" };
 return <div className={styles.page}>
 <header className={styles.pageHeader}><div><h1>Administrar projeto</h1><p>{w.name}</p></div><Link className={styles.button} href={`/projetos/${w.projectId}`}>Voltar ao detalhe</Link></header>
 {issues.map(issue => <ProjectIssue key={issue} issue={issue}/>)}
 <div className={styles.adminLayout}>
 <section className={styles.adminPanel}><h2>Dados do projeto</h2><p className={styles.contextNote}>Versão {w.version} · alterações de dados são registradas na auditoria.</p><ProjectDetailsForm key={w.version} project={project}/></section>
 <aside className={styles.adminControls}>
 {canChangeStatus && w.capabilities.canViewDocuments && <section className={styles.adminPanel}><h2>Documentos</h2><Link className={styles.textLink} href={`/meus-projetos/${w.projectId}/documentos/aprovacoes`}>Solicitações de exclusão →</Link></section>}
 {canChangeStatus && <section className={styles.adminPanel}><h2>Situação</h2><p>Atual: {projectStatusLabels[w.status]}</p><MutationForm key={`status-${w.version}`} label="Alterar situação" submit="Alterar situação" onSubmit={data => { const status = data.get("status"); return isProjectStatus(status) ? changeProjectStatusAction(w.projectId,{ ...base, status, reason: reason(data) }) : Promise.resolve({ data: null, issue: "invalid", issueText: "Selecione uma situação válida." }); }}><label className={styles.field}>Próxima situação<select name="status" required>{projectTransitions[w.status].map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></label></MutationForm></section>}
 {w.capabilities.canManageAvailability && <section className={styles.adminPanel}><h2>Ingresso</h2>{w.leadershipVacant && <p className={styles.contextNote}>Defina uma liderança vigente para abrir solicitações.</p>}{(w.status === "PAUSADO" || w.status === "CONCLUIDO") && <p className={styles.contextNote}>Esta situação impede a abertura de solicitações.</p>}<ProjectAvailability workspace={w}/></section>}
 {w.capabilities.canTransferLeadership && <section className={styles.adminPanel}><h2>Liderança</h2><p>{w.leaderName ?? "Liderança vacante"}</p><p className={styles.contextNote}>A liderança exige participação vigente. Adicione a pessoa à equipe antes de designá-la.</p><MutationForm key={`leader-${w.version}`} label="Configurar liderança" submit="Salvar liderança" onSubmit={data => transferProjectLeadershipAction(w.projectId,{ ...base, memberId: String(data.get("memberId") ?? "") || null, reason: reason(data) })}><label className={styles.field}>Nova configuração<select name="memberId" defaultValue={w.leaderId ?? ""}><option value="">Liderança vacante</option>{members.map(m => <option key={m.id} value={m.memberId}>{m.memberName ?? m.memberId}</option>)}</select></label></MutationForm></section>}
 </aside>
 </div>
 <section className={styles.adminPanel}><h2>Participação</h2><p className={styles.contextNote}>Administração global, participação e liderança são vínculos separados.</p>
 {members.length ? <div className={styles.teamList}>{members.map(m => <article className={styles.adminMember} key={m.id}><div className={styles.projectName}><Avatar name={m.memberName ?? "Integrante"} memberId={m.memberId}/><span><strong>{m.memberName ?? m.memberId}</strong><small>{m.responsibility}</small></span></div>{m.memberId === w.leaderId ? <p className={styles.contextNote}>Transfira ou encerre a liderança antes de encerrar a participação.</p> : <details><summary>Encerrar participação</summary><MutationForm key={`${m.id}-${w.version}`} label={`Encerrar participação de ${m.memberName ?? m.memberId}`} submit="Confirmar encerramento" onSubmit={data => manageProjectMemberAction(w.projectId,{ ...base, operation: "end", memberId: m.memberId, reason: reason(data) })}><p>O vínculo será encerrado; o histórico e as contribuições serão preservados.</p></MutationForm></details>}</article>)}</div> : <p>Nenhuma participação vigente.</p>}
 <details className={styles.adminDisclosure} open={!!candidateSearch}><summary>Adicionar integrante</summary><form method="get" className={styles.adminSearch}><label className={styles.field}>Pesquisar integrante ativo<input name="integrante" minLength={2} maxLength={160} required defaultValue={candidateSearch} placeholder="Pelo menos 2 caracteres"/></label><button className={styles.button}>Pesquisar integrante</button></form>{candidates.length ? <MutationForm key={`join-${w.version}`} label="Adicionar integrante" submit="Adicionar à equipe" onSubmit={data => manageProjectMemberAction(w.projectId,{ ...base, operation: "join", memberId: String(data.get("memberId") ?? ""), responsibility: String(data.get("responsibility") ?? ""), reason: reason(data) })}><label className={styles.field}>Integrante ativo<select name="memberId" required><option value="">Selecione uma pessoa</option>{candidates.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className={styles.field}>Responsabilidade<input name="responsibility" required maxLength={200}/></label></MutationForm> : <p>{candidateSearch ? "Nenhum integrante elegível encontrado para esta pesquisa." : "Pesquise pelo nome para consultar integrantes elegíveis."}</p>}</details>
 <Link className={styles.textLink} href={`/meus-projetos/${w.projectId}/equipe`}>Consultar equipe e solicitações →</Link>
 </section>
 <section className={styles.adminPanel}><h2>Históricos</h2>
 <details className={styles.adminDisclosure}><summary>Histórico de situações ({statusHistory.length})</summary>{statusHistory.length ? statusHistory.map(e => <article className={styles.adminHistory} key={e.id}><strong>{e.previousStatus ? `${projectStatusLabels[e.previousStatus]} → ` : "Criação → "}{projectStatusLabels[e.newStatus]}</strong><time dateTime={e.occurredAt}>{new Date(e.occurredAt).toLocaleString("pt-BR")}</time><p>{e.reason}</p></article>) : <p>Nenhum evento retornado.</p>}</details>
 {([ ["Histórico de participações",participationHistory], ["Histórico de liderança",leadershipHistory] ] as const).map(([title,periods]) => <details key={title} className={styles.adminDisclosure}><summary>{title} ({periods.length})</summary>{periods.length ? periods.map(p => <article className={styles.adminHistory} key={p.id}><strong>{p.memberId ? names.get(p.memberId) ?? `Integrante ${p.memberId}` : "Liderança vacante"}</strong>{p.responsibility && <p>{p.responsibility}</p>}<p>{new Date(p.startedAt).toLocaleString("pt-BR")} → {p.endedAt ? new Date(p.endedAt).toLocaleString("pt-BR") : "Vigente"}</p><p>Motivo inicial: {p.startReason}</p>{p.endReason && <p>Motivo de encerramento: {p.endReason}</p>}</article>) : <p>Nenhum período registrado.</p>}</details>)}
 </section>
 </div>;
}
