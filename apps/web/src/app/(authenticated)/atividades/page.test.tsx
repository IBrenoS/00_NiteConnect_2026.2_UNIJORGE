import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivityPlannings: vi.fn(), getActivityPlanningStats: vi.fn(), getAllMyProjects: vi.fn(), getAllProjects: vi.fn(),
  getProjectSummary: vi.fn(), getMyActivities: vi.fn(), getMyActivityStats: vi.fn(),
}));

vi.mock("../../../lib/auth/server-session", () => ({
  requireAuthenticatedNiteSession: vi.fn(async () => ({ bearer: "server-only", member: { id: "member-1" }, roles: [] })),
}));
vi.mock("../../../lib/activities/data", () => mocks);
vi.mock("../../../components/activities/activity-detail", () => ({ ActivityFeedback: () => null }));
vi.mock("../../../components/activities/activity-planning-filters", () => ({ ActivityPlanningFilters: () => <div>Filtros reais</div> }));

import ActivitiesPage from "./page";

const planning = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Plano autorizado", description: "Descrição real", projectId: null,
  createdBy: "member-1", version: 1, createdAt: "2026-11-17T12:00:00Z", updatedAt: "2026-11-17T12:00:00Z",
  canEdit: true, canCreateTasks: true, canDelete: true,
};
const statistics = {
  total: 4, planned: 1, inProgress: 1, completed: 1, cancelled: 1, overdue: 1, completionDenominator: 3,
  plannedRate: 25, inProgressRate: 25, completedRate: 25, cancelledRate: 25, completionRate: 33.3,
};

function pageResult(total: number, page = 0, items = [planning]) {
  return { data: { items, page, size: 20, total }, issue: null };
}

describe("Minhas atividades com V43", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActivityPlannings.mockResolvedValue(pageResult(1));
    mocks.getActivityPlanningStats.mockResolvedValue({ data: statistics, issue: null });
    mocks.getAllMyProjects.mockResolvedValue({ data: [], issue: null });
    mocks.getAllProjects.mockResolvedValue({ data: [], issue: null });
    mocks.getProjectSummary.mockResolvedValue({ data: null, issue: null });
  });

  it("mostra planejamentos persistidos, estatísticas agregadas e esconde os controles do protótipo", async () => {
    const page = await ActivitiesPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Plano autorizado");
    expect(markup).toContain(">4</strong> tarefas");
    expect(markup).toContain("33%");
    expect(markup).toContain(`/atividades/planejamentos/${planning.id}`);
    expect(markup).toContain("Tarefas sem planejamento");
    expect(markup).not.toContain("Demonstração");
    expect(markup).not.toContain("Aplicar na prévia");
    expect(markup).not.toContain("Telas do protótipo");
  });

  it("preserva busca, projeto contextual e paginação da API", async () => {
    const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mocks.getActivityPlannings.mockResolvedValue(pageResult(41, 1));
    mocks.getAllMyProjects.mockResolvedValue({ data: [{ id: projectId, title: "Projeto autorizado" }], issue: null });
    const page = await ActivitiesPage({ searchParams: Promise.resolve({ page: "1", q: "plano", projectId }) });
    const markup = renderToStaticMarkup(page);
    const query = mocks.getActivityPlannings.mock.calls[0]?.[1] as URLSearchParams;
    expect(query.get("page")).toBe("1");
    expect(query.get("q")).toBe("plano");
    expect(query.get("projectId")).toBe(projectId);
    expect(markup).toContain('aria-label="Paginação"');
    expect(markup).toContain("Itens 21–40 de 41");
  });

  it("mostra um erro explícito quando a consulta autorizada falha", async () => {
    mocks.getActivityPlannings.mockResolvedValue({ data: null, issue: "unavailable" });
    const page = await ActivitiesPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Não foi possível carregar seus planejamentos.");
    expect(markup).toContain("Tarefas sem planejamento");
  });
});
