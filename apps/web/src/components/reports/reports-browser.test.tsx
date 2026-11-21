import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {ReportsDirectory,ReportsDocuments} from "./reports-browser";
import type {ReportEntry} from "../../lib/reports/contracts";
const id="11111111-1111-4111-8111-111111111111";
const member={id,name:"Maria da Silva"};
const item:ReportEntry={id,type:"DOCUMENT",name:"Relatório mensal.docx",parentId:null,modifiedAt:"2026-11-20T12:00:00Z",modifiedByName:"João Santos",size:1000,mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",sharing:[{memberId:id,memberName:member.name,permission:"EDIT"}],capabilities:{policyVersion:1,canView:true,canDownload:true,canEdit:false,canAddChild:false,canRename:false,canMove:false,canCopy:false,canShare:false,canDeleteToTrash:false,canRestore:false,canPermanentlyDelete:false,canArchiveInstitutionally:false,canManageProtection:false,deniedReasons:{}}};
it("pesquisa integrantes por nome sem indicadores simulados e oferece navegação",()=>{
 const html=renderToStaticMarkup(<ReportsDirectory members={[member,{id:"outro",name:"Outro integrante"}]} search="maria"/>);
 expect(html).toContain(`/relatorios/${id}`);expect(html).toContain(member.name);expect(html).not.toContain("Outro integrante");
 expect(html.replace(/<[^>]*>/g,"")).not.toMatch(/preenchimento|aprovaç|%/i);
});
it("usa as cinco colunas reais, abertura contextual e capacidade de somente leitura",()=>{
 const html=renderToStaticMarkup(<ReportsDocuments member={member} listing={{memberId:id,items:[item],limit:50,offset:0,hasMore:false}}/>);
 for(const label of ["Nome","Modificado","Modificado por","Tamanho","Compartilhamento","João Santos","Somente leitura"])expect(html).toContain(label);
 expect(html).toContain(`/documentos/${id}?returnTo=`);expect(html).not.toContain("Aprovar");
});
it("mostra integrante sem relatórios sem criar pasta e respeita navegação de pastas",()=>{
 const empty=renderToStaticMarkup(<ReportsDocuments member={member} listing={{memberId:id,items:[],limit:50,offset:0,hasMore:false}}/>);
 expect(empty).toContain("Ainda não há documentos classificados como relatório");expect(empty).not.toContain("Criar");
 const folder=renderToStaticMarkup(<ReportsDocuments member={member} listing={{memberId:id,items:[{...item,type:"FOLDER",mimeType:null}],limit:50,offset:0,hasMore:false}}/>);
 expect(folder).toContain(`folder=${id}`);
});
