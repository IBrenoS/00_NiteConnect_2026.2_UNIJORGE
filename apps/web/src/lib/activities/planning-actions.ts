"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedNiteSession } from "../auth/server-session";
import { getActivity, getActivityAssignees, getAllActivityCandidates, getActivityPlanning, getActivityPlanningCapabilities, getActivityCapabilities } from "./data";
import { parseActivity, parseActivityAssignee, parseActivityPlanning, type ActivityAssignee, type ActivityCandidate, type ActivityCapabilities, type ActivityStatus } from "./contracts";
import { mutateActivity, type ActivityMutationIssue } from "./mutations";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
type PlanningActionResult<T> = { data: T; issue: null } | { data: null; issue: ActivityMutationIssue | "forbidden" | "not-found" };

export async function createPlanningAction(input: { title: string; description: string; projectId: string | null }): Promise<PlanningActionResult<{ id: string }>> {
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "access" };
  if (!input.title.trim() || input.title.length > 200 || input.description.length > 10_000 || (input.projectId && !uuidPattern.test(input.projectId))) return { data: null, issue: "invalid" };
  const created = await mutateActivity("/api/v1/activity-plannings", session.bearer, "POST", {
    title: input.title.trim(), description: input.description.trim(), projectId: input.projectId,
  }, parseActivityPlanning);
  if (created.issue || !created.data) return { data: null, issue: created.issue ?? "unavailable" };
  revalidatePath("/atividades");
  return { data: { id: created.data.id }, issue: null };
}

