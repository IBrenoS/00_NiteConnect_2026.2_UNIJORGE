import { isValidElement, type ReactNode } from "react";
import { AlertDialog } from "../ui/alert-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPlanningWorkspace, type ActivityPlanningTask } from "./activity-planning-workspace";
import { TaskBoard, TaskEditor } from "../activity-planning-preview/activity-planning-preview";
import { TransientFeedback } from "../ui/transient-feedback";
import { createPlanningTaskAction, getPlanningCreationCandidatesAction, getPlanningTaskEditorAction, searchPlanningTaskCandidatesAction, movePlanningTaskAction } from "../../lib/activities/planning-actions";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (next: unknown) => { state.values[index] = typeof next === "function" ? next(state.values[index]) : next; }];
  },
  useEffect: () => undefined,
  useId: () => "test-editor",
  useMemo: (compute: () => unknown) => compute(),
  useRef: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = { current: initial };
    return state.values[index];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../../lib/activities/planning-actions", () => ({
  createPlanningTaskAction: vi.fn(), getPlanningCreationCandidatesAction: vi.fn(), searchPlanningTaskCandidatesAction: vi.fn(), movePlanningTaskAction: vi.fn(),
  updatePlanningTaskAction: vi.fn(), getPlanningTaskEditorAction: vi.fn(), deletePlanningTaskAction: vi.fn(), deletePlanningAction: vi.fn(),
}));

const planning = { id: "planning", title: "Atividade", description: "", projectId: null, createdBy: "owner", version: 1, createdAt: "2026-11-18", updatedAt: "2026-11-18", canEdit: true, canCreateTasks: true, canDelete: true };
const row: ActivityPlanningTask = {
  activity: { id: "task", planningId: planning.id, title: "Tarefa", description: "", projectId: null, status: "PLANEJADA", priority: null, startOn: null, dueOn: null, primaryExecutorId: "owner", primaryExecutorName: "Nome", executorAvailable: true, createdBy: "owner", version: 4, createdAt: "2026-11-18", updatedAt: "2026-11-18", completedAt: null, deadlinePassed: false, overdue: false, attentionRequired: false },
  capabilities: { edit: true, changePriority: true, canDelete: true, transitions: ["EM_EXECUCAO"], history: true, manageAssignees: true, addEvidence: true, upload: true },
};
const initialTasks = [row];
function render() {
  state.cursor = 0;
  return ActivityPlanningWorkspace({ planning, tasks: initialTasks, statistics: null, nextDue: null, projectTitle: null, view: "status", query: "", statusFilter: "Todas", sort: "Título", currentMember: { id: "owner", name: "Nome" }, canCreateTasks: true, canDeletePlanning: true });
}
function find(node: ReactNode, matches: (node: ReactNode) => boolean): ReactNode {
  if (matches(node)) return node;
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, matches); if (found) return found; } }
  else if (isValidElement<{ children?: ReactNode; action?: ReactNode }>(node)) return find(node.props.children, matches) ?? find(node.props.action, matches);
  return null;
}
function board() {
  const node = find(render(), (node) => isValidElement(node) && node.type === TaskBoard);
  if (!isValidElement<React.ComponentProps<typeof TaskBoard>>(node)) throw new Error("Quadro indisponível");
  return node.props;
}
async function settle() { for (let index = 0; index < 6; index++) await Promise.resolve(); }

