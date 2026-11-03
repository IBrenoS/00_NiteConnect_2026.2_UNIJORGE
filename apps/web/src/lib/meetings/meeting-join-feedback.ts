export type MeetingJoinFeedback = "forbidden" | "session-required" | "not-found" | "unavailable";
export type MeetingJoinFailure = MeetingJoinFeedback | "consent-required";

export function meetingJoinFailureFeedback(status: number, code: string | null): MeetingJoinFailure {
  if (status === 403 && code === "OBO_CONSENT_REQUIRED") return "consent-required";
  if (status === 404) return "not-found";
  if (status === 401) return "session-required";
  if (status === 403) return "forbidden";
  return "unavailable";
}

export function meetingJoinErrorHref(reason: MeetingJoinFeedback, meetingId?: string): string {
  const query = new URLSearchParams({ reason });
  if (meetingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId)) {
    query.set("meetingId", meetingId);
  }
  return `/reunioes/erro?${query.toString()}`;
}

export function parseMeetingJoinErrorReason(value: string | string[] | undefined): MeetingJoinFeedback | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "forbidden" || first === "session-required" || first === "not-found" || first === "unavailable" ? first : null;
}

export function parseMeetingJoinFeedback(value: string | string[] | undefined): MeetingJoinFeedback | null {
  return parseMeetingJoinErrorReason(value);
}
