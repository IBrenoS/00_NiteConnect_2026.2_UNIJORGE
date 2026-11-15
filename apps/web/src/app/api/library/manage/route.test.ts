import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({fetch:vi.fn(),requireSession:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../../../../lib/auth/server-session",()=>({requireAuthenticatedNiteSession:mocks.requireSession}));
vi.mock("../../../../lib/api/server",()=>({resolveApiUrl:(path:string)=>new URL(path,"https://api.example.invalid")}));

import { DELETE,GET,PATCH,POST } from "./route";

const id="11111111-1111-4111-8111-111111111111";
const endpoint=(path:string)=>`https://nite.example.invalid/api/library/manage?path=${encodeURIComponent(path)}`;

describe("proxy documental autenticado",()=>{
  beforeEach(()=>{mocks.fetch.mockReset();mocks.requireSession.mockReset();mocks.requireSession.mockResolvedValue({bearer:"bearer-de-teste"});vi.stubGlobal("fetch",mocks.fetch);});
  afterEach(()=>vi.unstubAllGlobals());

  it("nega caminhos não permitidos sem chamar o backend",async()=>{
    const response=await GET(new Request(endpoint("/api/v1/internal/secrets")));
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("encaminha descarte com idempotência e confirmação explícita",async()=>{
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({id,status:"PENDING"}),{status:202}));
    const request=new Request(endpoint(`/api/v1/me/trash/${id}/purge`),{method:"POST",headers:{"Idempotency-Key":"chave-estável","X-Confirm-Purge":"true"}});
    const response=await POST(request);
    expect(response.status).toBe(202);
    const [url,init]=mocks.fetch.mock.calls[0] as [URL,RequestInit];
    expect(url.pathname).toBe(`/api/v1/me/trash/${id}/purge`);
    expect(init.headers).toMatchObject({Authorization:"Bearer bearer-de-teste","Idempotency-Key":"chave-estável","X-Confirm-Purge":"true"});
  });

  it("consulta versões sem permitir URL arbitrária",async()=>{
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({items:[],hasMore:false,nextBeforeRevision:null}),{status:200}));
    const response=await GET(new Request(endpoint(`/api/v1/documents/${id}/versions`)));
    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("encaminha apenas contratos autenticados de automação documental",async()=>{
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify([]),{status:200}));
    const options=await GET(new Request(`${endpoint("/api/v1/me/document-automations/options")}&targetType=FOLDER&targetId=${id}`));
    expect(options.status).toBe(200);
    const [url,init]=mocks.fetch.mock.calls[0] as [URL,RequestInit];
    expect(url.searchParams.get("targetType")).toBe("FOLDER");
    expect(url.searchParams.get("targetId")).toBe(id);
    expect(init.headers).toMatchObject({Authorization:"Bearer bearer-de-teste"});
    mocks.fetch.mockResolvedValue(new Response(null,{status:204}));
    expect((await PATCH(new Request(endpoint(`/api/v1/me/document-automations/${id}`),{method:"PATCH",body:JSON.stringify({enabled:false})}))).status).toBe(204);
    expect((await DELETE(new Request(endpoint(`/api/v1/me/document-automations/${id}`),{method:"DELETE"}))).status).toBe(204);
  });
});
