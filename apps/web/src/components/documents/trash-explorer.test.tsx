import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it,vi } from "vitest";
import { TrashExplorer,selectTrashItem,trashBlockReason } from "./trash-explorer";
import type { TrashListing } from "../../lib/documents/library-contracts";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("../../lib/documents/library-actions",()=>({restoreTrashItem:vi.fn()}));

describe("Lixeira documental",()=>{
  it("aplica expiração aos retornos de restauração sem ocultar a indisponibilidade da página",()=>{
    const html=renderToStaticMarkup(<TrashExplorer listing={null} issue="unavailable" params={{error:"conflict",saved:"1"}}/>);
    expect(html.match(/data-transient-feedback/g)).toHaveLength(2);
    expect(html).toContain("Restauração concluída.");
    expect(html).toContain("Não foi possível carregar a Lixeira.");
    const structural=renderToStaticMarkup(<TrashExplorer listing={null} issue="unavailable" params={{}}/>);
    expect(structural).not.toContain("data-transient-feedback");
    expect(structural).toContain('role="alert"');
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
  it("mostra capacidade negada e não oferece restauração ativa",()=>{
    const capabilities={policyVersion:1,canView:false,canDownload:false,canEdit:false,canAddChild:false,canRename:false,canMove:false,canCopy:false,canShare:false,canDeleteToTrash:false,canRestore:false,canPermanentlyDelete:false,canArchiveInstitutionally:false,canManageProtection:false,deniedReasons:{canRestore:"HOLD"}};
    const listing:TrashListing={items:[{item:{id:"11111111-1111-4111-8111-111111111111",name:"Retido.docx",type:"DOCUMENT",resourceOwnerKind:"MEMBER",createdBy:null,createdByName:"Gestão",createdAt:"2026-11-01T00:00:00Z",deletedBy:null,deletedByName:"Gestão",deletedAt:"2026-11-15T00:00:00Z",originalFolderId:null,originalFolderName:null,origin:"MANAGEMENT",protection:"OFFICIAL",retentionHold:true,size:2048,subtreeItems:0,batchId:null},capabilities}],limit:50,offset:0,hasMore:false};
    const html=renderToStaticMarkup(<TrashExplorer listing={listing} issue={null} params={{}}/>);
    expect(html).toContain("Retido.docx");
    expect(html).toContain("Meus Arquivos");
    expect(html).toMatch(/disabled=""[^>]*title="HOLD"|title="HOLD"[^>]*disabled=""/);
  });
});
