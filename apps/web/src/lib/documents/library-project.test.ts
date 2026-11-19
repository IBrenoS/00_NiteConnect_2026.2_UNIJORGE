import { beforeEach,expect,it,vi } from "vitest";
const {getApiJson}=vi.hoisted(()=>({getApiJson:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("../api/server",()=>({getApiJson}));
import {getProjectLibrary,getProjectTrashListing,getProjectFolderAncestors} from "./library";
import type { LibraryFolder } from "./library-contracts";
const makeFolder=(id:string,parentId:string|null,kind:LibraryFolder["kind"],projectId:string|null):LibraryFolder=>({id,parentId,kind,projectId,name:"Pasta real",color:"#D6A432",systemKey:null,ownerId:null,ownerName:null,createdByName:null,createdAt:null,modifiedByName:null,modifiedAt:"2026-11-18T12:00:00Z"});
const project="11111111-1111-4111-8111-111111111111",folder="22222222-2222-4222-8222-222222222222";
beforeEach(()=>vi.resetAllMocks());
it("encaminha paginação e filtros para o acervo contextual, nunca pessoal",async()=>{
 await getProjectLibrary("bearer",project,folder,{search:"Plano real",sortBy:"name",direction:"desc",cursor:"cursor",limit:100});
 const url=new URL(getApiJson.mock.calls[0][0],"http://localhost");expect(url.pathname).toBe(`/api/v1/projects/${project}/library`);
 expect(Object.fromEntries(url.searchParams)).toEqual({folderId:folder,search:"Plano real",sortBy:"name",direction:"desc",cursor:"cursor",limit:"100"});
});
it("consulta lixeira exclusivamente do projeto",async()=>{
 await getProjectTrashListing("bearer",project,{offset:50,limit:50,type:"DOCUMENT",sortBy:"name",direction:"asc"});
 expect(getApiJson.mock.calls[0][0]).toBe(`/api/v1/projects/${project}/trash?limit=50&offset=50&type=DOCUMENT&sortBy=name&direction=asc`);
});
it("ancestrais param na raiz PROJECT sem consultar raiz institucional",async()=>{
 const root=makeFolder(project,"global","PROJECT",project);
 getApiJson.mockResolvedValue({data:{folder:root},issue:null});
 const result=await getProjectFolderAncestors("bearer",project,makeFolder(folder,project,"CUSTOM",project));
 expect(result).toEqual({data:[root],issue:null});expect(getApiJson).toHaveBeenCalledOnce();
});
it("nega ancestrais vindos de outro acervo e preserva falha backend",async()=>{
 const current=makeFolder(folder,project,"CUSTOM",project);
 getApiJson.mockResolvedValueOnce({data:{folder:{id:project,kind:"PERSONAL",projectId:null}},issue:null});
 expect((await getProjectFolderAncestors("bearer",project,current)).issue).toBe("invalid");
 getApiJson.mockResolvedValueOnce({data:null,issue:"access"});expect((await getProjectFolderAncestors("bearer",project,current)).issue).toBe("access");
});

it("usa a fronteira da API para subpastas CUSTOM cujo projectId armazenado é nulo",async()=>{
 const root=makeFolder(project,null,"PROJECT",project);
 getApiJson.mockResolvedValue({data:{folder:root},issue:null});
 const result=await getProjectFolderAncestors("bearer",project,makeFolder(folder,project,"CUSTOM",null));
 expect(result).toEqual({data:[root],issue:null});
});