beforeEach(() => { state.values = []; vi.clearAllMocks(); });
describe("interações persistidas do planejamento", () => {
  it("limpa o aviso de ação ao finalizar sua exibição temporária", async () => {
    vi.mocked(createPlanningTaskAction).mockResolvedValue({ data: null, issue: "conflict" });
    await board().onAdd("Tarefa", "status", "Planejada");
    const notice = find(render(), (node) => isValidElement(node) && node.type === TransientFeedback);
    if (!isValidElement<React.ComponentProps<typeof TransientFeedback>>(notice)) throw new Error("Feedback indisponível");
    expect(notice.props.messageKey).toContain("outra sessão");
    notice.props.onDismiss?.();
    expect(find(render(), (node) => isValidElement(node) && node.type === TransientFeedback)).toBeNull();
  });

  it("oferece colaborador vigente disponível para promoção a responsável", async () => {
    if (!row.capabilities) throw new Error("Capacidades indisponíveis");
    vi.mocked(getPlanningTaskEditorAction).mockResolvedValue({ data: {
      capabilities: row.capabilities, candidates: [], assignees: [
        { id: "assignment-owner", memberId: "owner", memberName: "Nome", role: "EXECUTOR", startedAt: "2026-11-18", available: true },
        { id: "assignment-collaborator", memberId: "collaborator", memberName: "Colaborador vigente", role: "COLLABORATOR", startedAt: "2026-11-18", available: true },
        { id: "assignment-unavailable", memberId: "unavailable", memberName: "Indisponível", role: "COLLABORATOR", startedAt: "2026-11-18", available: false },
      ],
    }, issue: null });
    const currentBoard = board();
    currentBoard.onEdit(currentBoard.tasks[0]);
    await settle();
    const editor = find(render(), (node) => isValidElement(node) && node.type === TaskEditor);
    if (!isValidElement<React.ComponentProps<typeof TaskEditor>>(editor)) throw new Error("Editor indisponível");
    expect(editor.props.ownerOptions).toEqual([{ id: "owner", name: "Nome" }, { id: "collaborator", name: "Colaborador vigente" }]);
  });

  it("busca integrantes pelo campo responsável apenas a partir de dois caracteres", async () => {
    const search = vi.fn(async () => null);
    const editor = TaskEditor({ task: null, onClose: () => undefined, onUpdate: () => undefined, onCreate: () => undefined, ownerOptions: [], onSearchMembers: search });
    const input = find(editor, (node) => isValidElement<{ role?: string }>(node) && node.type === "input" && node.props.role === "combobox");
    if (!isValidElement<{ onChange: (event: { target: { value: string } }) => void }>(input)) throw new Error("Busca indisponível");
    input.props.onChange({ target: { value: " a " } });
    expect(search).not.toHaveBeenCalled();
    input.props.onChange({ target: { value: " Ana " } });
    await settle();
    expect(search).toHaveBeenCalledWith("Ana");
  });

  it("cria na situação ou prioridade da coluna escolhida", async () => {
    vi.mocked(createPlanningTaskAction).mockResolvedValue({ data: { id: "created" }, issue: null });
    await board().onAdd("Tarefa em execução", "status", "Em andamento");
    expect(createPlanningTaskAction).toHaveBeenLastCalledWith(planning.id, expect.objectContaining({ status: "EM_EXECUCAO", priority: null }));
    await board().onAdd("Tarefa urgente", "priority", "Alta");
    expect(createPlanningTaskAction).toHaveBeenLastCalledWith(planning.id, expect.objectContaining({ status: "PLANEJADA", priority: "ALTA" }));
  });

  it("usa a versão e o estado canônico retornados no movimento seguinte", async () => {
    vi.mocked(movePlanningTaskAction).mockResolvedValueOnce({ data: { version: 8, activity: { ...row.activity, status: "EM_EXECUCAO", version: 8 } }, issue: null });
    board().onMove("task", "status", "Em andamento");
    await settle();
    expect(board().tasks[0].status).toBe("Em andamento");
    vi.mocked(movePlanningTaskAction).mockResolvedValueOnce({ data: { version: 9, activity: { ...row.activity, status: "EM_EXECUCAO", priority: "ALTA", version: 9 } }, issue: null });
    board().onMove("task", "priority", "Alta");
    await settle();
    expect(movePlanningTaskAction).toHaveBeenLastCalledWith(planning.id, "task", 8, "priority", "ALTA", false);
  });

  it("carrega candidatos reais e envia responsável, colaboradores e situação do editor", async () => {
    vi.mocked(getPlanningCreationCandidatesAction).mockResolvedValue({ data: [{ id: "owner", name: "Nome" }], issue: null });
    vi.mocked(createPlanningTaskAction).mockResolvedValue({ data: { id: "new" }, issue: null });
    const button = find(render(), (node) => isValidElement<{ children?: ReactNode }>(node) && node.type === "button" && String(node.props.children).includes("Nova tarefa"));
    if (!isValidElement<{ onClick: () => void }>(button)) throw new Error("Botão indisponível");
    button.props.onClick();
    await settle();
    const editor = find(render(), (node) => isValidElement(node) && node.type === TaskEditor);
    if (!isValidElement<React.ComponentProps<typeof TaskEditor>>(editor)) throw new Error("Editor indisponível");
    expect(editor.props.ownerOptions).toEqual([{ id: "owner", name: "Nome" }]);
    expect(editor.props.collaboratorOptions).toEqual([{ id: "owner", name: "Nome" }]);
    vi.mocked(searchPlanningTaskCandidatesAction).mockResolvedValue({ data: [{ id: "found", name: "Integrante encontrado" }, { id: "owner", name: "Nome" }], issue: null });
    await editor.props.onSearchMembers?.("Integrante");
    expect(searchPlanningTaskCandidatesAction).toHaveBeenLastCalledWith(planning.id, null, "Integrante");
    const searchedEditor = find(render(), (node) => isValidElement(node) && node.type === TaskEditor);
    if (!isValidElement<React.ComponentProps<typeof TaskEditor>>(searchedEditor)) throw new Error("Editor indisponível");
    expect(searchedEditor.props.collaboratorOptions).toEqual([{ id: "owner", name: "Nome" }, { id: "found", name: "Integrante encontrado" }]);
    await editor.props.onCreateServer?.({ title: "Nova", description: "Descrição", status: "Em andamento", priority: "Baixa", ownerId: "responsible", collaboratorIds: ["collaborator"], startOn: null, dueOn: null });
    expect(createPlanningTaskAction).toHaveBeenLastCalledWith(planning.id, expect.objectContaining({ status: "EM_EXECUCAO", priority: "BAIXA", primaryExecutorId: "responsible", collaboratorIds: ["collaborator"] }));
  });
});

