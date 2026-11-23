import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(() => ({ session:vi.fn(), workspace:vi.fn(), authority:vi.fn(), catalog:vi.fn(), team:vi.fn(), candidates:vi.fn(), statuses:vi.fn(), participations:vi.fn(), leadership:vi.fn() }));
vi.mock("../../../../../lib/auth/server-session", () => ({requireAuthenticatedNiteSession:mocks.session}));
vi.mock("../../../../../lib/projects/data", () => ({getProjectWorkspace:mocks.workspace,getProjectAuthority:mocks.authority,getCatalogProject:mocks.catalog,getProjectTeam:mocks.team,getProjectCandidates:mocks.candidates,getProjectStatusHistory:mocks.statuses,getProjectParticipationHistory:mocks.participations,getProjectLeadershipHistory:mocks.leadership}));
vi.mock("../../../../../components/projects/project-administration", () => ({ProjectAdministration: () => null}));
vi.mock("../../../../../components/projects/project-ui", () => ({ProjectIssue: () => null}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NOT_FOUND");}}));
import AdministerProjectPage from "./page";
const params=Promise.resolve({id:"11111111-1111-4111-8111-111111111111"});
beforeEach(() => {vi.resetAllMocks();mocks.session.mockResolvedValue({bearer:"private",roles:["GESTOR_GERAL"]});mocks.catalog.mockResolvedValue({data:{image:null},issue:null});});
it("integrante sem gestão não consulta candidatos nem históricos privados",async () => {
 mocks.workspace.mockResolvedValue({data:{capabilities:{canManageMembers:false}},issue:null}); await AdministerProjectPage({params});
 expect(mocks.candidates).not.toHaveBeenCalled(); expect(mocks.statuses).not.toHaveBeenCalled(); expect(mocks.authority).not.toHaveBeenCalled();
});
it("preserva 404 do backend sem consultar dados administrativos",async () => {
 mocks.workspace.mockResolvedValue({data:null,issue:"not-found"}); await expect(AdministerProjectPage({params})).rejects.toThrow("NOT_FOUND"); expect(mocks.candidates).not.toHaveBeenCalled();
});
it("gestor contextual recebe dados autorizados e não ganha poderes globais da sessão",async () => {
 mocks.workspace.mockResolvedValue({data:{projectId:"p",capabilities:{canManageMembers:true}},issue:null});
 mocks.authority.mockResolvedValue({data:{canCreate:false},issue:null});
 for(const load of [mocks.team,mocks.candidates,mocks.statuses,mocks.participations,mocks.leadership]) load.mockResolvedValue({data:[],issue:null});
 const result=await AdministerProjectPage({params}); expect(result.props.canChangeStatus).toBe(false); expect(JSON.stringify(result)).not.toContain("private"); expect(mocks.candidates).not.toHaveBeenCalled();
});

it("consulta candidatos somente após pesquisa explícita e contextual",async () => {
 mocks.workspace.mockResolvedValue({data:{capabilities:{canManageMembers:true}},issue:null}); mocks.authority.mockResolvedValue({data:{canCreate:true},issue:null});
 for(const load of [mocks.team,mocks.candidates,mocks.statuses,mocks.participations,mocks.leadership]) load.mockResolvedValue({data:[],issue:null});
 await AdministerProjectPage({params,searchParams:Promise.resolve({integrante:"Ana"})}); expect(mocks.candidates).toHaveBeenCalledWith("private","11111111-1111-4111-8111-111111111111","Ana");
});
