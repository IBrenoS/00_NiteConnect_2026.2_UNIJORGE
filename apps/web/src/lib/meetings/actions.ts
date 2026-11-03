"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedNiteSession } from "../auth/server-session";
import { resolveApiUrl } from "../api/server";
import {
  parseMeetingInvitee,
  parseMeetingWriteResult,
  resolveMeetingGraphAvailability,
  type MeetingCandidate,
  type MeetingGraphAvailabilityResult,
  type MeetingMode,
  type MeetingResult,
  type Meeting,
  type MeetingInvitee,
  type MeetingPage,
  type MeetingWriteResult,
} from "./contracts";
import { getMeetingInvitees, getMeetings } from "./data";
import { mutateMeeting, postMeetingWithoutBody } from "./mutations";
import { meetingIssueFromResponse } from "./meeting-api-issues";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CreateInput = { mode: MeetingMode; title: string; startsAt: string | null; plannedDurationMinutes: number; inviteeIds: string[] };
type UpdateInput = { expectedVersion: number; title: string; startsAt: string; plannedDurationMinutes: number; inviteeIds: string[] };
type ShareLink = { path: string; text: string };

async function sessionOrRedirect() {
  const session = await getAuthenticatedNiteSession();
  if (!session) redirect("/login");
  return session;
}

function validInvitees(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length <= 100 && ids.every((id) => typeof id === "string" && uuidPattern.test(id)) && new Set(ids).size === ids.length;
}

function validIdempotencyKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= 128 && !/[\u0000-\u001f\u007f]/.test(key);
}

function validTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
}

function validStart(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value)) && /[+-]\d{2}:\d{2}$/.test(value);
}

function validDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_440;
}

function invalid<T>(): MeetingResult<T> {
  return { data: null, issue: "invalid" };
}

export async function searchMeetingInviteesAction(q: string, page: number): Promise<MeetingResult<MeetingPage<MeetingCandidate>>> {
  const session = await sessionOrRedirect();
  if (typeof q !== "string" || q.trim().length < 2 || q.trim().length > 160 || !Number.isSafeInteger(page) || page < 0 || page > 10_000) return invalid();
  const result = await getMeetingInvitees(session.bearer, q.trim(), page);
  if (result.issue || !result.data) return { data: null, issue: result.issue ?? "unavailable" };
  return { data: result.data, issue: null };
}

export async function loadMeetingPageAction(scope: "upcoming" | "past" | "cancelled", page: number): Promise<MeetingResult<MeetingPage<Meeting>>> {
  const session = await sessionOrRedirect();
  if ((scope !== "upcoming" && scope !== "past" && scope !== "cancelled") || !Number.isSafeInteger(page) || page < 0 || page > 10_000) return invalid();
  const result = await getMeetings(session.bearer, scope, page);
  if (result.issue || !result.data) return { data: null, issue: result.issue ?? "unavailable" };
  return { data: result.data, issue: null };
}

export async function getMeetingGraphAvailabilityAction(): Promise<MeetingGraphAvailabilityResult> {
  const session = await sessionOrRedirect();
  const url = resolveApiUrl("/api/v1/meetings/calendar/capabilities");
  if (!url) return { state: "unavailable", httpStatus: null, code: null };
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.bearer}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    return resolveMeetingGraphAvailability(response.status, payload);
  } catch {
    return { state: "unavailable", httpStatus: null, code: null };
  }
}

