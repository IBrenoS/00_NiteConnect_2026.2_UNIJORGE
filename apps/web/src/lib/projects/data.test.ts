import { beforeEach, expect, it, vi } from "vitest";
const { getApiJson, getAllMyProjects } = vi.hoisted(() => ({ getApiJson: vi.fn(), getAllMyProjects: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../api/server", () => ({ getApiJson }));
vi.mock("../activities/data", () => ({ getAllMyProjects }));
import { getLeadershipProjects, getProjectAuthority, getProjectCandidates, getAllProjectCatalog, getCatalogProject, getProjectTeam, getMyProjectRequests, getAllMyProjectIds } from "./data";
beforeEach(() => vi.resetAllMocks());
const id = "11111111-1111-4111-8111-111111111111";
it("consulta apresentação exclusivamente no catálogo sanitizado e preserva 404", async () => {
  getApiJson.mockResolvedValue({ data: null, issue: "not-found" });
  await expect(getCatalogProject("bearer", id)).resolves.toEqual({ data: null, issue: "not-found" });
  expect(getApiJson).toHaveBeenCalledWith(`/api/v1/project-catalog/${id}`, "bearer", expect.any(Function));
  expect(getApiJson).toHaveBeenCalledTimes(1);
});
it("rejeita IDs inválidos antes de enviar requisições", async () => {
  await expect(getCatalogProject("bearer", "../private")).resolves.toEqual({ data: null, issue: "invalid" });
  expect(getApiJson).not.toHaveBeenCalled();
});
it("carrega todas páginas da equipe e rejeita resultado parcial", async () => {
  getApiJson.mockResolvedValueOnce({ data: { items: [{ memberId: "a" }], page: 0, size: 1, total: 2 }, issue: null });
  getApiJson.mockResolvedValueOnce({ data: { items: [{ memberId: "b" }], page: 1, size: 1, total: 2 }, issue: null });
  await expect(getProjectTeam("bearer", id)).resolves.toEqual({ data: [{ memberId: "a" }, { memberId: "b" }], issue: null });
  getApiJson.mockResolvedValueOnce({ data: { items: [1], page: 0, size: 1, total: 2 }, issue: null });
  getApiJson.mockResolvedValueOnce({ data: null, issue: "access" });
  await expect(getMyProjectRequests("bearer")).resolves.toEqual({ data: null, issue: "access" });
});
it("consulta somente lideranças vigentes para os consumidores pessoais", async () => {
  getApiJson.mockResolvedValue({ data: { items: [{ projectId: id, title: "Projeto" }], page: 0, size: 100, total: 1 }, issue: null });
  await expect(getLeadershipProjects("bearer")).resolves.toEqual({ data: { items: [{ projectId: id, title: "Projeto" }], page: 0, size: 100, total: 1 }, issue: null });
  expect(getApiJson).toHaveBeenCalledWith("/api/v1/me/projects/leadership?page=0&size=100", "bearer", expect.any(Function));
});
it("reutiliza os vínculos pessoais existentes", async () => {
  getAllMyProjects.mockResolvedValue({ data: [{ id }], issue: null });
  await expect(getAllMyProjectIds("bearer")).resolves.toEqual({ data: [id], issue: null });
});
it("rejeita páginas inconsistentes para não exibir snapshot incompleto", async () => {
  getApiJson.mockResolvedValueOnce({ data: { items: [], page: 0, size: 100, total: 2 }, issue: null });
  await expect(getMyProjectRequests("bearer")).resolves.toEqual({ data: null, issue: "invalid" });
});
it("carrega catálogo completo pelo endpoint público paginado", async () => {
  getApiJson.mockResolvedValueOnce({ data: { items: [{ id: "a" }], page: 0, size: 1, total: 2 }, issue: null });
  getApiJson.mockResolvedValueOnce({ data: { items: [{ id: "b" }], page: 1, size: 1, total: 2 }, issue: null });
  await expect(getAllProjectCatalog("bearer")).resolves.toEqual({ data: [{ id: "a" }, { id: "b" }], issue: null });
  expect(getApiJson).toHaveBeenNthCalledWith(1, "/api/v1/project-catalog?page=0&size=100", "bearer", expect.any(Function));
  expect(getApiJson).toHaveBeenNthCalledWith(2, "/api/v1/project-catalog?page=1&size=1", "bearer", expect.any(Function));
});

it("consulta autoridade atual da API sem depender de papéis da sessão", async () => {
 getApiJson.mockResolvedValueOnce({ data: { roles: ["INTEGRANTE", "GESTOR_GERAL"] }, issue: null });
 expect(await getProjectAuthority("bearer")).toEqual({ data: { canCreate: true }, issue: null });
 expect(getApiJson).toHaveBeenCalledWith("/api/v1/me", "bearer", expect.any(Function));
 getApiJson.mockResolvedValueOnce({ data: { roles: ["INTEGRANTE"] }, issue: null });
 expect((await getProjectAuthority("bearer")).data).toEqual({ canCreate: false });
 getApiJson.mockResolvedValueOnce({ data: null, issue: "access" });
 expect((await getProjectAuthority("bearer")).issue).toBe("access");
});
it("carrega candidatos somente no contrato contextual paginado", async () => {
 getApiJson.mockResolvedValue({ data: { items: [], page: 0, size: 100, total: 0 }, issue: null });
 expect((await getProjectCandidates("bearer",id,"Ana")).data).toEqual([]);
 expect(getApiJson).toHaveBeenCalledWith(`/api/v1/projects/${id}/member-candidates?query=Ana&page=0&size=100`,"bearer",expect.any(Function));
});

it("pesquisa candidatos com pelo menos dois caracteres e paginação contextual", async () => {
 getApiJson.mockResolvedValue({ data: { items: [],page:0,size:100,total:0 },issue:null });
 await getProjectCandidates("bearer",id,"Ana");
 expect(getApiJson).toHaveBeenCalledWith(`/api/v1/projects/${id}/member-candidates?query=Ana&page=0&size=100`,"bearer",expect.any(Function));
});
