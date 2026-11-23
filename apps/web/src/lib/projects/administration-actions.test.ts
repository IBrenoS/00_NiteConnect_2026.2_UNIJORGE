import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), authority: vi.fn(), workspace: vi.fn(), fetch: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.session }));
vi.mock("./data", () => ({ getProjectAuthority: mocks.authority, getProjectWorkspace: mocks.workspace }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { createProjectAction, updateProjectAction, changeProjectStatusAction, manageProjectMemberAction, transferProjectLeadershipAction } from "./administration-actions";
const id = "11111111-1111-4111-8111-111111111111";
const fields = { title: " Projeto real ", description: " Descrição ", startsOn: null, endsOn: null, initialStatus: "ATIVO" as const, image: null };
const editFields = { title: " Projeto real ", description: " Descrição ", startsOn: null, endsOn: null, reason: " Alteração autorizada " };
const project = { id, title: "Projeto real", description: "Descrição", startsOn: null, endsOn: null, status: "PLANEJAMENTO", version: 0 };
beforeEach(() => {
 vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); vi.stubEnv("API_BASE_URL", "http://localhost:8080");
 mocks.session.mockResolvedValue({ bearer: "server-only", roles: ["GESTOR_GERAL"] });
 mocks.authority.mockResolvedValue({ data: { canCreate: true }, issue: null });
 mocks.workspace.mockResolvedValue({ data: { version: 2, status: "PLANEJAMENTO", capabilities: { canManageMembers: true, canTransferLeadership: true } }, issue: null });
 mocks.fetch.mockImplementation(async () => new Response(JSON.stringify(project), { status: 200 }));
});
it("cria sem justificativa manual e persiste a situação inicial selecionada", async () => {
 const result = await createProjectAction(fields);
 expect(result).toEqual({ data: project, issue: null, issueText: null });
 expect(mocks.fetch.mock.calls[0][0].pathname).toBe("/api/v1/projects");
 expect(mocks.fetch.mock.calls[0][1].method).toBe("POST");
 expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ title: "Projeto real", description: "Descrição", startsOn: null, endsOn: null, initialStatus: "ATIVO" });
 expect(mocks.revalidate).toHaveBeenCalledWith("/projetos");
 expect(mocks.revalidate).toHaveBeenCalledWith(`/meus-projetos/${id}`, "layout");
});
it("nega criação com papel revogado mesmo que a sessão ainda indique gestor", async () => {
 mocks.authority.mockResolvedValue({ data: { canCreate: false }, issue: null });
 expect((await createProjectAction(fields)).issue).toBe("access"); expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each([{ title: " " }, { description: "" }, { title: "x".repeat(201) }, { startsOn: "2026-02-30" }, { startsOn: "2026-11-20", endsOn: "2026-11-19" }, { image: new File(["cover"], "cover.gif", { type: "image/gif" }) }] as const)("rejeita dados administrativos inválidos %j", async patch => {
 expect((await createProjectAction({ ...fields, ...patch })).issue).toBe("invalid"); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("edita com versão e motivo preservando datas nulas explícitas", async () => {
 expect((await updateProjectAction(id, { ...editFields, expectedVersion: 2 })).issue).toBeNull();
 expect(mocks.fetch.mock.calls[0][1].method).toBe("PATCH");
 expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ expectedVersion: 2, startsOn: null, endsOn: null });
});
it("bloqueia versão antiga e integrante comum antes de editar", async () => {
 expect((await updateProjectAction(id, { ...editFields, expectedVersion: 1 })).issue).toBe("conflict");
 mocks.workspace.mockResolvedValue({ data: { version: 2, capabilities: { canManageMembers: false } }, issue: null });
 expect((await updateProjectAction(id, { ...editFields, expectedVersion: 2 })).issue).toBe("access"); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("liderança contextual edita mas não muda situação nem transfere liderança", async () => {
 mocks.authority.mockResolvedValue({ data: { canCreate: false }, issue: null });
 mocks.workspace.mockResolvedValue({ data: { version: 2, capabilities: { canManageMembers: true, canTransferLeadership: false } }, issue: null });
 expect((await updateProjectAction(id, { ...editFields, expectedVersion: 2 })).issue).toBeNull(); mocks.fetch.mockClear();
 expect((await changeProjectStatusAction(id, { status: "ATIVO", expectedVersion: 2, reason: "Ativar" })).issue).toBe("access");
 expect((await transferProjectLeadershipAction(id, { memberId: id, expectedVersion: 2, reason: "Designar" })).issue).toBe("access"); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("envia transição versionada sem inventar transições", async () => {
 expect((await changeProjectStatusAction(id, { status: "ATIVO", expectedVersion: 2, reason: "Ativação" })).issue).toBeNull();
 expect(mocks.fetch.mock.calls[0][0].pathname).toBe(`/api/v1/projects/${id}/status`);
 expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ status: "ATIVO", expectedVersion: 2, reason: "Ativação" });
});
it.each([403, 409])("propaga acesso/concorrência HTTP %i sem invalidar consultas", async status => {
 mocks.fetch.mockResolvedValue(new Response("private", { status }));
 expect((await updateProjectAction(id, { ...editFields, expectedVersion: 2 })).issue).toBe(status === 403 ? "access" : "conflict");
 expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("inclui e encerra participação pelo contrato e versão do projeto", async () => {
 mocks.fetch.mockResolvedValue(new Response(null, { status: 201 }));
 expect((await manageProjectMemberAction(id, { operation: "join", memberId: id, responsibility: "Pesquisa", expectedVersion: 2, reason: "Compor equipe" })).issue).toBeNull();
 expect(mocks.fetch.mock.calls[0][0].pathname).toBe(`/api/v1/projects/${id}/members`);
 mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
 expect((await manageProjectMemberAction(id, { operation: "end", memberId: id, expectedVersion: 2, reason: "Encerrar vínculo" })).issue).toBeNull();
 expect(mocks.fetch.mock.calls[1][1].method).toBe("DELETE");
});
it("permite vacância explícita sem criar participação", async () => {
 mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ memberId: null, effective: false })));
 expect((await transferProjectLeadershipAction(id, { memberId: null, expectedVersion: 2, reason: "Vacância administrativa" })).issue).toBeNull();
 expect(mocks.fetch.mock.calls[0][0].pathname).toBe(`/api/v1/projects/${id}/leadership-transfers`);
 expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).memberId).toBeNull();
});
