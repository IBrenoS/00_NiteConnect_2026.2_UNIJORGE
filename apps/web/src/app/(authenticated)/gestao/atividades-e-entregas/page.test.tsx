import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session:vi.fn(), leaders:vi.fn(), activities:vi.fn(), people:vi.fn(), projects:vi.fn(), plannings:vi.fn() }));
vi.mock("../../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession:mocks.session }));
vi.mock("../../../../lib/projects/data", () => ({ getLeadershipProjects:mocks.leaders }));
vi.mock("../../../../lib/activities/data", () => ({ getAllProjects:mocks.projects, getManagementPlanningOptions:mocks.plannings }));
vi.mock("../../../../lib/activities/management", () => ({ getManagementActivities:mocks.activities, getManagementPeople:mocks.people, managementIdPattern:/^[0-9a-f-]{36}$/i }));

import Page from "./page";
const project = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const result = { data:{ items:[{activityId:"task-id",title:"Tarefa real",projectId:project,projectTitle:"Projeto persistido",projectStatus:"PAUSADO",planningId:"plan-id",planningTitle:"Plano real",status:"PLANEJADA",priority:"ALTA",startOn:null,dueOn:"2026-01-01",createdById:"member-id",createdByName:"Ana",primaryExecutorId:"member-id",primaryExecutorName:"Ana",collaboratorIds:["member-id"],collaborators:[{id:"member-id",name:"Ana"}],linkKinds:["CREATED","EXECUTOR","COLLABORATOR"],activeEvidenceCount:1,createdAt:"2026-01-01T00:00:00Z",completedAt:null,overdue:true,attentionRequired:false}],page:0,size:20,total:1,asOfDate:"2026-11-21",summary:{total:1,planned:1,inProgress:0,completed:0,cancelled:0,pending:1,overdue:1,attentionRequired:0,withEvidence:1,completionDenominator:1,completionRate:0}},issue:null };
beforeEach(() => { vi.resetAllMocks(); mocks.projects.mockResolvedValue({data:[],issue:null}); mocks.plannings.mockResolvedValue({data:[],issue:null}); mocks.people.mockResolvedValue({data:{items:[],page:0,size:20,total:0},issue:null}); mocks.session.mockResolvedValue({ bearer:"private-bearer", member:{id:"member-id"}, roles:["GESTOR_GERAL"] }); mocks.leaders.mockResolvedValue({data:[],issue:null}); mocks.activities.mockResolvedValue(result); });
describe("gestão de atividades e entregas", () => {
  it("renderiza dados reais, vínculos, atenção separada de atraso e contexto canônico", async () => {
    const page = await Page({ searchParams:Promise.resolve({perspective:"project",projectId:project}) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Tarefa real"); expect(html).toContain("Atenção necessária</span><strong class=\"text-type-section-title font-medium text-nite-text-primary\">0</strong>"); expect(html).toContain("Projeto pausado");
    expect(html).toContain(`/atividades/task-id`); expect(html).toContain(`/atividades/planejamentos/plan-id`);
    expect(html).toContain("Criada pela pessoa, Responsável, Colaboradora"); expect(html).toContain("Plano real"); expect(html).toContain("Ana"); expect(html).not.toContain("UUID"); expect(html).toContain("não representa entrega formal aprovada");
    expect(html).not.toContain("private-bearer");
  });
  it("consulta perspectiva global e paginação somente pelo contrato 08.5A", async () => {
    await Page({ searchParams:Promise.resolve({perspective:"member",memberId:member,page:"2",q:"Tarefa"}) });
    expect(mocks.activities).toHaveBeenCalledWith("private-bearer",expect.objectContaining({memberId:member,page:2,q:"Tarefa"}),undefined);
    expect(mocks.leaders).not.toHaveBeenCalled();
  });
  it("líder consulta só projeto em liderança vigente e não chama a visão global", async () => {
    mocks.session.mockResolvedValue({ bearer:"private-bearer", member:{id:"leader"}, roles:["INTEGRANTE"] });
    mocks.leaders.mockResolvedValue({data:[{projectId:project,title:"Projeto liderado"}],issue:null});
    await Page({ searchParams:Promise.resolve({perspective:"project",projectId:project}) });
    expect(mocks.activities).toHaveBeenCalledWith("private-bearer",expect.any(Object),project);
    expect(mocks.activities.mock.calls[0]?.[2]).toBe(project);
  });
  it("não tenta consulta global quando integrante não tem autoridade", async () => {
    mocks.session.mockResolvedValue({ bearer:"private-bearer", member:{id:member}, roles:["INTEGRANTE"] });
    await Page({ searchParams:Promise.resolve({perspective:"member",memberId:member}) });
    expect(mocks.activities).not.toHaveBeenCalled();
  });
});



it("diferencia ausência de resultados, entidade indisponível e falha de carregamento", async () => {
  mocks.activities.mockResolvedValueOnce({ data: { ...result.data, items: [], total: 0 }, issue: null });
  let html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ memberId: member }) }));
  expect(html).toContain("Nenhuma atividade encontrada");
  mocks.activities.mockResolvedValueOnce({ data: { ...result.data, items: [{ ...result.data.items[0], planningTitle: null, projectTitle: null, primaryExecutorName: null, createdByName: null, collaborators: [] }] }, issue: null });
  html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ memberId: member }) }));
  expect(html).toContain("Projeto indisponível"); expect(html).toContain("Planejamento indisponível"); expect(html).toContain("Responsável indisponível");
  mocks.activities.mockResolvedValueOnce({ data: null, issue: "unavailable" });
  html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ memberId: member }) }));
  expect(html).toContain("Não foi possível carregar os dados gerenciais");
});

it("aguarda a seleção da perspectiva antes de consultar atividades", async () => {
  let html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ perspective: "member" }) }));
  expect(html).toContain("Selecione um integrante");
  html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ perspective: "project" }) }));
  expect(html).toContain("Selecione um projeto autorizado");
  expect(mocks.activities).not.toHaveBeenCalled();
  expect(mocks.plannings).not.toHaveBeenCalled();
});

it("mantém o projeto do líder e os filtros na paginação, inclusive sem planejamento", async () => {
  mocks.session.mockResolvedValue({ bearer:"private-bearer", roles:["INTEGRANTE"] });
  mocks.leaders.mockResolvedValue({data:[{projectId:project,title:"Projeto liderado"}],issue:null});
  mocks.activities.mockResolvedValue({ data: { ...result.data, total: 21, items: [{ ...result.data.items[0], planningId: null, planningTitle: null }] }, issue: null });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ perspective:"project", projectId:project, executorId:member, q:"Tarefa" }) }));
  expect(html).toContain("Sem planejamento");
  expect(html).toContain(`projectId=${project}&amp;page=1`);
  expect(html).toContain(`executorId=${member}`);
  expect(mocks.plannings).toHaveBeenCalledWith("private-bearer", project);
});
