import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getApiJson: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../api/server", () => ({ getApiJson: mocks.getApiJson }));
import { getManagementActivities, type ManagementActivityResult } from "./management";
const response: ManagementActivityResult = {
  items: [{ activityId:"task", title:"Atividade persistida", projectId:"project", projectTitle:"Projeto real", projectStatus:"PAUSADO", planningId:"planning",planningTitle:"Plano real", createdByName:"Ana Responsável", primaryExecutorName:"Ana Responsável", collaborators:[{id:"member",name:"Ana Responsável"}], status:"PLANEJADA", priority:"ALTA", startOn:null, dueOn:"2026-01-01", createdById:"member", primaryExecutorId:"member", collaboratorIds:["member"], linkKinds:["CREATED","EXECUTOR","COLLABORATOR"], activeEvidenceCount:1, createdAt:"2026-01-01T00:00:00Z", completedAt:null, overdue:true, attentionRequired:false }],
  page:0, size:20, total:1, asOfDate:"2026-11-21", summary:{ total:1, planned:1, inProgress:0, completed:0, cancelled:0, pending:1, overdue:1, attentionRequired:0, withEvidence:1, completionDenominator:1, completionRate:0 },
};
beforeEach(() => { vi.resetAllMocks(); mocks.getApiJson.mockImplementation(async (_path:string, _bearer:string, parse:(value:unknown)=>unknown) => ({ data:parse(response), issue:null })); });
it("normaliza rótulos ausentes e preserva busca por nome", async () => {
  mocks.getApiJson.mockImplementationOnce(async (_path:string, _bearer:string, parse:(value:unknown)=>unknown) => ({ data:parse({ ...response, items:[{ ...response.items[0], planningTitle:null, createdByName:null, primaryExecutorName:null, collaborators:undefined }] }), issue:null }));
  const result = await getManagementActivities("server-only", {});
  expect(result.data?.items[0]?.planningTitle).toBeNull();
  expect(result.data?.items[0]?.collaborators).toEqual([{ id:"member", name:null }]);
});
describe("consulta gerencial 08.5A", () => {
  it("envia paginação e filtros à rota global e valida IDs/vínculos deduplicados", async () => {
    const result = await getManagementActivities("server-only", { memberId:"member", status:"PLANEJADA", priority:"ALTA", dueFrom:"2026-01-01", overdue:"true", q:"Atividade", page:2, size:20 });
    expect(mocks.getApiJson.mock.calls[0]?.[0]).toBe("/api/v1/management/activities?memberId=member&status=PLANEJADA&priority=ALTA&dueFrom=2026-01-01&overdue=true&q=Atividade&page=2&size=20");
    expect(result.data?.items).toHaveLength(1);
    expect(result.data?.items[0]?.linkKinds).toEqual(["CREATED","EXECUTOR","COLLABORATOR"]);
    expect(result.data?.summary.attentionRequired).toBe(0);
    expect(result.data?.items[0]?.activityId).toBe("task");
    expect(result.data?.items[0]?.primaryExecutorName).toBe("Ana Responsável");
  });
  it("usa somente o endpoint contextual para líderes de projeto", async () => {
    await getManagementActivities("server-only", { page:0 }, "project");
    expect(mocks.getApiJson.mock.calls[0]?.[0]).toBe("/api/v1/projects/project/management/activities?page=0&size=20");
  });
  it("rejeita payload gerencial incompleto", async () => {
    mocks.getApiJson.mockImplementationOnce(async (_path:string, _bearer:string, parse:(value:unknown)=>unknown) => ({ data:parse({ ...response, summary:{...response.summary, attentionRequired:"0"} }), issue:null }));
    expect((await getManagementActivities("server-only", {})).data).toBeNull();
  });
});

