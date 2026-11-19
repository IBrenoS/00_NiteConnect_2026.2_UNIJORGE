import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),personal:vi.fn(),project:vi.fn(),shared:vi.fn(),received:vi.fn(),sent:vi.fn()}));
vi.mock("../../../../lib/auth/server-session",()=>({requireAuthenticatedNiteSession:mocks.session}));
vi.mock("../../../../lib/documents/library",()=>({getPersonalLibrary:mocks.personal,getProjectLibrary:mocks.project,getSharedFolder:mocks.shared,getSharedListing:mocks.received,getSentListing:mocks.sent,validUuid:(v:string)=>/^[a-f0-9-]{36}$/.test(v)}));
import {GET} from "./route";
const id="11111111-1111-4111-8111-111111111111";
beforeEach(()=>{vi.resetAllMocks();mocks.session.mockResolvedValue({bearer:"server-only"});mocks.project.mockResolvedValue({data:{folder:{id}},issue:null});});
it("mantém pesquisa/cursor no projeto e ignora tentativas de trocar perspectiva",async()=>{
 const response=await GET(new Request(`http://localhost/api/library/listing?projectId=${id}&folder=${id}&view=shared&search=Plano&cursor=next&sort=name&direction=desc`));
 expect(response.status).toBe(200);expect(mocks.project).toHaveBeenCalledWith("server-only",id,id,expect.objectContaining({search:"Plano",cursor:"next",sortBy:"name",direction:"desc"}));
 expect(mocks.personal).not.toHaveBeenCalled();expect(mocks.shared).not.toHaveBeenCalled();expect(JSON.stringify(await response.json())).not.toContain("server-only");
});
it("nega projeto inválido sem fazer fallback pessoal",async()=>{
 expect((await GET(new Request("http://localhost/api/library/listing?projectId=outro"))).status).toBe(400);expect(mocks.personal).not.toHaveBeenCalled();expect(mocks.project).not.toHaveBeenCalled();
});
it("preserva acesso negado do backend sem recorrer a outro acervo",async()=>{
 mocks.project.mockResolvedValue({data:null,issue:"access"});expect((await GET(new Request(`http://localhost/api/library/listing?projectId=${id}`))).status).toBe(403);expect(mocks.personal).not.toHaveBeenCalled();
});
