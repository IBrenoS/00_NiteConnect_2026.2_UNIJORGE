import type { HistoryEntry, NonApurationReason } from "./contracts";

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
  if (entry.notCountedReason) return { label: reasonLabels[entry.notCountedReason], context: null };
  if (entry.attendanceStatus === "JUSTIFICADO") return { label: "Justificado", context: null };
  if (entry.attendanceStatus === "AUSENTE") return { label: "Ausente", context: null };
  if (entry.attendanceStatus === "AGUARDANDO" || entry.accountingStatus === "AGUARDANDO_CONCLUSAO") return { label: "Aguardando conclusão", context: null };
  if (entry.attendanceStatus === "LEGADO") return { label: "Registro anterior", context: null };
  return { label: "Registro anterior", context: null };
}
