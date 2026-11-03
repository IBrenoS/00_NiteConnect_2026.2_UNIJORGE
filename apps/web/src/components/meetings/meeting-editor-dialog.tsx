"use client";

import { useRef, useState, type FormEvent } from "react";
import { createMeetingAction, updateMeetingAction } from "../../lib/meetings/actions";
import { localDateTimeInputValues, toBahiaOffsetDateTime } from "../../lib/meetings/date-time";
import type { Meeting, MeetingCandidate, MeetingMode, MeetingWriteResult } from "../../lib/meetings/contracts";
import { Button } from "../ui/button";
import { DialogFrame } from "../ui/dialog-frame";
import { Field } from "../ui/field";
import { Select } from "../ui/select";
import { TextField } from "../ui/text-field";
import { MeetingInviteePicker } from "./meeting-invitee-picker";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  meetingMode: MeetingMode;
  meeting?: Meeting;
  viewerId: string;
  previewMode?: boolean;
  previewCandidates?: MeetingCandidate[];
  onOpenChange: (open: boolean) => void;
  onSaved: (result: MeetingWriteResult) => void;
  onAuthorizationRequired: () => void;
};

function issueMessage(issue: string): string {
  if (issue === "consent-required") return "A autorização institucional do Microsoft 365 ainda não está disponível. Nenhuma reunião foi criada.";
  if (issue === "admin-approval-required") return "A integração exige aprovação administrativa institucional. Nenhuma reunião foi criada.";
  if (issue === "graph-unavailable") return "O Microsoft 365 não confirmou a operação. Nenhuma reunião foi apresentada como criada; tente novamente em instantes.";
  if (issue === "access") return "Sua sessão não permite esta ação. Atualize o acesso institucional e tente novamente.";
  if (issue === "not-found") return "A reunião não está mais disponível.";
  if (issue === "conflict") return "A reunião mudou desde que você a abriu. Feche e consulte a versão atual.";
  if (issue === "invalid") return "Confira o título, a data, o horário e os convidados.";
  return "Não foi possível confirmar a operação. Tente novamente; uma tentativa repetida mantém a mesma chave de idempotência.";
}

function selectedInvitees(meeting?: Meeting): MeetingCandidate[] {
  return meeting?.invitees.filter((invitee) => invitee.internalStatus !== "REVOGADO").map(({ memberId, name }) => ({ id: memberId, name })) ?? [];
}

