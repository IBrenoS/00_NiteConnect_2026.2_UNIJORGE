import type { HistoryEntry, NonApurationReason } from "./contracts";
import { formatFrequencyDate } from "./query";

const reasonLabels: Record<NonApurationReason, string> = {
  LISTA_AGUARDANDO_CONCLUSAO: "Aguardando conclusão",
  REUNIAO_CANCELADA: "Reunião cancelada",
  REUNIAO_NAO_REALIZADA: "Não realizada",
  REUNIAO_NAO_CONTABILIZAVEL: "Não contabilizada",
  ANTERIOR_AO_CORTE_OFICIAL: "Registro anterior",
};

export function historyPresentation(entry: HistoryEntry): { label: string; context: string | null } {
  const recordedPresence = entry.presenceRecorded;
  if (recordedPresence) {
    const context = entry.notCountedReason ? reasonLabels[entry.notCountedReason] : entry.legacy ? "Registro anterior" : null;
    return { label: "Presente", context };
  }
  if (entry.listStatus === "CANCELADA" || entry.accountingStatus === "CANCELADA") return { label: "Cancelada", context: null };
  if (entry.attendanceStatus === "AGUARDANDO" && entry.listStatus === "ABERTA" && entry.confirmationWindowStatus === "ABERTA") return { label: "Reunião em andamento", context: null };
  if (entry.attendanceStatus === "JUSTIFICADO") return { label: "Justificado", context: entry.notCountedReason ? reasonLabels[entry.notCountedReason] : null };
  if (entry.notCountedReason) return { label: reasonLabels[entry.notCountedReason], context: null };
  if (entry.attendanceStatus === "AUSENTE") return { label: "Ausente", context: null };
  if (entry.attendanceStatus === "AGUARDANDO" || entry.accountingStatus === "AGUARDANDO_CONCLUSAO") return { label: "Aguardando conclusão", context: null };
  if (entry.attendanceStatus === "LEGADO") return { label: "Registro anterior", context: null };
  return { label: "Registro anterior", context: null };
}

type StatusMoment = Pick<HistoryEntry, "attendanceStatus" | "confirmedAt" | "changedAt" | "occurredAt" | "listStatus" | "outcome" | "inApuration">;
type RecordedStatus = StatusMoment["attendanceStatus"] | "FORA_DA_APURACAO";

export function frequencyStatusMoment(status: RecordedStatus, confirmedAt: string | null, changedAt: string | null, occurredAt: string): string | null {
  if (status === "PRESENTE") return confirmedAt ? formatMoment("Presença confirmada", confirmedAt, occurredAt) : "Horário da presença indisponível";
  if (status === "LEGADO") return confirmedAt ? formatMoment("Presença registrada", confirmedAt, occurredAt) : "Horário da presença indisponível";
  if (status === "JUSTIFICADO") {
    return changedAt ? formatMoment("Justificado", changedAt, occurredAt) : "Horário da justificativa indisponível";
  }
  if (status === "AUSENTE") {
    return changedAt ? formatMoment("Ausência registrada", changedAt, occurredAt) : "Horário da ausência indisponível";
  }
  return null;
}

export function historyStatusMoment(entry: StatusMoment): string | null {
  if (entry.attendanceStatus === "AUSENTE"
      && (entry.listStatus !== "CONCLUIDA" || entry.outcome !== "REALIZADA_CONTABILIZAVEL" || !entry.inApuration)) return null;
  return frequencyStatusMoment(entry.attendanceStatus, entry.confirmedAt, entry.changedAt, entry.occurredAt);
}

function formatMoment(label: string, value: string, meetingAt: string): string {
  const time = formatFrequencyDate(value, { hour: "2-digit", minute: "2-digit" });
  const recordedDate = formatFrequencyDate(value, { dateStyle: "short" });
  const meetingDate = formatFrequencyDate(meetingAt, { dateStyle: "short" });
  return recordedDate === meetingDate
    ? `${label} às ${time}`
    : `${label} em ${formatFrequencyDate(value, { dateStyle: "medium" })} às ${time}`;
}
