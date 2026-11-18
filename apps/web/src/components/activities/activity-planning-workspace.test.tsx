import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActivityPlanningWorkspace, type ActivityPlanningTask } from "./activity-planning-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../../lib/activities/planning-actions", () => ({
  createPlanningTaskAction: vi.fn(), deletePlanningAction: vi.fn(), deletePlanningTaskAction: vi.fn(),
  getPlanningTaskEditorAction: vi.fn(), movePlanningTaskAction: vi.fn(), updatePlanningTaskAction: vi.fn(),
}));

const planning = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Planejamento real", description: "Descrição persistida", projectId: null,
  createdBy: "member-1", version: 3, createdAt: "2026-11-18T12:00:00Z", updatedAt: "2026-11-18T12:00:00Z",
  canEdit: true, canCreateTasks: true, canDelete: true,
};
const row: ActivityPlanningTask = {
  activity: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Task persistida", description: "Descrição da task", projectId: null,
    planningId: planning.id, status: "EM_EXECUCAO", startOn: null, dueOn: "2026-11-24", priority: "ALTA",
    primaryExecutorId: "member-1", primaryExecutorName: "Integrante autorizado", executorAvailable: true, createdBy: "member-1",
    version: 5, createdAt: "2026-11-18T12:00:00Z", updatedAt: "2026-11-18T12:00:00Z", completedAt: null,
    deadlinePassed: false, overdue: false, attentionRequired: false,
  },
  capabilities: { edit: true, changePriority: true, canDelete: true, transitions: ["PLANEJADA", "CONCLUIDA"], history: false, manageAssignees: true, addEvidence: false, upload: false },
};
const statistics = {
  total: 1, planned: 0, inProgress: 1, completed: 0, cancelled: 0, overdue: 0, completionDenominator: 1,
  plannedRate: 0, inProgressRate: 100, completedRate: 0, cancelledRate: 0, completionRate: 0,
};

describe("workspace de planejamento integrado", () => {
  it("reutiliza os componentes aprovados com tarefas, responsável e indicadores reais", () => {
    const markup = renderToStaticMarkup(<ActivityPlanningWorkspace
      planning={planning} tasks={[row]} statistics={statistics} nextDue="2026-11-24" projectTitle={null} view="status"
      query="" statusFilter="Todas" sort="Atualizado recentemente" currentMember={{ id: "member-1", name: "Integrante autorizado" }}
      canCreateTasks canDeletePlanning
    />);
    expect(markup).toContain("Planejamento real");
    expect(markup).toContain("Task persistida");
    expect(markup).toContain("Integrante autorizado");
    expect(markup).toContain("1</strong>");
    expect(markup).toContain("24 de nov");
    expect(markup).not.toContain("Marina Costa");
    expect(markup).not.toContain("Aplicar na prévia");
    expect(markup).not.toContain("Opções de visualização");
    expect(markup).not.toContain("Mais opções do resumo");
    expect(markup).not.toContain("Demonstração");
  });
});
