import "server-only";

import { resolveApiUrl } from "../api/server";
import { meetingIssueFromResponse } from "./meeting-api-issues";
import type { MeetingIssue, MeetingResult } from "./contracts";

async function issueForResponse(response: Response): Promise<MeetingIssue> {
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* the response body is not needed for the generic error */ }
  const code = typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string" ? payload.code : "";
  return meetingIssueFromResponse(response.status, code || null);
}

export async function mutateMeeting<T>(
  path: string,
  bearer: string,
  method: "POST" | "PATCH" | "PUT",
  body: unknown,
  parse: (value: unknown) => T | null,
  idempotencyKey?: string,
): Promise<MeetingResult<T>> {
  const url = resolveApiUrl(path);
  if (!url) return { data: null, issue: "unavailable" };
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return { data: null, issue: await issueForResponse(response) };
    const parsed = parse(await response.json());
    return parsed ? { data: parsed, issue: null } : { data: null, issue: "invalid" };
  } catch {
    return { data: null, issue: "unavailable" };
  }
}

export async function postMeetingWithoutBody(path: string, bearer: string): Promise<MeetingResult<null>> {
  const url = resolveApiUrl(path);
  if (!url) return { data: null, issue: "unavailable" };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { data: null, issue: meetingIssueFromResponse(response.status, null) };
    return { data: null, issue: null };
  } catch {
    return { data: null, issue: "unavailable" };
  }
}
