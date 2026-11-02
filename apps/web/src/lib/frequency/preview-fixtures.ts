import type { CollectiveSummaryRow, FrequencyList, FrequencyPage, FrequencySummary, HistoryEntry, Participant } from "./contracts";
import type { AgendaEvent } from "./data";

const memberIds = [
  "83000000-0000-4000-8000-000000000101",
  "83000000-0000-4000-8000-000000000102",
  "83000000-0000-4000-8000-000000000103",
  "83000000-0000-4000-8000-000000000104",
  "83000000-0000-4000-8000-000000000105",
  "83000000-0000-4000-8000-000000000106",
  "83000000-0000-4000-8000-000000000107",
  "83000000-0000-4000-8000-000000000108",
];

export const previewFrequencyMembers = ["Alice Almeida", "Caio Barros", "Daniela Costa", "Eduardo Freitas", "Helena Nascimento", "João Pedro Santos", "Marina Souza", "Rafael Teixeira"];
const counts = { eligibleMeetings: 6, present: 4, justified: 1, unjustifiedAbsences: 1, attendancePercentage: 66.67, noEligibleMeetings: false };

export const previewFrequencySummary: FrequencySummary = {
  period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" },
  counts,
  buckets: [{ period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" }, counts }],
};

export const previewFrequencyHistory: FrequencyPage<HistoryEntry> = {
  items: [
    { listId: "93000000-0000-4000-8000-000000000101", calendarEventId: "93000000-0000-4000-8000-000000000201", meetingName: "Encontro semanal do NITE", occurredAt: "2026-11-05T21:00:00Z", status: "PRESENTE", confirmedAt: "2026-11-05T21:02:18Z", legacy: false, inApuration: true },
    { listId: "93000000-0000-4000-8000-000000000102", calendarEventId: "93000000-0000-4000-8000-000000000202", meetingName: "Planejamento de projetos", occurredAt: "2026-11-12T21:00:00Z", status: "JUSTIFICADO", confirmedAt: null, legacy: false, inApuration: true },
    { listId: "93000000-0000-4000-8000-000000000103", calendarEventId: "93000000-0000-4000-8000-000000000203", meetingName: "Encontro semanal do NITE", occurredAt: "2026-11-19T21:00:00Z", status: "AUSENTE", confirmedAt: null, legacy: false, inApuration: true },
    { listId: "93000000-0000-4000-8000-000000000104", calendarEventId: "93000000-0000-4000-8000-000000000204", meetingName: "Reunião de acompanhamento", occurredAt: "2026-11-26T21:00:00Z", status: "FORA_DA_APURACAO", confirmedAt: null, legacy: false, inApuration: false },
  ], page: 0, size: 20, total: 4,
};

export const previewFrequencyList: FrequencyList = {
  listId: "93000000-0000-4000-8000-000000000001",
  calendarEventId: "93000000-0000-4000-8000-000000000201",
  meetingName: "Encontro semanal do NITE",
  classification: "REGULAR",
  countsForFrequency: true,
  status: "ABERTA",
  outcome: null,
  openedAt: "2026-11-05T21:00:00Z",
  openedBy: { memberId: memberIds[0] ?? "", displayName: "Breno Oliveira", role: "COORDENADOR" },
  confirmationWindowMinutes: 5,
  confirmationDeadline: "2026-11-05T21:05:00Z",
  closedAt: null,
  closedBy: null,
  qr: { version: 1, expiresAt: "2026-11-05T21:02:00Z", windowState: "OPEN" },
  version: 1,
};

export const previewFrequencyParticipants: FrequencyPage<Participant> = {
  items: previewFrequencyMembers.map((displayName, index) => ({
    memberId: memberIds[index] ?? memberIds[0] ?? "",
    displayName,
    status: index < 5 ? "PRESENTE" : index === 5 ? "JUSTIFICADO" : index === 6 ? "AUSENTE" : "AGUARDANDO",
    confirmedAt: index < 5 ? `2026-11-05T21:0${index + 1}:18Z` : null,
    changedAt: index === 5 ? "2026-11-05T21:04:00Z" : null,
    changedBy: index === 5 ? "83000000-0000-4000-8000-000000000901" : null,
    reason: index === 5 ? "Comunicação externa recebida por e-mail" : null,
  })), page: 0, size: 50, total: 8,
};

export const previewFrequencyLists: FrequencyPage<FrequencyList> = { items: [previewFrequencyList], page: 0, size: 50, total: 1 };

export const previewCollectiveSummary: FrequencyPage<CollectiveSummaryRow> = {
  items: previewFrequencyMembers.map((displayName, index) => ({
    memberId: memberIds[index] ?? memberIds[0] ?? "",
    displayName,
    counts: { eligibleMeetings: 6, present: 4 - Number(index % 3 === 0), justified: Number(index % 2 === 0), unjustifiedAbsences: Number(index % 4 === 0), attendancePercentage: index % 4 === 0 ? 50 : 66.67, noEligibleMeetings: false },
    absenceSignal: { hasThreeConsecutiveUnjustifiedAbsences: index === 4, meetings: index === 4 ? [1, 2, 3].map((offset) => ({ listId: `93000000-0000-4000-8000-00000000011${offset}`, calendarEventId: null, meetingName: `Encontro semanal · ${offset}`, openedAt: `2026-10-${String(8 + offset * 7).padStart(2, "0")}T21:00:00Z` })) : [] },
  })), page: 0, size: 50, total: 8,
};

export const previewAgendaEvents: AgendaEvent[] = [
  { id: "93000000-0000-4000-8000-000000000201", title: "Encontro semanal do NITE", kind: "ENCONTRO", modality: "PRESENCIAL", startsAt: "2026-11-05T21:00:00Z", endsAt: "2026-11-05T23:00:00Z", status: "AGENDADO", version: 2 },
  { id: "93000000-0000-4000-8000-000000000202", title: "Reunião de planejamento", kind: "EXTRAORDINARIO", modality: "PRESENCIAL", startsAt: "2026-11-05T21:15:00Z", endsAt: "2026-11-05T22:30:00Z", status: "AGENDADO", version: 1 },
];