export function MeetingEditorDialog({ open, mode, meetingMode, meeting, viewerId, previewMode = false, previewCandidates, onOpenChange, onSaved, onAuthorizationRequired }: Props) {
  const initial = meeting ? localDateTimeInputValues(meeting.startsAt) : { date: "", time: "" };
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(String(meeting?.plannedDurationMinutes ?? 60));
  const [invitees, setInvitees] = useState<MeetingCandidate[]>(selectedInvitees(meeting));
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const isImmediate = mode === "create" && meetingMode === "IMMEDIATE";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    if (previewMode) {
      setFeedback("Esta prévia usa dados sintéticos e não grava reuniões.");
      return;
    }
    const plannedDurationMinutes = Number(duration);
    const startsAt = isImmediate ? null : toBahiaOffsetDateTime(date, time);
    if (!title.trim() || title.trim().length > 200 || !Number.isSafeInteger(plannedDurationMinutes) || plannedDurationMinutes < 1 || plannedDurationMinutes > 1_440 || (!isImmediate && !startsAt)) {
      setFeedback("Preencha um título, uma data e um horário válidos.");
      return;
    }
    if (mode === "create" && meetingMode === "SCHEDULED" && startsAt && Date.parse(startsAt) <= Date.now()) {
      setFeedback("Escolha um horário futuro para agendar.");
      return;
    }
    const ids = invitees.map((invitee) => invitee.id);
    const fingerprint = JSON.stringify({ mode, meetingMode, title: title.trim(), startsAt, plannedDurationMinutes, ids });
    if (!keyRef.current || keyRef.current.fingerprint !== fingerprint) keyRef.current = { fingerprint, key: crypto.randomUUID() };
    setPending(true);
    try {
      const result = mode === "create"
        ? await createMeetingAction({ mode: meetingMode, title: title.trim(), startsAt, plannedDurationMinutes, inviteeIds: ids }, keyRef.current.key)
        : meeting
          ? await updateMeetingAction(meeting.id, { expectedVersion: meeting.version, title: title.trim(), startsAt: startsAt ?? "", plannedDurationMinutes, inviteeIds: ids }, keyRef.current.key)
          : { data: null, issue: "not-found" as const };
      if (result.issue || !result.data) {
        if (result.issue === "consent-required") { onAuthorizationRequired(); return; }
        setFeedback(issueMessage(result.issue ?? "unavailable"));
      } else {
        onSaved(result.data);
      }
    } catch {
      setFeedback("Não foi possível concluir agora. Revise os dados e tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return <DialogFrame open={open} onOpenChange={onOpenChange}
    title={mode === "edit" ? "Editar reunião" : isImmediate ? "Iniciar reunião" : "Agendar reunião"}
    description={mode === "edit" ? "Atualize o evento do calendário e os convidados." : isImmediate ? "O NITE Connect criará a reunião no calendário institucional e abrirá a entrada no Teams." : "O NITE Connect criará o evento no calendário com o link oficial do Teams."}
    className="max-w-3xl"
    footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Voltar</Button><Button type="submit" form="meeting-editor-form" loading={pending}>{mode === "edit" ? "Salvar alterações" : isImmediate ? "Iniciar reunião" : "Agendar reunião"}</Button></>}>
    <form id="meeting-editor-form" onSubmit={(event) => void submit(event)} className="grid min-w-0 gap-5">
      <Field id="meeting-title" label="Nome da reunião" required>
        <TextField value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={200} autoComplete="off" required placeholder="Ex.: Alinhamento do projeto" />
      </Field>
      {!isImmediate ? <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,.65fr)]">
        <Field id="meeting-date" label="Data" required>
          <TextField type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} required />
        </Field>
        <Field id="meeting-time" label="Início" required>
          <TextField type="time" value={time} onChange={(event) => setTime(event.currentTarget.value)} required />
        </Field>
      </div> : <div className="border-y border-nite-border-soft py-3 text-type-body-compact text-nite-text-secondary">Início imediato · duração prevista de 60 minutos. A duração não encerra a chamada no Teams.</div>}
      {!isImmediate ? <Field id="meeting-duration" label="Duração prevista" description="Esta previsão não limita nem encerra a chamada no Teams." required>
        <Select value={duration} onChange={(event) => setDuration(event.currentTarget.value)}>
          {Array.from(new Set([30, 45, 60, 90, 120, 180, 240, meeting?.plannedDurationMinutes].filter((minutes): minutes is number => typeof minutes === "number"))).sort((left, right) => left - right).map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 || minutes % 60 !== 0 ? `${minutes} minutos` : `${minutes / 60} ${minutes === 60 ? "hora" : "horas"}`}</option>)}
        </Select>
      </Field> : null}
      <MeetingInviteePicker selected={invitees} onChange={setInvitees} excludedId={viewerId} previewCandidates={previewCandidates} />
      {mode === "create" && meetingMode === "SCHEDULED" ? <p className="border-t border-nite-border-soft pt-3 text-type-metadata leading-relaxed text-nite-text-secondary">O convite de calendário será enviado pelo Microsoft 365. As respostas internas do NITE Connect permanecem separadas das respostas no Outlook.</p> : null}
      {previewMode ? <p className="border-t border-nite-border-soft pt-3 text-type-metadata text-status-warning">Prévia sintética — nenhuma alteração será persistida.</p> : null}
      {feedback ? <p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft px-3 py-2 text-type-body-compact text-status-error">{feedback}</p> : null}
    </form>
  </DialogFrame>;
}
