import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), catalog: vi.fn(), workspace: vi.fn(), fetch: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.session }));
vi.mock("./data", () => ({ getCatalogProject: mocks.catalog, getProjectWorkspace: mocks.workspace }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { requestProjectMembershipAction, withdrawProjectMembershipAction, expressProjectInterestAction, decideProjectMembershipAction, setProjectAvailabilityAction } from "./actions";
const id = "11111111-1111-4111-8111-111111111111";
const request = { id, projectId: id, memberId: id, message: null, state: "PENDENTE", requestedAt: "2026-11-18T12:00:00Z", decidedAt: null, decidedBy: null, decisionMessage: null, version: 0 };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); vi.stubEnv("API_BASE_URL", "http://localhost:8080");
  mocks.session.mockResolvedValue({ bearer: "server-bearer", member: { id } });
  mocks.catalog.mockResolvedValue({ data: { capabilities: { canRequestMembership: true, canExpressInterest: true, canDecideRequests: true } }, issue: null });
  mocks.workspace.mockResolvedValue({ data: { version: 3, capabilities: { canManageAvailability: true, canDecideRequests: true } }, issue: null });
});
it("envia mensagem normalizada e revalida somente após persistência confirmada", async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(request), { status: 201 }));
  const result = await requestProjectMembershipAction(id, "  Olá  ");
  expect(result.issue).toBeNull(); expect(result.data).toEqual(request);
  const options = mocks.fetch.mock.calls[0][1];
  expect(JSON.parse(options.body)).toEqual({ message: "Olá" });
  expect(options.headers.Authorization).toBe("Bearer server-bearer");
  expect(mocks.revalidate).toHaveBeenCalledWith("/projetos");
  expect(mocks.revalidate).toHaveBeenCalledWith("/meus-projetos");
  expect(mocks.revalidate).toHaveBeenCalledWith(`/meus-projetos/${id}`, "layout");
});
it("permite desistir de pedido pendente com controle de versão", async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ...request, state: "ENCERRADA", version: 1 }), { status: 200 }));
  const result = await withdrawProjectMembershipAction(id, id, 0);
  expect(result.issue).toBeNull();
  expect(mocks.fetch.mock.calls[0][0].pathname).toBe(`/api/v1/projects/${id}/membership-requests/${id}/withdraw`);
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ expectedVersion: 0 });
});
it("propaga exigência de autenticação sem enviar mutação", async () => {
  mocks.session.mockRejectedValue(new Error("redirect:/login"));
  await expect(expressProjectInterestAction(id, "")).rejects.toThrow("redirect:/login");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("nega capacidade revogada e rejeita inputs antes da mutação", async () => {
  mocks.catalog.mockResolvedValue({ data: { capabilities: { canRequestMembership: false } }, issue: null });
  expect((await requestProjectMembershipAction(id, "")).issue).toBe("access");
  expect((await requestProjectMembershipAction(id, "x".repeat(2001))).issue).toBe("invalid");
  expect((await decideProjectMembershipAction(id, id, { approve: true, expectedVersion: -1 })).issue).toBe("invalid");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each([[403, "access"], [404, "not-found"], [409, "conflict"]] as const)("traduz HTTP %i sem expor resposta privada", async (status, issue) => {
  mocks.fetch.mockResolvedValue(new Response("private-backend-payload", { status }));
  const result = await decideProjectMembershipAction(id, id, { approve: false, message: "Não", expectedVersion: 2 });
  expect(result.issue).toBe(issue); expect(result.issueText).toBeTruthy(); expect(JSON.stringify(result)).not.toContain("private-backend-payload");
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ approve: false, message: "Não", expectedVersion: 2 });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("detecta versão desatualizada antes de alterar disponibilidade", async () => {
  expect((await setProjectAvailabilityAction(id, { acceptingMembers: false, expectedVersion: 2 })).issue).toBe("conflict");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("revalida capacidade de decisão no workspace sem inferir administração da equipe", async () => {
  mocks.workspace.mockResolvedValue({ data: { capabilities: { canDecideRequests: false, canManageMembers: true } }, issue: null });
  expect((await decideProjectMembershipAction(id, id, { approve: true, expectedVersion: 0 })).issue).toBe("access");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("confirma resposta vazia de disponibilidade e não simula sucesso de pedido malformado", async () => {
  mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
  expect((await setProjectAvailabilityAction(id, { acceptingMembers: false, expectedVersion: 3 })).issue).toBeNull();
  mocks.fetch.mockResolvedValueOnce(new Response("{}", { status: 201 }));
  expect((await requestProjectMembershipAction(id, "")).issue).toBe("invalid");
});
