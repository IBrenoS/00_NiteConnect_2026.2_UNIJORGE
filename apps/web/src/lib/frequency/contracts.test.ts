import { describe, expect, it } from "vitest";
import {
  parseCollectiveSummaryRow,
  parseFrequencySummary,
  parseHistoryEntry,
  parseListView,
  parsePageResult,
  parseParticipant,
  parseParticipantPage,
  parsePersonalOpenLists,
} from "./contracts";

const counts = {
  eligibleMeetings: 4,
  present: 3,
  justified: 1,
  unjustifiedAbsences: 0,
  attendancePercentage: 75,
  noEligibleMeetings: false,
};

describe("contratos reais da Frequência", () => {
  it("lê o resumo com period, counts e buckets no formato aninhado do record Java", () => {
    expect(parseFrequencySummary({
      period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" },
      counts,
      buckets: [{ period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" }, counts }],
    })).toMatchObject({ counts, buckets: [{ counts }] });
    expect(parseFrequencySummary({
      period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" },
      ...counts,
    })).toBeNull();
  });

  it("preserva percentual nulo quando não há reunião elegível", () => {
    const summary = parseFrequencySummary({
      period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" },
      counts: { ...counts, eligibleMeetings: 0, present: 0, justified: 0, attendancePercentage: null, noEligibleMeetings: true },
      buckets: [],
    });
    expect(summary?.counts.attendancePercentage).toBeNull();
    expect(summary?.counts.noEligibleMeetings).toBe(true);
  });

  it("valida paginação e formatos da reunião, integrante e histórico", () => {
    expect(parsePageResult({ items: [], page: 0, size: 50, total: 0 }, parseParticipant)).toEqual({
      items: [], page: 0, size: 50, total: 0,
    });
    expect(parsePageResult({ items: [], page: -1, size: 50, total: 0 }, parseParticipant)).toBeNull();
    expect(parseListView({
      listId: "list-1", calendarEventId: "event-1", meetingName: "Reunião", classification: "REGULAR",
      countsForFrequency: true, status: "ABERTA", outcome: null, openedAt: "2026-11-05T21:00:00Z",
      openedBy: { memberId: "member-1", displayName: "Coordenação", role: "COORDENADOR" },
      confirmationWindowMinutes: 5, confirmationDeadline: "2026-11-05T21:05:00Z", closedAt: null,
      closedBy: null, qr: null, version: 1,
    })?.status).toBe("ABERTA");
    expect(parseHistoryEntry({
      listId: "list-1", calendarEventId: "event-1", meetingName: "Reunião", occurredAt: "2026-11-05T21:00:00Z",
      status: "PRESENTE", confirmedAt: "2026-11-05T21:02:00Z", changedAt: "2026-11-05T21:02:00Z", legacy: false, inApuration: true,
      presenceRecorded: true, attendanceStatus: "PRESENTE", listStatus: "CONCLUIDA", outcome: "REALIZADA_CONTABILIZAVEL",
      confirmationDeadline: "2026-11-05T21:05:00Z", confirmationWindowStatus: "ENCERRADA", accountingStatus: "CONTABILIZADA", notCountedReason: null,
    })?.confirmedAt).toBe("2026-11-05T21:02:00Z");
  });

  it("aceita registros legados de presença no histórico pessoal", () => {
    const entry = {
      listId: null,
      calendarEventId: "event-legacy",
      meetingName: "Reunião histórica",
      occurredAt: "2026-11-05T21:00:00Z",
      status: "LEGADO",
      confirmedAt: "2026-11-05T21:02:00Z",
      changedAt: null,
      legacy: true,
      inApuration: false,
      presenceRecorded: true,
      attendanceStatus: "LEGADO",
      listStatus: "LEGADO",
      outcome: null,
      confirmationDeadline: null,
      confirmationWindowStatus: "NAO_APLICAVEL",
      accountingStatus: "ANTERIOR_AO_CORTE",
      notCountedReason: "ANTERIOR_AO_CORTE_OFICIAL",
    };

    expect(parsePageResult({ items: [entry], page: 0, size: 20, total: 1 }, parseHistoryEntry)).toEqual({
      items: [entry],
      page: 0,
      size: 20,
      total: 1,
    });
    expect(parseHistoryEntry({ ...entry, legacy: false })).toBeNull();
    expect(parseHistoryEntry({ ...entry, inApuration: true })).toBeNull();
    expect(parseHistoryEntry({ ...entry, status: "PRESENTE" })).toBeNull();
  });

  it("lê sinal coletivo e não promove status administrativo a presença", () => {
    expect(parseCollectiveSummaryRow({
      memberId: "member-1", displayName: "Ana Costa", counts,
      absenceSignal: { hasThreeConsecutiveUnjustifiedAbsences: true, meetings: [] },
    })?.absenceSignal.hasThreeConsecutiveUnjustifiedAbsences).toBe(true);
    expect(parseParticipant({
      memberId: "member-1", displayName: "Ana Costa", status: "PRESENTE", confirmedAt: null,
      changedAt: null, changedBy: null, reason: null,
    })).toBeNull();
  });

  it("valida totais globais e paginação da lista nominal", () => {
    const page = {
      items: [], page: 0, size: 2, total: 4, pageCount: 2,
      counts: { rosterTotal: 8, present: 5, justified: 1, absent: 1, awaitingConfirmation: 1, outsideApuration: 0 },
    };
    expect(parseParticipantPage(page)).toEqual(page);
    expect(parseParticipantPage({ ...page, pageCount: 3 })).toBeNull();
    expect(parseParticipantPage({ ...page, counts: { ...page.counts, awaitingConfirmation: 0 } })).toBeNull();
  });

  it("lê reuniões pessoais abertas mesmo quando ainda não há QR disponível", () => {
    const available = {
      listId: "93000000-0000-4000-8000-000000000001", calendarEventId: "93000000-0000-4000-8000-000000000201",
      meetingName: "Encontro semanal", classification: "REGULAR", scheduledAt: "2026-11-05T21:00:00Z",
      openedAt: "2026-11-05T21:00:00Z", confirmationDeadline: "2026-11-05T21:05:00Z", qrExpiresAt: "2026-11-05T21:02:00Z",
      confirmationWindowStatus: "ABERTA", eligible: true, status: "AGUARDANDO_CONFIRMACAO", confirmedAt: null,
      changedAt: null, confirmationAvailable: true,
    };
    const waitingForQr = { ...available, qrExpiresAt: null, confirmationAvailable: false };
    expect(parsePersonalOpenLists([available, waitingForQr])).toEqual([available, waitingForQr]);
    expect(parsePersonalOpenLists([{ ...waitingForQr, confirmationAvailable: true }])).toBeNull();
  });
});
