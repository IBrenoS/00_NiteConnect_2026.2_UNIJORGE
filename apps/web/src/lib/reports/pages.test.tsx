import {beforeEach,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
const mocks=vi.hoisted(()=>({session:vi.fn(),directory:vi.fn(),reports:vi.fn()}));
vi.mock("../auth/server-session",()=>({requireAuthenticatedNiteSession:mocks.session}));
vi.mock("../documents/library",()=>({getRecipients:mocks.directory,validUuid:(value:string)=>/^[0-9a-f-]{36}$/i.test(value)}));
vi.mock("./data",()=>({getReports:mocks.reports}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NOT_FOUND");}}));
import Directory from "../../app/(authenticated)/relatorios/page";
import Documents from "../../app/(authenticated)/relatorios/[memberId]/page";
const id="11111111-1111-4111-8111-111111111111",member={id,name:"Integrante persistido"};
beforeEach(()=>{
 vi.resetAllMocks();mocks.session.mockResolvedValue({bearer:"never-in-client",member:{id},roles:["COORDENADOR"]});
 mocks.directory.mockResolvedValue({data:[member],issue:null});
 mocks.reports.mockResolvedValue({data:{memberId:id,items:[],limit:50,offset:0,hasMore:false},issue:null});
});
it("nega listagem pelo resultado atual do backend mesmo com papel antigo na sessão",async()=>{
 mocks.directory.mockResolvedValue({data:null,issue:"access"});
 const html=renderToStaticMarkup(await Documents({params:Promise.resolve({memberId:id}),searchParams:Promise.resolve({})}));
 expect(html).toContain("Acesso restrito");expect(mocks.reports).not.toHaveBeenCalled();
});
it("carrega diretório real e preserva pesquisa sem expor bearer",async()=>{
 const html=renderToStaticMarkup(await Directory({searchParams:Promise.resolve({search:"persistido"})}));
 expect(mocks.directory).toHaveBeenCalledWith("never-in-client");expect(html).toContain(member.name);expect(html).not.toContain("never-in-client");
 const repeated=renderToStaticMarkup(await Directory({searchParams:Promise.resolve({search:["primeiro","segundo"]})}));
 expect(repeated).toContain(member.name);
});
it("navega por pasta e paginação pela consulta real e trata integrante sem relatórios",async()=>{
 const html=renderToStaticMarkup(await Documents({params:Promise.resolve({memberId:id}),searchParams:Promise.resolve({folder:id,offset:"50"})}));
 expect(mocks.reports).toHaveBeenCalledWith("never-in-client",id,id,50);expect(html).toContain("Nenhum relatório nesta pasta");
});
it("rejeita integrante inexistente e identificador de pasta inválido",async()=>{
 mocks.directory.mockResolvedValue({data:[],issue:null});
 await expect(Documents({params:Promise.resolve({memberId:id}),searchParams:Promise.resolve({})})).rejects.toThrow("NOT_FOUND");
 await expect(Documents({params:Promise.resolve({memberId:id}),searchParams:Promise.resolve({folder:"invalid"})})).rejects.toThrow("NOT_FOUND");
 expect(mocks.reports).not.toHaveBeenCalled();
});
