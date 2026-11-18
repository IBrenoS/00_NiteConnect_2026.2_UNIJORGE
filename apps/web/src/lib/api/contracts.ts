export type ApiIssue = "unauthenticated" | "access" | "not-found" | "unavailable" | "invalid";
export type ApiResult<T> = { data: T; issue: null } | { data: null; issue: ApiIssue };

export function apiIssueFromStatus(status: number): ApiIssue {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "access";
  if (status === 404) return "not-found";
  return "unavailable";
}
