import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), plannings: vi.fn(), planning: vi.fn(), capabilities: vi.fn(), stats: vi.fn(), tasks: vi.fn(), taskCapabilities: vi.fn() }));
vi.mock("../../../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession: async () => ({ bearer: "server-only", member: { id: "member", name: "Nome" } }) }));
vi.mock("../../../../../lib/projects/data", () => ({ getProjectWorkspace: mocks.workspace }));
vi.mock("../../../../../lib/activities/data", () => ({ getActivityPlannings: mocks.plannings, getProjectActivityPlannings: mocks.plannings, getActivityPlanning: mocks.planning, getActivityPlanningCapabilities: mocks.capabilities, getActivityPlanningStats: mocks.stats, getAllActivityPlanningTasks: mocks.tasks, getActivityCapabilities: mocks.taskCapabilities }));
vi.mock("../../../../../components/projects/project-activities", () => ({ ProjectActivities: ({ plannings = [] }: { plannings: { title: string }[] }) => <div>{plannings.map(item => item.title).join(";")}</div> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
import Page from "./page";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const selected = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function render(searchParams = {}) { return Page({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) }); }
describe("atividades reais do projeto", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.workspace.mockResolvedValue({ data: { projectId: id, name: "Projeto", capabilities: { canViewActivities: true, canCreatePlanning: true } }, issue: null }); mocks.plannings.mockResolvedValue({ data: { items: [{ id: selected, projectId: id, title: "Planejamento persistido" }], page: 0, size: 20, total: 1 }, issue: null }); mocks.stats.mockResolvedValue({ data: null, issue: "unavailable" }); });
  it("usa a coleção contextual para participantes sem tarefas atribuídas", async () => {
    expect(renderToStaticMarkup(await render())).toContain("Planejamento persistido");
    expect(mocks.plannings.mock.calls[0][1]).toBe(id);
    expect((mocks.plannings.mock.calls[0][2] as URLSearchParams).get("page")).toBe("0");
  });
  it("não consulta tarefas de planejamento pertencente a outro projeto", async () => {
    mocks.planning.mockResolvedValue({ data: { id: selected, projectId: "outro" }, issue: null });
    expect(renderToStaticMarkup(await render({ planejamento: selected }))).toContain("Planejamento indisponível");
    expect(mocks.tasks).not.toHaveBeenCalled(); expect(mocks.capabilities).not.toHaveBeenCalled(); expect(mocks.stats).not.toHaveBeenCalled();
  });
  it("não carrega planejamentos quando o workspace nega acesso", async () => {
    mocks.workspace.mockResolvedValue({ data: null, issue: "access" });
    expect(renderToStaticMarkup(await render())).toContain("acesso");
    expect(mocks.plannings).not.toHaveBeenCalled(); expect(mocks.planning).not.toHaveBeenCalled();
  });
  it("não carrega IDs malformados nem planejamentos de outro projeto retornados na listagem", async () => {
    mocks.plannings.mockResolvedValue({ data: { items: [{ projectId: "outro", title: "Privado" }], page: 0, size: 20, total: 1 }, issue: null });
    expect(renderToStaticMarkup(await render())).not.toContain("Privado");
    expect(renderToStaticMarkup(await render({ planejamento: "invalido" }))).toContain("Planejamento indisponível");
    expect(mocks.planning).not.toHaveBeenCalled();
  });
  it("carrega tarefas reais somente depois de confirmar o vínculo do planejamento", async () => {
    mocks.planning.mockResolvedValue({ data: { id: selected, projectId: id }, issue: null });
    mocks.capabilities.mockResolvedValue({ data: { canRead: true, canCreateTasks: false, canDelete: false }, issue: null });
    mocks.tasks.mockResolvedValue({ data: [], issue: null });
    const page = await render({ planejamento: selected, view: "table" });
    expect(page.props.selected.planning.projectId).toBe(id);
    expect(page.props.selected.view).toBe("table");
    expect(page.props.selected.canCreateTasks).toBe(false);
    expect(page.props.selected.tasks).toEqual([]);
    expect(JSON.stringify(page.props)).not.toContain("server-only");
  });

  it.each([
    { projectId: "outro", planningId: selected },
    { projectId: id, planningId: "outro" },
    { projectId: id, planningId: null },
  ])("rejeita snapshot de tarefas fora do contexto: %j", async task => {
    mocks.planning.mockResolvedValue({ data: { id: selected, projectId: id }, issue: null });
    mocks.capabilities.mockResolvedValue({ data: { canRead: true }, issue: null });
    mocks.tasks.mockResolvedValue({ data: [{ ...task, id: "private", title: "Tarefa privada" }], issue: null });
    const page = await render({ planejamento: selected });
    expect(renderToStaticMarkup(page)).toContain("Não foi possível carregar as tarefas");
    expect(JSON.stringify(page.props)).not.toContain("Tarefa privada");
    expect(mocks.taskCapabilities).not.toHaveBeenCalled();
  });

});

