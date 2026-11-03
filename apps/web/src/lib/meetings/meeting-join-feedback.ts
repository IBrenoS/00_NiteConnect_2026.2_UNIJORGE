export type MeetingJoinFeedback = "forbidden" | "not-found" | "unavailable";
export type MeetingJoinFailure = MeetingJoinFeedback | "consent-required";

export function meetingJoinFailureFeedback(status: number, code: string | null): MeetingJoinFailure {
  if (status === 403 && code === "OBO_CONSENT_REQUIRED") return "consent-required";
  if (status === 404) return "not-found";
  if (status === 401 || status === 403) return "forbidden";
  return "unavailable";
}

export function parseMeetingJoinFeedback(value: string | string[] | undefined): MeetingJoinFeedback | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "forbidden" || first === "not-found" || first === "unavailable" ? first : null;
}
