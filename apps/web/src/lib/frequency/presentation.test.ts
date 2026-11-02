import { describe, expect, it } from "vitest";
import { historyPresentation } from "./presentation";
import type { HistoryEntry } from "./contracts";

const historyEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  listId: "93000000-0000-4000-8000-000000000001",
  calendarEventId: "93000000-0000-4000-8000-000000000201",
  meetingName: "Encontro semanal do NITE",
  occurredAt: "2026-11-05T21:00:00Z",
  status: "FORA_DA_APURACAO",
  confirmedAt: null,
  legacy: false,
  inApuration: false,
  presenceRecorded: false,
  attendanceStatus: "AUSENTE",
  listStatus: "CONCLUIDA",
  outcome: "REALIZADA_NAO_CONTABILIZAVEL",
  confirmationDeadline: "2026-11-05T21:05:00Z",
  confirmationWindowStatus: "ENCERRADA",
  accountingStatus: "NAO_CONTABILIZAVEL",
  notCountedReason: "REUNIAO_NAO_CONTABILIZAVEL",
  ...overrides,
});

describe("apresentação semântica do histórico pessoal", () => {
  it("preserva presença confirmada mesmo quando a reunião foi cancelada", () => {
    expect(historyPresentation(historyEntry({
      status: "FORA_DA_APURACAO",
      confirmedAt: "2026-11-05T21:02:18Z",
      presenceRecorded: true,
      attendanceStatus: "PRESENTE",
      listStatus: "CANCELADA",
      outcome: "NAO_REALIZADA",
      accountingStatus: "CANCELADA",
      notCountedReason: "REUNIAO_CANCELADA",
    }))).toEqual({ label: "Presente", context: "Reunião cancelada" });
  });

  it("explica razões diferentes sem classificar todo estado como fora da apuração", () => {
    expect(historyPresentation(historyEntry({ notCountedReason: "REUNIAO_NAO_REALIZADA" }))).toEqual({ label: "Não realizada", context: null });
    expect(historyPresentation(historyEntry({ notCountedReason: "ANTERIOR_AO_CORTE_OFICIAL" }))).toEqual({ label: "Registro anterior", context: null });
    expect(historyPresentation(historyEntry({
      attendanceStatus: "AGUARDANDO",
      listStatus: "ABERTA",
      outcome: null,
      accountingStatus: "AGUARDANDO_CONCLUSAO",
      confirmationWindowStatus: "ABERTA",
      notCountedReason: "LISTA_AGUARDANDO_CONCLUSAO",
    }))).toEqual({ label: "Reunião em andamento", context: null });
    expect(historyPresentation(historyEntry({
      attendanceStatus: "AGUARDANDO",
      listStatus: "CONCLUIDA",
      outcome: null,
      accountingStatus: "AGUARDANDO_CONCLUSAO",
      notCountedReason: "LISTA_AGUARDANDO_CONCLUSAO",
    }))).toEqual({ label: "Aguardando conclusão", context: null });
    expect(historyPresentation(historyEntry({
      attendanceStatus: "JUSTIFICADO",
      notCountedReason: null,
      accountingStatus: "CONTABILIZADA",
    }))).toEqual({ label: "Justificado", context: null });
    expect(historyPresentation(historyEntry({
      attendanceStatus: "AUSENTE",
      notCountedReason: null,
      accountingStatus: "CONTABILIZADA",
    }))).toEqual({ label: "Ausente", context: null });
    expect(historyPresentation(historyEntry({
      attendanceStatus: "AUSENTE",
      listStatus: "CANCELADA",
      notCountedReason: "REUNIAO_CANCELADA",
      accountingStatus: "CANCELADA",
    }))).toEqual({ label: "Cancelada", context: null });
    expect(historyPresentation(historyEntry({ notCountedReason: "REUNIAO_NAO_CONTABILIZAVEL" }))).toEqual({ label: "Não contabilizada", context: null });
  });
});
