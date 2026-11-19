import "server-only";
import { getApiJson } from "../api/server";
import { activityCandidateQuery } from "./query";
import {
  parseActivity,
  parseActivityAssignee,
  parseActivityCandidate,
  parseActivityCapabilities,
  parseActivityEvidence,
  parseActivityHistoryEvent,
  parseActivityPage,
  parseActivityPlanning,
  parseActivityPlanningCapabilities,
  parseActivityPlanningPage,
  parseActivityStatistics,
  parsePage,
  parseEvidenceCapabilities,
  parsePersonalActivityCapabilities,
  parseProjectPage,
  parseProjectSummary,
} from "./contracts";
export function getMyActivities(bearer: string, query: URLSearchParams) {
  return getApiJson(`/api/v1/me/activities?${query}`, bearer, parseActivityPage);
}
export function getActivity(bearer: string, id: string) {
  return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}`, bearer, parseActivity);
}
export function getActivityCapabilities(bearer: string, id: string) {
  return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}/capabilities`, bearer, parseActivityCapabilities);
}
export function getMyActivityCapabilities(bearer: string) {
  return getApiJson("/api/v1/me/activities/capabilities", bearer, parsePersonalActivityCapabilities);
}
export function getActivityPlannings(bearer: string, query = new URLSearchParams({ page: "0", size: "20" })) {
  return getApiJson(`/api/v1/activity-plannings?${query}`, bearer, parseActivityPlanningPage);
}
export function getProjectActivityPlannings(bearer: string, projectId: string, query = new URLSearchParams({ page: "0", size: "20" })) {
  return getApiJson(`/api/v1/projects/${encodeURIComponent(projectId)}/activity-plannings?${query}`, bearer, parseActivityPlanningPage);
}
export function getActivityPlanning(bearer: string, id: string) {
  return getApiJson(`/api/v1/activity-plannings/${encodeURIComponent(id)}`, bearer, parseActivityPlanning);
}
export function getActivityPlanningCapabilities(bearer: string, id: string) {
  return getApiJson(`/api/v1/activity-plannings/${encodeURIComponent(id)}/capabilities`, bearer, parseActivityPlanningCapabilities);
}
export function getActivityPlanningTasks(bearer: string, id: string, query = new URLSearchParams({ page: "0", size: "100" })) {
  return getApiJson(`/api/v1/activity-plannings/${encodeURIComponent(id)}/tasks?${query}`, bearer, parseActivityPage);
}
export async function getAllActivityPlanningTasks(bearer: string, id: string) {
  const first = await getActivityPlanningTasks(bearer, id);
  if (first.issue) return first;
  const pageCount = Math.ceil(first.data.total / first.data.size);
  if (pageCount <= 1) return { data: first.data.items, issue: null } as const;
  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => {
    const query = new URLSearchParams({ page: String(index + 1), size: String(first.data.size) });
    return getActivityPlanningTasks(bearer, id, query);
  }));
  const failed = rest.find((result) => result.issue !== null);
  if (failed?.issue) return { data: null, issue: failed.issue } as const;
  return { data: [...first.data.items, ...rest.flatMap((result) => result.data?.items ?? [])], issue: null } as const;
}
export function getActivityPlanningStats(bearer: string, id: string) {
  return getApiJson(`/api/v1/activity-plannings/${encodeURIComponent(id)}/stats`, bearer, parseActivityStatistics);
}
export function getMyActivityStats(bearer: string) {
  return getApiJson("/api/v1/me/activities/stats", bearer, parseActivityStatistics);
}
export function getProjectSummary(bearer: string, id: string) {
  return getApiJson(`/api/v1/projects/${encodeURIComponent(id)}`, bearer, parseProjectSummary);
}
export function getMyProjects(bearer: string, page = 0) {
  const query = new URLSearchParams({ page: String(page), size: "100" });
  return getApiJson(`/api/v1/me/projects?${query}`, bearer, parseProjectPage);
}
export function getProjects(bearer: string, page = 0) {
  const query = new URLSearchParams({ page: String(page), size: "100" });
  return getApiJson(`/api/v1/projects?${query}`, bearer, parseProjectPage);
}
export async function getAllProjects(bearer: string) {
  const first = await getProjects(bearer, 0);
  if (first.issue) return first;
  const pageCount = Math.ceil(first.data.total / first.data.size);
  if (pageCount <= 1) return { data: first.data.items, issue: null } as const;
  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => getProjects(bearer, index + 1)));
  const failed = rest.find((result) => result.issue !== null);
  if (failed?.issue) return { data: null, issue: failed.issue } as const;
  return { data: [...first.data.items, ...rest.flatMap((result) => result.data?.items ?? [])], issue: null } as const;
}
export async function getAllMyProjects(bearer: string) {
  const first = await getMyProjects(bearer, 0);
  if (first.issue) return first;
  const pageCount = Math.ceil(first.data.total / first.data.size);
  if (pageCount <= 1) return { data: first.data.items, issue: null } as const;
  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => getMyProjects(bearer, index + 1)));
  const failed = rest.find((result) => result.issue !== null);
  if (failed?.issue) return { data: null, issue: failed.issue } as const;
  return { data: [...first.data.items, ...rest.flatMap((result) => result.data?.items ?? [])], issue: null } as const;
}
export function getActivityHistory(bearer: string, id: string, page = 0) {
  const query = new URLSearchParams({ page: String(page), size: "20" });
  return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}/history?${query}`, bearer, (value) => parsePage(value, parseActivityHistoryEvent));
}
export function getActivityAssignees(bearer: string, id: string) {
  const query = new URLSearchParams({ page: "0", size: "100" });
  return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}/assignees?${query}`, bearer, (value) => parsePage(value, parseActivityAssignee));
}
export function getActivityCandidates(bearer: string, id: string, params: { page?: number; q?: string; size?: number } = {}) {
  const query = activityCandidateQuery(params);
  return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}/assignee-candidates?${query}`, bearer, (value) => parsePage(value, parseActivityCandidate));
}
export async function getAllActivityCandidates(bearer: string, id: string, q: string) {
  const first = await getActivityCandidates(bearer, id, { size: 100, q });
  if (first.issue) return first;
  const pageCount = Math.ceil(first.data.total / first.data.size);
  if (pageCount <= 1) return { data: first.data.items, issue: null } as const;
  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => getActivityCandidates(bearer, id, { page: index + 1, size: first.data.size, q })));
  const failed = rest.find((result) => result.issue !== null);
  if (failed?.issue) return { data: null, issue: failed.issue } as const;
  return { data: [...first.data.items, ...rest.flatMap((result) => result.data?.items ?? [])], issue: null } as const;
}
export function getActivityEvidence(bearer: string, id: string, page = 0) {
  const query = new URLSearchParams({ page: String(page), size: "20" });
  return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}/evidence?${query}`, bearer, (value) => parsePage(value, parseActivityEvidence));
}
export function getActivityEvidenceById(bearer: string, id: string, evidenceId: string) {
  return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`, bearer, parseActivityEvidence);
}
export function getEvidenceCapabilities(bearer: string, id: string, evidenceId: string) {
  return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}/capabilities`, bearer, parseEvidenceCapabilities);
}

export async function getAllActivityAssignees(bearer: string, id: string) {
  const first = await getActivityAssignees(bearer, id);
  if (first.issue) return first;
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.data.total / first.data.size) - 1) }, (_, index) => {
    const query = new URLSearchParams({ page: String(index + 1), size: String(first.data.size) });
    return getApiJson(`/api/v1/activities/${encodeURIComponent(id)}/assignees?${query}`, bearer, (value) => parsePage(value, parseActivityAssignee));
  }));
  const failed = rest.find((result) => result.issue);
  if (failed?.issue) return { data: null, issue: failed.issue } as const;
  return { data: [...first.data.items, ...rest.flatMap((result) => result.data?.items ?? [])], issue: null } as const;
}
