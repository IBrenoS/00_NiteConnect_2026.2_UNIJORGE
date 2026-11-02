export const listStatuses = ["ABERTA", "CONCLUIDA", "CANCELADA"] as const;
export type ListStatus = (typeof listStatuses)[number];
export type ParticipantStatus = "AGUARDANDO" | "PRESENTE" | "JUSTIFICADO" | "AUSENTE" | "FORA_DA_APURACAO";
export type HistoryStatus = ParticipantStatus | "FORA_DA_APURACAO" | "LEGADO";
export type Outcome = "REALIZADA_CONTABILIZAVEL" | "REALIZADA_NAO_CONTABILIZAVEL" | "NAO_REALIZADA";
export type HistoryListStatus = "ABERTA" | "CONCLUIDA" | "CANCELADA" | "LEGADO";
export type ConfirmationWindowStatus = "ABERTA" | "EXPIRADA" | "ENCERRADA" | "NAO_APLICAVEL";
export type AccountingStatus = "AGUARDANDO_CONCLUSAO" | "CONTABILIZADA" | "NAO_CONTABILIZAVEL" | "CANCELADA" | "ANTERIOR_AO_CORTE";
export type NonApurationReason = "LISTA_AGUARDANDO_CONCLUSAO" | "REUNIAO_CANCELADA" | "REUNIAO_NAO_REALIZADA" | "REUNIAO_NAO_CONTABILIZAVEL" | "ANTERIOR_AO_CORTE_OFICIAL";
export type PersonalConfirmationStatus = "AGUARDANDO_CONFIRMACAO" | "PRESENCA_REGISTRADA" | "JUSTIFICADO" | "NAO_ELEGIVEL";

export type Counts = {
  eligibleMeetings: number;
  present: number;
  justified: number;
  unjustifiedAbsences: number;
  attendancePercentage: number | null;
  noEligibleMeetings: boolean;
};
export type FrequencyPeriod = { from: string; to: string; zoneId: string };
export type FrequencySummary = { period: FrequencyPeriod; counts: Counts; buckets: { period: FrequencyPeriod; counts: Counts }[] };
export type FrequencyList = {
  listId: string;
  calendarEventId: string | null;
  meetingName: string;
  classification: "REGULAR" | "EXCEPTIONAL";
  countsForFrequency: boolean;
  status: ListStatus;
  outcome: Outcome | null;
  openedAt: string;
  openedBy: { memberId: string; displayName: string; role: string };
  confirmationWindowMinutes: number;
  confirmationDeadline: string;
  closedAt: string | null;
  closedBy: string | null;
  qr: { version: number; expiresAt: string; windowState: string } | null;
  version: number;
};
export type Participant = {
  memberId: string;
  displayName: string;
  status: ParticipantStatus;
  confirmedAt: string | null;
  changedAt: string | null;
  changedBy: string | null;
  reason: string | null;
};
export type ParticipantCounts = {
  rosterTotal: number;
  present: number;
  justified: number;
  absent: number;
  awaitingConfirmation: number;
  outsideApuration: number;
};
export type ParticipantPage = FrequencyPage<Participant> & { pageCount: number; counts: ParticipantCounts };
export type PersonalOpenList = {
  listId: string;
  calendarEventId: string | null;
  meetingName: string;
  classification: "REGULAR" | "EXCEPTIONAL";
  scheduledAt: string;
  openedAt: string;
  confirmationDeadline: string;
  qrExpiresAt: string | null;
  confirmationWindowStatus: ConfirmationWindowStatus;
  eligible: boolean;
  status: PersonalConfirmationStatus;
  confirmedAt: string | null;
  confirmationAvailable: boolean;
};
export type HistoryEntry = {
  listId: string | null;
  calendarEventId: string | null;
  meetingName: string;
  occurredAt: string;
  status: HistoryStatus;
  confirmedAt: string | null;
  legacy: boolean;
  inApuration: boolean;
  presenceRecorded: boolean;
  attendanceStatus: "AGUARDANDO" | "PRESENTE" | "JUSTIFICADO" | "AUSENTE" | "LEGADO";
  listStatus: HistoryListStatus;
  outcome: Outcome | null;
  confirmationDeadline: string | null;
  confirmationWindowStatus: ConfirmationWindowStatus;
  accountingStatus: AccountingStatus;
  notCountedReason: NonApurationReason | null;
};
export type CollectiveSummaryRow = {
  memberId: string;
  displayName: string;
  counts: Counts;
  absenceSignal: { hasThreeConsecutiveUnjustifiedAbsences: boolean; meetings: { listId: string; calendarEventId: string | null; meetingName: string; openedAt: string }[] };
};
export type FrequencyPage<T> = { items: T[]; page: number; size: number; total: number };
export type Confirmation = { attendanceId: string; calendarEventId: string; listId: string; status: "PRESENTE"; confirmedAt: string; alreadyRegistered: boolean };
export type QrPayload = { listId: string; qrToken: string; qrVersion: number; expiresAt: string; version: number };

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const isOneOf = <T extends readonly string[]>(value: unknown, allowed: T): value is T[number] => typeof value === "string" && allowed.includes(value);
const nullableString = (value: unknown): value is string | null => value === null || string(value);
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const instant = (value: unknown): value is string => string(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
const nullableInstant = (value: unknown): value is string | null => value === null || instant(value);
const localDate = (value: unknown): value is string => {
  if (!string(value)) return false;
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value);
  if (!match) return false;
  const [, year = "", month = "", day = ""] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.toISOString().slice(0, 10) === value;
};
const isListStatus = (value: unknown): value is ListStatus => value === "ABERTA" || value === "CONCLUIDA" || value === "CANCELADA";

