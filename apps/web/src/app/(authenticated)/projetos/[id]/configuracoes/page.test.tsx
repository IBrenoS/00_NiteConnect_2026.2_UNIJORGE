import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), workspace: vi.fn(), authority: vi.fn() }));
vi.mock("../../../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.session }));
vi.mock("../../../../../lib/projects/data", () => ({ getProjectWorkspace: mocks.workspace, getProjectAuthority: mocks.authority }));
vi.mock("../../../../../components/projects/project-administration-contexts", () => ({ ProjectSettingsAdministration: () => null }));
vi.mock("../../../../../components/projects/project-ui", () => ({ ProjectIssue: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import ProjectSettingsPage from "./page";

const params = Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ bearer: "server-only" });
  mocks.workspace.mockResolvedValue({ data: { capabilities: { canEditProject: true, canManageMembers: false, canManageAvailability: true, canDeleteProject: false } }, issue: null });
  mocks.authority.mockResolvedValue({ data: { canCreate: true }, issue: null });
});

it("permite configurações conforme capacidade contextual sem exigir autoridade global", async () => {
  await ProjectSettingsPage({ params });
  expect(mocks.authority).not.toHaveBeenCalled();
});

it("consulta autoridade somente para verificar transições de situação", async () => {
  mocks.workspace.mockResolvedValue({ data: { capabilities: { canEditProject: false, canManageMembers: true, canManageAvailability: false, canDeleteProject: false } }, issue: null });
  await ProjectSettingsPage({ params });
  expect(mocks.authority).toHaveBeenCalledWith("server-only");
});

it("nega o contexto a quem não tem nenhuma capacidade administrativa", async () => {
  mocks.workspace.mockResolvedValue({ data: { capabilities: { canEditProject: false, canManageMembers: false, canManageAvailability: false, canDeleteProject: false } }, issue: null });
  await ProjectSettingsPage({ params });
  expect(mocks.authority).not.toHaveBeenCalled();
});
