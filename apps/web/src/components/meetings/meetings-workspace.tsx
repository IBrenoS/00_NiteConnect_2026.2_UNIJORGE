"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  cancelMeetingAction,
  getMeetingGraphAvailabilityAction,
  getMeetingShareAction,
  loadMeetingPageAction,
  markMeetingNotificationReadAction,
  respondToMeetingInviteAction,
} from "../../lib/meetings/actions";
import { formatMeetingDate, formatMeetingDateTime, formatMeetingDuration, formatMeetingTime } from "../../lib/meetings/date-time";
import { appendMeetingPages, isMeetingGraphConsentRequired, type Meeting, type MeetingCandidate, type MeetingGraphAvailability, type MeetingGraphAvailabilityResult, type MeetingIssue, type MeetingNotification, type MeetingPage, type MeetingWriteResult } from "../../lib/meetings/contracts";
import { readMeetingGraphAvailabilityCache, writeMeetingGraphAvailabilityCache } from "../../lib/meetings/graph-availability-cache";
import { resolveCreateMeetingGate, shouldRouteMeetingLinkAction } from "../../lib/meetings/meeting-action-gate";
import type { MeetingJoinFeedback } from "../../lib/meetings/meeting-join-feedback";
import { Button } from "../ui/button";
import { DialogFrame } from "../ui/dialog-frame";
import { InlineFeedback } from "../ui/inline-feedback";
import { MeetingEditorDialog } from "./meeting-editor-dialog";

type Props = {
  viewerId: string;
  previewMode?: boolean;
  previewCandidates?: MeetingCandidate[];
  initialOverlay?: "immediate" | "scheduled" | "invite" | "linked" | "history" | "cancelled";
  upcoming: MeetingPage<Meeting> | null;
  past: MeetingPage<Meeting> | null;
  cancelled: MeetingPage<Meeting> | null;
  notifications: MeetingPage<MeetingNotification> | null;
  upcomingIssue: MeetingIssue | null;
  pastIssue: MeetingIssue | null;
  cancelledIssue: MeetingIssue | null;
  notificationIssue: MeetingIssue | null;
  upcomingPage: number;
  pastPage: number;
  cancelledPage: number;
  initialGraphAvailability?: Exclude<MeetingGraphAvailability, "checking">;
  initialJoinFeedback?: MeetingJoinFeedback | null;
  graphHelpHref?: string | null;
};

type EditorState = { key: number; mode: "create" | "edit"; meetingMode: "IMMEDIATE" | "SCHEDULED"; meeting?: Meeting };
type DetailState = { meeting: Meeting; cancelConfirm: boolean; busy: boolean; feedback: string };

function statusText(meeting: Meeting): string {
  if (meeting.status === "AGENDADA") return meeting.provider === "GRAPH" ? "Confirmada no calendário" : "Link disponível";
  if (meeting.status === "AGUARDANDO_TEAMS") return "Sem link de entrada";
  if (meeting.status === "CANCELADA") return meeting.provider === "TEAMS_LINK" ? "Cancelada no NITE Connect" : "Cancelada";
  if (meeting.status === "SINCRONIZACAO_PENDENTE") return "Atualização pendente";
  if (meeting.status === "CRIACAO_PENDENTE") return "Aguardando confirmação";
  return "Não foi possível concluir";
}

const inviteStatusText: Record<Meeting["invitees"][number]["internalStatus"], string> = {
  PENDENTE: "Aguardando resposta no NITE",
  ACEITO: "Aceito no NITE",
  RECUSADO: "Recusado no NITE",
  REVOGADO: "Convite revogado",
};

const notificationText: Record<string, string> = {
  CONVITE_RECEBIDO: "Você recebeu um convite",
  REUNIAO_ALTERADA: "A reunião foi alterada",
  REUNIAO_CANCELADA: "A reunião foi cancelada no NITE Connect",
  CONVITE_ACEITO: "Um convite foi aceito no NITE Connect",
  CONVITE_RECUSADO: "Um convite foi recusado no NITE Connect",
};

const graphAvailabilityText: Record<Exclude<MeetingGraphAvailability, "checking" | "available">, string> = {
  "consent-required": "A criação de reuniões aguarda autorização institucional.",
  "admin-approval-required": "A integração Microsoft 365 aguarda aprovação administrativa institucional.",
  "not-configured": "A conexão com o calendário institucional ainda não está configurada neste ambiente. Você pode consultar reuniões e convites normalmente.",
  "teams-unavailable": "Esta conta institucional não disponibiliza reuniões do Teams pelo calendário. Consulte sua equipe de suporte institucional.",
  "session-required": "Sua sessão institucional expirou. Entre novamente para criar ou gerenciar reuniões.",
  unavailable: "Não foi possível verificar a conexão com o calendário agora. Tente novamente em alguns instantes.",
};