export async function createPlanningTaskAction(planningId: string, input: {
  title: string; description: string; startOn: string | null; dueOn: string | null; priority: string | null;
}): Promise<PlanningActionResult<{ id: string }>> {
  if (!uuidPattern.test(planningId) || !input.title.trim() || input.title.length > 200 || input.description.length > 10_000) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "access" };
  const [planning, capabilities] = await Promise.all([
    getActivityPlanning(session.bearer, planningId),
    getActivityPlanningCapabilities(session.bearer, planningId),
  ]);
  if (planning.issue || !planning.data) return { data: null, issue: planning.issue ?? "unavailable" };
  if (capabilities.issue || !capabilities.data?.canCreateTasks) return { data: null, issue: capabilities.issue === "not-found" ? "not-found" : "forbidden" };
  const result = await mutateActivity(`/api/v1/activity-plannings/${encodeURIComponent(planningId)}/tasks`, session.bearer, "POST", {
    title: input.title.trim(), description: input.description.trim(), startOn: input.startOn, dueOn: input.dueOn,
    priority: input.priority, primaryExecutorId: session.member.id, expectedVersion: capabilities.data.version,
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
}): Promise<PlanningActionResult<{ version: number }>> {
  if (!uuidPattern.test(planningId) || !uuidPattern.test(activityId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !input.title.trim() || input.title.length > 200 || input.description.length > 10_000) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "access" };
  const [current, capabilities] = await Promise.all([
    getActivity(session.bearer, activityId),
    getActivityCapabilities(session.bearer, activityId),
  ]);
  if (current.issue || !current.data) return { data: null, issue: current.issue ?? "unavailable" };
  if (current.data.planningId !== planningId) return { data: null, issue: "not-found" };
  if (capabilities.issue || !capabilities.data?.edit) return { data: null, issue: capabilities.issue === "not-found" ? "not-found" : "forbidden" };
  if (current.data.version !== input.expectedVersion) return { data: null, issue: "conflict" };
  let expectedVersion = current.data.version;
  if (input.ownerId && input.ownerId !== current.data.primaryExecutorId) {
    if (!capabilities.data.manageAssignees) return { data: null, issue: "forbidden" };
    const candidates = await getAllActivityCandidates(session.bearer, activityId);
    if (candidates.issue || !candidates.data) return { data: null, issue: candidates.issue ?? "unavailable" };
    if (!candidates.data.some((candidate) => candidate.id === input.ownerId)) return { data: null, issue: "forbidden" };
    const assigned = await mutateActivity(`/api/v1/activities/${encodeURIComponent(activityId)}/executor`, session.bearer, "PUT", {
      memberId: input.ownerId, expectedVersion,
    }, parseActivityAssignee);
    if (assigned.issue) return { data: null, issue: assigned.issue };
    const refreshed = await getActivity(session.bearer, activityId);
    if (refreshed.issue || !refreshed.data) return { data: null, issue: refreshed.issue ?? "unavailable" };
    expectedVersion = refreshed.data.version;
  }
  const result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(activityId)}`, session.bearer, "PATCH", {
    title: input.title.trim(), description: input.description.trim(), startOn: input.startOn,
    dueOn: input.dueOn, priority: input.priority, expectedVersion,
  }, parseActivity);
  if (result.issue || !result.data) return { data: null, issue: result.issue ?? "unavailable" };
  let version = result.data.version;
  if (capabilities.data.manageAssignees) {
    const [assignees, candidates] = await Promise.all([
      getActivityAssignees(session.bearer, activityId),
      getAllActivityCandidates(session.bearer, activityId),
    ]);
    if (assignees.issue || !assignees.data || candidates.issue || !candidates.data) return { data: null, issue: "unavailable" };
    const existing = assignees.data.items.filter((assignee) => assignee.role === "COLLABORATOR").map((assignee) => assignee.memberId);
    const desired = Array.from(new Set(input.collaboratorIds.filter((memberId) => uuidPattern.test(memberId) && memberId !== input.ownerId)));
    if (desired.some((memberId) => !existing.includes(memberId) && !candidates.data.some((candidate) => candidate.id === memberId))) return { data: null, issue: "forbidden" };
    for (const memberId of desired.filter((member) => !existing.includes(member))) {
      const latest = await getActivity(session.bearer, activityId);
      if (latest.issue || !latest.data) return { data: null, issue: latest.issue ?? "unavailable" };
      const added = await mutateActivity(`/api/v1/activities/${encodeURIComponent(activityId)}/collaborators`, session.bearer, "POST", { memberId, expectedVersion: latest.data.version }, parseActivityAssignee);
      if (added.issue) return { data: null, issue: added.issue };
    }
    for (const memberId of existing.filter((member) => !desired.includes(member))) {
      const latest = await getActivity(session.bearer, activityId);
      if (latest.issue || !latest.data) return { data: null, issue: latest.issue ?? "unavailable" };
      const removed = await mutateActivity(`/api/v1/activities/${encodeURIComponent(activityId)}/collaborators/${encodeURIComponent(memberId)}`, session.bearer, "DELETE", { expectedVersion: latest.data.version });
      if (removed.issue) return { data: null, issue: removed.issue };
    }
    const latest = await getActivity(session.bearer, activityId);
    if (latest.issue || !latest.data) return { data: null, issue: latest.issue ?? "unavailable" };
    version = latest.data.version;
  }
  if (input.status !== result.data.status) {
    const moved = await movePlanningTaskAction(planningId, activityId, version, "status", input.status, input.confirmed);
    if (moved.issue || !moved.data) return { data: null, issue: moved.issue ?? "unavailable" };
    version = moved.data.version;
  }
  revalidatePath("/atividades");
  revalidatePath(`/atividades/planejamentos/${planningId}`);
  return { data: { version }, issue: null };
}

export async function movePlanningTaskAction(planningId: string, activityId: string, expectedVersion: number, field: "status" | "priority", value: string | null, confirmed = false): Promise<PlanningActionResult<{ version: number }>> {
  if (!uuidPattern.test(planningId) || !uuidPattern.test(activityId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "access" };
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
  return { data: { version: result.data.version }, issue: null };
}

export async function deletePlanningTaskAction(planningId: string, activityId: string, expectedVersion: number): Promise<PlanningActionResult<null>> {
  if (!uuidPattern.test(planningId) || !uuidPattern.test(activityId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "access" };
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
  if (!session) return { data: null, issue: "access" };
  const [activity, capabilities] = await Promise.all([
    getActivity(session.bearer, activityId),
    getActivityCapabilities(session.bearer, activityId),
  ]);
  if (activity.issue || !activity.data) return { data: null, issue: activity.issue ?? "unavailable" };
  if (activity.data.planningId !== planningId) return { data: null, issue: "not-found" };
  if (capabilities.issue || !capabilities.data) return { data: null, issue: capabilities.issue ?? "unavailable" };
  if (!capabilities.data.manageAssignees) return { data: { capabilities: capabilities.data, candidates: [], assignees: [] }, issue: null };
  const [candidates, assigneePage] = await Promise.all([
    getAllActivityCandidates(session.bearer, activityId),
    getActivityAssignees(session.bearer, activityId),
  ]);
  if (candidates.issue || !candidates.data || assigneePage.issue || !assigneePage.data) return { data: null, issue: "unavailable" };
  return { data: { capabilities: capabilities.data, candidates: [...candidates.data], assignees: assigneePage.data.items }, issue: null };
}

export async function deletePlanningAction(planningId: string, expectedVersion: number): Promise<PlanningActionResult<null>> {
  if (!uuidPattern.test(planningId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { data: null, issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { data: null, issue: "access" };
  const capabilities = await getActivityPlanningCapabilities(session.bearer, planningId);
  if (capabilities.issue || !capabilities.data?.canDelete) return { data: null, issue: capabilities.issue === "not-found" ? "not-found" : "forbidden" };
  const result = await mutateActivity(`/api/v1/activity-plannings/${encodeURIComponent(planningId)}`, session.bearer, "DELETE", { expectedVersion, confirmed: true });
  if (result.issue) return { data: null, issue: result.issue };
  revalidatePath("/atividades");
  revalidatePath(`/atividades/planejamentos/${planningId}`);
  return { data: null, issue: null };
}
