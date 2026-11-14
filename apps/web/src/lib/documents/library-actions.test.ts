import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({getSession:vi.fn(),resolveApiUrl:vi.fn(),fetch:vi.fn(),revalidatePath:vi.fn()}));

vi.mock("../auth/server-session",()=>({requireAuthenticatedNiteSession:mocks.getSession}));
vi.mock("../api/server",()=>({resolveApiUrl:mocks.resolveApiUrl}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidatePath}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(`redirect:${path}`);}}));
vi.mock("./library",()=>({validUuid:(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)}));

import { archiveLibraryFile,archiveLibraryFolder,createLibraryFolder } from "./library-actions";

function form(returnTo:string) {
  const result=new FormData();
  result.set("parentId","");
  result.set("name","Nova pasta");
  result.set("returnTo",returnTo);
  return result;
}

describe("ações da biblioteca documental",()=>{
  beforeEach(()=>{
    mocks.getSession.mockResolvedValue({bearer:"server-only-token"});
    mocks.resolveApiUrl.mockImplementation((path:string)=>`http://localhost:8080${path}`);
    mocks.fetch.mockResolvedValue(new Response(null,{status:201}));
    vi.stubGlobal("fetch",mocks.fetch);
  });

  afterEach(()=>{
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("retorna para Meus Arquivos com confirmação de sucesso",async()=>{
    await expect(createLibraryFolder(form("/documentos?view=personal&sort=name")))
      .rejects.toThrow("redirect:/documentos?view=personal&sort=name&saved=1");
  });

  it("mantém o feedback de erro ao criar pasta",async()=>{
    mocks.fetch.mockResolvedValue(new Response(null,{status:409}));
    await expect(createLibraryFolder(form("/documentos?view=personal")))
      .rejects.toThrow("redirect:/documentos?view=personal&error=conflict");
  });

  it("arquiva arquivo pelo endpoint autenticado e retorna para a pasta atual",async()=>{
    const input=new FormData();input.set("id","11111111-1111-1111-1111-111111111111");input.set("returnTo","/documentos?view=personal&folder=22222222-2222-2222-2222-222222222222");
    await expect(archiveLibraryFile(input)).rejects.toThrow("redirect:/documentos?view=personal&folder=22222222-2222-2222-2222-222222222222&saved=1");
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/library/documents/11111111-1111-1111-1111-111111111111"),expect.objectContaining({method:"DELETE",headers:{Authorization:"Bearer server-only-token"}}));
  });

  it("arquiva recursivamente pasta somente quando o formulário confirma o conteúdo",async()=>{
    const input=new FormData();input.set("id","11111111-1111-1111-1111-111111111111");input.set("recursive","on");input.set("returnTo","/documentos?view=personal");
    await expect(archiveLibraryFolder(input)).rejects.toThrow("redirect:/documentos?view=personal&saved=1");
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/library/folders/11111111-1111-1111-1111-111111111111?recursive=true"),expect.objectContaining({method:"DELETE"}));
  });
});
