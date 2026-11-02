export const listStatuses = ["ABERTA", "CONCLUIDA", "CANCELADA"] as const;
export type ListStatus = (typeof listStatuses)[number];
export type ParticipantStatus = "AGUARDANDO" | "PRESENTE" | "JUSTIFICADO" | "AUSENTE";
export type HistoryStatus = ParticipantStatus | "FORA_DA_APURACAO";
export type Outcome = "REALIZADA_CONTABILIZAVEL" | "REALIZADA_NAO_CONTABILIZAVEL" | "NAO_REALIZADA";

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
export type HistoryEntry = {
  listId: string;
  calendarEventId: string | null;
  meetingName: string;
  occurredAt: string;
  status: HistoryStatus;
  confirmedAt: string | null;
  legacy: boolean;
  inApuration: boolean;
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
  if (!record(value) || !string(value.memberId) || !string(value.displayName) || (value.status !== "AGUARDANDO" && value.status !== "PRESENTE" && value.status !== "JUSTIFICADO" && value.status !== "AUSENTE") || !nullableInstant(value.confirmedAt) || (value.status === "PRESENTE" && !instant(value.confirmedAt)) || !nullableInstant(value.changedAt) || !nullableString(value.changedBy) || !nullableString(value.reason)) return null;
  return { memberId: value.memberId, displayName: value.displayName, status: value.status, confirmedAt: value.confirmedAt, changedAt: value.changedAt, changedBy: value.changedBy, reason: value.reason };
}

export function parseHistoryEntry(value: unknown): HistoryEntry | null {
  if (!record(value) || !string(value.listId) || !nullableString(value.calendarEventId) || !string(value.meetingName) || !instant(value.occurredAt) || !(value.status === "AGUARDANDO" || value.status === "PRESENTE" || value.status === "JUSTIFICADO" || value.status === "AUSENTE" || value.status === "FORA_DA_APURACAO") || !nullableInstant(value.confirmedAt) || typeof value.legacy !== "boolean" || typeof value.inApuration !== "boolean") return null;
  return { listId: value.listId, calendarEventId: value.calendarEventId, meetingName: value.meetingName, occurredAt: value.occurredAt, status: value.status, confirmedAt: value.confirmedAt, legacy: value.legacy, inApuration: value.inApuration };
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
