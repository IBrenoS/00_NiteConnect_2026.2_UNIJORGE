import { describe, expect, it } from "vitest";
import { historyPresentation, historyStatusMoment } from "./presentation";
import type { HistoryEntry } from "./contracts";

const historyEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  listId: "93000000-0000-4000-8000-000000000001",
  calendarEventId: "93000000-0000-4000-8000-000000000201",
  meetingName: "Encontro semanal do NITE",
  occurredAt: "2026-11-05T21:00:00Z",
  status: "FORA_DA_APURACAO",
  confirmedAt: null,
  changedAt: null,
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

describe("instante semântico da situação", () => {
  it("usa a confirmação QR para presença e a alteração administrativa para justificativa/ausência", () => {
    expect(historyStatusMoment(historyEntry({
      attendanceStatus: "PRESENTE",
      confirmedAt: "2026-11-05T17:04:00Z",
    }))).toBe("Presença confirmada às 14:04");
    expect(historyStatusMoment(historyEntry({
      attendanceStatus: "JUSTIFICADO",
      changedAt: "2026-11-05T17:12:00Z",
    }))).toBe("Justificado às 14:12");
    expect(historyStatusMoment(historyEntry({
      attendanceStatus: "AUSENTE",
      changedAt: "2026-11-05T17:15:00Z",
      inApuration: true,
      outcome: "REALIZADA_CONTABILIZAVEL",
      accountingStatus: "CONTABILIZADA",
      notCountedReason: null,
    }))).toBe("Ausência registrada às 14:15");
  });

  it("inclui a data local quando a mudança acontece em outro dia e não inventa horário legado", () => {
    expect(historyStatusMoment(historyEntry({
      occurredAt: "2026-11-05T02:50:00Z",
      attendanceStatus: "JUSTIFICADO",
      changedAt: "2026-11-05T03:10:00Z",
    }))).toBe("Justificado em 5 de nov. de 2026 às 00:10");
    expect(historyStatusMoment(historyEntry({
      attendanceStatus: "AUSENTE",
      changedAt: null,
      inApuration: true,
      outcome: "REALIZADA_CONTABILIZAVEL",
      accountingStatus: "CONTABILIZADA",
      notCountedReason: null,
    }))).toBe("Horário da ausência indisponível");
    expect(historyStatusMoment(historyEntry({
      attendanceStatus: "LEGADO",
      confirmedAt: null,
    }))).toBe("Horário da presença indisponível");
    expect(historyStatusMoment(historyEntry({
      attendanceStatus: "AUSENTE",
      changedAt: "2026-11-05T17:15:00Z",
      listStatus: "CANCELADA",
      outcome: "NAO_REALIZADA",
      notCountedReason: "REUNIAO_CANCELADA",
      accountingStatus: "CANCELADA",
    }))).toBeNull();
  });
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
    expect(historyPresentation(historyEntry({ notCountedReason: "REUNIAO_NAO_CONTABILIZAVEL" }))).toEqual({ label: "Reunião não contabilizada", context: null });
  });
});
