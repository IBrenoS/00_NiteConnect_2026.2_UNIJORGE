"use server";

import { getApiJson } from "../api/server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedNiteSession } from "../auth/server-session";
import { getActivity, getAllActivityAssignees, getAllActivityCandidates, getActivityPlanning, getActivityPlanningCapabilities, getActivityCapabilities } from "./data";
import { parseActivity, parseActivityPlanning, type ActivityAssignee, type ActivityCandidate, type ActivityCapabilities, type ActivityStatus, parseActivityCandidate, parsePage, type Activity } from "./contracts";
import { mutateActivity, type ActivityMutationIssue } from "./mutations";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
type PlanningActionResult<T> = { data: T; issue: null } | { data: null; issue: ActivityMutationIssue | "forbidden" | "not-found" };

export async function createPlanningAction(input: { title: string; description: string; projectId: string | null }): Promise<PlanningActionResult<{ id: string }>> {
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  if (!input.title.trim() || input.title.length > 200 || input.description.length > 10_000 || (input.projectId && !uuidPattern.test(input.projectId))) return { data: null, issue: "invalid" };
  const created = await mutateActivity("/api/v1/activity-plannings", session.bearer, "POST", {
    title: input.title.trim(), description: input.description.trim(), projectId: input.projectId,
  }, parseActivityPlanning);
  if (created.issue || !created.data) return { data: null, issue: created.issue ?? "unavailable" };
  revalidatePath("/atividades");
  return { data: { id: created.data.id }, issue: null };
}

export async function createPlanningTaskAction(planningId: string, input: {
  title: string; description: string; startOn: string | null; dueOn: string | null; priority: string | null; status?: ActivityStatus; primaryExecutorId?: string; collaboratorIds?: string[]; confirmed?: boolean;
}): Promise<PlanningActionResult<{ id: string }>> {
  if (!uuidPattern.test(planningId) || !input.title.trim() || input.title.length > 200 || input.description.length > 10_000) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const [planning, capabilities] = await Promise.all([
    getActivityPlanning(session.bearer, planningId),
    getActivityPlanningCapabilities(session.bearer, planningId),
  ]);
  if (planning.issue || !planning.data) return { data: null, issue: planning.issue ?? "unavailable" };
  if (capabilities.issue || !capabilities.data?.canCreateTasks) return { data: null, issue: capabilities.issue === "not-found" ? "not-found" : "forbidden" };
  const result = await mutateActivity(`/api/v1/activity-plannings/${encodeURIComponent(planningId)}/tasks`, session.bearer, "POST", {
    title: input.title.trim(), description: input.description.trim(), startOn: input.startOn, dueOn: input.dueOn,
    priority: input.priority, primaryExecutorId: input.primaryExecutorId || session.member.id, status: input.status ?? "PLANEJADA", collaboratorIds: input.collaboratorIds ?? [], confirmed: input.confirmed ?? false, expectedVersion: capabilities.data.version,
  }, (value) => {
    if (!isRecord(value)) return null;
    const activity = parseActivity(value.activity);
    return activity && typeof value.planningVersion === "number" && Number.isSafeInteger(value.planningVersion) ? activity : null;
  });
  if (result.issue || !result.data) return { data: null, issue: result.issue ?? "unavailable" };
  revalidatePath("/atividades");
  revalidatePath(`/atividades/planejamentos/${planningId}`);
  return { data: { id: result.data.id }, issue: null };
}