export function parseCounts(value: unknown): Counts | null {
  if (!record(value)) return null;
  const { eligibleMeetings, present, justified, unjustifiedAbsences, attendancePercentage, noEligibleMeetings } = value;
  if (!nonNegative(eligibleMeetings) || !nonNegative(present) || !nonNegative(justified) || !nonNegative(unjustifiedAbsences) || !(attendancePercentage === null || (typeof attendancePercentage === "number" && Number.isFinite(attendancePercentage) && attendancePercentage >= 0 && attendancePercentage <= 100)) || typeof noEligibleMeetings !== "boolean" || noEligibleMeetings !== (eligibleMeetings === 0) || (eligibleMeetings === 0 && attendancePercentage !== null) || (eligibleMeetings > 0 && attendancePercentage === null)) return null;
  return { eligibleMeetings, present, justified, unjustifiedAbsences, attendancePercentage, noEligibleMeetings };
}

function parsePeriod(value: unknown): FrequencyPeriod | null {
  if (!record(value) || !localDate(value.from) || !localDate(value.to) || value.from > value.to || value.zoneId !== "America/Bahia") return null;
  return { from: value.from, to: value.to, zoneId: value.zoneId };
}

export function parseFrequencySummary(value: unknown): FrequencySummary | null {
  if (!record(value)) return null;
  const period = parsePeriod(value.period);
  const counts = parseCounts(value.counts);
  if (!period || !counts || !Array.isArray(value.buckets)) return null;
  const buckets = value.buckets.map((bucket) => {
    if (!record(bucket)) return null;
    const bucketPeriod = parsePeriod(bucket.period);
    const bucketCounts = parseCounts(bucket.counts);
    return bucketPeriod && bucketCounts ? { period: bucketPeriod, counts: bucketCounts } : null;
  });
  if (buckets.some((bucket) => bucket === null)) return null;
  return { period, counts, buckets: buckets.filter((bucket): bucket is NonNullable<typeof bucket> => bucket !== null) };
}

