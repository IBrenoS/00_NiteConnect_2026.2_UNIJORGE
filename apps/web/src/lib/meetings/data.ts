import "server-only";

import { getApiJson, resolveApiUrl } from "../api/server";
import {
  parseMeeting,
  parseMeetingCandidate,
  parseMeetingNotification,
  parseMeetingPage,
  type Meeting,
  type MeetingIssue,
  type MeetingPage,
  type MeetingResult,
} from "./contracts";

function issueForMeetingStatus(status: number): MeetingIssue {
  if (status === 401 || status === 403) return "access";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status >= 500) return `server-error-${status}`;
  if (status >= 400) return `request-error-${status}`;
  return "unavailable";
}

export async function getMeetings(bearer: string, scope: "upcoming" | "past" | "cancelled", page = 0): Promise<MeetingResult<MeetingPage<Meeting>>> {
  const query = new URLSearchParams({ scope, page: String(page), size: "20" });
  const url = resolveApiUrl(`/api/v1/meetings?${query}`);
  if (!url) return { data: null, issue: "configuration" };

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { data: null, issue: issueForMeetingStatus(response.status) };

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { data: null, issue: "invalid" };
    }
    const data = parseMeetingPage(payload, parseMeeting);
    return data ? { data, issue: null } : { data: null, issue: "invalid" };
  } catch (error) {
    return { data: null, issue: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "connection" };
  }
}

export function getMeeting(bearer: string, meetingId: string) {
  return getApiJson(`/api/v1/meetings/${encodeURIComponent(meetingId)}`, bearer, parseMeeting);
}

export function getMeetingInvitees(bearer: string, q: string, page = 0) {
  const query = new URLSearchParams({ q, page: String(page), size: "20" });
  return getApiJson(`/api/v1/meetings/invitees?${query}`, bearer, (value) => parseMeetingPage(value, parseMeetingCandidate));
}

export function getMeetingNotifications(bearer: string) {
  const query = new URLSearchParams({ page: "0", size: "20" });
  return getApiJson(`/api/v1/me/notifications?${query}`, bearer, (value) => parseMeetingPage(value, parseMeetingNotification));
}
