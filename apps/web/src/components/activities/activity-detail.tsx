import { TransientFeedback } from "../ui/transient-feedback";
import Link from "next/link";
import type { Activity, ActivityAssignee, ActivityCandidate, ActivityCapabilities, ActivityEvidence, ActivityHistoryEvent, Page } from "../../lib/activities/contracts";
import type { ApiIssue } from "../../lib/api/contracts";
import {
  addActivityCollaboratorAction,
  addActivityEvidenceAction,
  changeActivityExecutorAction,
  deleteActivityAction,
  removeActivityCollaboratorAction,
  transitionActivityAction,
  updateActivityAction,
  uploadActivityEvidenceAction,
  withdrawActivityEvidenceAction,
} from "../../lib/activities/actions";
import { ActivityStatusBadge, formatActivityDate, formatActivityInstant } from "./activity-list";
import { ActivityActionDialog, ActivityStatusDialog } from "./activity-action-dialog";
import { ActivityEvidenceDialog } from "./activity-evidence-dialog";
import { Button, InlineFeedback } from "../ui";

type ActivityDetailProps = {
  activity: Activity;
  projectTitle: string | null;
  memberId: string;
  returnTo: string;
  capabilities: ActivityCapabilities | null;
  assignees: Page<ActivityAssignee> | null;
  assigneeIssue: ApiIssue | null;
  candidates: Page<ActivityCandidate> | null;
  candidateIssue: ApiIssue | null;
  candidateQuery: string;
  candidatePage: number;
  candidateSearchInvalid: boolean;
  participantsOpen: boolean;
  evidence: Page<ActivityEvidence> | null;
  evidenceIssue: ApiIssue | null;
  evidenceWithdraw: Readonly<Record<string, boolean>>;
  history: Page<ActivityHistoryEvent> | null;
  historyIssue: ApiIssue | null;
  historyAllowed: boolean;
  evidencePage: number;
  historyPage: number;
  feedback?: string;
};

const controlClass = "min-h-11 w-full min-w-0 rounded-control border border-nite-border-control bg-nite-surface px-3 py-2 text-type-body-compact text-nite-text-primary placeholder:text-nite-placeholder focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus";
const labelClass = "grid min-w-0 gap-1.5 text-type-label text-nite-text-primary";
const summaryClass = "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control px-3 text-type-body-compact font-medium text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden";

const feedbackMessages: Record<string, { variant: "success" | "error" | "warning"; title: string; description: string }> = {
  created: { variant: "success", title: "Atividade criada", description: "A atividade foi atribuída a você." },
  deleted: { variant: "success", title: "Atividade excluída", description: "A atividade foi removida permanentemente." },
  updated: { variant: "success", title: "Alterações salvas", description: "Os dados da atividade foram atualizados." },
  status: { variant: "success", title: "Situação atualizada", description: "A mudança foi registrada no histórico." },
  evidence: { variant: "success", title: "Evidência registrada", description: "O registro foi associado à atividade." },
  upload: { variant: "success", title: "Arquivo associado", description: "O anexo privado foi recebido." },
  assigned: { variant: "success", title: "Participante atualizado", description: "A atribuição foi registrada." },
  removed: { variant: "success", title: "Colaborador removido", description: "O período de participação foi encerrado." },
  withdrawn: { variant: "success", title: "Evidência retirada", description: "O conteúdo saiu da consulta comum e permanece no histórico autorizado." },
  invalid: { variant: "error", title: "Revise os campos", description: "Confira os dados e o motivo informado antes de tentar novamente." },
  forbidden: { variant: "warning", title: "Ação indisponível", description: "Sua identidade não tem autorização para esta operação nesta atividade." },
  "not-found": { variant: "error", title: "Registro indisponível", description: "A atividade ou a evidência não está disponível para esta consulta." },
  conflict: { variant: "warning", title: "A atividade mudou", description: "Atualize a página para carregar a versão mais recente antes de tentar novamente." },
  "project-paused": { variant: "warning", title: "Projeto pausado", description: "A situação do projeto bloqueia esta operação de execução." },
  "too-large": { variant: "error", title: "Arquivo acima do limite", description: "Escolha um arquivo de até 10 MiB." },
  unsupported: { variant: "error", title: "Formato não aceito", description: "Use um arquivo TXT, PNG ou JPEG." },
  unavailable: { variant: "error", title: "Não foi possível concluir", description: "Tente novamente em alguns instantes." },
};