export function parseFrequencyPage<T>(value: unknown, parseItem: (item: unknown) => T | null): FrequencyPage<T> | null {
  if (!record(value) || !Array.isArray(value.items) || !nonNegative(value.page) || !nonNegative(value.size) || value.size < 1 || value.size > 100 || !nonNegative(value.total)) return null;
  const items = value.items.map(parseItem);
  if (items.some((item) => item === null)) return null;
  return { items: items.filter((item): item is T => item !== null), page: value.page, size: value.size, total: value.total };
}

export const parsePageResult = parseFrequencyPage;

export function parseListView(value: unknown): FrequencyList | null {
  if (!record(value) || !string(value.listId) || !nullableString(value.calendarEventId) || !string(value.meetingName) || (value.classification !== "REGULAR" && value.classification !== "EXCEPTIONAL") || typeof value.countsForFrequency !== "boolean" || !isListStatus(value.status) || !(value.outcome === null || value.outcome === "REALIZADA_CONTABILIZAVEL" || value.outcome === "REALIZADA_NAO_CONTABILIZAVEL" || value.outcome === "NAO_REALIZADA") || !instant(value.openedAt) || !record(value.openedBy) || !string(value.openedBy.memberId) || !string(value.openedBy.displayName) || !string(value.openedBy.role) || !nonNegative(value.confirmationWindowMinutes) || !instant(value.confirmationDeadline) || !nullableString(value.closedAt) || !nullableString(value.closedBy) || !nonNegative(value.version)) return null;
  let qr: FrequencyList["qr"] = null;
  if (value.qr !== null) {
    if (!record(value.qr) || !nonNegative(value.qr.version) || !instant(value.qr.expiresAt) || !string(value.qr.windowState)) return null;
    qr = { version: value.qr.version, expiresAt: value.qr.expiresAt, windowState: value.qr.windowState };
  }
  return { listId: value.listId, calendarEventId: value.calendarEventId, meetingName: value.meetingName, classification: value.classification, countsForFrequency: value.countsForFrequency, status: value.status, outcome: value.outcome, openedAt: value.openedAt, openedBy: { memberId: value.openedBy.memberId, displayName: value.openedBy.displayName, role: value.openedBy.role }, confirmationWindowMinutes: value.confirmationWindowMinutes, confirmationDeadline: value.confirmationDeadline, closedAt: value.closedAt, closedBy: value.closedBy, qr, version: value.version };
}

export function parseParticipant(value: unknown): Participant | null {
  if (!record(value) || !string(value.memberId) || !string(value.displayName) || (value.status !== "AGUARDANDO" && value.status !== "PRESENTE" && value.status !== "JUSTIFICADO" && value.status !== "AUSENTE" && value.status !== "FORA_DA_APURACAO") || !nullableInstant(value.confirmedAt) || (value.status === "PRESENTE" && !instant(value.confirmedAt)) || !nullableInstant(value.changedAt) || !nullableString(value.changedBy) || !nullableString(value.reason)) return null;
  return { memberId: value.memberId, displayName: value.displayName, status: value.status, confirmedAt: value.confirmedAt, changedAt: value.changedAt, changedBy: value.changedBy, reason: value.reason };
}

export function parseParticipantPage(value: unknown): ParticipantPage | null {
  if (!record(value) || !Array.isArray(value.items) || !nonNegative(value.page) || !nonNegative(value.size) || value.size < 1 || value.size > 100 || !nonNegative(value.total) || !nonNegative(value.pageCount) || !record(value.counts)) return null;
  const items = value.items.map(parseParticipant);
  if (items.some((item) => item === null)) return null;
  const counts = value.counts;
  const { rosterTotal, present, justified, absent, awaitingConfirmation, outsideApuration } = counts;
  if (!nonNegative(rosterTotal) || !nonNegative(present) || !nonNegative(justified) || !nonNegative(absent) || !nonNegative(awaitingConfirmation) || !nonNegative(outsideApuration)) return null;
  const parsedCounts: ParticipantCounts = {
    rosterTotal,
    present,
    justified,
    absent,
    awaitingConfirmation,
    outsideApuration,
  };
  const classified = parsedCounts.present + parsedCounts.justified + parsedCounts.absent + parsedCounts.awaitingConfirmation + parsedCounts.outsideApuration;
  if (classified !== parsedCounts.rosterTotal || value.pageCount !== Math.ceil(value.total / value.size)) return null;
  return { items: items.filter((item): item is Participant => item !== null), page: value.page, size: value.size, total: value.total, pageCount: value.pageCount, counts: parsedCounts };
}