function issueMessage(issue: string): string {
  if (issue === "configuration") return "O endereço do serviço de reuniões não está configurado neste ambiente.";
  if (issue === "timeout") return "O serviço de reuniões não respondeu dentro do limite de 8 segundos.";
  if (issue === "connection") return "Não foi possível estabelecer conexão com o serviço de reuniões.";
  if (issue.startsWith("server-error-")) return `O serviço de reuniões respondeu com erro interno (HTTP ${issue.slice("server-error-".length)}).`;
  if (issue.startsWith("request-error-")) return `O serviço de reuniões recusou a consulta (HTTP ${issue.slice("request-error-".length)}).`;
  if (issue === "consent-required") return "A autorização institucional do Microsoft 365 não está disponível para esta operação. Reuniões e convites existentes continuam acessíveis.";
  if (issue === "admin-approval-required") return "A operação exige aprovação administrativa institucional para a integração Microsoft 365.";
  if (issue === "graph-unavailable") return "A conexão com o calendário Microsoft não concluiu a operação. Nada foi confirmado; você pode tentar novamente.";
  if (issue === "access" || issue === "forbidden") return "Sua sessão não permite consultar esta informação. Atualize o acesso institucional e tente novamente.";
  if (issue === "not-found") return "Esta reunião não está mais disponível.";
  if (issue === "conflict") return "A reunião mudou desde a última consulta. Atualize a página e tente novamente.";
  if (issue === "invalid") return "O serviço de reuniões retornou uma resposta em formato inesperado.";
  if (issue === "unavailable") return "O serviço de reuniões está indisponível no momento.";
  return "A consulta de reuniões não pôde ser concluída.";
}

function isJoinable(meeting: Meeting): boolean {
  return meeting.status === "AGENDADA" && (meeting.provider === "GRAPH" || meeting.providerState === "LINK_CONFIRMADO_PELO_ORGANIZADOR");
}

function meetingSummary(meeting: Meeting): string {
  const invitees = meeting.invitees.filter((invitee) => invitee.internalStatus !== "REVOGADO").length;
  return `${invitees} convidado${invitees === 1 ? "" : "s"}`;
}

