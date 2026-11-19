import { renderToStaticMarkup } from "react-dom/server";
import { expect,it,vi } from "vitest";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("../../lib/projects/document-request-actions",()=>({requestProjectDocumentAction:vi.fn(),decideProjectDocumentRequest:vi.fn()}));
import { ProjectDocumentRequests } from "./project-document-requests";
import { ProjectDocumentActionDialog } from "./project-document-action-dialog";
import type { ProjectDocumentActionRequest } from "../../lib/projects/document-requests";
const id="11111111-1111-4111-8111-111111111111";
const request:ProjectDocumentActionRequest={id,projectId:id,resourceId:id,resourceType:"DOCUMENT",action:"PURGE",requestedBy:id,reason:"Guardar protocolo",status:"PENDING",requestedAt:"2026-11-18T12:00:00Z",decidedBy:null,decidedAt:null,decisionReason:null,purgeOperationId:null};
it("só exibe decisão com autoridade administrativa e confirmação explícita",()=>{
  const leader=renderToStaticMarkup(<ProjectDocumentRequests projectId={id} requests={[request]} issue={null} canDecide={false}/>);
  expect(leader).toContain("Guardar protocolo");expect(leader).not.toContain("Aprovar e executar");
  const admin=renderToStaticMarkup(<ProjectDocumentRequests projectId={id} requests={[request]} issue={null} canDecide/>);
  expect(admin).toContain("Confirmo a execução");expect(admin).toContain("Aprovar e executar");expect(admin).toContain("disabled");
});
it("diálogo exige motivo e explica aprovação sem prometer execução imediata",()=>{
  const html=renderToStaticMarkup(<ProjectDocumentActionDialog projectId={id} resourceId={id} resourceType="DOCUMENT" name="Plano.docx" action="TRASH" requestsPath="/aprovacoes" onClose={()=>{}}/>);
  expect(html).toContain("Plano.docx");expect(html).toContain('maxLength="1000"');expect(html).toContain("decisão administrativa");expect(html).toContain("required");
});