export async function updatePlanningTaskAction(planningId: string, activityId: string, input: {
  expectedVersion: number; title: string; description: string; startOn: string | null; dueOn: string | null; priority: string | null; ownerId: string; collaboratorIds: string[]; status: ActivityStatus; confirmed?: boolean;
}): Promise<PlanningActionResult<{ version: number; activity: Activity }>> {
  if (!uuidPattern.test(planningId) || !uuidPattern.test(activityId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !input.title.trim() || input.title.length > 200 || input.description.length > 10_000) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const [current, capabilities] = await Promise.all([
    getActivity(session.bearer, activityId),
    getActivityCapabilities(session.bearer, activityId),
  ]);
  if (current.issue || !current.data) return { data: null, issue: current.issue ?? "unavailable" };
  if (current.data.planningId !== planningId) return { data: null, issue: "not-found" };
  if (capabilities.issue || !capabilities.data?.edit) return { data: null, issue: capabilities.issue === "not-found" ? "not-found" : "forbidden" };
  if (current.data.version !== input.expectedVersion) return { data: null, issue: "conflict" };
  const result = await mutateActivity(`/api/v1/activity-plannings/${encodeURIComponent(planningId)}/tasks/${encodeURIComponent(activityId)}`, session.bearer, "PATCH", {
    expectedVersion: input.expectedVersion, title: input.title.trim(), description: input.description.trim(),
    startOn: input.startOn, dueOn: input.dueOn, priority: input.priority,
    primaryExecutorId: input.ownerId || current.data.primaryExecutorId,
    collaboratorIds: input.collaboratorIds, status: input.status, confirmed: input.confirmed ?? false,
  }, parseActivity);
  if (result.issue || !result.data) return { data: null, issue: result.issue ?? "unavailable" };
  revalidatePath("/atividades");
  revalidatePath(`/atividades/planejamentos/${planningId}`);
  return { data: { version: result.data.version, activity: result.data }, issue: null };
}

export async function movePlanningTaskAction(planningId: string, activityId: string, expectedVersion: number, field: "status" | "priority", value: string | null, confirmed = false): Promise<PlanningActionResult<{ version: number; activity: Activity }>> {
  if (!uuidPattern.test(planningId) || !uuidPattern.test(activityId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const [current, capabilities] = await Promise.all([
    getActivity(session.bearer, activityId),
    getActivityCapabilities(session.bearer, activityId),
  ]);
  if (current.issue || !current.data) return { data: null, issue: current.issue ?? "unavailable" };
  if (current.data.planningId !== planningId) return { data: null, issue: "not-found" };
  if (capabilities.issue || !capabilities.data) return { data: null, issue: capabilities.issue ?? "unavailable" };
  let result;
  if (field === "status") {
    const allowed = capabilities.data.transitions.some((status) => status === value);
    const confirmationRequired = value === "CANCELADA" || current.data.status === "CANCELADA" || current.data.status === "CONCLUIDA";
    if (!allowed || confirmationRequired && !confirmed) return { data: null, issue: "forbidden" };
    result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(activityId)}/status`, session.bearer, "PATCH", {
      status: value, expectedVersion, ...(confirmationRequired ? { confirmed: true } : {}),
    }, parseActivity);
  } else {
    const allowed = value === null || value === "ALTA" || value === "MEDIA" || value === "BAIXA";
    if (!allowed || !capabilities.data.changePriority) return { data: null, issue: "forbidden" };
    result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(activityId)}`, session.bearer, "PATCH", { priority: value, expectedVersion }, parseActivity);
  }
  if (result.issue || !result.data) return { data: null, issue: result.issue ?? "unavailable" };
  revalidatePath("/atividades");
  revalidatePath(`/atividades/planejamentos/${planningId}`);
  return { data: { version: result.data.version, activity: result.data }, issue: null };
}

export async function deletePlanningTaskAction(planningId: string, activityId: string, expectedVersion: number): Promise<PlanningActionResult<null>> {
  if (!uuidPattern.test(planningId) || !uuidPattern.test(activityId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const [current, capabilities] = await Promise.all([
    getActivity(session.bearer, activityId),
    getActivityCapabilities(session.bearer, activityId),
  ]);
  if (current.issue || !current.data) return { data: null, issue: current.issue ?? "unavailable" };
  if (current.data.planningId !== planningId) return { data: null, issue: "not-found" };
  if (capabilities.issue || !capabilities.data?.canDelete) return { data: null, issue: capabilities.issue === "not-found" ? "not-found" : "forbidden" };
  const result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(activityId)}`, session.bearer, "DELETE", { expectedVersion, confirmed: true });
  if (result.issue) return { data: null, issue: result.issue };
  revalidatePath("/atividades");
  revalidatePath(`/atividades/planejamentos/${planningId}`);
  return { data: null, issue: null };
}

export async function getPlanningTaskEditorAction(planningId: string, activityId: string): Promise<PlanningActionResult<{
  capabilities: ActivityCapabilities; candidates: ActivityCandidate[]; assignees: ActivityAssignee[];
}>> {
  if (!uuidPattern.test(planningId) || !uuidPattern.test(activityId)) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const [activity, capabilities] = await Promise.all([
    getActivity(session.bearer, activityId),
    getActivityCapabilities(session.bearer, activityId),
  ]);
  if (activity.issue || !activity.data) return { data: null, issue: activity.issue ?? "unavailable" };
  if (activity.data.planningId !== planningId) return { data: null, issue: "not-found" };
  if (capabilities.issue || !capabilities.data) return { data: null, issue: capabilities.issue ?? "unavailable" };
  if (!capabilities.data.manageAssignees) return { data: { capabilities: capabilities.data, candidates: [], assignees: [] }, issue: null };
  const assigneePage = await getAllActivityAssignees(session.bearer, activityId);
  if (assigneePage.issue) return { data: null, issue: assigneePage.issue };
  return { data: { capabilities: capabilities.data, candidates: [], assignees: [...assigneePage.data] }, issue: null };
}

export async function deletePlanningAction(planningId: string, expectedVersion: number): Promise<PlanningActionResult<null>> {
  if (!uuidPattern.test(planningId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const capabilities = await getActivityPlanningCapabilities(session.bearer, planningId);
  if (capabilities.issue || !capabilities.data?.canDelete) return { data: null, issue: capabilities.issue === "not-found" ? "not-found" : "forbidden" };
  const result = await mutateActivity(`/api/v1/activity-plannings/${encodeURIComponent(planningId)}`, session.bearer, "DELETE", { expectedVersion, confirmed: true });
  if (result.issue) return { data: null, issue: result.issue };
  revalidatePath("/atividades");
  revalidatePath(`/atividades/planejamentos/${planningId}`);
  return { data: null, issue: null };
}

export async function getPlanningCreationCandidatesAction(planningId: string, query = ""): Promise<PlanningActionResult<ActivityCandidate[]>> {
  if (!uuidPattern.test(planningId)) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const [planning, capabilities] = await Promise.all([
    getActivityPlanning(session.bearer, planningId), getActivityPlanningCapabilities(session.bearer, planningId),
  ]);
  if (planning.issue) return { data: null, issue: planning.issue };
  if (capabilities.issue || !capabilities.data.canCreateTasks) return { data: null, issue: capabilities.issue ?? "forbidden" };
  if (query.trim().length < 2) return { data: planning.data.projectId ? [] : [{ id: session.member.id, name: session.member.name }], issue: null };
  if (query.length > 160) return { data: null, issue: "invalid" };
  // The independent candidate directory is administrative; ordinary members can still create their own work.
  if (!planning.data.projectId && !session.roles.some((role) => role === "COORDENADOR" || role === "GESTOR_GERAL")) {
    return { data: [{ id: session.member.id, name: session.member.name }], issue: null };
  }
  const base = planning.data.projectId
    ? `/api/v1/projects/${encodeURIComponent(planning.data.projectId)}/activity-assignee-candidates`
    : "/api/v1/activities/independent-assignee-candidates";
  const load = (page: number) => getApiJson(`${base}?page=${page}&size=100&query=${encodeURIComponent(query.trim())}`, session.bearer, (value) => parsePage(value, parseActivityCandidate));
  const first = await load(0);
  if (first.issue) return { data: null, issue: first.issue };
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.data.total / first.data.size) - 1) }, (_, index) => load(index + 1)));
  const failed = rest.find((result) => result.issue);
  if (failed?.issue) return { data: null, issue: failed.issue };
  return { data: [...first.data.items, ...rest.flatMap((result) => result.data?.items ?? [])], issue: null };
}

export async function searchPlanningTaskCandidatesAction(planningId: string, activityId: string | null, query: string): Promise<PlanningActionResult<ActivityCandidate[]>> {
  if (query.trim().length < 2 || query.length > 160) return { data: null, issue: "invalid" };
  if (activityId === null) return getPlanningCreationCandidatesAction(planningId, query);
  if (!uuidPattern.test(planningId) || !uuidPattern.test(activityId)) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "unauthenticated" };
  const [activity, capabilities] = await Promise.all([getActivity(session.bearer, activityId), getActivityCapabilities(session.bearer, activityId)]);
  if (activity.issue) return { data: null, issue: activity.issue };
  if (activity.data.planningId !== planningId) return { data: null, issue: "not-found" };
  if (capabilities.issue || !capabilities.data.manageAssignees) return { data: null, issue: capabilities.issue ?? "forbidden" };
  const result = await getAllActivityCandidates(session.bearer, activityId, query);
  if (result.issue) return { data: null, issue: result.issue };
  return { data: [...result.data], issue: null };
}
