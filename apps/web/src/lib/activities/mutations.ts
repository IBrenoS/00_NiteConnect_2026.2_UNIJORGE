import "server-only";

import { resolveApiUrl } from "../api/server";
import { apiIssueFromStatus, type ApiIssue } from "../api/contracts";

export type ActivityMutationIssue = ApiIssue | "conflict" | "project-paused" | "too-large" | "unsupported";
export type ActivityMutationResult<T> = { data: T | null; issue: null } | { data: null; issue: ActivityMutationIssue };

export function activityMutationIssueFromStatus(status: number): ActivityMutationIssue {
  if (status === 409) return "conflict";
  if (status === 413) return "too-large";
  if (status === 415) return "unsupported";
  if (status === 400) return "invalid";
  return apiIssueFromStatus(status);
}

export async function mutateActivity<T>(
  path: string,
  bearer: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body: unknown,
  parse?: (value: unknown) => T | null,
): Promise<ActivityMutationResult<T>> {
  const url = resolveApiUrl(path);
  if (!url) return { data: null, issue: "unavailable" };
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.warn("NITE API request failed", { path: url.pathname, status: response.status });
      if (response.status === 409) {
        try {
          const problem: unknown = await response.json();
          if (typeof problem === "object" && problem !== null && "code" in problem && problem.code === "PROJECT_PAUSED") {
            return { data: null, issue: "project-paused" };
          }
        } catch { /* Non-ProblemDetail responses retain the status-based classification. */ }
      }
      return { data: null, issue: activityMutationIssueFromStatus(response.status) };
    }
    if (!parse || response.status === 204) return { data: null, issue: null };
    const data = parse(await response.json());
    return data ? { data, issue: null } : { data: null, issue: "invalid" };
  } catch (error) {
    console.warn("NITE API mutation unavailable", { path: url.pathname, errorType: error instanceof Error ? error.name : "unknown" });
    return { data: null, issue: "unavailable" };
  }
}

export async function uploadActivityEvidence(
  activityId: string,
  bearer: string,
  form: FormData,
): Promise<ActivityMutationResult<null>> {
  const url = resolveApiUrl(`/api/v1/activities/${encodeURIComponent(activityId)}/evidence/uploads`);
  if (!url) return { data: null, issue: "unavailable" };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
      body: form,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.warn("NITE API request failed", { path: url.pathname, status: response.status });
      return { data: null, issue: activityMutationIssueFromStatus(response.status) };
    }
    return { data: null, issue: null };
  } catch {
    return { data: null, issue: "unavailable" };
  }
}

export type PrivateEvidenceDownload = { bytes: Uint8Array; contentType: string };

export async function downloadActivityEvidence(
  activityId: string,
  evidenceId: string,
  bearer: string,
): Promise<ActivityMutationResult<PrivateEvidenceDownload>> {
  const url = resolveApiUrl(`/api/v1/activities/${encodeURIComponent(activityId)}/evidence/${encodeURIComponent(evidenceId)}/download`);
  if (!url) return { data: null, issue: "unavailable" };
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/octet-stream" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.warn("NITE API request failed", { path: url.pathname, status: response.status });
      return { data: null, issue: activityMutationIssueFromStatus(response.status) };
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!contentType || !["text/plain", "image/png", "image/jpeg"].includes(contentType)) return { data: null, issue: "invalid" };
    return { data: { bytes: new Uint8Array(await response.arrayBuffer()), contentType }, issue: null };
  } catch {
    return { data: null, issue: "unavailable" };
  }
}
