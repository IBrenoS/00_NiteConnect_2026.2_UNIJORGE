import { describe, expect, it } from "vitest";
import {
  parseCollectiveSummaryRow,
  parseFrequencySummary,
  parseHistoryEntry,
  parseListView,
  parsePageResult,
  parseParticipant,
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
      status: "PRESENTE", confirmedAt: "2026-11-05T21:02:00Z", legacy: false, inApuration: true,
    })?.confirmedAt).toBe("2026-11-05T21:02:00Z");
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
});
