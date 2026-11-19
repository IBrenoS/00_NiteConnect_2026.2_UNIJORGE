import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), own: vi.fn(), session: vi.fn() }));
vi.mock("../../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.session }));
vi.mock("../../../../lib/projects/data", () => ({ getProjectWorkspace: mocks.workspace, getAllMyProjectIds: mocks.own }));
vi.mock("../../../../components/projects/project-workspace", () => ({ ProjectWorkspaceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../../../components/projects/project-ui", () => ({ ProjectIssue: ({ issue }: { issue: string }) => <p role="alert">{issue}</p> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import WorkspaceLayout from "./layout";

describe("acesso real ao layout do projeto", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ bearer: "segredo-somente-servidor", member: { id: "actor" }, roles: ["GESTOR_GERAL"] }); });
  it("não renderiza conteúdo privado quando o backend nega acesso, inclusive a uma sessão administrativa", async () => {
    mocks.workspace.mockResolvedValue({ data: null, issue: "access" });
    const html = renderToStaticMarkup(await WorkspaceLayout({ params: Promise.resolve({ id: "project" }), children: <p>Conteúdo privado</p> }));
    expect(html).toContain("access"); expect(html).not.toContain("Conteúdo privado"); expect(mocks.own).not.toHaveBeenCalled();
  });
  it("preserva 404 do backend sem consultar os vínculos", async () => {
    mocks.workspace.mockResolvedValue({ data: null, issue: "not-found" });
    await expect(WorkspaceLayout({ params: Promise.resolve({ id: "project" }), children: <p>Privado</p> })).rejects.toThrow("NOT_FOUND");
    expect(mocks.own).not.toHaveBeenCalled();
  });
  it("não propaga bearer para a árvore de cliente autorizada", async () => {
    mocks.workspace.mockResolvedValue({ data: { projectId: "project", capabilities: { canAccessWorkspace: true } }, issue: null });
    mocks.own.mockResolvedValue({ data: ["project"], issue: null });
    const result = await WorkspaceLayout({ params: Promise.resolve({ id: "project" }), children: <p>Permitido</p> });
    expect(JSON.stringify(result)).not.toContain("segredo-somente-servidor");
    expect(renderToStaticMarkup(result)).toContain("Permitido");
  });
});
