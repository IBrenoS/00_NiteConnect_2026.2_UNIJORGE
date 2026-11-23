import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPersonalActivityItems: vi.fn(), getAllMyProjects: vi.fn(), redirect: vi.fn(),
}));

vi.mock("../../../lib/auth/server-session", () => ({
  requireAuthenticatedNiteSession: vi.fn(async () => ({ bearer: "server-only", member: { id: "member-1" }, roles: [] })),
}));
vi.mock("../../../lib/activities/data", () => mocks);
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../../../components/activities/activity-detail", () => ({ ActivityFeedback: () => null }));
vi.mock("../../../components/activities/activity-planning-filters", () => ({ ActivityPlanningFilters: () => <div>Filtros reais</div> }));

vi.mock("../../../lib/activities/planning-actions", () => ({ deletePlanningAction: vi.fn() }));
import ActivitiesPage from "./page";

const planning = {
  kind: "PLANNING" as const, planningId: null, status: null, startOn: null, dueOn: null, priority: null, taskCount: 4, completedCount: 1,
  inProgressCount: 1, completionRate: 33.3,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Plano autorizado", description: "Descrição real", projectId: null, projectTitle: null,
  createdBy: "member-1", version: 1, createdAt: "2026-11-17T12:00:00Z", updatedAt: "2026-11-17T12:00:00Z", canDelete: true,
};
const task = {
  kind: "TASK" as const, planningId: null, status: "EM_EXECUCAO" as const, startOn: null, dueOn: "2026-11-30", priority: null, taskCount: 0,
  completedCount: 0, inProgressCount: 0, completionRate: 0, canDelete: false, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  title: "Tarefa direta", description: "", projectId: null, projectTitle: null, createdBy: "member-1", version: 1,
  createdAt: "2026-11-17T12:00:00Z", updatedAt: "2026-11-17T12:00:00Z",
};

function pageResult(total: number, page = 0, items: Array<typeof planning | typeof task> = [planning]) {
  return { data: { items, page, size: 20, total }, issue: null };
}

describe("Minhas atividades com V43", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPersonalActivityItems.mockResolvedValue(pageResult(2, 0, [planning, task]));
    mocks.getAllMyProjects.mockResolvedValue({ data: [], issue: null });
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  });

  it("mostra planejamentos e tarefas em uma única grade de cards", async () => {
    const page = await ActivitiesPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Plano autorizado");
    expect(markup).toContain(">4</strong> tarefas");
    expect(markup).toContain("33%");
    expect(markup).toContain(`/atividades/planejamentos/${planning.id}`);
    expect(markup).toContain("Tarefa direta");
    expect(markup).toContain(`/atividades/${task.id}?from=%2Fatividades`);
    expect(markup).toContain("Independente");
    expect(markup.match(/aria-label="Minhas atividades"/g)).toHaveLength(1);
    expect(markup).not.toContain("Tarefas sem planejamento");
  });

  it("preserva busca, projeto contextual e paginação da API", async () => {
    const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mocks.getAllMyProjects.mockResolvedValue({ data: [{ id: projectId, title: "Projeto autorizado" }], issue: null });
    mocks.getPersonalActivityItems.mockResolvedValue(pageResult(41, 1));
    const page = await ActivitiesPage({ searchParams: Promise.resolve({ page: "1", q: "plano", projectId }) });
    const markup = renderToStaticMarkup(page);
    const query = mocks.getPersonalActivityItems.mock.calls[0]?.[1] as URLSearchParams;
    expect(query.get("page")).toBe("1");
    expect(query.get("q")).toBe("plano");
    expect(query.get("projectId")).toBe(projectId);
    expect(markup).toContain('aria-label="Paginação"');
    expect(markup).toContain("Itens 21–40 de 41");
  });

  it("mostra um erro explícito quando a consulta autorizada falha", async () => {
    mocks.getPersonalActivityItems.mockResolvedValue({ data: null, issue: "unavailable" });
    const page = await ActivitiesPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Não foi possível carregar suas atividades.");
  });

  it.each(["tasks", "legacy"]) ("redireciona a visualização antiga %s para a página unificada", async (view) => {
    await expect(ActivitiesPage({ searchParams: Promise.resolve({ view, q: "minha busca" }) })).rejects.toThrow("REDIRECT:/atividades?q=minha+busca");
  });
});