export function parseHistoryEntry(value: unknown): HistoryEntry | null {
  const attendanceStatuses = ["AGUARDANDO", "PRESENTE", "JUSTIFICADO", "AUSENTE", "LEGADO"] as const;
  const listStatuses = ["ABERTA", "CONCLUIDA", "CANCELADA", "LEGADO"] as const;
  const windowStatuses = ["ABERTA", "EXPIRADA", "ENCERRADA", "NAO_APLICAVEL"] as const;
  const accountingStatuses = ["AGUARDANDO_CONCLUSAO", "CONTABILIZADA", "NAO_CONTABILIZAVEL", "CANCELADA", "ANTERIOR_AO_CORTE"] as const;
  const nonApurationReasons = ["LISTA_AGUARDANDO_CONCLUSAO", "REUNIAO_CANCELADA", "REUNIAO_NAO_REALIZADA", "REUNIAO_NAO_CONTABILIZAVEL", "ANTERIOR_AO_CORTE_OFICIAL"] as const;
  if (!record(value) || !nullableString(value.listId) || !nullableString(value.calendarEventId) || !string(value.meetingName) || !instant(value.occurredAt) || !(value.status === "AGUARDANDO" || value.status === "PRESENTE" || value.status === "JUSTIFICADO" || value.status === "AUSENTE" || value.status === "FORA_DA_APURACAO" || value.status === "LEGADO") || !nullableInstant(value.confirmedAt) || typeof value.legacy !== "boolean" || typeof value.inApuration !== "boolean" || typeof value.presenceRecorded !== "boolean" || !isOneOf(value.attendanceStatus, attendanceStatuses) || !isOneOf(value.listStatus, listStatuses) || !(value.outcome === null || value.outcome === "REALIZADA_CONTABILIZAVEL" || value.outcome === "REALIZADA_NAO_CONTABILIZAVEL" || value.outcome === "NAO_REALIZADA") || !nullableInstant(value.confirmationDeadline) || !isOneOf(value.confirmationWindowStatus, windowStatuses) || !isOneOf(value.accountingStatus, accountingStatuses) || !(value.notCountedReason === null || isOneOf(value.notCountedReason, nonApurationReasons))) return null;
  if (value.legacy ? value.listId !== null || value.status !== "LEGADO" || value.inApuration : value.listId === null || value.status === "LEGADO") return null;
  if (value.legacy && (value.listStatus !== "LEGADO" || value.attendanceStatus !== "LEGADO" || value.confirmationDeadline !== null) || !value.legacy && (value.listStatus === "LEGADO" || value.confirmationDeadline === null)) return null;
  if (value.presenceRecorded !== (value.attendanceStatus === "PRESENTE" || value.attendanceStatus === "LEGADO")) return null;
  return { listId: value.listId, calendarEventId: value.calendarEventId, meetingName: value.meetingName, occurredAt: value.occurredAt, status: value.status, confirmedAt: value.confirmedAt, legacy: value.legacy, inApuration: value.inApuration, presenceRecorded: value.presenceRecorded, attendanceStatus: value.attendanceStatus, listStatus: value.listStatus, outcome: value.outcome, confirmationDeadline: value.confirmationDeadline, confirmationWindowStatus: value.confirmationWindowStatus, accountingStatus: value.accountingStatus, notCountedReason: value.notCountedReason };
}

