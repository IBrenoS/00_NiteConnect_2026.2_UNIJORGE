import { renderToStaticMarkup } from "react-dom/server";
import { afterEach,describe,expect,it,vi } from "vitest";
import { PurgeConfirmationDialog,TrashExplorer,TrashToast,purgeConfirmationCopy,purgeOutcomeMessage,purgeSubmissionFailureMessage,requestTrashRestore,restoreFailureMessage,restoredCountMessage,selectTrashItem,trashBlockReason } from "./trash-explorer";
import type { TrashListing } from "../../lib/documents/library-contracts";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("../../lib/projects/document-request-actions",()=>({requestProjectDocumentAction:vi.fn()}));
afterEach(()=>vi.unstubAllGlobals());

describe("Lixeira documental",()=>{
  it("aplica expiração aos retornos de restauração sem ocultar a indisponibilidade da página",()=>{
    const html=renderToStaticMarkup(<TrashExplorer listing={null} issue="unavailable" params={{error:"conflict",saved:"1"}}/>);
    expect(html.match(/data-transient-feedback/g)).toHaveLength(2);
    expect(html).toContain("1 item restaurado");
    expect(html).toContain('aria-label="Fechar notificação"');
    expect(html).toContain("Não foi possível carregar a Lixeira.");
    const structural=renderToStaticMarkup(<TrashExplorer listing={null} issue="unavailable" params={{}}/>);
    expect(structural).not.toContain("data-transient-feedback");
    expect(structural).toContain('role="alert"');
    expect(structural).not.toContain('role="dialog"');
    expect(structural).not.toContain("Operação em lote");
  });
  it("envia restauração individual e múltipla diretamente pelo lote idempotente",async()=>{
    const document={id:"file-1",type:"DOCUMENT" as const,name:"Relatório.docx"},folder={id:"folder-1",type:"FOLDER" as const,name:"Pasta"};
    const resources=[document,folder];
    const result={action:"RESTORE",items:resources.map(({id,type})=>({id,type,sourceId:id}))};
    const fetchMock=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({action:"RESTORE",items:[result.items[0]]})})
      .mockResolvedValue({ok:true,json:async()=>result});
    vi.stubGlobal("fetch",fetchMock);
    await requestTrashRestore([document],"restore-single");
    await requestTrashRestore(resources,"restore-once");
    await requestTrashRestore(resources,"restore-once");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(1,expect.stringContaining("/api/library/manage?path="),expect.objectContaining({
      method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"restore-single"},
      body:JSON.stringify({action:"RESTORE",items:[document],destinationId:null}),cache:"no-store"
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2,expect.stringContaining("/api/library/manage?path="),expect.objectContaining({
      method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"restore-once"},
      body:JSON.stringify({action:"RESTORE",items:resources,destinationId:null}),cache:"no-store"
    }));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(fetchMock.mock.calls[2]?.[0]);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(fetchMock.mock.calls[2]?.[1]);
  });
  it("conta somente recursos confirmados pelo backend e trata pasta como um item",()=>{
    const folder={id:"folder-1",type:"FOLDER" as const,name:"Pasta"};
    const file={id:"file-1",type:"DOCUMENT" as const,name:"Relatório.docx"};
    expect(restoredCountMessage({action:"RESTORE",items:[{id:folder.id,type:folder.type,sourceId:folder.id}]},[folder])).toBe("1 item restaurado");
    expect(restoredCountMessage({action:"RESTORE",items:[{id:folder.id,type:folder.type,sourceId:folder.id},{id:file.id,type:file.type,sourceId:file.id}]},[folder,file])).toBe("2 itens restaurados");
    expect(()=>restoredCountMessage({action:"RESTORE",items:[{id:folder.id,type:folder.type,sourceId:folder.id}]},[folder,file])).toThrow("Não foi possível confirmar");
    expect(restoreFailureMessage(409,"Já existe um item com este nome na pasta original")).toContain("nome");
    expect(restoreFailureMessage(409,"A pasta original não está disponível")).toContain("pasta original");
    expect(restoreFailureMessage(409,"Um ou mais itens não estão disponíveis para restauração nesta Lixeira")).toContain("protegidos por política");
    expect(restoreFailureMessage(409)).not.toContain("permissão");
    expect(restoreFailureMessage(403)).toContain("autorização");
  });
  it("apresenta o resultado em notificação inferior compacta com fechamento",()=>{
    const html=renderToStaticMarkup(<TrashToast messageKey="restore-1" message="1 item restaurado" kind="success"/>);
    expect(html).toContain('role="status"');
    expect(html).toContain("fixed");
    expect(html).toContain("1 item restaurado");
    expect(html).toContain('aria-label="Fechar notificação"');
    expect(html).toContain("bg-[#f5f5f5]");
    expect(html).toContain("bg-[#107c10]");
    expect(html).toContain("bottom-4");
  });
  it("adiciona o acesso à Lixeira na notificação de exclusão recuperável",()=>{
    const html=renderToStaticMarkup(<TrashToast messageKey="trash-1" message="3 itens excluídos de Meus arquivos" kind="success" actionHref="/documentos/lixeira" actionLabel="Abrir Lixeira"/>);
    expect(html).toContain("3 itens excluídos de Meus arquivos");
    expect(html).toContain('href="/documentos/lixeira"');
    expect(html).toContain("Abrir Lixeira");
  });
  it("explica quando o processamento destrutivo está desabilitado",()=>{
    expect(trashBlockReason("PROCESSING_DISABLED")).toContain("desabilitado");
    expect(trashBlockReason("OWNER_UNKNOWN")).toContain("indeterminada");
  });
  it("seleciona a linha pelo nome e alterna apenas a caixa marcada",()=>{
    expect(selectTrashItem([],"pasta","row")).toEqual(["pasta"]);
    expect(selectTrashItem(["pasta"],"pasta","row")).toEqual(["pasta"]);
    expect(selectTrashItem(["pasta"],"arquivo","checkbox")).toEqual(["pasta","arquivo"]);
    expect(selectTrashItem(["pasta","arquivo"],"pasta","checkbox")).toEqual(["arquivo"]);
  });
  it("diferencia descarte permanente do envio recuperável para a Lixeira",()=>{
    expect(purgeConfirmationCopy("document-id","relatorio.pdf")).toEqual({title:"Excluir permanentemente?",message:"Tem certeza de que deseja excluir permanentemente este item “relatorio.pdf” da Lixeira? Ele não poderá ser recuperado."});
    expect(purgeConfirmationCopy(["a","b"])).toEqual({title:"Excluir permanentemente?",message:"Tem certeza de que deseja excluir permanentemente esses itens da Lixeira? Eles não poderão ser recuperados."});
    expect(purgeConfirmationCopy("empty")).toEqual({title:"Esvaziar lixeira?",message:"Todos os itens elegíveis serão excluídos permanentemente e não poderão ser recuperados."});
  });
  it("renderiza confirmação compacta sem prévia, checkbox ou conteúdo adicional",()=>{
    const html=renderToStaticMarkup(<PurgeConfirmationDialog target="document-id" itemName="relatorio.pdf" busy={false} onCancel={()=>{}} onConfirm={()=>{}}/>);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Fechar"');
    expect(html).toContain("Excluir permanentemente?");
    expect(html).toContain("Ele não poderá ser recuperado.");
    expect(html).toContain(">Excluir</button>");
    expect(html).toContain(">Cancelar</button>");
    expect(html).not.toContain("checkbox");
    expect(html).not.toContain("Itens selecionados");
    expect(html).not.toContain("30 dias");
  });
  it("só comunica sucesso depois do estado terminal concluído e traduz bloqueios",()=>{
    const operation=(status:string,itemCount:number,resultCode:string|null=null)=>({operation:{id:status,status,itemCount,estimatedBytes:0,resultCode},items:[]});
    expect(purgeOutcomeMessage([operation("COMPLETED",1)])).toBe("1 item excluído");
    expect(purgeOutcomeMessage([operation("COMPLETED",3)])).toBe("3 itens excluídos");
    expect(purgeOutcomeMessage([{...operation("COMPLETED",8),selectedCount:1}])).toBe("1 item excluído");
    expect(purgeOutcomeMessage([operation("BLOCKED",1,"PRESERVATION_REFERENCE")])).toBe("Não foi possível excluir os itens. Há uma referência documental protegida.");
    expect(purgeOutcomeMessage([operation("FAILED",1)])).toBe("Não foi possível excluir os itens.");
    expect(purgeSubmissionFailureMessage([{...operation("COMPLETED",5),selectedCount:1}, {...operation("PROCESSING",9),selectedCount:1}])).toBe("1 item excluído. 1 item está em processamento. Não foi possível solicitar a exclusão dos demais itens.");
    expect(purgeSubmissionFailureMessage([])).toBe("Não foi possível excluir os itens.");
  });
  it("mostra capacidade negada e não oferece restauração ativa",()=>{
    const capabilities={policyVersion:1,canView:false,canDownload:false,canEdit:false,canAddChild:false,canRename:false,canMove:false,canCopy:false,canShare:false,canDeleteToTrash:false,canRestore:false,canPermanentlyDelete:false,canArchiveInstitutionally:false,canManageProtection:false,deniedReasons:{canRestore:"HOLD"}};
    const listing:TrashListing={items:[{item:{id:"11111111-1111-4111-8111-111111111111",name:"Retido.docx",type:"DOCUMENT",resourceOwnerKind:"MEMBER",createdBy:null,createdByName:"Gestão",createdAt:"2026-11-01T00:00:00Z",deletedBy:null,deletedByName:"Gestão",deletedAt:"2026-11-15T00:00:00Z",originalFolderId:null,originalFolderName:null,origin:"MANAGEMENT",protection:"OFFICIAL",retentionHold:true,size:2048,subtreeItems:0,batchId:null},capabilities}],limit:50,offset:0,hasMore:false};
    const html=renderToStaticMarkup(<TrashExplorer listing={listing} issue={null} params={{}}/>);
    expect(html).toContain("Retido.docx");
    expect(html).toContain("Meus Arquivos");
    expect(html).toMatch(/disabled=""[^>]*title="HOLD"|title="HOLD"[^>]*disabled=""/);
    const projectListing:TrashListing={...listing,items:listing.items.map(entry=>({...entry,item:{...entry.item,resourceOwnerKind:"PROJECT",origin:"PROJECT"}}))};
    const contextual=renderToStaticMarkup(<TrashExplorer listing={projectListing} issue={null} params={{sortBy:"name",direction:"asc"}} projectContext={{id:"11111111-1111-4111-8111-111111111111",name:"Projeto real",basePath:"/meus-projetos/projeto/documentos/lixeira",libraryPath:"/meus-projetos/projeto/documentos",requestsPath:"/meus-projetos/projeto/documentos/aprovacoes",canRequestActions:true}}/>);
    expect(contextual).not.toContain("Esvaziar lixeira");
    expect(contextual).not.toContain("Meus Arquivos");
    expect(contextual).toContain("Institucional · Projeto");
    expect(contextual).toContain("Solicitar descarte");
    expect(contextual).toContain("/meus-projetos/projeto/documentos/lixeira?sortBy=name&amp;direction=desc");
    const restricted=renderToStaticMarkup(<TrashExplorer listing={projectListing} issue={null} params={{}} projectContext={{id:"11111111-1111-4111-8111-111111111111",name:"Projeto real",basePath:"/projetos/projeto/documentos/lixeira",libraryPath:"/projetos/projeto/documentos",requestsPath:"/projetos/projeto/documentos/aprovacoes",canRequestActions:false}}/>);
    expect(restricted).not.toContain("Solicitar descarte");
  });
});
