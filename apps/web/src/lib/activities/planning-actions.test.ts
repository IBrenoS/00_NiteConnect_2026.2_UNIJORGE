import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedNiteSession: vi.fn(), getActivity: vi.fn(), getActivityCapabilities: vi.fn(),
  getActivityPlanning: vi.fn(), getActivityPlanningCapabilities: vi.fn(), getActivityCandidates: vi.fn(),
  getActivityAssignees: vi.fn(), mutateActivity: vi.fn(), revalidatePath: vi.fn(),
}));

vi.mock("../auth/server-session", () => ({ getAuthenticatedNiteSession: mocks.getAuthenticatedNiteSession }));
vi.mock("./data", () => ({
  getActivity: mocks.getActivity, getActivityCapabilities: mocks.getActivityCapabilities,
  getActivityPlanning: mocks.getActivityPlanning, getActivityPlanningCapabilities: mocks.getActivityPlanningCapabilities,
  getActivityCandidates: mocks.getActivityCandidates, getActivityAssignees: mocks.getActivityAssignees,
}));
vi.mock("./mutations", () => ({ mutateActivity: mocks.mutateActivity }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createPlanningAction, movePlanningTaskAction } from "./planning-actions";

const planningId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const activityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const activity = {
  id: activityId, title: "Task", description: "", projectId: null, planningId, status: "CONCLUIDA", startOn: null, dueOn: null,
  priority: null, primaryExecutorId: "member-1", primaryExecutorName: "Pessoa", executorAvailable: true,
  createdBy: "member-1", version: 4, createdAt: "2026-11-17T12:00:00Z", updatedAt: "2026-11-17T12:00:00Z",
  completedAt: "2026-11-17T12:00:00Z", deadlinePassed: false, overdue: false, attentionRequired: false,
};

describe("activity planning actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedNiteSession.mockResolvedValue({ bearer: "server-only", member: { id: "member-1" } });
  });

  it("persists planning creation through the V43 collection", async () => {
    const planning = { ...activity, id: planningId, title: "Plano", projectId: null, planningId: null, canEdit: true, canCreateTasks: true, canDelete: true };
    mocks.mutateActivity.mockImplementation(async (_path, _bearer, _method, _body, parse) => ({ data: parse(planning), issue: null }));
    const result = await createPlanningAction({ title: "  Plano  ", description: "  descrição  ", projectId: null });
    expect(mocks.mutateActivity).toHaveBeenCalledWith("/api/v1/activity-plannings", "server-only", "POST", { title: "Plano", description: "descrição", projectId: null }, expect.any(Function));
    expect(result).toEqual({ data: { id: planningId }, issue: null });
  });

  it("allows a confirmed reactivation from completed to in progress using the current version", async () => {
    mocks.getActivity.mockResolvedValue({ data: activity, issue: null });
    mocks.getActivityCapabilities.mockResolvedValue({ data: { edit: false, changePriority: false, canDelete: false, transitions: ["EM_EXECUCAO"], history: false, manageAssignees: false, addEvidence: false, upload: false }, issue: null });
    mocks.mutateActivity.mockImplementation(async (_path, _bearer, _method, _body, parse) => ({ data: parse({ ...activity, status: "EM_EXECUCAO", version: 5, completedAt: null }), issue: null }));
    const result = await movePlanningTaskAction(planningId, activityId, 4, "status", "EM_EXECUCAO", true);
    expect(mocks.mutateActivity).toHaveBeenCalledWith(`/api/v1/activities/${activityId}/status`, "server-only", "PATCH", { status: "EM_EXECUCAO", expectedVersion: 4, confirmed: true }, expect.any(Function));
    expect(result).toEqual({ data: { version: 5 }, issue: null });
  });

  it("returns a conflict without pretending that a stale move persisted", async () => {
    mocks.getActivity.mockResolvedValue({ data: activity, issue: null });
    mocks.getActivityCapabilities.mockResolvedValue({ data: { edit: false, changePriority: true, canDelete: false, transitions: [], history: false, manageAssignees: false, addEvidence: false, upload: false }, issue: null });
    mocks.mutateActivity.mockResolvedValue({ data: null, issue: "conflict" });
    const result = await movePlanningTaskAction(planningId, activityId, 4, "priority", "MEDIA");
    expect(result).toEqual({ data: null, issue: "conflict" });
  });
});
