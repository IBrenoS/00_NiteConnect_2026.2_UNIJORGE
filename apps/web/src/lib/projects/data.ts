import "server-only";

import { cache } from "react";
import { parseNiteIdentity } from "../auth/identity";
import { parseProjectCandidate, parseProjectStatusEvent, parseProjectPeriod } from "./administration-contracts";
import { getApiJson } from "../api/server";
import { parseLeadershipProjects, type LeadershipProject } from "./contracts";
import { parsePage, type Page } from "../activities/contracts";
import { getAllMyProjects } from "../activities/data";
import type { ApiResult } from "../api/contracts";
import { parseCatalogProject, parseInterestSignal, parseMembershipRequest, parseProjectRequestEvent, parseProjectTeamMember, parseWorkspaceOverview, projectIdPattern } from "./integration-contracts";

export const getLeadershipProjects = cache(async (bearer: string) => getApiJson(
  "/api/v1/me/projects/leadership/history?page=0&size=100",
  bearer,
  parseLeadershipProjects,
));

export type { LeadershipProject };

export function getProjectCatalog(bearer: string, query: URLSearchParams) {
  return getApiJson(`/api/v1/project-catalog?${query}`, bearer, (value) => parsePage(value, parseCatalogProject));
}
export function getAllProjectCatalog(bearer: string) {
  return allPages(bearer, "/api/v1/project-catalog", parseCatalogProject);
}

export function getCatalogProject(bearer: string, id: string) {
  if (!projectIdPattern.test(id)) return Promise.resolve({ data: null, issue: "invalid" } as const);
  return getApiJson(`/api/v1/project-catalog/${encodeURIComponent(id)}`, bearer, parseCatalogProject);
}

export const getProjectWorkspace = cache(async (bearer: string, id: string) => {
  if (!projectIdPattern.test(id)) return { data: null, issue: "invalid" } as const;
  return getApiJson(`/api/v1/projects/${encodeURIComponent(id)}/workspace`, bearer, parseWorkspaceOverview);
});

async function allPages<T>(bearer: string, path: string, parse: (value: unknown) => T | null, parameters: Record<string, string> = {}): Promise<ApiResult<T[]>> {
  const load = (page: number, size: number) => getApiJson(`${path}?${new URLSearchParams({ ...parameters, page: String(page), size: String(size) })}`, bearer, (value) => parsePage(value, parse));
  const first = await load(0, 100);
  if (first.issue) return first;
  if (first.data.page !== 0 || first.data.items.length !== Math.min(first.data.size, first.data.total)) return { data: null, issue: "invalid" };
  const items = [...first.data.items];
  const total = first.data.total;
  for (let page = 1; page < Math.ceil(total / first.data.size); page++) {
    const result: ApiResult<Page<T>> = await load(page, first.data.size);
    if (result.issue) return result;
    if (result.data.page !== page || result.data.size !== first.data.size || result.data.total !== total || result.data.items.length !== Math.min(first.data.size, total - page * first.data.size)) return { data: null, issue: "invalid" };
    items.push(...result.data.items);
  }
  return { data: items, issue: null };
}

export function getProjectTeam(bearer: string, id: string) {
  if (!projectIdPattern.test(id)) return Promise.resolve({ data: null, issue: "invalid" } as const);
  return allPages(bearer, `/api/v1/projects/${encodeURIComponent(id)}/members`, parseProjectTeamMember);
}
export function getMyProjectRequests(bearer: string) {
  return allPages(bearer, "/api/v1/me/project-membership-requests", parseMembershipRequest);
}
export function getProjectRequests(bearer: string, id: string) {
  if (!projectIdPattern.test(id)) return Promise.resolve({ data: null, issue: "invalid" } as const);
  return allPages(bearer, `/api/v1/projects/${encodeURIComponent(id)}/membership-requests`, parseMembershipRequest);
}
export function getProjectRequestHistory(bearer: string, projectId: string, requestId: string) {
  if (!projectIdPattern.test(projectId) || !projectIdPattern.test(requestId)) return Promise.resolve({ data: null, issue: "invalid" } as const);
  return allPages(bearer, `/api/v1/projects/${encodeURIComponent(projectId)}/membership-requests/${encodeURIComponent(requestId)}/history`, parseProjectRequestEvent);
}
export function getMyProjectInterests(bearer: string) {
  return allPages(bearer, "/api/v1/me/project-interest-signals", parseInterestSignal);
}
export async function getAllMyProjectIds(bearer: string): Promise<ApiResult<string[]>> {
  const result = await getAllMyProjects(bearer);
  return result.issue ? result : { data: result.data.map((project) => project.id), issue: null };
}


// Effective roles are reread from the API; cached session roles are not mutation authority.
export async function getProjectAuthority(bearer: string): Promise<ApiResult<{ canCreate: boolean }>> {
  const result = await getApiJson("/api/v1/me", bearer, parseNiteIdentity);
  return result.issue ? result : { data: { canCreate: result.data.roles.some(role => role === "COORDENADOR" || role === "GESTOR_GERAL") }, issue: null };
}
export function getProjectCandidates(bearer: string, id: string, query: string) { return allPages(bearer, `/api/v1/projects/${encodeURIComponent(id)}/member-candidates`, parseProjectCandidate, { query }); }
export function getProjectStatusHistory(bearer: string, id: string) { return allPages(bearer, `/api/v1/projects/${encodeURIComponent(id)}/history`, parseProjectStatusEvent); }
export function getProjectParticipationHistory(bearer: string, id: string) { return allPages(bearer, `/api/v1/projects/${encodeURIComponent(id)}/members/history`, parseProjectPeriod); }
export function getProjectLeadershipHistory(bearer: string, id: string) { return allPages(bearer, `/api/v1/projects/${encodeURIComponent(id)}/leadership/history`, parseProjectPeriod); }
