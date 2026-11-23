import { describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({
  session:vi.fn(),personal:vi.fn(),templates:vi.fn(),shared:vi.fn(),sent:vi.fn(),folder:vi.fn(),ancestors:vi.fn(),
}));

vi.mock("../../../lib/auth/server-session",()=>({requireAuthenticatedNiteSession:mocks.session}));
vi.mock("../../../lib/documents/library",()=>({
  getFolderAncestors:mocks.ancestors,getPersonalLibrary:mocks.personal,getSharedFolder:mocks.folder,
  getSharedListing:mocks.shared,getSentListing:mocks.sent,getTemplates:mocks.templates,validUuid:(value:string)=>value==="11111111-1111-4111-8111-111111111111",
}));
vi.mock("../../../components/documents/my-files-explorer",()=>({MyFilesExplorer:()=>null}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(`redirect:${path}`);}}));

import PersonalDocumentsPage from "./page";
import { MyFilesExplorer } from "../../../components/documents/my-files-explorer";

describe("rota de Meus arquivos",()=>{
  it("redireciona a URL antiga de pesquisa avançada para a listagem normal",async()=>{
    await expect(PersonalDocumentsPage({searchParams:Promise.resolve({advanced:"1",search:"ata",type:"DOCUMENT",ownerKind:"UNKNOWN"})}))
      .rejects.toThrow("redirect:/documentos");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.personal).not.toHaveBeenCalled();
  });

  it("carrega a experiência normal para os demais parâmetros documentais",async()=>{
    mocks.session.mockResolvedValue({bearer:"server-only",member:{id:"integrante"},roles:[]});
    mocks.personal.mockResolvedValue({data:{folder:{id:"raiz"},folders:[],files:[],totalFiles:0,hasMore:false,nextCursor:null},issue:null});
    mocks.templates.mockResolvedValue({data:[],issue:null});
    mocks.ancestors.mockResolvedValue([]);
    const page=await PersonalDocumentsPage({searchParams:Promise.resolve({search:"ata",type:"application/pdf"})});
    expect(page.type).toBe(MyFilesExplorer);
    expect(mocks.personal).toHaveBeenCalledWith("server-only",undefined,expect.objectContaining({search:"ata",mimeType:"application/pdf"}));
  });
});
