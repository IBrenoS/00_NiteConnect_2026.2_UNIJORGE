import { apiIssueFromStatus } from "../api/contracts";
import type { MeetingIssue } from "./contracts";

export function meetingIssueFromResponse(status: number, code: string | null): MeetingIssue {
  if (status === 403 && code === "OBO_CONSENT_REQUIRED") return "consent-required";
  if (status === 403 && code === "OBO_ADMIN_APPROVAL_REQUIRED") return "admin-approval-required";
  if (code?.startsWith("GRAPH_") || code?.startsWith("OBO_")) return "graph-unavailable";
  if (status === 400 || status === 422) return "invalid";
  if (status === 409) return "conflict";
  return apiIssueFromStatus(status);
}
