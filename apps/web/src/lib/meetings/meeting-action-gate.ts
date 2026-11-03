import { isMeetingGraphConsentRequired, type MeetingGraphAvailabilityResult } from "./contracts";

export type CreateMeetingGate = "open" | "authorization-page" | "disabled";

export function resolveCreateMeetingGate(result: MeetingGraphAvailabilityResult | null): CreateMeetingGate {
  if (result && isMeetingGraphConsentRequired(result)) return "authorization-page";
  if (result?.state === "available") return "open";
  return "disabled";
}

export function shouldRouteMeetingLinkAction(result: MeetingGraphAvailabilityResult | null): boolean {
  return result !== null && isMeetingGraphConsentRequired(result);
}
