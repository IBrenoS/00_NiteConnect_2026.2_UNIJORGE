import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectActivities, type ProjectActivitiesProps } from "./project-activities";
import { PlanningForm } from "../activity-planning-preview/activity-planning-preview";
import { PlanningDeleteMenu } from "../activities/planning-delete-menu";
import { AlertDialog } from "../ui/alert-dialog";
const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, push: vi.fn(), refresh: vi.fn(), create: vi.fn(), remove: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState: (initial: unknown) => { const index = state.cursor++; if (!(index in state.values)) state.values[index] = initial; return [state.values[index], (next: unknown) => { state.values[index] = typeof next === "function" ? next(state.values[index]) : next; }]; } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, refresh: state.refresh }) }));
vi.mock("../../lib/activities/planning-actions", () => ({ createPlanningAction: state.create, deletePlanningAction: state.remove }));
const props: ProjectActivitiesProps = { projectId: "project", projectTitle: "Projeto real", canCreatePlanning: true, plannings: [], statistics: {}, page: 0, total: 0, size: 20, query: "" };
function find(node: ReactNode, match: (node: ReactNode) => boolean): ReactNode {
  if (match(node)) return node;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, match); if (result) return result; } }
  if (isValidElement<{ children?: ReactNode }>(node)) return find(node.props.children, match);
  return null;
}
beforeEach(() => { state.values = []; state.cursor = 0; vi.clearAllMocks(); });
describe("planejamentos no projeto", () => {
  it("fixa o projeto na criação e navega apenas após confirmação do servidor", async () => {
    const tree = ProjectActivities(props);
    const form = find(tree, node => isValidElement(node) && node.type === PlanningForm);
    if (!isValidElement<React.ComponentProps<typeof PlanningForm>>(form)) throw new Error("Formulário ausente");
    expect(form.props.fixedProject).toEqual({ id: "project", title: "Projeto real" });
    state.create.mockResolvedValueOnce({ data: null, issue: "conflict" });
    await form.props.onCreate({ title: "Plano real", description: "Descrição", project: "forjado" });
    expect(state.create).toHaveBeenLastCalledWith({ title: "Plano real", description: "Descrição", projectId: "project" });
    expect(state.push).not.toHaveBeenCalled();
    state.create.mockResolvedValueOnce({ data: { id: "persistido" }, issue: null });
    await form.props.onCreate({ title: "Plano real", description: "Descrição", project: null });
    expect(state.push).toHaveBeenLastCalledWith("/meus-projetos/project/atividades?planejamento=persistido");
    expect(state.refresh).toHaveBeenCalled();
  });
  it("mantém exclusão no projeto e conserva o destino padrão dos consumidores antigos", async () => {
    for (const destination of ["/meus-projetos/project/atividades", undefined]) {
      state.values = []; state.cursor = 0;
      const tree = PlanningDeleteMenu({ id: "planning", title: "Plano", version: 7, canDelete: true, leaveWorkspace: true, returnHref: destination });
      const dialog = find(tree, node => isValidElement(node) && node.type === AlertDialog);
      if (!isValidElement<React.ComponentProps<typeof AlertDialog>>(dialog)) throw new Error("Diálogo ausente");
      state.remove.mockResolvedValue({ data: {}, issue: null });
      dialog.props.onConfirm();
      for (let i = 0; i < 6; i++) await Promise.resolve();
      expect(state.remove).toHaveBeenLastCalledWith("planning", 7);
      expect(state.push).toHaveBeenLastCalledWith(destination ?? "/atividades");
    }
  });
});
