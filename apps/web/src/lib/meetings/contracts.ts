export const meetingStatuses = ["CRIACAO_PENDENTE", "AGUARDANDO_TEAMS", "AGENDADA", "SINCRONIZACAO_PENDENTE", "CANCELADA", "FALHA_PROVEDOR"] as const;
export type MeetingStatus = typeof meetingStatuses[number];
export type MeetingMode = "IMMEDIATE" | "SCHEDULED";
export type MeetingProvider = "GRAPH" | "TEAMS_LINK";
export type MeetingProviderState = "AGUARDANDO_CRIACAO_NO_TEAMS" | "LINK_CONFIRMADO_PELO_ORGANIZADOR" | "ATUALIZACAO_PENDENTE_NO_TEAMS" | "CANCELAMENTO_NAO_SINCRONIZADO";
export type InviteStatus = "PENDENTE" | "ACEITO" | "RECUSADO" | "REVOGADO";

export type MeetingInvitee = {
  memberId: string;
  name: string;
  internalStatus: InviteStatus;
  calendarResponseStatus: string;
  respondedAt: string | null;
  version: number;
};

export type Meeting = {
  id: string;
  mode: MeetingMode;
  status: MeetingStatus;
  provider: MeetingProvider;
  providerState: MeetingProviderState | null;
  title: string;
  startsAt: string;
  plannedDurationMinutes: number;
  plannedEndsAt: string;
  actualStartsAt: string | null;
  actualEndsAt: string | null;
  actualDurationSeconds: number | null;
  organizerMemberId: string;
  organizerName: string;
  invitees: MeetingInvitee[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type MeetingCandidate = { id: string; name: string };
export type MeetingPage<T> = { items: T[]; page: number; size: number; total: number };
export type MeetingNotification = {
  id: string;
  meetingId: string;
  type: string;
  title: string;
  startsAt: string;
  createdAt: string;
  readAt: string | null;
};
export type TeamsContinuation = {
  action: string;
  actionUrl: string;
  instructions: string[];
  timeZone: string;
  startsAt: string;
  endsAt: string;
};
export type MeetingAttendance = {
  availabilityStatus: string;
  actualStartsAt: string | null;
  actualEndsAt: string | null;
  actualDurationSeconds: number | null;
  retrievedAt: string | null;
  participants: { memberId: string | null; name: string | null; attendanceSeconds: number | null }[];
};
export type MeetingInviteResponse = MeetingInvitee;
export type MeetingOperation = {
  meetingId: string;
  operationId: string;
  operationStatus: string;
  retryable: boolean;
  retryAfter: string | null;
};
export type MeetingWriteResult = { kind: "meeting"; meeting: Meeting } | { kind: "operation"; operation: MeetingOperation };
export type MeetingIssue = "access" | "not-found" | "unavailable" | "invalid" | "conflict" | "consent-required" | "admin-approval-required" | "graph-unavailable" | "configuration" | "timeout" | "connection" | `server-error-${number}` | `request-error-${number}`;
export type MeetingGraphAvailability = "checking" | "available" | "consent-required" | "admin-approval-required" | "not-configured" | "teams-unavailable" | "session-required" | "unavailable";
export type MeetingGraphAvailabilityResult = {
  state: Exclude<MeetingGraphAvailability, "checking">;
  httpStatus: number | null;
  code: string | null;
};
export type MeetingResult<T> = { data: T; issue: null } | { data: null; issue: MeetingIssue };

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const nullableCount = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
const timestamp = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const inviteStatus = (value: unknown): value is InviteStatus => value === "PENDENTE" || value === "ACEITO" || value === "RECUSADO" || value === "REVOGADO";

function safeProblemCode(payload: unknown): string | null {
  return record(payload) && typeof payload.code === "string" && /^[A-Z0-9_]{1,80}$/.test(payload.code) ? payload.code : null;
}

function validCalendarCapabilities(payload: unknown): payload is {
  allowedOnlineMeetingProviders: string[];
  defaultOnlineMeetingProvider: string;
  supportsTeamsForBusiness: boolean;
} {
  return record(payload)
    && Array.isArray(payload.allowedOnlineMeetingProviders)
    && payload.allowedOnlineMeetingProviders.every((provider) => typeof provider === "string")
    && typeof payload.defaultOnlineMeetingProvider === "string"
    && typeof payload.supportsTeamsForBusiness === "boolean";
}

export function resolveMeetingGraphAvailability(status: number, payload: unknown): MeetingGraphAvailabilityResult {
  const code = safeProblemCode(payload);
  if (status >= 200 && status < 300) {
    if (!validCalendarCapabilities(payload)) return { state: "unavailable", httpStatus: status, code: null };
    return { state: payload.supportsTeamsForBusiness ? "available" : "teams-unavailable", httpStatus: status, code: null };
  }
  if (status === 403 && code === "OBO_CONSENT_REQUIRED") return { state: "consent-required", httpStatus: status, code };
  if (status === 403 && code === "OBO_ADMIN_APPROVAL_REQUIRED") return { state: "admin-approval-required", httpStatus: status, code };
  if (["GRAPH_INTEGRATION_DISABLED", "GRAPH_OBO_NOT_CONFIGURED", "GRAPH_OBO_CONFIGURATION_INVALID", "OBO_CLIENT_AUTHENTICATION_FAILED", "OBO_CLIENT_FAILURE"].includes(code ?? "")) {
    return { state: "not-configured", httpStatus: status, code };
  }
  if (status === 401) return { state: "session-required", httpStatus: status, code };
  return { state: "unavailable", httpStatus: status, code };
}

export function isMeetingGraphConsentRequired(result: MeetingGraphAvailabilityResult): boolean {
  return result.httpStatus === 403 && result.state === "consent-required" && result.code === "OBO_CONSENT_REQUIRED";
}

export function parseMeetingInvitee(value: unknown): MeetingInvitee | null {
  if (!record(value) || typeof value.memberId !== "string" || typeof value.name !== "string" || !inviteStatus(value.internalStatus) || typeof value.calendarResponseStatus !== "string" || !nullableString(value.respondedAt) || !Number.isSafeInteger(value.version) || (value.version as number) < 0) return null;
  if (value.respondedAt !== null && !timestamp(value.respondedAt)) return null;
  return { memberId: value.memberId, name: value.name, internalStatus: value.internalStatus, calendarResponseStatus: value.calendarResponseStatus, respondedAt: value.respondedAt, version: value.version as number };
}

export function parseMeeting(value: unknown): Meeting | null {
  if (!record(value) || typeof value.id !== "string" || (value.mode !== "IMMEDIATE" && value.mode !== "SCHEDULED") || !meetingStatuses.includes(value.status as MeetingStatus) || (value.provider !== "GRAPH" && value.provider !== "TEAMS_LINK") || typeof value.title !== "string" || !timestamp(value.startsAt) || !Number.isSafeInteger(value.plannedDurationMinutes) || (value.plannedDurationMinutes as number) < 1 || !timestamp(value.plannedEndsAt) || !nullableString(value.actualStartsAt) || !nullableString(value.actualEndsAt) || !nullableCount(value.actualDurationSeconds) || typeof value.organizerMemberId !== "string" || typeof value.organizerName !== "string" || !Array.isArray(value.invitees) || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || !timestamp(value.createdAt) || !timestamp(value.updatedAt)) return null;
  const states = ["AGUARDANDO_CRIACAO_NO_TEAMS", "LINK_CONFIRMADO_PELO_ORGANIZADOR", "ATUALIZACAO_PENDENTE_NO_TEAMS", "CANCELAMENTO_NAO_SINCRONIZADO"];
  if (value.provider === "GRAPH" ? value.providerState !== null : !states.includes(String(value.providerState))) return null;
  const invitees = value.invitees.map(parseMeetingInvitee);
  if (invitees.some((invitee) => invitee === null)) return null;
  if ((value.actualStartsAt !== null && !timestamp(value.actualStartsAt)) || (value.actualEndsAt !== null && !timestamp(value.actualEndsAt))) return null;
  return { id: value.id, mode: value.mode, status: value.status as MeetingStatus, provider: value.provider, providerState: value.providerState as MeetingProviderState | null, title: value.title, startsAt: value.startsAt, plannedDurationMinutes: value.plannedDurationMinutes as number, plannedEndsAt: value.plannedEndsAt, actualStartsAt: value.actualStartsAt, actualEndsAt: value.actualEndsAt, actualDurationSeconds: value.actualDurationSeconds, organizerMemberId: value.organizerMemberId, organizerName: value.organizerName, invitees: invitees.filter((invitee): invitee is MeetingInvitee => invitee !== null), version: value.version as number, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

export function parseMeetingPage<T>(value: unknown, parseItem: (item: unknown) => T | null): MeetingPage<T> | null {
  if (!record(value) || !Array.isArray(value.items) || !Number.isSafeInteger(value.page) || (value.page as number) < 0 || !Number.isSafeInteger(value.size) || (value.size as number) < 1 || (value.size as number) > 100 || !Number.isSafeInteger(value.total) || (value.total as number) < 0) return null;
  const items = value.items.map(parseItem);
  return items.some((item) => item === null) ? null : { items: items.filter((item): item is T => item !== null), page: value.page as number, size: value.size as number, total: value.total as number };
}

export function appendMeetingPages<T extends { id: string }>(current: MeetingPage<T>, next: MeetingPage<T>): MeetingPage<T> {
  const seen = new Set(current.items.map((item) => item.id));
  const appendedItems = next.items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return { ...next, items: [...current.items, ...appendedItems] };
}

export function parseMeetingCandidate(value: unknown): MeetingCandidate | null {
  return record(value) && typeof value.id === "string" && typeof value.name === "string" ? { id: value.id, name: value.name } : null;
}

export function parseMeetingNotification(value: unknown): MeetingNotification | null {
  if (!record(value) || typeof value.id !== "string" || typeof value.meetingId !== "string" || typeof value.type !== "string" || typeof value.title !== "string" || !timestamp(value.startsAt) || !timestamp(value.createdAt) || !nullableString(value.readAt)) return null;
  if (value.readAt !== null && !timestamp(value.readAt)) return null;
  return { id: value.id, meetingId: value.meetingId, type: value.type, title: value.title, startsAt: value.startsAt, createdAt: value.createdAt, readAt: value.readAt };
}

export function parseTeamsContinuation(value: unknown): TeamsContinuation | null {
  if (!record(value) || typeof value.action !== "string" || typeof value.actionUrl !== "string" || !Array.isArray(value.instructions) || !value.instructions.every((instruction) => typeof instruction === "string") || value.timeZone !== "America/Bahia" || !timestamp(value.startsAt) || !timestamp(value.endsAt)) return null;
  try {
    const url = new URL(value.actionUrl);
    if (url.protocol !== "https:" || (url.hostname !== "teams.microsoft.com" && url.hostname !== "teams.live.com")) return null;
  } catch { return null; }
  return { action: value.action, actionUrl: value.actionUrl, instructions: value.instructions, timeZone: value.timeZone, startsAt: value.startsAt, endsAt: value.endsAt };
}

export function parseMeetingAttendance(value: unknown): MeetingAttendance | null {
  if (!record(value) || typeof value.availabilityStatus !== "string" || !nullableString(value.actualStartsAt) || !nullableString(value.actualEndsAt) || !nullableCount(value.actualDurationSeconds) || !nullableString(value.retrievedAt) || !Array.isArray(value.participants)) return null;
  if ([value.actualStartsAt, value.actualEndsAt, value.retrievedAt].some((date) => date !== null && !timestamp(date))) return null;
  const participants = value.participants.map((participant) => record(participant) && nullableString(participant.memberId) && nullableString(participant.name) && nullableCount(participant.attendanceSeconds) ? { memberId: participant.memberId, name: participant.name, attendanceSeconds: participant.attendanceSeconds } : null);
  if (participants.some((participant) => participant === null)) return null;
  return { availabilityStatus: value.availabilityStatus, actualStartsAt: value.actualStartsAt, actualEndsAt: value.actualEndsAt, actualDurationSeconds: value.actualDurationSeconds, retrievedAt: value.retrievedAt, participants: participants.filter((participant): participant is NonNullable<typeof participant> => participant !== null) };
}

export function parseMeetingOperation(value: unknown): MeetingOperation | null {
  if (!record(value) || typeof value.meetingId !== "string" || typeof value.operationId !== "string" || typeof value.operationStatus !== "string" || typeof value.retryable !== "boolean" || !nullableString(value.retryAfter)) return null;
  if (value.retryAfter !== null && !timestamp(value.retryAfter)) return null;
  return { meetingId: value.meetingId, operationId: value.operationId, operationStatus: value.operationStatus, retryable: value.retryable, retryAfter: value.retryAfter };
}

export function parseMeetingWriteResult(value: unknown): MeetingWriteResult | null {
  const meeting = parseMeeting(value);
  if (meeting) return { kind: "meeting", meeting };
  const operation = parseMeetingOperation(value);
  return operation ? { kind: "operation", operation } : null;
}
