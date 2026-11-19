import { beforeEach,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({session:vi.fn(),fetch:vi.fn(),revalidate:vi.fn()}));
vi.mock("../auth/server-session",()=>({requireAuthenticatedNiteSession:mocks.session}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { getProjectDocumentRequests,getProjectDocumentRequest,parseProjectDocumentActionRequest } from "./document-requests";
import { requestProjectDocumentAction,decideProjectDocumentRequest } from "./document-request-actions";
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const request={id,projectId:id,resourceId:id,resourceType:"DOCUMENT",action:"TRASH",requestedBy:id,reason:"Motivo",status:"PENDING",requestedAt:"2026-11-18T12:00:00Z",decidedBy:null,decidedAt:null,decisionReason:null,purgeOperationId:null};
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal("fetch",mocks.fetch);vi.stubEnv("API_BASE_URL","http://localhost:8080");mocks.session.mockResolvedValue({bearer:"server-only-test"});});
it("rejeita resposta malformada e não mistura protocolos de outro projeto",async()=>{
  expect(parseProjectDocumentActionRequest({...request,status:"FAKE"})).toBeNull();
  expect(parseProjectDocumentActionRequest({...request,requestedAt:"invalid"})).toBeNull();
  expect(parseProjectDocumentActionRequest({...request,decidedAt:"invalid"})).toBeNull();
  expect(parseProjectDocumentActionRequest({...request,privateField:"private"})).toEqual(request);
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({...request,projectId:other})));
  expect((await getProjectDocumentRequest("test",id,id)).issue).toBe("invalid");
});
it("pagina a fila filtrada no backend antes de retornar todos os pedidos",async()=>{
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(Array.from({length:100},()=>request)))).mockResolvedValueOnce(new Response(JSON.stringify([request])));
  const result=await getProjectDocumentRequests("test",id);
  expect(result.data).toHaveLength(101);
  expect(String(mocks.fetch.mock.calls[0][0])).toContain(`projectId=${id}&limit=100&offset=0`);
  expect(String(mocks.fetch.mock.calls[1][0])).toContain("offset=100");
});
it("registra protocolo confirmado e autentica novamente a Server Action",async()=>{
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(request),{status:201}));
  const input={projectId:id,resourceId:id,resourceType:"DOCUMENT" as const,action:"TRASH" as const,reason:"  Motivo  ",untrusted:"ignored"};
  const result=await requestProjectDocumentAction(input);
  expect(result.data?.id).toBe(id);expect(mocks.session).toHaveBeenCalledOnce();
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).reason).toBe("Motivo");
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).not.toHaveProperty("untrusted");
  expect(mocks.revalidate.mock.calls).toEqual([[`/meus-projetos/${id}/documentos`,"layout"],[`/projetos/${id}/arquivos`,"layout"]]);
});
it("exige motivo e confirmação antes de aprovar e mantém bloqueio409 sem falso sucesso",async()=>{
  expect((await decideProjectDocumentRequest(id,id,{approve:true,reason:"Ok",confirmed:false})).issue).toBe("invalid");
  expect((await requestProjectDocumentAction({projectId:id,resourceId:id,resourceType:"DOCUMENT",action:"TRASH",reason:" "})).issue).toBe("invalid");
  expect(mocks.fetch).not.toHaveBeenCalled();
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(request))).mockResolvedValueOnce(new Response("private",{status:409}));
  expect((await decideProjectDocumentRequest(id,id,{approve:true,reason:"Ok",confirmed:true})).issue).toBe("conflict");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("não decide um protocolo de outro projeto nem mascara403 como sucesso",async()=>{
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({...request,projectId:other})));
  expect((await decideProjectDocumentRequest(id,id,{approve:false,reason:"Não",confirmed:false})).issue).toBe("invalid");
  expect(mocks.fetch).toHaveBeenCalledOnce();
  mocks.fetch.mockResolvedValueOnce(new Response("private",{status:403}));
  expect((await requestProjectDocumentAction({projectId:id,resourceId:id,resourceType:"DOCUMENT",action:"TRASH",reason:"Motivo"})).issue).toBe("access");
});
