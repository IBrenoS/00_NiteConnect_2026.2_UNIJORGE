import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), workspace: vi.fn(), team: vi.fn(), requests: vi.fn(), candidates: vi.fn() }));
vi.mock("../../../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.session }));
vi.mock("../../../../../lib/projects/data", () => ({ getProjectWorkspace: mocks.workspace, getProjectTeam: mocks.team, getProjectRequests: mocks.requests, getProjectCandidates: mocks.candidates }));
vi.mock("../../../../../components/projects/project-administration-contexts", () => ({ ProjectTeamAdministration: () => null }));
vi.mock("../../../../../components/projects/project-ui", () => ({ ProjectIssue: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import ProjectTeamPage from "./page";

const id = "11111111-1111-4111-8111-111111111111";
const params = Promise.resolve({ id });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ bearer: "server-only" });
  mocks.workspace.mockResolvedValue({ data: { capabilities: { canAccessWorkspace: true, canManageMembers: false, canDecideRequests: false, canTransferLeadership: false } }, issue: null });
  mocks.team.mockResolvedValue({ data: [], issue: null });
  mocks.requests.mockResolvedValue({ data: [], issue: null });
  mocks.candidates.mockResolvedValue({ data: [], issue: null });
});

it("nega quem não tem acesso contextual antes de consultar a equipe", async () => {
  mocks.workspace.mockResolvedValue({ data: { capabilities: { canAccessWorkspace: false, canManageMembers: false, canDecideRequests: false, canTransferLeadership: false } }, issue: null });
  await ProjectTeamPage({ params, searchParams: Promise.resolve({}) });
  expect(mocks.team).not.toHaveBeenCalled();
});

it("carrega pedidos e candidatos somente para capacidades e pesquisa autorizadas", async () => {
  mocks.workspace.mockResolvedValue({ data: { capabilities: { canAccessWorkspace: false, canManageMembers: true, canDecideRequests: true, canTransferLeadership: true } }, issue: null });
  await ProjectTeamPage({ params, searchParams: Promise.resolve({ integrante: "Ana" }) });
  expect(mocks.team).toHaveBeenCalledWith("server-only", id);
  expect(mocks.requests).toHaveBeenCalledWith("server-only", id);
  expect(mocks.candidates).toHaveBeenCalledWith("server-only", id, "Ana");
});

it("não consulta candidatos sem pesquisa explícita", async () => {
  mocks.workspace.mockResolvedValue({ data: { capabilities: { canAccessWorkspace: false, canManageMembers: true, canDecideRequests: false, canTransferLeadership: false } }, issue: null });
  await ProjectTeamPage({ params, searchParams: Promise.resolve({}) });
  expect(mocks.candidates).not.toHaveBeenCalled();
  expect(mocks.requests).not.toHaveBeenCalled();
});
