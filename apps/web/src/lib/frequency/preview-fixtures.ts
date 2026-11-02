import type { CollectiveSummaryRow, FrequencyList, FrequencyPage, FrequencySummary, HistoryEntry, ParticipantPage, PersonalOpenList } from "./contracts";
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
const now = Date.now();
const openedAt = new Date(now - 42_000).toISOString();
const confirmationDeadline = new Date(now + 258_000).toISOString();
const qrExpiry = new Date(now + 78_000).toISOString();
const past = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const previewFrequencySummary: FrequencySummary = {
  period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" },
  counts,
  buckets: [{ period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" }, counts }],
};

export const previewEmptyFrequencySummary: FrequencySummary = {
  period: { from: "2026-11-01", to: "2026-11-30", zoneId: "America/Bahia" },
  counts: { eligibleMeetings: 0, present: 0, justified: 0, unjustifiedAbsences: 0, attendancePercentage: null, noEligibleMeetings: true },
  buckets: [],
};

export const previewPersonalOpenList: PersonalOpenList = {
  listId: "93000000-0000-4000-8000-000000000001",
  calendarEventId: "93000000-0000-4000-8000-000000000201",
  meetingName: "Encontro semanal do NITE",
  classification: "REGULAR",
  scheduledAt: new Date(now - 10 * 60_000).toISOString(),
  openedAt,
  confirmationDeadline,
  qrExpiresAt: qrExpiry,
  confirmationWindowStatus: "ABERTA",
  eligible: true,
  status: "AGUARDANDO_CONFIRMACAO",
  confirmedAt: null,
  confirmationAvailable: true,
};

export const previewPersonalConfirmedOpenList: PersonalOpenList = {
  ...previewPersonalOpenList,
  status: "PRESENCA_REGISTRADA",
  confirmedAt: new Date(now - 24_000).toISOString(),
  confirmationAvailable: false,
};

export const previewFrequencyHistory: FrequencyPage<HistoryEntry> = {
  items: [
    { listId: "93000000-0000-4000-8000-000000000101", calendarEventId: "93000000-0000-4000-8000-000000000201", meetingName: "Encontro semanal do NITE", occurredAt: "2026-11-01T21:00:00Z", status: "PRESENTE", confirmedAt: "2026-11-01T21:02:18Z", legacy: false, inApuration: true, presenceRecorded: true, attendanceStatus: "PRESENTE", listStatus: "CONCLUIDA", outcome: "REALIZADA_CONTABILIZAVEL", confirmationDeadline: "2026-11-01T21:05:00Z", confirmationWindowStatus: "ENCERRADA", accountingStatus: "CONTABILIZADA", notCountedReason: null },
    { listId: "93000000-0000-4000-8000-000000000102", calendarEventId: "93000000-0000-4000-8000-000000000202", meetingName: "Planejamento de projetos", occurredAt: "2026-10-29T21:00:00Z", status: "JUSTIFICADO", confirmedAt: null, legacy: false, inApuration: true, presenceRecorded: false, attendanceStatus: "JUSTIFICADO", listStatus: "CONCLUIDA", outcome: "REALIZADA_CONTABILIZAVEL", confirmationDeadline: "2026-10-29T21:05:00Z", confirmationWindowStatus: "ENCERRADA", accountingStatus: "CONTABILIZADA", notCountedReason: null },
    { listId: "93000000-0000-4000-8000-000000000103", calendarEventId: "93000000-0000-4000-8000-000000000203", meetingName: "Encontro semanal do NITE", occurredAt: "2026-10-22T21:00:00Z", status: "AUSENTE", confirmedAt: null, legacy: false, inApuration: true, presenceRecorded: false, attendanceStatus: "AUSENTE", listStatus: "CONCLUIDA", outcome: "REALIZADA_CONTABILIZAVEL", confirmationDeadline: "2026-10-22T21:05:00Z", confirmationWindowStatus: "ENCERRADA", accountingStatus: "CONTABILIZADA", notCountedReason: null },
    { listId: "93000000-0000-4000-8000-000000000104", calendarEventId: "93000000-0000-4000-8000-000000000204", meetingName: "Lista em andamento", occurredAt: new Date(now - 3 * 60_000).toISOString(), status: "AGUARDANDO", confirmedAt: null, legacy: false, inApuration: false, presenceRecorded: false, attendanceStatus: "AGUARDANDO", listStatus: "ABERTA", outcome: null, confirmationDeadline: new Date(now + 2 * 60_000).toISOString(), confirmationWindowStatus: "ABERTA", accountingStatus: "AGUARDANDO_CONCLUSAO", notCountedReason: "LISTA_AGUARDANDO_CONCLUSAO" },
    { listId: null, calendarEventId: "93000000-0000-4000-8000-000000000205", meetingName: "Reunião anterior à apuração", occurredAt: "2026-10-15T21:00:00Z", status: "LEGADO", confirmedAt: "2026-10-15T21:02:00Z", legacy: true, inApuration: false, presenceRecorded: true, attendanceStatus: "LEGADO", listStatus: "LEGADO", outcome: null, confirmationDeadline: null, confirmationWindowStatus: "NAO_APLICAVEL", accountingStatus: "ANTERIOR_AO_CORTE", notCountedReason: "ANTERIOR_AO_CORTE_OFICIAL" },
  ], page: 0, size: 20, total: 5,
};

export const previewFrequencyList: FrequencyList = {
  listId: "93000000-0000-4000-8000-000000000001",
  calendarEventId: "93000000-0000-4000-8000-000000000201",
  meetingName: "Encontro semanal do NITE",
  classification: "REGULAR",
  countsForFrequency: true,
  status: "ABERTA",
  outcome: null,
  openedAt,
  openedBy: { memberId: memberIds[0] ?? "", displayName: "Breno Oliveira", role: "COORDENADOR" },
  confirmationWindowMinutes: 5,
  confirmationDeadline,
  closedAt: null,
  closedBy: null,
  qr: { version: 1, expiresAt: qrExpiry, windowState: "OPEN" },
  version: 1,
};

const completedList: FrequencyList = {
  ...previewFrequencyList,
  listId: "93000000-0000-4000-8000-000000000002",
  meetingName: "Planejamento de projetos",
  status: "CONCLUIDA",
  outcome: "REALIZADA_CONTABILIZAVEL",
  openedAt: past(2_880),
  confirmationDeadline: past(2_875),
  closedAt: past(2_870),
  closedBy: memberIds[0] ?? "",
  qr: null,
  version: 2,
};

const canceledList: FrequencyList = {
  ...completedList,
  listId: "93000000-0000-4000-8000-000000000003",
  meetingName: "Reunião extraordinária",
  status: "CANCELADA",
  outcome: "NAO_REALIZADA",
};

export const previewFrequencyParticipants: ParticipantPage = {
  items: previewFrequencyMembers.map((displayName, index) => ({
    memberId: memberIds[index] ?? memberIds[0] ?? "",
    displayName,
    status: index < 5 ? "PRESENTE" : index === 5 ? "JUSTIFICADO" : "AGUARDANDO",
    confirmedAt: index < 5 ? new Date(now - (30 - index) * 1_000).toISOString() : null,
    changedAt: index === 5 ? past(2) : null,
    changedBy: index === 5 ? "83000000-0000-4000-8000-000000000901" : null,
    reason: index === 5 ? "EMAIL_EXTERNO_RECEBIDO" : null,
  })), page: 0, size: 50, total: 8, pageCount: 1,
  counts: { rosterTotal: 8, present: 5, justified: 1, absent: 0, awaitingConfirmation: 2, outsideApuration: 0 },
};

export const previewFrequencyLists: FrequencyPage<FrequencyList> = { items: [previewFrequencyList, completedList, canceledList], page: 0, size: 50, total: 3 };

export const previewCollectiveSummary: FrequencyPage<CollectiveSummaryRow> = {
  items: previewFrequencyMembers.map((displayName, index) => {
    const present = index === 0 || index === 3 || index === 4 ? 3 : 4;
    const justified = index % 2 === 0 ? 1 : 0;
    const unjustifiedAbsences = 6 - present - justified;
    const signaled = index === 4;
    return {
      memberId: memberIds[index] ?? memberIds[0] ?? "",
      displayName,
      counts: { eligibleMeetings: 6, present, justified, unjustifiedAbsences, attendancePercentage: present / 6 * 100, noEligibleMeetings: false },
      absenceSignal: { hasThreeConsecutiveUnjustifiedAbsences: signaled, meetings: signaled ? [1, 2, 3].map((offset) => ({ listId: `93000000-0000-4000-8000-00000000011${offset}`, calendarEventId: null, meetingName: `Encontro semanal · ${offset}`, openedAt: `2026-10-${String(8 + offset * 7).padStart(2, "0")}T21:00:00Z` })) : [] },
    };
  }), page: 0, size: 50, total: 8,
};

export const previewAgendaEvents: AgendaEvent[] = [
  { id: "93000000-0000-4000-8000-000000000201", title: "Encontro semanal do NITE", kind: "ENCONTRO", modality: "PRESENCIAL", startsAt: "2026-11-05T21:00:00Z", endsAt: "2026-11-05T23:00:00Z", status: "AGENDADO", version: 2 },
  { id: "93000000-0000-4000-8000-000000000202", title: "Reunião de planejamento", kind: "EXTRAORDINARIO", modality: "PRESENCIAL", startsAt: "2026-11-05T21:15:00Z", endsAt: "2026-11-05T22:30:00Z", status: "AGENDADO", version: 1 },
];