function ActivityFeedback({ code }: { code?: string }) {
  if (!code) return null;
  const message = feedbackMessages[code];
  if (!message) return null;
  return <TransientFeedback messageKey={code} queryParam="feedback" occurrenceKey={message}><InlineFeedback {...message} announcement={message.variant === "success" ? "polite" : "assertive"} /></TransientFeedback>;
}

function FormReason() {
  return <label className={labelClass}>Motivo <span className="font-normal text-nite-text-muted">Opcional</span><textarea className={`${controlClass} min-h-16 resize-y`} name="reason" maxLength={1_000} /></label>;
}

function VersionAndReturn({ activity, returnTo }: Pick<ActivityDetailProps, "activity" | "returnTo">) {
  return <>
    <input type="hidden" name="expectedVersion" value={activity.version} />
    <input type="hidden" name="returnTo" value={returnTo} />
  </>;
}

function PaginationLink({ href, children }: { href: string; children: string }) {
  return <Link href={href} className="inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium text-nite-brand-primary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{children}</Link>;
}

function safeExternalHref(value: string): string | null {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function bytesLabel(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.max(1, Math.round(size / 1024))} KiB`;
}

function evidenceTypeLabel(type: ActivityEvidence["type"]): string {
  const labels: Record<ActivityEvidence["type"], string> = { TEXT: "Registro", TECHNICAL: "Registro técnico", LINK: "Link", FILE: "Arquivo", IMAGE: "Imagem" };
  return labels[type];
}

function EvidenceSection({ props }: { props: Pick<ActivityDetailProps, "activity" | "evidence" | "evidenceIssue" | "evidenceWithdraw" | "capabilities" | "returnTo" | "evidencePage" | "historyPage"> }) {
  const { activity, evidence, evidenceIssue, evidenceWithdraw, capabilities, returnTo, evidencePage } = props;
  const pages = evidence ? Math.ceil(evidence.total / evidence.size) : 0;
  const detailHref = (page: number) => {
    const query = new URLSearchParams({ from: returnTo });
    if (page > 0) query.set("evidencePage", String(page));
    if (props.historyPage > 0) query.set("historyPage", String(props.historyPage));
    return `/atividades/${encodeURIComponent(activity.id)}?${query}`;
  };
  const addEvidence = capabilities?.addEvidence ? addActivityEvidenceAction.bind(null, activity.id) : null;
  const uploadEvidence = capabilities?.upload ? uploadActivityEvidenceAction.bind(null, activity.id) : null;
  const corrections = evidence?.items.filter((item) => item.withdrawnAt === null).map((item) => ({
    id: item.id,
    label: `${evidenceTypeLabel(item.type)} · ${formatActivityInstant(item.createdAt)}`,
  })) ?? [];

  return <section aria-labelledby="activity-evidence-title" className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="activity-evidence-title" className="font-display text-type-section-title text-nite-text-primary">Evidências</h2>
      {evidence && evidence.total > 0 ? <span className="text-type-metadata text-nite-text-secondary">{evidence.total} {evidence.total === 1 ? "registro" : "registros"}</span> : null}
    </div>
    {evidenceIssue ? <InlineFeedback variant={evidenceIssue === "access" ? "warning" : "error"} title={evidenceIssue === "access" ? "Evidências indisponíveis" : "Não foi possível carregar as evidências"} description={evidenceIssue === "access" ? "Esta consulta não permite visualizar evidências." : "Tente atualizar a página em alguns instantes."} /> : null}
    {evidence && evidence.items.length === 0 ? <p className="py-3 text-type-body-compact text-nite-text-secondary">Nenhuma evidência foi vinculada ainda.</p> : null}
    {evidence && evidence.items.length > 0 ? <ul className="divide-y divide-nite-border-soft border-y border-nite-border-soft">
      {evidence.items.map((item) => {
        const url = item.url ? safeExternalHref(item.url) : null;
        const withdraw = withdrawActivityEvidenceAction.bind(null, activity.id, item.id);
        const downloadPath = `/api/atividades/${encodeURIComponent(activity.id)}/evidencias/${encodeURIComponent(item.id)}/download`;
        return <li key={item.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-type-body-compact font-medium text-nite-text-primary">{evidenceTypeLabel(item.type)}</span>
              <span aria-hidden="true" className="text-nite-text-muted">·</span>
              <span className="text-type-metadata text-nite-text-secondary">{item.authorName ?? "Integrante"}</span>
              <time className="text-type-metadata text-nite-text-secondary" dateTime={item.createdAt}>{formatActivityInstant(item.createdAt)}</time>
            </div>
            {item.content ? <p className="whitespace-pre-wrap break-words text-type-body-compact text-nite-text-secondary">{item.content}</p> : null}
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center break-all text-type-body-compact font-medium text-nite-brand-primary underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Abrir referência externa</a> : null}
            {item.object ? <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-type-metadata text-nite-text-secondary"><span className="min-w-0 break-all">{item.object.filename}</span><span>{bytesLabel(item.object.size)}</span><a href={downloadPath} className="font-medium text-nite-brand-primary underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Baixar anexo privado</a></div> : null}
            {item.withdrawnAt ? <p className="text-type-metadata text-nite-text-secondary">Retirada em {formatActivityInstant(item.withdrawnAt)}</p> : null}
          </div>
          {item.withdrawnAt === null && evidenceWithdraw[item.id] ? <details className="min-w-0 self-start sm:w-60">
            <summary className={summaryClass}>Mais ações</summary>
            <div className="mt-1 rounded-panel border border-nite-border-soft bg-nite-surface p-2">
              <ActivityActionDialog label="Retirar evidência" title="Retirar evidência" description="O registro será preservado no histórico autorizado.">
                <form action={withdraw} className="grid min-w-0 gap-4">
                  <VersionAndReturn activity={activity} returnTo={returnTo} />
                  <FormReason />
                  <label className="flex min-w-0 items-start gap-3 text-type-body-compact text-nite-text-secondary"><input className="mt-0.5 size-5 shrink-0 accent-nite-brand-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus" type="checkbox" name="confirmed" value="true" required />Confirmo a retirada desta evidência.</label>
                  <div className="flex justify-end"><Button type="submit" variant="destructive">Confirmar retirada</Button></div>
                </form>
              </ActivityActionDialog>
            </div>
          </details> : null}
        </li>;
      })}
    </ul> : null}
    {evidence && pages > 1 ? <nav aria-label="Paginação das evidências" className="flex items-center justify-between border-b border-nite-border-soft pb-1">
      {evidencePage > 0 ? <PaginationLink href={detailHref(evidencePage - 1)}>Evidências anteriores</PaginationLink> : <span />}
      <span className="text-type-metadata text-nite-text-secondary">Página {evidence.page + 1} de {pages}</span>
      {evidencePage + 1 < pages ? <PaginationLink href={detailHref(evidencePage + 1)}>Evidências seguintes</PaginationLink> : <span />}
    </nav> : null}

    {addEvidence || uploadEvidence ? <ActivityEvidenceDialog
      addAction={addEvidence}
      uploadAction={uploadEvidence}
      expectedVersion={activity.version}
      returnTo={returnTo}
      corrections={corrections}
    /> : null}
  </section>;
}

function eventTitle(event: ActivityHistoryEvent): string {
  const labels: Record<string, string> = {
    CREATED: "Atividade criada",
    UPDATED: "Detalhes atualizados",
    STATUS_CHANGED: "Situação alterada",
    EXECUTOR_CHANGED: "Executor atualizado",
    COLLABORATOR_ADDED: "Colaborador incluído",
    COLLABORATOR_REMOVED: "Colaborador removido",
    EVIDENCE_CREATED: "Evidência adicionada",
    EVIDENCE_WITHDRAWN: "Evidência retirada",
  };
  return labels[event.action] ?? "Alteração registrada";
}

function HistorySection({ props }: { props: Pick<ActivityDetailProps, "activity" | "history" | "historyIssue" | "historyAllowed" | "historyPage" | "memberId" | "returnTo" | "evidencePage"> }) {
  const { activity, history, historyIssue, historyAllowed, historyPage, memberId, returnTo } = props;
  const pages = history ? Math.ceil(history.total / history.size) : 0;
  const href = (page: number) => {
    const query = new URLSearchParams({ from: returnTo });
    if (page > 0) query.set("historyPage", String(page));
    if (props.evidencePage > 0) query.set("evidencePage", String(props.evidencePage));
    return `/atividades/${encodeURIComponent(activity.id)}?${query}`;
  };
  return <section aria-labelledby="activity-history-title" className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="activity-history-title" className="font-display text-type-section-title text-nite-text-primary">Histórico</h2>
      {history && history.total > 0 ? <span className="text-type-metadata text-nite-text-secondary">Mais recente primeiro</span> : null}
    </div>
    {!historyAllowed ? <p className="text-type-body-compact text-nite-text-secondary">O histórico detalhado não está disponível para esta consulta.</p> : null}
    {historyAllowed && historyIssue ? <InlineFeedback variant={historyIssue === "access" ? "warning" : "error"} title={historyIssue === "access" ? "Histórico indisponível" : "Não foi possível carregar o histórico"} description={historyIssue === "access" ? "Esta consulta não permite visualizar o histórico detalhado." : "Tente atualizar a página em alguns instantes."} /> : null}
    {historyAllowed && history && history.items.length === 0 ? <p className="text-type-body-compact text-nite-text-secondary">Ainda não há alterações registradas.</p> : null}
    {historyAllowed && history && history.items.length > 0 ? <ol className="relative ml-2 grid gap-0 border-l border-nite-border-soft pl-6">
      {history.items.map((event, index) => <li key={event.id} className="relative pb-6 last:pb-0">
        <span aria-hidden="true" className={`absolute -left-[1.8rem] top-1.5 size-2.5 rounded-full border-2 ${index === 0 && history.page === 0 ? "border-nite-brand-primary bg-nite-brand-soft" : "border-nite-border-strong bg-nite-background"}`} />
        <article className="grid gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-type-body-compact font-medium text-nite-text-primary">{eventTitle(event)}</h3>
          <time className="text-type-metadata text-nite-text-secondary" dateTime={event.occurredAt}>{formatActivityInstant(event.occurredAt)}</time>
          </div>
          <p className="text-type-metadata text-nite-text-secondary">{event.actorId === memberId ? "Você" : "Equipe"}</p>
          {event.reason ? <p className="whitespace-pre-wrap break-words text-type-body-compact text-nite-text-secondary">{event.reason}</p> : null}
        </article>
      </li>)}
    </ol> : null}
    {historyAllowed && history && pages > 1 ? <nav aria-label="Paginação do histórico" className="flex items-center justify-between border-t border-nite-border-soft pt-1">
      {historyPage > 0 ? <PaginationLink href={href(historyPage - 1)}>Alterações seguintes</PaginationLink> : <span />}
      <span className="text-type-metadata text-nite-text-secondary">Página {history.page + 1} de {pages}</span>
      {historyPage + 1 < pages ? <PaginationLink href={href(historyPage + 1)}>Alterações anteriores</PaginationLink> : <span />}
    </nav> : null}
  </section>;
}

function ActivityActions({ props }: { props: Pick<ActivityDetailProps, "activity" | "capabilities" | "candidates" | "candidateIssue" | "candidateQuery" | "candidatePage" | "candidateSearchInvalid" | "participantsOpen" | "assignees" | "returnTo" | "evidencePage" | "historyPage"> }) {
  const { activity, capabilities, candidates, candidateIssue, candidateQuery, candidatePage, candidateSearchInvalid, participantsOpen, assignees, returnTo } = props;
  if (!capabilities || (!capabilities.edit && !capabilities.manageAssignees && !capabilities.canDelete)) return null;
  const update = updateActivityAction.bind(null, activity.id);
  const assignExecutor = changeActivityExecutorAction.bind(null, activity.id);
  const addCollaborator = addActivityCollaboratorAction.bind(null, activity.id);
  const collaborators = assignees?.items.filter((assignee) => assignee.role === "COLLABORATOR") ?? [];
  const candidatePages = candidates ? Math.ceil(candidates.total / candidates.size) : 0;
  const participantQueryActive = participantsOpen || candidatePage > 0 || Boolean(candidateQuery) || candidateSearchInvalid || candidateIssue !== null;
  const candidateHref = (page: number, search = candidateQuery) => {
    const query = new URLSearchParams({ from: returnTo });
    query.set("participants", "1");
    if (search) query.set("candidateQ", search);
    if (page > 0) query.set("candidatePage", String(page));
    if (props.evidencePage > 0) query.set("evidencePage", String(props.evidencePage));
    if (props.historyPage > 0) query.set("historyPage", String(props.historyPage));
    return `/atividades/${encodeURIComponent(activity.id)}?${query}`;
  };

  return <section aria-labelledby="activity-actions-title" className="space-y-2 border-t border-nite-border-soft pt-4">
    <h2 id="activity-actions-title" className="px-3 font-display text-type-label font-semibold text-nite-text-primary">Ações</h2>
    {capabilities.edit ? <ActivityActionDialog label="Editar atividade" title="Editar atividade" description="Atualize os dados e informe o motivo para registrar a mudança.">
      <form action={update} className="grid min-w-0 gap-4">
        <VersionAndReturn activity={activity} returnTo={returnTo} />
        <label className={labelClass}>Título<input className={controlClass} name="title" required maxLength={200} defaultValue={activity.title} /></label>
        <label className={labelClass}>Descrição<textarea className={`${controlClass} min-h-24 resize-y`} name="description" maxLength={10_000} defaultValue={activity.description} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Início<input className={controlClass} type="date" name="startOn" defaultValue={activity.startOn ?? ""} /></label>
          <label className={labelClass}>Prazo<input className={controlClass} type="date" name="dueOn" defaultValue={activity.dueOn ?? ""} /></label>
        </div>
        <label className={labelClass}>Prioridade<select className={controlClass} name="priority" defaultValue={activity.priority ?? ""}><option value="">Sem prioridade</option><option value="ALTA">Alta</option><option value="MEDIA">Média</option><option value="BAIXA">Baixa</option></select></label>
        <FormReason />
        <div className="flex justify-end"><Button type="submit" variant="secondary">Salvar alterações</Button></div>
      </form>
    </ActivityActionDialog> : null}
    {capabilities.manageAssignees && !participantQueryActive ? <Link href={candidateHref(0)} className={summaryClass}>Gerenciar participantes</Link> : null}
    {capabilities.manageAssignees && participantQueryActive ? <details open className="group">
      <summary className={summaryClass}>Gerenciar participantes</summary>
      <div className="grid min-w-0 gap-4 px-3 pb-4 pt-2">
        <form action={`/atividades/${encodeURIComponent(activity.id)}`} method="get" className="grid min-w-0 gap-3 border-b border-nite-border-soft pb-4">
          <input type="hidden" name="from" value={returnTo} />
          <input type="hidden" name="participants" value="1" />
          {props.evidencePage > 0 ? <input type="hidden" name="evidencePage" value={props.evidencePage} /> : null}
          {props.historyPage > 0 ? <input type="hidden" name="historyPage" value={props.historyPage} /> : null}
          <input type="hidden" name="candidatePage" value="0" />
          <label className={labelClass}>Buscar integrantes<input className={controlClass} type="search" name="candidateQ" required minLength={2} maxLength={160} defaultValue={candidateQuery} placeholder="Nome ou parte do nome" /></label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="secondary">Buscar</Button>
            {candidateQuery ? <Link href={candidateHref(0, "")} className="inline-flex min-h-11 items-center rounded-control px-3 text-type-body-compact font-medium text-nite-text-secondary underline underline-offset-4 hover:text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Limpar busca</Link> : null}
          </div>
        </form>
        {candidateSearchInvalid ? <InlineFeedback variant="warning" title="Revise a busca" description="Use de dois a 160 caracteres para buscar integrantes." /> : null}
        {!candidateSearchInvalid && !candidateIssue && !candidateQuery && !candidates ? <p className="text-type-body-compact text-nite-text-secondary">Digite ao menos dois caracteres para buscar integrantes elegíveis.</p> : null}
        {candidateIssue ? <InlineFeedback
          variant={candidateIssue === "access" || candidateIssue === "not-found" ? "warning" : "error"}
          title={candidateIssue === "access" ? "Consulta não autorizada" : candidateIssue === "not-found" ? "Busca indisponível" : "Não foi possível consultar integrantes elegíveis"}
          description={candidateIssue === "access" ? "Esta consulta de participantes não está autorizada para sua identidade." : candidateIssue === "not-found" ? "A atividade não está disponível para consultar participantes." : "Tente atualizar a página antes de buscar novamente."}
        /> : null}
        {!candidateSearchInvalid && !candidateIssue && candidates && candidates.items.length === 0 ? <p className="text-type-body-compact text-nite-text-secondary">{candidateQuery ? "Nenhum integrante elegível encontrado." : "Nenhum integrante elegível disponível."}</p> : null}
        {!candidateSearchInvalid && !candidateIssue && candidates && candidates.items.length > 0 ? <>
          <form action={assignExecutor} className="grid min-w-0 gap-4 border-b border-nite-border-soft pb-4">
            <VersionAndReturn activity={activity} returnTo={returnTo} />
            <label className={labelClass}>Novo executor<select className={controlClass} name="memberId" required defaultValue=""><option value="" disabled>Selecione um integrante</option>{candidates.items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
            <FormReason />
            <p className="text-type-metadata text-nite-text-secondary">A troca encerra a atribuição vigente do executor.</p>
            <label className="flex min-w-0 items-start gap-3 text-type-body-compact text-nite-text-secondary"><input className="mt-0.5 size-5 shrink-0 accent-nite-brand-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus" type="checkbox" name="confirmed" value="true" required />Confirmo a troca do executor.</label>
            <Button type="submit" variant="secondary">Trocar executor</Button>
          </form>
          <form action={addCollaborator} className="grid min-w-0 gap-4 border-b border-nite-border-soft pb-4">
            <VersionAndReturn activity={activity} returnTo={returnTo} />
            <label className={labelClass}>Novo colaborador<select className={controlClass} name="memberId" required defaultValue=""><option value="" disabled>Selecione um integrante</option>{candidates.items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
            <FormReason />
            <Button type="submit" variant="secondary">Adicionar colaborador</Button>
          </form>
          {candidatePages > 1 ? <nav aria-label="Paginação de integrantes" className="flex min-w-0 items-center justify-between gap-2 text-type-metadata text-nite-text-secondary">
            {candidatePage > 0 ? <PaginationLink href={candidateHref(candidatePage - 1)}>Página anterior</PaginationLink> : <span />}
            <span>Página {candidates.page + 1} de {candidatePages}</span>
            {candidatePage + 1 < candidatePages ? <PaginationLink href={candidateHref(candidatePage + 1)}>Próxima página</PaginationLink> : <span />}
          </nav> : null}
        </> : null}
        {collaborators.map((collaborator) => <details key={collaborator.id} className="rounded-control border border-nite-border-soft p-3">
          <summary className="cursor-pointer text-type-body-compact font-medium text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Remover {collaborator.memberName ?? "colaborador"}</summary>
          <form action={removeActivityCollaboratorAction.bind(null, activity.id, collaborator.memberId)} className="mt-3 grid gap-3">
            <VersionAndReturn activity={activity} returnTo={returnTo} />
            <FormReason />
            <label className="flex min-w-0 items-start gap-3 text-type-body-compact text-nite-text-secondary"><input className="mt-0.5 size-5 shrink-0 accent-nite-brand-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus" type="checkbox" name="confirmed" value="true" required />Confirmo o encerramento da participação.</label>
            <Button type="submit" variant="destructive">Encerrar participação</Button>
          </form>
        </details>)}
      </div>
    </details> : null}
    {capabilities.canDelete ? <details className="group border-t border-nite-border-soft pt-3">
      <summary className="flex min-h-10 cursor-pointer items-center rounded-control px-3 text-type-body-compact font-medium text-status-error hover:bg-status-error-soft focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Excluir atividade</summary>
      <form action={deleteActivityAction.bind(null, activity.id)} className="grid gap-3 px-3 pb-3 pt-2">
        <input type="hidden" name="expectedVersion" value={activity.version} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <p className="text-type-body-compact text-nite-text-secondary">A exclusão é permanente e remove a atividade das listas.</p>
        <label className="flex items-start gap-2 text-type-body-compact text-nite-text-secondary"><input className="mt-1 size-4 accent-status-error" type="checkbox" name="confirmed" value="true" required />Confirmo a exclusão permanente.</label>
        <Button type="submit" variant="destructive">Excluir permanentemente</Button>
      </form>
    </details> : null}
  </section>;
}

export function ActivityDetail({
  activity,
  projectTitle,
  memberId,
  returnTo,
  capabilities,
  assignees,
  assigneeIssue,
  candidates,
  candidateIssue,
  candidateQuery,
  candidatePage,
  candidateSearchInvalid,
  participantsOpen,
  evidence,
  evidenceIssue,
  evidenceWithdraw,
  history,
  historyIssue,
  historyAllowed,
  evidencePage,
  historyPage,
  feedback,
}: ActivityDetailProps) {
  const collaborators = assignees?.items.filter((assignee) => assignee.role === "COLLABORATOR") ?? [];
  const transition = transitionActivityAction.bind(null, activity.id);
  return <main className="mx-auto w-full max-w-6xl min-w-0 space-y-7 px-4 py-7 sm:px-7 sm:py-10 lg:px-9">
    <nav aria-label="Caminho da página" className="flex min-w-0 flex-wrap items-center gap-2 text-type-body-compact text-nite-text-secondary">
      <Link href={returnTo} className="rounded-subtle underline underline-offset-4 hover:text-nite-brand-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Minhas atividades</Link>
      <span aria-hidden="true">/</span><span aria-current="page" className="truncate text-nite-text-muted">Detalhe</span>
    </nav>
    <ActivityFeedback code={feedback} />
    <header className="min-w-0 space-y-3">
      <ActivityStatusBadge status={activity.status} />
      <h1 className="max-w-4xl break-words font-display text-type-page-title text-nite-text-primary">{activity.title}</h1>
      <p className="text-type-metadata text-nite-text-secondary">Atualizada em {formatActivityInstant(activity.updatedAt)}</p>
    </header>

    <div className="grid min-w-0 grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-x-12 lg:gap-y-10">
      <section aria-labelledby="activity-description-title" className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
        <h2 id="activity-description-title" className="font-display text-type-section-title text-nite-text-primary">Descrição</h2>
        <p className="max-w-prose whitespace-pre-wrap break-words text-type-body leading-relaxed text-nite-text-secondary">{activity.description}</p>
      </section>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <EvidenceSection props={{ activity, evidence, evidenceIssue, evidenceWithdraw, capabilities, returnTo, evidencePage, historyPage }} />
      </div>

      <aside aria-label="Propriedades da atividade" className="order-3 min-w-0 space-y-5 border-t border-nite-border-soft pt-5 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:sticky lg:top-24 lg:self-start lg:border-l lg:border-t-0 lg:pl-6 lg:pt-1">
        <h2 className="font-display text-type-section-title text-nite-text-primary">Detalhes</h2>
        <dl className="grid gap-4">
          <div className="grid gap-1"><dt className="text-type-metadata font-medium text-nite-text-secondary">Situação</dt><dd className="flex min-w-0 flex-wrap items-center gap-2"><ActivityStatusBadge status={activity.status} />{activity.overdue ? <span className="whitespace-nowrap rounded-pill border border-status-warning-border bg-status-warning-soft px-2 py-1 text-type-metadata font-medium text-status-warning">Em atraso</span> : null}{capabilities && capabilities.transitions.length > 0 ? <ActivityStatusDialog action={transition} current={activity.status} transitions={capabilities.transitions} expectedVersion={activity.version} returnTo={returnTo} /> : null}</dd></div>
          <div className="grid gap-1"><dt className="text-type-metadata font-medium text-nite-text-secondary">Prioridade</dt><dd className="text-type-body-compact text-nite-text-primary">{activity.priority === "ALTA" ? "Alta" : activity.priority === "MEDIA" ? "Média" : activity.priority === "BAIXA" ? "Baixa" : "Sem prioridade"}</dd></div>
          <div className="grid gap-1"><dt className="text-type-metadata font-medium text-nite-text-secondary">Início</dt><dd className="text-type-body-compact text-nite-text-primary">{activity.startOn ? <time dateTime={activity.startOn}>{formatActivityDate(activity.startOn)}</time> : "Sem data de início"}</dd></div>
          <div className="grid gap-1"><dt className="text-type-metadata font-medium text-nite-text-secondary">Projeto</dt><dd className="break-words text-type-body-compact text-nite-text-primary">{projectTitle ?? (activity.projectId ? "Projeto associado" : "Atividade independente")}</dd></div>
          <div className="grid gap-1"><dt className="text-type-metadata font-medium text-nite-text-secondary">Prazo</dt><dd className="text-type-body-compact text-nite-text-primary">{activity.dueOn ? <time dateTime={activity.dueOn}>{formatActivityDate(activity.dueOn)}</time> : "Sem prazo definido"}</dd></div>
          <div className="grid gap-1"><dt className="text-type-metadata font-medium text-nite-text-secondary">Criador</dt><dd className="break-words text-type-body-compact text-nite-text-primary">{activity.createdBy === memberId ? "Você" : "Integrante"}</dd></div>
          <div className="grid gap-1"><dt className="text-type-metadata font-medium text-nite-text-secondary">Responsável principal</dt><dd className="break-words text-type-body-compact text-nite-text-primary">{activity.primaryExecutorName ?? "Integrante"}{!activity.executorAvailable ? <span className="mt-1 block text-type-metadata text-nite-text-secondary">Atribuição indisponível</span> : null}</dd></div>
          <div className="grid gap-1"><dt className="text-type-metadata font-medium text-nite-text-secondary">Colaboradores</dt><dd className="grid gap-1 text-type-body-compact text-nite-text-primary">{assigneeIssue ? <span className="text-nite-text-secondary">Participantes indisponíveis</span> : collaborators.length ? collaborators.map((person) => <span key={person.id} className="break-words">{person.memberName ?? "Integrante"}{!person.available ? <span className="text-type-metadata text-nite-text-secondary"> · indisponível</span> : null}</span>) : <span className="text-nite-text-secondary">Nenhum colaborador</span>}</dd></div>
        </dl>
        <ActivityActions props={{ activity, capabilities, candidates, candidateIssue, candidateQuery, candidatePage, candidateSearchInvalid, participantsOpen, assignees, returnTo, evidencePage, historyPage }} />
      </aside>
      <div className="order-4 min-w-0 lg:col-start-1 lg:row-start-3">
        <HistorySection props={{ activity, history, historyIssue, historyAllowed, historyPage, memberId, returnTo, evidencePage }} />
      </div>
    </div>
  </main>;
}

export { ActivityFeedback };