function MeetingRow({ meeting, viewerId, previewMode = false, graphConsentRequired = false, onDetails, onRespond }: {
  meeting: Meeting;
  viewerId: string;
  previewMode?: boolean;
  graphConsentRequired?: boolean;
  onDetails: (meeting: Meeting) => void;
  onRespond: (meeting: Meeting) => void;
}) {
  const organizer = meeting.organizerMemberId === viewerId;
  const ownInvite = meeting.invitees.find((invitee) => invitee.memberId === viewerId);
  const canRespond = !organizer && ownInvite?.internalStatus === "PENDENTE" && meeting.status !== "CANCELADA";
  const canJoin = isJoinable(meeting) && meeting.status !== "CANCELADA";
  return <li className="flex min-w-0 flex-col gap-3 border-b border-nite-border-soft py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h3 className="truncate text-type-body-compact font-semibold text-nite-text-primary">{meeting.title}</h3>
      <p className="mt-1 text-type-body-compact leading-6 text-nite-text-secondary">{formatMeetingDate(meeting.startsAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {formatMeetingTime(meeting.startsAt)} <span className="text-nite-text-muted">·</span> {organizer ? "Organizada por você" : meeting.organizerName}</p>
      <p className="mt-1 text-type-body-compact text-nite-text-muted">{meetingSummary(meeting)} <span className="px-1">·</span> {statusText(meeting)}</p>
    </div>
    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
      {canRespond ? <Button type="button" variant="secondary" onClick={() => onRespond(meeting)}>Responder</Button> : null}
      {canJoin ? previewMode ? <Button type="button" disabled>Entrar</Button> : <Link href={graphConsentRequired ? "/reunioes/erro-403" : `/reunioes/${encodeURIComponent(meeting.id)}/entrar`} className="inline-flex min-h-11 items-center justify-center rounded-control border border-nite-brand-primary bg-nite-brand-primary px-4 py-2 text-type-label font-medium text-nite-action-text transition-colors hover:bg-nite-brand-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus motion-reduce:transition-none">Entrar</Link> : null}
      <Button type="button" variant="quiet" onClick={() => onDetails(meeting)}>Detalhes</Button>
    </div>
  </li>;
}

function PageIssue({ issue }: { issue: MeetingIssue | null }) {
  if (!issue) return null;
  return <InlineFeedback variant={issue === "access" ? "warning" : "error"} description={issueMessage(issue)} announcement="polite" />;
}

function CancelledIssue({ issue }: { issue: MeetingIssue | null }) {
  if (!issue) return null;
  return <div role="status" aria-live="polite" className="py-4">
    <p className="text-type-body-compact font-medium text-nite-text-primary">Não foi possível carregar as reuniões canceladas.</p>
    <p className="mt-1 text-type-body-compact text-nite-text-secondary">{issueMessage(issue)}</p>
  </div>;
}

export function MeetingsWorkspace({ viewerId, previewMode = false, previewCandidates = [], initialOverlay, upcoming: initialUpcoming, past: initialPast, cancelled: initialCancelled, notifications: initialNotifications, upcomingIssue, pastIssue, cancelledIssue, notificationIssue, upcomingPage, pastPage, cancelledPage, initialGraphAvailability, initialJoinFeedback, graphHelpHref }: Props) {
  const router = useRouter();
  const previewMeetings = [...(initialUpcoming?.items ?? []), ...(initialPast?.items ?? []), ...(initialCancelled?.items ?? [])];
  const invitePreviewMeeting = previewMeetings.find((meeting) => meeting.organizerMemberId !== viewerId && meeting.invitees.some((invitee) => invitee.memberId === viewerId && invitee.internalStatus === "PENDENTE"));
  const linkedPreviewMeeting = previewMeetings.find(isJoinable);
  const historicalPreviewMeeting = initialPast?.items[0];
  const cancelledPreviewMeeting = initialCancelled?.items[0];
  const previewDetailMeeting = initialOverlay === "invite" ? invitePreviewMeeting : initialOverlay === "linked" ? linkedPreviewMeeting : initialOverlay === "cancelled" ? cancelledPreviewMeeting : initialOverlay === "history" ? historicalPreviewMeeting : null;
  const previewCanCreate = !previewMode || initialGraphAvailability === undefined || initialGraphAvailability === "available";
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [past, setPast] = useState(initialPast);
  const [cancelled, setCancelled] = useState(initialCancelled);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [loadedUpcomingPage, setLoadedUpcomingPage] = useState(initialUpcoming?.page ?? upcomingPage);
  const [loadedPastPage, setLoadedPastPage] = useState(initialPast?.page ?? pastPage);
  const [loadedCancelledPage, setLoadedCancelledPage] = useState(initialCancelled?.page ?? cancelledPage);
  const [loadingMore, setLoadingMore] = useState<"upcoming" | "past" | "cancelled" | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(() => previewCanCreate && initialOverlay === "immediate" ? { key: 1, mode: "create", meetingMode: "IMMEDIATE" } : previewCanCreate && initialOverlay === "scheduled" ? { key: 2, mode: "create", meetingMode: "SCHEDULED" } : null);
  const [detail, setDetail] = useState<DetailState | null>(() => previewMode && previewDetailMeeting ? { meeting: previewDetailMeeting, cancelConfirm: false, busy: false, feedback: "" } : null);
  const [graphResult, setGraphResult] = useState<MeetingGraphAvailabilityResult | null>(() => {
    if (!previewMode) return null;
    const state = initialGraphAvailability ?? "available";
    return { state, httpStatus: state === "consent-required" || state === "admin-approval-required" ? 403 : state === "available" ? 200 : null, code: state === "consent-required" ? "OBO_CONSENT_REQUIRED" : state === "admin-approval-required" ? "OBO_ADMIN_APPROVAL_REQUIRED" : null };
  });
  const graphAvailability: MeetingGraphAvailability = graphResult?.state ?? "checking";
  const graphConsentRequired = graphResult !== null && isMeetingGraphConsentRequired(graphResult);
  const createGate = resolveCreateMeetingGate(graphResult);
  const createButtonsEnabled = previewMode
    ? graphAvailability === "available"
    : createGate === "open" || createGate === "authorization-page";
  const [feedback, setFeedback] = useState(() => initialJoinFeedback ? issueMessage(initialJoinFeedback) : "");
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const cancelKeyRef = useRef<{ meetingId: string; version: number; key: string } | null>(null);
  const [, startTransition] = useTransition();
  const availabilityCheckRef = useRef(false);

  const allMeetings = useMemo(() => Array.from(new Map([...(upcoming?.items ?? []), ...(past?.items ?? []), ...(cancelled?.items ?? [])].map((meeting) => [meeting.id, meeting] as const)).values()), [upcoming, past, cancelled]);
  const pendingInvites = useMemo(() => allMeetings.filter((meeting) => meeting.organizerMemberId !== viewerId && meeting.status !== "CANCELADA" && meeting.invitees.some((invitee) => invitee.memberId === viewerId && invitee.internalStatus === "PENDENTE")), [allMeetings, viewerId]);
  const pendingInviteIds = useMemo(() => new Set(pendingInvites.map((meeting) => meeting.id)), [pendingInvites]);
  const cancelledMeetingIds = useMemo(() => new Set((cancelled?.items ?? []).filter((meeting) => meeting.status === "CANCELADA").map((meeting) => meeting.id)), [cancelled]);
  const visibleUpcoming = upcoming?.items.filter((meeting) => meeting.status !== "CANCELADA" && !cancelledMeetingIds.has(meeting.id) && !pendingInviteIds.has(meeting.id)) ?? [];
  const visiblePast = past?.items.filter((meeting) => meeting.status !== "CANCELADA" && !cancelledMeetingIds.has(meeting.id) && !pendingInviteIds.has(meeting.id)) ?? [];
  const visibleCancelled = cancelled?.items.filter((meeting) => meeting.status === "CANCELADA") ?? [];
  const unread = (notifications?.items ?? []).filter((notification) => notification.readAt === null && notification.type !== "RELATORIO_DE_PRESENCA_DISPONIVEL");

  const checkGraphAvailability = useCallback(async (force = false) => {
    if (previewMode || availabilityCheckRef.current) return;
    if (!force) {
      try {
        const cached = readMeetingGraphAvailabilityCache(sessionStorage, viewerId);
        if (cached) { setGraphResult(cached); return; }
      } catch { /* storage may be unavailable; perform the check without caching */ }
    }
    availabilityCheckRef.current = true;
    setGraphResult(null);
    try {
      const result = await getMeetingGraphAvailabilityAction();
      setGraphResult(result);
      try { writeMeetingGraphAvailabilityCache(sessionStorage, viewerId, result); } catch { /* availability remains usable for this render */ }
    } catch {
      setGraphResult({ state: "unavailable", httpStatus: null, code: null });
    } finally {
      availabilityCheckRef.current = false;
    }
  }, [previewMode, viewerId]);

  useEffect(() => {
    if (!previewMode) startTransition(() => { void checkGraphAvailability(); });
  }, [checkGraphAvailability, previewMode, startTransition]);

  function updateMeeting(meeting: Meeting) {
    const insertOrReplace = (current: MeetingPage<Meeting> | null, direction: "asc" | "desc"): MeetingPage<Meeting> => {
      const page = current ?? { items: [], page: 0, size: 20, total: 0 };
      const exists = page.items.some((item) => item.id === meeting.id);
      const items = [...page.items.filter((item) => item.id !== meeting.id), meeting].sort((left, right) => {
        const leftValue = Date.parse(direction === "asc" ? left.startsAt : left.updatedAt);
        const rightValue = Date.parse(direction === "asc" ? right.startsAt : right.updatedAt);
        return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
      });
      return { ...page, items, total: exists ? page.total : page.total + 1 };
    };
    const remove = (current: MeetingPage<Meeting> | null): MeetingPage<Meeting> | null => current ? { ...current, items: current.items.filter((item) => item.id !== meeting.id), total: Math.max(0, current.total - (current.items.some((item) => item.id === meeting.id) ? 1 : 0)) } : current;
    const isCancelled = meeting.status === "CANCELADA";
    const isPast = Date.parse(meeting.plannedEndsAt) < Date.now();
    if (isCancelled) {
      setUpcoming((current) => remove(current));
      setPast((current) => remove(current));
      setCancelled((current) => insertOrReplace(current, "desc"));
    } else {
      setCancelled((current) => remove(current));
      if (isPast) {
        setUpcoming((current) => remove(current));
        setPast((current) => insertOrReplace(current, "desc"));
      } else {
        setPast((current) => remove(current));
        setUpcoming((current) => insertOrReplace(current, "asc"));
      }
    }
    router.refresh();
  }

  function openEditor(mode: "create" | "edit", meetingMode: "IMMEDIATE" | "SCHEDULED", meeting?: Meeting) {
    if (previewMode && graphAvailability !== "available") return;
    if (!previewMode) {
      const gate = resolveCreateMeetingGate(graphResult);
      if (gate === "authorization-page" && mode === "create") { router.push("/reunioes/erro-403"); return; }
      if (gate !== "open") return;
    }
    if (meeting?.provider === "TEAMS_LINK") return;
    setDetail(null);
    setEditor({ key: Date.now(), mode, meetingMode, meeting });
  }

  function handleEditorSaved(result: MeetingWriteResult) {
    if (result.kind === "operation") {
      setFeedback(`A operação permanece ${result.operation.operationStatus.toLocaleLowerCase("pt-BR")}. O NITE Connect não a apresenta como concluída; consulte novamente em instantes.`);
      router.refresh();
      return;
    }
    const meeting = result.meeting;
    updateMeeting(meeting);
    setEditor(null);
    setDetail({ meeting, cancelConfirm: false, busy: false, feedback: "" });
  }

  async function respond(meeting: Meeting, response: "ACEITO" | "RECUSADO") {
    const invite = meeting.invitees.find((item) => item.memberId === viewerId);
    if (!invite) return;
    setFeedback("");
    const result = await respondToMeetingInviteAction(meeting.id, invite.version, response);
    if (result.issue || !result.data) {
      setFeedback(issueMessage(result.issue ?? "unavailable"));
      return;
    }
    const updated = { ...meeting, invitees: meeting.invitees.map((item) => item.memberId === result.data.memberId ? result.data : item) };
    updateMeeting(updated);
    if (detail?.meeting.id === updated.id) setDetail((current) => current ? { ...current, meeting: updated, feedback: response === "ACEITO" ? "Sua resposta foi registrada no NITE Connect." : "Sua recusa foi registrada no NITE Connect." } : current);
  }

  async function confirmCancel() {
    if (!detail) return;
    setDetail((current) => current ? { ...current, busy: true, feedback: "" } : current);
    if (!cancelKeyRef.current || cancelKeyRef.current.meetingId !== detail.meeting.id || cancelKeyRef.current.version !== detail.meeting.version) {
      cancelKeyRef.current = { meetingId: detail.meeting.id, version: detail.meeting.version, key: crypto.randomUUID() };
    }
    const result = await cancelMeetingAction(detail.meeting.id, detail.meeting.version, cancelKeyRef.current.key);
    if (result.issue || !result.data) {
      setDetail((current) => current ? { ...current, busy: false, feedback: issueMessage(result.issue ?? "unavailable") } : current);
      return;
    }
    if (result.data.kind === "operation") {
      setDetail((current) => current ? { ...current, busy: false, feedback: "O cancelamento ainda aguarda confirmação do Microsoft 365." } : current);
      return;
    }
    const cancelledMeeting = result.data.meeting;
    updateMeeting(cancelledMeeting);
    setDetail((current) => current ? { ...current, meeting: cancelledMeeting, busy: false, cancelConfirm: false, feedback: "Cancelamento confirmado no calendário." } : current);
  }

  async function shareMeeting(meeting: Meeting) {
    if (shouldRouteMeetingLinkAction(graphResult)) { router.push("/reunioes/erro-403"); return; }
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    setSharingId(meeting.id);
    setCopyFeedback("");
    const result = await getMeetingShareAction(meeting.id);
    setSharingId(null);
    if (result.issue || !result.data) {
      popup?.close();
      if (result.issue === "consent-required") { router.push("/reunioes/erro-403"); return; }
      setCopyFeedback(issueMessage(result.issue ?? "unavailable"));
      return;
    }
    const url = new URL(result.data.path, window.location.origin).toString();
    if (popup) popup.location.href = `https://wa.me/?text=${encodeURIComponent(`${meeting.title} — ${url}`)}`;
    else setCopyFeedback("O navegador bloqueou a nova janela. Copie o link autorizado e compartilhe manualmente.");
  }

  async function copyMeetingLink(meeting: Meeting) {
    setSharingId(meeting.id);
    setCopyFeedback("");
    const result = await getMeetingShareAction(meeting.id);
    setSharingId(null);
    if (result.issue || !result.data) {
      if (result.issue === "consent-required") { router.push("/reunioes/erro-403"); return; }
      setCopyFeedback(issueMessage(result.issue ?? "unavailable"));
      return;
    }
    try {
      await navigator.clipboard.writeText(new URL(result.data.path, window.location.origin).toString());
      setCopyFeedback("Link autorizado copiado.");
    } catch {
      setCopyFeedback("Não foi possível copiar. Use o compartilhamento pelo WhatsApp ou abra a reunião pelo NITE Connect.");
    }
  }

  async function markRead(notification: MeetingNotification) {
    if (notification.readAt) return;
    const result = await markMeetingNotificationReadAction(notification.id);
    if (result.issue) {
      setFeedback(issueMessage(result.issue));
      return;
    }
    const readAt = new Date().toISOString();
    setNotifications((current) => current ? { ...current, items: current.items.map((item) => item.id === notification.id ? { ...item, readAt } : item) } : current);
  }

  async function loadMoreMeetings(scope: "upcoming" | "past" | "cancelled") {
    if (loadingMore) return;
    const page = (scope === "upcoming" ? loadedUpcomingPage : scope === "past" ? loadedPastPage : loadedCancelledPage) + 1;
    setLoadingMore(scope);
    setFeedback("");
    try {
      const result = await loadMeetingPageAction(scope, page);
      if (result.issue || !result.data) {
        setFeedback(issueMessage(result.issue ?? "unavailable"));
        return;
      }
      const nextPage = result.data;
      if (scope === "upcoming") {
        setUpcoming((current) => current ? appendMeetingPages(current, nextPage) : nextPage);
        setLoadedUpcomingPage(nextPage.page);
      } else if (scope === "past") {
        setPast((current) => current ? appendMeetingPages(current, nextPage) : nextPage);
        setLoadedPastPage(nextPage.page);
      } else {
        setCancelled((current) => current ? appendMeetingPages(current, nextPage) : nextPage);
        setLoadedCancelledPage(nextPage.page);
      }
    } catch {
      setFeedback("Não foi possível carregar mais reuniões. Tente novamente.");
    } finally {
      setLoadingMore(null);
    }
  }

  const pendingInviteSection = pendingInvites.length ? <section aria-labelledby="pending-invites-heading" className="pb-1">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="pending-invites-heading" className="font-display text-type-section-title text-nite-text-primary">Convites pendentes</h2>
      <span className="text-type-metadata text-nite-brand-primary">Aguardando sua resposta</span>
    </div>
    <ul className="mt-2">
      {pendingInvites.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} viewerId={viewerId} previewMode={previewMode} graphConsentRequired={graphConsentRequired} onDetails={(item) => { setFeedback(""); setDetail({ meeting: item, cancelConfirm: false, busy: false, feedback: "" }); }} onRespond={(item) => { setFeedback(""); setDetail({ meeting: item, cancelConfirm: false, busy: false, feedback: "" }); }} />)}
    </ul>
  </section> : null;

  return <div className="mx-auto w-full max-w-6xl min-w-0 space-y-7 px-4 py-5 sm:px-7 sm:py-8 lg:px-9">
    {feedback ? <InlineFeedback className="mb-1" variant="warning" description={feedback} announcement="polite" /> : null}
    <header className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-2">
        <h1 className="font-display text-type-page-title text-nite-text-primary">Reuniões</h1>
        <p className="max-w-prose text-type-body-compact text-nite-text-secondary">Crie encontros e participe pelo Microsoft Teams.</p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button type="button" disabled={!createButtonsEnabled} onClick={() => openEditor("create", "IMMEDIATE")}>Iniciar reunião</Button>
        <Button type="button" variant="secondary" disabled={!createButtonsEnabled} onClick={() => openEditor("create", "SCHEDULED")}>Agendar</Button>
      </div>
    </header>

    {graphAvailability !== "available" ? <section role={graphAvailability === "checking" ? "status" : "note"} aria-live="polite" className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1">
      <p className="max-w-3xl text-type-body-compact text-nite-text-secondary">
        {graphAvailability === "checking" ? "Verificando a conexão institucional com o calendário…" : graphAvailability === "consent-required" ? <>{graphAvailabilityText[graphAvailability]} {graphHelpHref ? <Link href={graphHelpHref} className="font-medium text-nite-brand-primary underline underline-offset-4 hover:text-nite-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Entenda o motivo</Link> : null}</> : graphAvailabilityText[graphAvailability]}
      </p>
      {graphAvailability !== "checking" && graphAvailability !== "consent-required" ? <Button type="button" variant="quiet" disabled={previewMode} onClick={() => void checkGraphAvailability(true)}>Verificar novamente</Button> : null}
    </section> : null}

    {notificationIssue ? <PageIssue issue={notificationIssue} /> : unread.length ? <section aria-label="Atualizações recentes" className="flex min-w-0 flex-col gap-2 py-1 sm:flex-row sm:items-start sm:gap-5">
      <div className="flex shrink-0 items-baseline gap-2"><h2 className="text-type-label font-semibold text-nite-text-primary">Atualizações</h2><span className="text-type-metadata text-nite-brand-primary">{unread.length} novas recentes</span></div>
      <ul className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2">
        {unread.map((notification) => <li key={notification.id} className="flex min-w-0 items-center justify-between gap-2 text-type-metadata">
          <button type="button" onClick={() => { void markRead(notification); const meeting = allMeetings.find((item) => item.id === notification.meetingId); if (meeting) setDetail({ meeting, cancelConfirm: false, busy: false, feedback: "" }); }} className="min-w-0 truncate text-left text-nite-text-secondary underline decoration-nite-border-strong underline-offset-4 hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{notificationText[notification.type] ?? "Atualização da reunião"} · {notification.title}</button>
          <button type="button" aria-label={`Marcar atualização de ${notification.title} como lida`} onClick={() => void markRead(notification)} disabled={previewMode} className="min-h-9 shrink-0 rounded-control px-2 text-nite-text-muted hover:bg-nite-surface-subtle hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:text-nite-text-muted">Lida</button>
        </li>)}
      </ul>
    </section> : null}

    {pendingInviteSection}

    <section aria-labelledby="upcoming-meetings-heading" id="proximas">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="upcoming-meetings-heading" className="font-display text-type-section-title text-nite-text-primary">Próximas reuniões</h2>
      </div>
      <PageIssue issue={upcomingIssue} />
      {upcomingIssue ? null : visibleUpcoming.length ? <ul>
        {visibleUpcoming.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} viewerId={viewerId} previewMode={previewMode} graphConsentRequired={graphConsentRequired} onDetails={(item) => setDetail({ meeting: item, cancelConfirm: false, busy: false, feedback: "" })} onRespond={(item) => setDetail({ meeting: item, cancelConfirm: false, busy: false, feedback: "" })} />)}
      </ul> : <p className="py-2 text-type-body-compact text-nite-text-secondary">{pendingInvites.length ? "Os encontros que aguardam sua resposta estão listados acima." : "Nenhuma reunião futura por enquanto."}</p>}
      {upcoming && (loadedUpcomingPage + 1) * upcoming.size < upcoming.total ? <button type="button" onClick={() => void loadMoreMeetings("upcoming")} disabled={loadingMore !== null || previewMode} aria-busy={loadingMore === "upcoming"} className="mt-3 inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium text-nite-text-secondary underline underline-offset-4 hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:cursor-wait disabled:text-nite-text-muted">{loadingMore === "upcoming" ? "Carregando reuniões…" : "Ver mais reuniões"}</button> : null}
    </section>

    <section aria-labelledby="past-meetings-heading" id="historico">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="past-meetings-heading" className="font-display text-type-section-title text-nite-text-primary">Reuniões anteriores</h2>
      </div>
      <PageIssue issue={pastIssue} />
      {pastIssue ? null : visiblePast.length ? <ul>
        {visiblePast.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} viewerId={viewerId} previewMode={previewMode} graphConsentRequired={graphConsentRequired} onDetails={(item) => setDetail({ meeting: item, cancelConfirm: false, busy: false, feedback: "" })} onRespond={(item) => setDetail({ meeting: item, cancelConfirm: false, busy: false, feedback: "" })} />)}
      </ul> : <p className="py-2 text-type-body-compact text-nite-text-secondary">Nenhuma reunião anterior por enquanto.</p>}
      {past && (loadedPastPage + 1) * past.size < past.total ? <button type="button" onClick={() => void loadMoreMeetings("past")} disabled={loadingMore !== null || previewMode} aria-busy={loadingMore === "past"} className="mt-3 inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium text-nite-text-secondary underline underline-offset-4 hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:cursor-wait disabled:text-nite-text-muted">{loadingMore === "past" ? "Carregando histórico…" : "Ver mais histórico"}</button> : null}
    </section>

    <section aria-labelledby="cancelled-meetings-heading" id="canceladas">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cancelled-meetings-heading" className="font-display text-type-section-title text-nite-text-primary">Reuniões canceladas</h2>
      </div>
      <CancelledIssue issue={cancelledIssue} />
      {cancelledIssue ? null : visibleCancelled.length ? <ul>
        {visibleCancelled.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} viewerId={viewerId} previewMode={previewMode} graphConsentRequired={graphConsentRequired} onDetails={(item) => setDetail({ meeting: item, cancelConfirm: false, busy: false, feedback: "" })} onRespond={(item) => setDetail({ meeting: item, cancelConfirm: false, busy: false, feedback: "" })} />)}
      </ul> : <p className="py-2 text-type-body-compact text-nite-text-secondary">Nenhuma reunião cancelada.</p>}
      {cancelled && (loadedCancelledPage + 1) * cancelled.size < cancelled.total ? <button type="button" onClick={() => void loadMoreMeetings("cancelled")} disabled={loadingMore !== null || previewMode} aria-busy={loadingMore === "cancelled"} className="mt-3 inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium text-nite-text-secondary underline underline-offset-4 hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:cursor-wait disabled:text-nite-text-muted">{loadingMore === "cancelled" ? "Carregando reuniões…" : "Ver mais canceladas"}</button> : null}
    </section>

    {editor ? <MeetingEditorDialog key={editor.key} open mode={editor.mode} meetingMode={editor.meetingMode} meeting={editor.meeting} viewerId={viewerId} previewMode={previewMode} previewCandidates={previewCandidates} onOpenChange={(open) => { if (!open) setEditor(null); }} onSaved={handleEditorSaved} onAuthorizationRequired={() => router.push("/reunioes/erro-403")} /> : null}

    <DialogFrame open={detail !== null} onOpenChange={(open) => { if (!open) { setDetail(null); setCopyFeedback(""); } }} title={detail?.meeting.title ?? "Detalhes da reunião"} description={detail ? `${formatMeetingDateTime(detail.meeting.startsAt)} · duração prevista ${detail.meeting.plannedDurationMinutes} min` : undefined} className="max-w-2xl" footer={detail ? <><Button type="button" variant="secondary" onClick={() => setDetail(null)}>Fechar</Button>{detail.meeting.organizerMemberId === viewerId && detail.meeting.provider === "GRAPH" && detail.meeting.status !== "CANCELADA" ? <><Button type="button" variant="secondary" disabled={previewMode || graphAvailability !== "available"} onClick={() => openEditor("edit", detail.meeting.mode, detail.meeting)}>Editar</Button><Button type="button" variant="destructive" disabled={previewMode || graphAvailability !== "available"} onClick={() => setDetail((current) => current ? { ...current, cancelConfirm: true, feedback: "" } : current)}>Cancelar</Button></> : null}</> : null}>
      {detail ? <div className="grid gap-5">
        <section className="grid gap-2">
          <p className="text-type-body-compact font-medium text-nite-text-primary">{statusText(detail.meeting)}</p>
          <p className="text-type-body-compact text-nite-text-secondary">Organizador: {detail.meeting.organizerName}</p>
          <p className="text-type-body-compact text-nite-text-secondary">Duração prevista: {detail.meeting.plannedDurationMinutes} minutos</p>
          {detail.meeting.actualDurationSeconds !== null ? <p className="text-type-body-compact text-nite-text-secondary">Duração efetiva informada pelo Teams: {formatMeetingDuration(detail.meeting.actualDurationSeconds)}</p> : null}
          {detail.meeting.provider === "TEAMS_LINK" && detail.meeting.status === "AGENDADA" ? <p className="text-type-metadata leading-relaxed text-nite-text-secondary">Este é um registro anterior à integração automática. A reunião possui um link de entrada já associado.</p> : null}
          {detail.meeting.provider === "TEAMS_LINK" && detail.meeting.status === "CANCELADA" ? <InlineFeedback variant="warning" description="O registro foi cancelado no NITE Connect. O compromisso antigo do Teams não foi atualizado automaticamente." /> : null}
          {detail.meeting.provider === "TEAMS_LINK" && detail.meeting.status === "AGUARDANDO_TEAMS" ? <p className="text-type-body-compact text-nite-text-secondary">Este registro antigo não possui um link de entrada disponível.</p> : null}
        </section>

        {detail.cancelConfirm ? <InlineFeedback variant="warning" title="Cancelar reunião?" description="O evento será cancelado no calendário Microsoft e os convidados receberão uma atualização." action={<div className="flex gap-2"><Button type="button" variant="secondary" disabled={previewMode || detail.busy} onClick={() => setDetail((current) => current ? { ...current, cancelConfirm: false } : current)}>Voltar</Button><Button type="button" variant="destructive" loading={detail.busy} disabled={previewMode || graphAvailability !== "available"} onClick={() => void confirmCancel()}>Confirmar cancelamento</Button></div>} announcement="assertive" /> : null}

        {detail.feedback ? <InlineFeedback variant={detail.feedback.includes("não") || detail.feedback.includes("indisponíveis") ? "warning" : "success"} description={detail.feedback} announcement="polite" /> : null}

        <section aria-labelledby="meeting-guests-heading" className="grid gap-2">
          <h3 id="meeting-guests-heading" className="text-type-label font-semibold text-nite-text-primary">Convidados</h3>
          {detail.meeting.invitees.length ? <ul className="divide-y divide-nite-border-soft border-y border-nite-border-soft">
            {detail.meeting.invitees.map((invitee) => <li key={invitee.memberId} className="flex flex-wrap items-start justify-between gap-2 py-3 text-type-body-compact">
              <span className="text-nite-text-primary">{invitee.name}</span>
              <span className="text-right text-type-metadata text-nite-text-secondary">{inviteStatusText[invitee.internalStatus]}</span>
            </li>)}
          </ul> : <p className="text-type-body-compact text-nite-text-secondary">Nenhum integrante convidado.</p>}
          {detail.meeting.organizerMemberId !== viewerId && detail.meeting.invitees.find((invitee) => invitee.memberId === viewerId)?.internalStatus === "PENDENTE" && detail.meeting.status !== "CANCELADA" ? <div className="flex flex-wrap gap-2 pt-2"><Button type="button" disabled={previewMode} onClick={() => void respond(detail.meeting, "ACEITO")}>Aceitar convite no NITE</Button><Button type="button" variant="secondary" disabled={previewMode} onClick={() => void respond(detail.meeting, "RECUSADO")}>Recusar</Button></div> : null}
        </section>

        {isJoinable(detail.meeting) ? <section className="grid gap-3 border-t border-nite-border-soft pt-4">
          <h3 className="text-type-label font-semibold text-nite-text-primary">Acesso e compartilhamento</h3>
          <p className="text-type-body-compact text-nite-text-secondary">O link passa pelo NITE Connect. O Teams controla o lobby e as regras de entrada.</p>
          <div className="flex flex-wrap gap-2">{previewMode ? <Button type="button" disabled>Entrar no Teams</Button> : <Link href={shouldRouteMeetingLinkAction(graphResult) ? "/reunioes/erro-403" : `/reunioes/${encodeURIComponent(detail.meeting.id)}/entrar`} className="inline-flex min-h-11 items-center justify-center rounded-control border border-nite-brand-primary bg-nite-brand-primary px-4 py-2 text-type-label font-medium text-nite-action-text hover:bg-nite-brand-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Entrar no Teams</Link>}<Button type="button" variant="secondary" disabled={previewMode} loading={sharingId === detail.meeting.id} onClick={() => void copyMeetingLink(detail.meeting)}>Copiar link autorizado</Button><Button type="button" variant="quiet" disabled={previewMode} loading={sharingId === detail.meeting.id} onClick={() => void shareMeeting(detail.meeting)}>Compartilhar pelo WhatsApp</Button></div>
          {copyFeedback ? <p role="status" className="text-type-body-compact text-nite-text-secondary">{copyFeedback}</p> : null}
        </section> : null}
      </div> : null}
    </DialogFrame>
  </div>;
}
