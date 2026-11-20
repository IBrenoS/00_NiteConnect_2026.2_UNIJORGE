import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedNiteSession: vi.fn(), getActivity: vi.fn(), getActivityCapabilities: vi.fn(),
  getActivityPlanning: vi.fn(), getActivityPlanningCapabilities: vi.fn(), getActivityCandidates: vi.fn(),
  getActivityAssignees: vi.fn(), mutateActivity: vi.fn(), revalidatePath: vi.fn(),
}));

vi.mock("../api/server", () => ({ getApiJson: vi.fn() }));
vi.mock("../auth/server-session", () => ({ getAuthenticatedNiteSession: mocks.getAuthenticatedNiteSession }));
vi.mock("./data", () => ({
  getActivity: mocks.getActivity, getActivityCapabilities: mocks.getActivityCapabilities,
  getActivityPlanning: mocks.getActivityPlanning, getActivityPlanningCapabilities: mocks.getActivityPlanningCapabilities,
  getActivityCandidates: mocks.getActivityCandidates, getActivityAssignees: mocks.getActivityAssignees,
}));
vi.mock("./mutations", () => ({ mutateActivity: mocks.mutateActivity }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { getPlanningCreationCandidatesAction, createPlanningAction, createPlanningTaskAction, updatePlanningTaskAction, movePlanningTaskAction } from "./planning-actions";

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
    expect(result).toMatchObject({ data: { version: 5, activity: { version: 5, status: "EM_EXECUCAO" } }, issue: null });
  });

  it("returns a conflict without pretending that a stale move persisted", async () => {
    mocks.getActivity.mockResolvedValue({ data: activity, issue: null });
    mocks.getActivityCapabilities.mockResolvedValue({ data: { edit: false, changePriority: true, canDelete: false, transitions: [], history: false, manageAssignees: false, addEvidence: false, upload: false }, issue: null });
    mocks.mutateActivity.mockResolvedValue({ data: null, issue: "conflict" });
    const result = await movePlanningTaskAction(planningId, activityId, 4, "priority", "MEDIA");
    expect(result).toEqual({ data: null, issue: "conflict" });
  });

  it("identifies a pause blocked status move without changing the activity", async () => {
    mocks.getActivity.mockResolvedValue({ data: { ...activity, status: "PLANEJADA" }, issue: null });
    mocks.getActivityCapabilities.mockResolvedValue({ data: { edit: true, changePriority: true, canDelete: false, transitions: [], history: false, manageAssignees: false, addEvidence: false, upload: false, executionBlockedByProjectPause: true, canResumeProject: false }, issue: null });
    const result = await movePlanningTaskAction(planningId, activityId, 4, "status", "EM_EXECUCAO");
    expect(result).toEqual({ data: null, issue: "project-paused" });
    expect(mocks.mutateActivity).not.toHaveBeenCalled();
  });
});

it("updates all editor properties atomically", async () => {
 mocks.getActivity.mockResolvedValue({ data: activity, issue: null });
 mocks.getActivityCapabilities.mockResolvedValue({ data: { edit: true, manageAssignees: true }, issue: null });
 mocks.mutateActivity.mockImplementation(async (_p,_b,_m,_body,parse) => ({data:parse({...activity,version:8}),issue:null}));
 const result = await updatePlanningTaskAction(planningId,activityId,{expectedVersion:4,title:"Updated",description:"Details",startOn:null,dueOn:null,priority:"ALTA",ownerId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",collaboratorIds:[],status:"EM_EXECUCAO",confirmed:true});
 expect(mocks.mutateActivity).toHaveBeenCalledTimes(1);
 expect(mocks.mutateActivity).toHaveBeenCalledWith(`/api/v1/activity-plannings/${planningId}/tasks/${activityId}`,"server-only","PATCH",expect.objectContaining({expectedVersion:4,primaryExecutorId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",collaboratorIds:[],status:"EM_EXECUCAO",confirmed:true}),expect.any(Function));
 expect(result.data?.version).toBe(8);
});
it("preserves quick creation column and properties", async () => {
 mocks.getActivityPlanning.mockResolvedValue({data:{id:planningId},issue:null});
 mocks.getActivityPlanningCapabilities.mockResolvedValue({data:{canCreateTasks:true,version:2},issue:null});
 mocks.mutateActivity.mockImplementation(async (_p,_b,_m,_body,parse) => ({data:parse({activity,planningVersion:3}),issue:null}));
 await createPlanningTaskAction(planningId,{title:"Task",description:"Details",startOn:null,dueOn:null,priority:"ALTA",status:"EM_EXECUCAO",primaryExecutorId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",collaboratorIds:[]});
 expect(mocks.mutateActivity).toHaveBeenCalledWith(expect.any(String),"server-only","POST",expect.objectContaining({priority:"ALTA",status:"EM_EXECUCAO",primaryExecutorId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",collaboratorIds:[]}),expect.any(Function));
});

it("does not block independent creation by requiring the administrative member directory", async () => {
 mocks.getAuthenticatedNiteSession.mockResolvedValue({bearer:"server-only",member:{id:"member-1",name:"Pessoa"},roles:["INTEGRANTE"]});
 mocks.getActivityPlanning.mockResolvedValue({data:{id:planningId,projectId:null},issue:null});
 mocks.getActivityPlanningCapabilities.mockResolvedValue({data:{canCreateTasks:true},issue:null});
 await expect(getPlanningCreationCandidatesAction(planningId)).resolves.toEqual({data:[{id:"member-1",name:"Pessoa"}],issue:null});
});

it("defaults an empty editor owner to the authenticated member", async () => {
 vi.clearAllMocks();
 mocks.getAuthenticatedNiteSession.mockResolvedValue({bearer:"server-only",member:{id:"member-1"},roles:[]});
 mocks.getActivityPlanning.mockResolvedValue({data:{id:planningId,projectId:"project"},issue:null});
 mocks.getActivityPlanningCapabilities.mockResolvedValue({data:{canCreateTasks:true,version:0},issue:null});
 mocks.mutateActivity.mockImplementation(async (_p,_b,_m,_body,parse) => ({data:parse({activity,planningVersion:1}),issue:null}));
 await createPlanningTaskAction(planningId,{title:"Task",description:"",startOn:null,dueOn:null,priority:null,primaryExecutorId:""});
 expect(mocks.mutateActivity).toHaveBeenCalledWith(expect.any(String),expect.any(String),"POST",expect.objectContaining({primaryExecutorId:"member-1"}),expect.any(Function));
});
