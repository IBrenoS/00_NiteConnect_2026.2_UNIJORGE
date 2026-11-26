import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActivityPlanningWorkspace, type ActivityPlanningTask } from "./activity-planning-workspace";
import { TaskEditor } from "../activity-planning-preview/activity-planning-preview";
import { PlanningDeleteMenu } from "./planning-delete-menu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../../lib/activities/planning-actions", () => ({
  createPlanningTaskAction: vi.fn(), deletePlanningAction: vi.fn(), deletePlanningTaskAction: vi.fn(),
  getPlanningTaskEditorAction: vi.fn(), movePlanningTaskAction: vi.fn(), updatePlanningTaskAction: vi.fn(),
  getPlanningCreationCandidatesAction: vi.fn(), searchPlanningTaskCandidatesAction: vi.fn(),
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
  it("orienta sobre a pausa e mostra a retomada apenas para quem pode administrar o projeto", () => {
    if (!row.capabilities) throw new Error("Capacidades não carregadas");
    const pausedTask = { ...row, capabilities: { ...row.capabilities, transitions: [], executionBlockedByProjectPause: true, canResumeProject: false } };
    const context = { id: "projeto", title: "Projeto real", basePath: "/meus-projetos/projeto/atividades" };
    const member = renderToStaticMarkup(<ActivityPlanningWorkspace
      planning={planning} tasks={[pausedTask]} statistics={statistics} nextDue={null} projectTitle="Projeto real" view="priority"
      query="" statusFilter="Todas" sort="Título" currentMember={{ id: "member-1", name: "Integrante" }}
      canCreateTasks={false} canDeletePlanning={false} projectContext={context}
    />);
    expect(member).toContain("O projeto está pausado");
    expect(member).toContain("Peça a um administrador para retomar o projeto");
    expect(member).not.toContain('href="/projetos/projeto/administrar"');
    const administrator = renderToStaticMarkup(<ActivityPlanningWorkspace
      planning={planning} tasks={[{ ...pausedTask, capabilities: { ...pausedTask.capabilities, canResumeProject: true } }]} statistics={statistics} nextDue={null} projectTitle="Projeto real" view="status"
      query="" statusFilter="Todas" sort="Título" currentMember={{ id: "member-1", name: "Integrante" }}
      canCreateTasks={false} canDeletePlanning={false} projectContext={context}
    />);
    expect(administrator).toContain('href="/projetos/projeto/configuracoes"');
  });

  it("mantém o contexto do projeto ao trocar visualização", () => {
    const markup = renderToStaticMarkup(<ActivityPlanningWorkspace
      planning={planning} tasks={[row]} statistics={statistics} nextDue={null} projectTitle="Projeto real" view="status"
      query="busca" statusFilter="Todas" sort="Título" currentMember={{ id: "member-1", name: "Integrante" }}
      canCreateTasks={false} canDeletePlanning={false}
      projectContext={{ id: "projeto", title: "Projeto real", basePath: "/meus-projetos/projeto/atividades" }}
    />);
    expect(markup).toContain('href="/meus-projetos/projeto/atividades"');
    expect(markup).toContain(`planejamento=${planning.id}`);
    expect(markup).toContain('view=priority');
    expect(markup).toContain('q=busca');
    expect(markup).toContain("Somente este projeto");
    expect(markup).not.toContain('href="/atividades"');
    expect(markup).not.toContain("Nova tarefa");
  });

  it("oferece exclusão contextual somente com canDelete", () => {
    expect(renderToStaticMarkup(<PlanningDeleteMenu id={planning.id} version={planning.version} title={planning.title} canDelete/>)).toContain("Excluir atividade");
    expect(renderToStaticMarkup(<PlanningDeleteMenu id={planning.id} version={planning.version} title={planning.title} canDelete={false}/>)).toBe("");
  });

  it("mostra exclusão da tarefa mesmo sem edição quando canDelete permite", () => {
    const markup = renderToStaticMarkup(<TaskEditor task={{ id: row.activity.id, title: "Tarefa", description: "", status: "Planejada", priority: "Alta", owner: "Nome", start: "Sem data", due: "Sem prazo" }} onClose={() => undefined} onUpdate={() => undefined} onCreate={() => undefined} canEdit={false} canDelete onDelete={async () => null}/>);
    expect(markup).toContain("Excluir tarefa");
  });

  it("mostra situação e colaboradores na criação integrada", () => {
    const markup = renderToStaticMarkup(<TaskEditor task={null} onClose={() => undefined} onUpdate={() => undefined} onCreate={() => undefined} onCreateServer={async () => null} ownerOptions={[{ id: "owner", name: "Nome" }]} collaboratorOptions={[{ id: "other", name: "Colaborador elegível" }]} initialOwnerId="owner" initialOwnerName="Nome"/>);
    expect(markup).toContain("Situação");
    expect(markup).toContain("Colaborador elegível");
  });
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