export function parsePersonalOpenLists(value: unknown): PersonalOpenList[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map((item): PersonalOpenList | null => {
    if (!record(item) || !string(item.listId) || !nullableString(item.calendarEventId) || !string(item.meetingName) || (item.classification !== "REGULAR" && item.classification !== "EXCEPTIONAL") || !instant(item.scheduledAt) || !instant(item.openedAt) || !instant(item.confirmationDeadline) || !nullableInstant(item.qrExpiresAt) || !isOneOf(item.confirmationWindowStatus, ["ABERTA", "EXPIRADA", "ENCERRADA", "NAO_APLICAVEL"] as const) || typeof item.eligible !== "boolean" || !isOneOf(item.status, ["AGUARDANDO_CONFIRMACAO", "PRESENCA_REGISTRADA", "JUSTIFICADO", "NAO_ELEGIVEL"] as const) || !nullableInstant(item.confirmedAt) || typeof item.confirmationAvailable !== "boolean") return null;
    if ((item.status === "NAO_ELEGIVEL") !== !item.eligible || (item.status === "PRESENCA_REGISTRADA" && item.confirmedAt === null) || (item.confirmationAvailable && (!item.eligible || item.status !== "AGUARDANDO_CONFIRMACAO" || item.confirmationWindowStatus !== "ABERTA" || item.qrExpiresAt === null))) return null;
    return { listId: item.listId, calendarEventId: item.calendarEventId, meetingName: item.meetingName, classification: item.classification, scheduledAt: item.scheduledAt, openedAt: item.openedAt, confirmationDeadline: item.confirmationDeadline, qrExpiresAt: item.qrExpiresAt, confirmationWindowStatus: item.confirmationWindowStatus, eligible: item.eligible, status: item.status, confirmedAt: item.confirmedAt, confirmationAvailable: item.confirmationAvailable };
  });
  return items.some((item) => item === null) ? null : items.filter((item): item is PersonalOpenList => item !== null);
}

export function parseCollectiveSummaryRow(value: unknown): CollectiveSummaryRow | null {
  if (!record(value) || !string(value.memberId) || !string(value.displayName)) return null;
  const counts = parseCounts(value.counts);
  if (!counts || !record(value.absenceSignal) || typeof value.absenceSignal.hasThreeConsecutiveUnjustifiedAbsences !== "boolean" || !Array.isArray(value.absenceSignal.meetings)) return null;
  const meetings = value.absenceSignal.meetings.map((meeting) => {
    if (!record(meeting) || !string(meeting.listId) || !nullableString(meeting.calendarEventId) || !string(meeting.meetingName) || !instant(meeting.openedAt)) return null;
    return { listId: meeting.listId, calendarEventId: meeting.calendarEventId, meetingName: meeting.meetingName, openedAt: meeting.openedAt };
  });
  if (meetings.some((meeting) => meeting === null)) return null;
  return { memberId: value.memberId, displayName: value.displayName, counts, absenceSignal: { hasThreeConsecutiveUnjustifiedAbsences: value.absenceSignal.hasThreeConsecutiveUnjustifiedAbsences, meetings: meetings.filter((meeting): meeting is NonNullable<typeof meeting> => meeting !== null) } };
}

export function parseConfirmation(value: unknown): Confirmation | null {
  if (!record(value) || !string(value.attendanceId) || !string(value.calendarEventId) || !string(value.listId) || value.status !== "PRESENTE" || !instant(value.confirmedAt) || typeof value.alreadyRegistered !== "boolean") return null;
  return { attendanceId: value.attendanceId, calendarEventId: value.calendarEventId, listId: value.listId, status: value.status, confirmedAt: value.confirmedAt, alreadyRegistered: value.alreadyRegistered };
}

export function parseQrPayload(value: unknown): QrPayload | null {
  if (!record(value) || !string(value.listId) || !string(value.qrToken) || !/^[A-Za-z0-9_-]{43}$/.test(value.qrToken) || !nonNegative(value.qrVersion) || !instant(value.expiresAt) || !nonNegative(value.version)) return null;
  return { listId: value.listId, qrToken: value.qrToken, qrVersion: value.qrVersion, expiresAt: value.expiresAt, version: value.version };
}
