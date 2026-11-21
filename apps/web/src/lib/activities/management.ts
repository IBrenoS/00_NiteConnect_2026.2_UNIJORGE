import "server-only";
import { getApiJson } from "../api/server";
import type { ApiResult } from "../api/contracts";
import { activityPriorities, activityStatuses, type ActivityPriority, type ActivityStatus } from "./contracts";

export type ManagementActivity = {
  activityId: string; title: string; projectId: string | null; projectTitle: string | null;
  projectStatus: "PLANEJAMENTO" | "ATIVO" | "PAUSADO" | "CONCLUIDO" | null; planningId: string | null;
  status: ActivityStatus; priority: ActivityPriority | null; startOn: string | null; dueOn: string | null;
  createdById: string; primaryExecutorId: string; collaboratorIds: string[];
  linkKinds: ("CREATED" | "EXECUTOR" | "COLLABORATOR")[]; activeEvidenceCount: number;
  createdAt: string; completedAt: string | null; overdue: boolean; attentionRequired: boolean;
};
export type ManagementActivitySummary = {
  total: number; planned: number; inProgress: number; completed: number; cancelled: number; pending: number;
  overdue: number; attentionRequired: number; withEvidence: number; completionDenominator: number; completionRate: number;
};
export type ManagementActivityResult = {
  items: ManagementActivity[]; page: number; size: number; total: number; asOfDate: string; summary: ManagementActivitySummary;
};
export type ManagementFilters = {
  projectId?: string; memberId?: string; planningId?: string; status?: string; priority?: string; executorId?: string;
  dueFrom?: string; dueTo?: string; startFrom?: string; startTo?: string; overdue?: string; q?: string; page?: number; size?: number;
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nullableText = (value: unknown): value is string | null => value === null || typeof value === "string";
const isStatus = (value: unknown): value is ActivityStatus => activityStatuses.some(status => status === value);
const isPriority = (value: unknown): value is ActivityPriority => activityPriorities.some(priority => priority === value);
const isProjectStatus = (value: unknown): value is ManagementActivity["projectStatus"] => value === null || value === "PLANEJAMENTO" || value === "ATIVO" || value === "PAUSADO" || value === "CONCLUIDO";
const isLinkKind = (value: unknown): value is ManagementActivity["linkKinds"][number] => value === "CREATED" || value === "EXECUTOR" || value === "COLLABORATOR";

function parseResult(value: unknown): ManagementActivityResult | null {
  if (!record(value) || !Array.isArray(value.items) || !count(value.page) || !count(value.size) || value.size < 1 || value.size > 100 || !count(value.total) || typeof value.asOfDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOfDate) || !record(value.summary)) return null;
  const items: ManagementActivity[] = [];
  for (const item of value.items) {
    if (!record(item) || typeof item.activityId !== "string" || typeof item.title !== "string" || !nullableText(item.projectId) || !nullableText(item.projectTitle) || !isProjectStatus(item.projectStatus) || !nullableText(item.planningId) || !isStatus(item.status) || !(item.priority === null || isPriority(item.priority)) || !nullableText(item.startOn) || !nullableText(item.dueOn) || typeof item.createdById !== "string" || typeof item.primaryExecutorId !== "string" || !Array.isArray(item.collaboratorIds) || !item.collaboratorIds.every(id => typeof id === "string") || !Array.isArray(item.linkKinds) || !item.linkKinds.every(isLinkKind) || !count(item.activeEvidenceCount) || typeof item.createdAt !== "string" || !nullableText(item.completedAt) || typeof item.overdue !== "boolean" || typeof item.attentionRequired !== "boolean") return null;
    items.push({ activityId: item.activityId, title: item.title, projectId: item.projectId, projectTitle: item.projectTitle, projectStatus: item.projectStatus, planningId: item.planningId, status: item.status, priority: item.priority, startOn: item.startOn, dueOn: item.dueOn, createdById: item.createdById, primaryExecutorId: item.primaryExecutorId, collaboratorIds: item.collaboratorIds, linkKinds: item.linkKinds, activeEvidenceCount: item.activeEvidenceCount, createdAt: item.createdAt, completedAt: item.completedAt, overdue: item.overdue, attentionRequired: item.attentionRequired });
  }
  const raw = value.summary;
  const keys = ["total", "planned", "inProgress", "completed", "cancelled", "pending", "overdue", "attentionRequired", "withEvidence", "completionDenominator"] as const;
  if (!keys.every(key => count(raw[key])) || typeof raw.completionRate !== "number" || !Number.isFinite(raw.completionRate) || raw.completionRate < 0 || raw.completionRate > 100) return null;
  const summary: ManagementActivitySummary = {
    total: raw.total as number, planned: raw.planned as number, inProgress: raw.inProgress as number,
    completed: raw.completed as number, cancelled: raw.cancelled as number, pending: raw.pending as number,
    overdue: raw.overdue as number, attentionRequired: raw.attentionRequired as number, withEvidence: raw.withEvidence as number,
    completionDenominator: raw.completionDenominator as number, completionRate: raw.completionRate,
  };
  return { items, page: value.page, size: value.size, total: value.total, asOfDate: value.asOfDate, summary };
}

export function getManagementActivities(bearer: string, filters: ManagementFilters, projectContext?: string): Promise<ApiResult<ManagementActivityResult>> {
  const query = new URLSearchParams();
  for (const key of ["projectId", "memberId", "planningId", "status", "priority", "executorId", "dueFrom", "dueTo", "startFrom", "startTo", "overdue", "q"] as const) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  query.set("page", String(filters.page ?? 0));
  query.set("size", String(filters.size ?? 20));
  const path = projectContext ? `/api/v1/projects/${encodeURIComponent(projectContext)}/management/activities` : "/api/v1/management/activities";
  return getApiJson(`${path}?${query}`, bearer, parseResult);
}


