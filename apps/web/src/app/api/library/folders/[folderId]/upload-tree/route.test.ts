import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),library:vi.fn(),fetch:vi.fn()}));
vi.mock("../../../../../../lib/auth/server-session",()=>({requireAuthenticatedNiteSession:mocks.session}));
vi.mock("../../../../../../lib/documents/library",()=>({getProjectLibrary:mocks.library,validUuid:(v:string)=>/^[a-f0-9-]{36}$/.test(v)}));
vi.mock("../../../../../../lib/api/server",()=>({resolveApiUrl:(path:string)=>new URL(path,"http://localhost:8080")}));
import {POST} from "./route";
const id="11111111-1111-4111-8111-111111111111",params=Promise.resolve({folderId:id});
function request(project=id){const body=new FormData();body.append("files",new File(["%PDF-1.7 test"],"teste.pdf",{type:"application/pdf"}));body.append("paths","Pasta/teste.pdf");return new Request(`http://localhost/api/library/folders/${id}/upload-tree?projectId=${project}`,{method:"POST",body});}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal("fetch",mocks.fetch);mocks.session.mockResolvedValue({bearer:"server-only"});mocks.library.mockResolvedValue({data:{folder:{id,kind:"CUSTOM",projectId:null,capabilities:{canAddChild:true}}},issue:null});mocks.fetch.mockResolvedValue(new Response(JSON.stringify({uploaded:1})));});
it("valida destino contextual antes de enviar bytes e mantém contrato de diretório",async()=>{
 expect((await POST(request(),{params})).status).toBe(200);expect(mocks.library).toHaveBeenCalledWith("server-only",id,id,{limit:1});
 const [url,init]=mocks.fetch.mock.calls[0];expect(url.pathname).toBe(`/api/v1/library/folders/${id}/upload-directory`);expect(init.headers.Authorization).toBe("Bearer server-only");expect(init.body.getAll("paths")).toEqual(["Pasta/teste.pdf"]);
});
it("não envia upload para pasta alheia ao projeto",async()=>{mocks.library.mockResolvedValue({data:null,issue:"not-found"});expect((await POST(request(),{params})).status).toBe(404);expect(mocks.fetch).not.toHaveBeenCalled();});
it("não envia upload sem capacidade de adicionar",async()=>{mocks.library.mockResolvedValue({data:{folder:{id,kind:"CUSTOM",projectId:null,capabilities:{canAddChild:false}}},issue:null});expect((await POST(request(),{params})).status).toBe(403);expect(mocks.fetch).not.toHaveBeenCalled();});
it("rejeita contexto inválido sem fallback pessoal",async()=>{expect((await POST(request("invalido"),{params})).status).toBe(400);expect(mocks.fetch).not.toHaveBeenCalled();});
