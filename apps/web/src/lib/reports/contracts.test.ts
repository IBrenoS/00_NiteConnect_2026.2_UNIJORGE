import {expect,it} from "vitest";
import {parseReportListing,reportFileHref,reportLocation,type ReportEntry} from "./contracts";
import {documentReturnTo} from "../documents/navigation";
const id="11111111-1111-4111-8111-111111111111";
const capabilities={policyVersion:1,canView:true,canDownload:true,canEdit:false,canAddChild:false,canRename:false,canMove:false,canCopy:false,canShare:false,canDeleteToTrash:false,canRestore:false,canPermanentlyDelete:false,canArchiveInstitutionally:false,canManageProtection:false,deniedReasons:{}};
export const report:ReportEntry={id,type:"DOCUMENT",name:"Relatório real.docx",parentId:null,modifiedAt:"2026-11-20T12:00:00Z",modifiedByName:"Maria Silva",size:1024,mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",sharing:[],capabilities};
it("valida metadados e capacidades reais; rejeita resposta incompleta",()=>{
 const listing={memberId:id,items:[report],limit:50,offset:0,hasMore:false};
 expect(parseReportListing(listing)?.items[0]?.modifiedByName).toBe("Maria Silva");
 expect(parseReportListing({...listing,items:[{...report,capabilities:undefined}]})).toBeNull();
 expect(parseReportListing({...listing,items:[{...report,size:-1}]})).toBeNull();
});
it("mantém retorno local de Relatórios e bloqueia abertura sem capacidade",()=>{
 const back=reportLocation(id,id,50);
 expect(documentReturnTo(back)).toBe(back);
 expect(reportFileHref(report,back)).toContain(encodeURIComponent(back));
 expect(reportFileHref({...report,capabilities:{...capabilities,canView:false}},back)).toBeNull();
 expect(reportFileHref({...report,mimeType:"application/pdf"},back)).toBe(`/api/library/download/${id}`);
 expect(reportFileHref({...report,mimeType:"application/pdf",capabilities:{...capabilities,canDownload:false}},back)).toBeNull();
});