it("requires an in-app confirmation before deleting a task and allows cancellation", async () => {
 const remove = vi.fn(async () => null);
 const close = vi.fn();
 const renderEditor = () => { state.cursor=0; return TaskEditor({task:{id:"task",title:"Registro teste",description:"",status:"Planejada",priority:"Alta",owner:"Nome",start:"Sem data",due:"Sem prazo"},onClose:close,onUpdate:()=>undefined,onCreate:()=>undefined,canDelete:true,onDelete:remove}); };
 const button=find(renderEditor(),node=>isValidElement<{children?:ReactNode}>(node)&&node.type==="button"&&node.props.children==="Excluir tarefa");
 if(!isValidElement<{onClick:()=>void}>(button)) throw new Error("Exclusão indisponível");
 button.props.onClick();
 expect(remove).not.toHaveBeenCalled();
 let dialog=find(renderEditor(),node=>isValidElement(node)&&node.type===AlertDialog);
 if(!isValidElement<React.ComponentProps<typeof AlertDialog>>(dialog)) throw new Error("Confirmação indisponível");
 expect(dialog.props.open).toBe(true);
 dialog.props.onOpenChange(false);
 expect(remove).not.toHaveBeenCalled();
 button.props.onClick();
 dialog=find(renderEditor(),node=>isValidElement(node)&&node.type===AlertDialog);
 if(!isValidElement<React.ComponentProps<typeof AlertDialog>>(dialog)) throw new Error("Confirmação indisponível");
 await dialog.props.onConfirm();
 expect(remove).toHaveBeenCalledOnce();
 expect(close).toHaveBeenCalledOnce();
});
