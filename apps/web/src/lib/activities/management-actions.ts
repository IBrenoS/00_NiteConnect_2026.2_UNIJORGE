"use server";

import { getAuthenticatedNiteSession } from "../auth/server-session";
import { activityCandidateQuery } from "./query";
import { getManagementPeople, managementIdPattern } from "./management";
import type { ApiResult } from "../api/contracts";
import type { ActivityCandidate, Page } from "./contracts";

export async function searchManagementPeople(query: string, page: number, projectId?: string): Promise<ApiResult<Page<ActivityCandidate>>> {
  const term = typeof query === "string" ? activityCandidateQuery({ q: query }).get("query") : null;
  if (!term || !Number.isSafeInteger(page) || page < 0 || page > 100_000 || (projectId !== undefined && !managementIdPattern.test(projectId))) {
    return { data: null, issue: "invalid" };
  }
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const global = session.roles.some(role => role === "COORDENADOR" || role === "GESTOR_GERAL");
  if (!global && !projectId) return { data: null, issue: "access" };
  return getManagementPeople(session.bearer, { query: term, page, projectId, contextual: !global });
}