export async function createMeetingAction(input: CreateInput, idempotencyKey: string): Promise<MeetingResult<MeetingWriteResult>> {
  const session = await sessionOrRedirect();
  if (!input || (input.mode !== "IMMEDIATE" && input.mode !== "SCHEDULED") || !validTitle(input.title) || !validDuration(input.plannedDurationMinutes) || !validInvitees(input.inviteeIds) || !validIdempotencyKey(idempotencyKey)) return invalid();
  if (input.mode === "IMMEDIATE" ? input.startsAt !== null : !validStart(input.startsAt)) return invalid();
  const result = await mutateMeeting("/api/v1/meetings", session.bearer, "POST", {
    mode: input.mode,
    title: input.title.trim(),
    startsAt: input.mode === "IMMEDIATE" ? null : input.startsAt,
    plannedDurationMinutes: input.plannedDurationMinutes,
    inviteeIds: input.inviteeIds,
    provider: "GRAPH",
  }, parseMeetingWriteResult, idempotencyKey);
  if (!result.issue) revalidatePath("/reunioes");
  return result;
}

export async function updateMeetingAction(meetingId: string, input: UpdateInput, idempotencyKey: string): Promise<MeetingResult<MeetingWriteResult>> {
  const session = await sessionOrRedirect();
  if (!uuidPattern.test(meetingId) || !input || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !validTitle(input.title) || !validStart(input.startsAt) || !validDuration(input.plannedDurationMinutes) || !validInvitees(input.inviteeIds) || !validIdempotencyKey(idempotencyKey)) return invalid();
  const result = await mutateMeeting(`/api/v1/meetings/${encodeURIComponent(meetingId)}`, session.bearer, "PATCH", { ...input, title: input.title.trim() }, parseMeetingWriteResult, idempotencyKey);
  if (!result.issue) revalidatePath("/reunioes");
  return result;
}

export async function cancelMeetingAction(meetingId: string, expectedVersion: number, idempotencyKey: string): Promise<MeetingResult<MeetingWriteResult>> {
  const session = await sessionOrRedirect();
  if (!uuidPattern.test(meetingId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !validIdempotencyKey(idempotencyKey)) return invalid();
  const result = await mutateMeeting(`/api/v1/meetings/${encodeURIComponent(meetingId)}/cancel`, session.bearer, "POST", { expectedVersion, comment: null }, parseMeetingWriteResult, idempotencyKey);
  if (!result.issue) revalidatePath("/reunioes");
  return result;
}

export async function respondToMeetingInviteAction(meetingId: string, expectedVersion: number, response: "ACEITO" | "RECUSADO"): Promise<MeetingResult<MeetingInvitee>> {
  const session = await sessionOrRedirect();
  if (!uuidPattern.test(meetingId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || (response !== "ACEITO" && response !== "RECUSADO")) return invalid();
  const result = await mutateMeeting(`/api/v1/meetings/${encodeURIComponent(meetingId)}/my-response`, session.bearer, "PUT", { expectedVersion, response }, parseMeetingInvitee);
  if (!result.issue) revalidatePath("/reunioes");
  return result;
}

export async function getMeetingShareAction(meetingId: string): Promise<MeetingResult<ShareLink>> {
  const session = await sessionOrRedirect();
  if (!uuidPattern.test(meetingId)) return invalid();
  const url = resolveApiUrl(`/api/v1/meetings/${encodeURIComponent(meetingId)}/share`);
  if (!url) return { data: null, issue: "unavailable" };
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.bearer}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const code = typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string" ? payload.code : null;
      return { data: null, issue: meetingIssueFromResponse(response.status, code) };
    }
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || !("path" in value) || typeof value.path !== "string" || value.path !== `/reunioes/${meetingId}/entrar` || !("text" in value) || typeof value.text !== "string") return { data: null, issue: "invalid" };
    return { data: { path: value.path, text: value.text }, issue: null };
  } catch { return { data: null, issue: "unavailable" }; }
}

export async function markMeetingNotificationReadAction(notificationId: string): Promise<MeetingResult<null>> {
  const session = await sessionOrRedirect();
  if (!uuidPattern.test(notificationId)) return invalid();
  const result = await postMeetingWithoutBody(`/api/v1/me/notifications/${encodeURIComponent(notificationId)}/read`, session.bearer);
  if (!result.issue) revalidatePath("/reunioes");
  return result;
}

