import { describe, expect, it } from "vitest";
import { parseActivityHistoryEvent, parsePage, parseActivityPage, parseActivityCapabilities, parseActivityPlanning, parseActivityPlanningCapabilities, parseActivityStatistics, parsePersonalActivityItemPage } from "./contracts";

const activity = { id: "a", title: "Atividade", description: "Descrição", projectId: null, planningId: null, status: "PLANEJADA", startOn: null, dueOn: null, priority: null, primaryExecutorId: "m", primaryExecutorName: "Pessoa", executorAvailable: true, createdBy: "m", version: 0, createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z", completedAt: null, deadlinePassed: false, overdue: false, attentionRequired: false };

describe("activity API contract", () => {
  it("validates V43 planning views, capabilities and aggregate statistics", () => {
    const planning = { id: "planning-1", title: "Plano", description: "Descrição", projectId: null, createdBy: "member-1", version: 2, createdAt: "2026-11-17T12:00:00Z", updatedAt: "2026-11-17T12:00:00Z", canEdit: true, canCreateTasks: true, canDelete: true };
    expect(parseActivityPlanning(planning)).toEqual(planning);
    expect(parseActivityPlanningCapabilities({ canRead: true, canEdit: true, canCreateTasks: true, canDelete: true, version: 2 }))
      .toEqual({ canRead: true, canEdit: true, canCreateTasks: true, canDelete: true, version: 2 });
    expect(parseActivityStatistics({ total: 3, planned: 1, inProgress: 0, completed: 1, cancelled: 1, overdue: 0, completionDenominator: 2, plannedRate: 33.3, inProgressRate: 0, completedRate: 33.3, cancelledRate: 33.3, completionRate: 50 }))
      .toMatchObject({ total: 3, completionDenominator: 2, completionRate: 50 });
  });
  it("rejects malformed V43 planning and statistics payloads", () => {
    expect(parseActivityPlanning({ id: "planning-1" })).toBeNull();
    expect(parseActivityPlanningCapabilities({ canRead: true })).toBeNull();
    expect(parseActivityStatistics({ total: -1 })).toBeNull();
  });
  it("validates activity capabilities without accepting unknown transitions", () => {
    expect(parseActivityCapabilities({ edit: true, changePriority: true, canDelete: true, transitions: ["EM_EXECUCAO"], history: true, manageAssignees: false, addEvidence: true, upload: false, executionBlockedByProjectPause: true, canResumeProject: false })).toMatchObject({ transitions: ["EM_EXECUCAO"], executionBlockedByProjectPause: true, canResumeProject: false });
    expect(parseActivityCapabilities({ edit: true, changePriority: false, canDelete: false, transitions: ["ATRASADA"], history: true, manageAssignees: false, addEvidence: true, upload: false })).toBeNull();
  });
  it("preserves independent activities and the API overdue condition", () => {
    expect(parseActivityPage({ items: [{ ...activity, overdue: true }], page: 0, size: 20, total: 1 })?.items[0]).toMatchObject({ projectId: null, status: "PLANEJADA", overdue: true });
  });
  it("validates the unified personal activity card projection", () => {
    const planning = { kind: "PLANNING", id: "planning-1", title: "Plano", description: "", projectId: null, projectTitle: null, planningId: null, createdBy: "m", version: 1, createdAt: "2026-11-17T12:00:00Z", updatedAt: "2026-11-17T12:00:00Z", status: null, startOn: null, dueOn: null, priority: null, taskCount: 2, completedCount: 1, inProgressCount: 1, completionRate: 50, canDelete: true };
    const task = { ...planning, kind: "TASK", id: "task-1", title: "Tarefa", planningId: "planning-hidden", status: "EM_EXECUCAO", taskCount: 0, completedCount: 0, inProgressCount: 0, completionRate: 0, canDelete: false };
    expect(parsePersonalActivityItemPage({ items: [planning, task], page: 0, size: 20, total: 2 })?.items).toEqual([planning, task]);
    expect(parsePersonalActivityItemPage({ items: [{ ...task, planningId: "planning-hidden", status: null }], page: 0, size: 20, total: 1 })).toBeNull();
  });
  it("rejects unknown statuses and malformed pagination", () => {
    expect(parseActivityPage({ items: [{ ...activity, status: "ATRASADA" }], page: 0, size: 20, total: 1 })).toBeNull();
    expect(parseActivityPage({ items: [], page: -1, size: 20, total: 0 })).toBeNull();
  });
});

it("accepts optional reasons in a mixed persisted history page without losing events", () => {
 const event = {id:"event",activityId:"task",actorId:"actor",action:"CREATED",reason:null,occurredAt:"2026-11-18T00:00:00Z",activityVersion:0,before:null,after:"{}"};
 const payload = {items:[event,{...event,id:"second",reason:"Registro informado",activityVersion:1}],page:0,size:20,total:2};
 expect(parsePage(payload,parseActivityHistoryEvent)).toEqual(payload);
 expect(parseActivityHistoryEvent({...event,reason:42})).toBeNull();
});
