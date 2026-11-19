"use client";
import Link from "next/link";
import { useState } from "react";
import { requestProjectDocumentAction } from "../../lib/projects/document-request-actions";

export const documentRequestIssue=(issue:string)=>issue==="conflict"?"O estado do recurso mudou ou o descarte permanece bloqueado. Atualize a página e confira as restrições.":issue==="access"||issue==="not-found"?"Você não tem autorização para esta solicitação.":issue==="invalid"?"Informe um motivo válido de até 1000 caracteres.":"Não foi possível concluir a solicitação. Tente novamente.";
export function ProjectDocumentActionDialog({projectId,resourceId,resourceType,name,action,onClose,requestsPath}:{projectId:string;resourceId:string;resourceType:"DOCUMENT"|"FOLDER";name:string;action:"TRASH"|"PURGE";onClose:()=>void;requestsPath:string}){
  const [reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[requestId,setRequestId]=useState<string|null>(null);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setError(null);
    try{const result=await requestProjectDocumentAction({projectId,resourceId,resourceType,action,reason});if(result.data)setRequestId(result.data.id);else setError(documentRequestIssue(result.issue??"unavailable"));}
    catch{setError(documentRequestIssue("unavailable"));}finally{setBusy(false);}
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="project-document-action-title" className="w-full max-w-lg rounded-dialog bg-nite-surface p-6 text-nite-text-primary shadow-nite-modal">
    <h2 id="project-document-action-title" className="text-type-section-title font-semibold">Solicitar {action==="PURGE"?"descarte definitivo":"exclusão"}</h2>
    <p className="mt-3 break-words">{name}</p>
    {requestId?<><p role="status" className="mt-3">Solicitação registrada. A administração avaliará o pedido antes de executar a ação.</p><p className="mt-2 break-all text-type-body-compact">Protocolo: {requestId}</p><Link href={`${requestsPath}?request=${encodeURIComponent(requestId)}`} className="mt-4 inline-block text-nite-brand-primary underline">Acompanhar solicitação</Link><button type="button" onClick={onClose} className="ml-4 min-h-10 px-3">Fechar</button></>:<form onSubmit={event=>void submit(event)} className="mt-4 grid gap-4">
      <p className="text-type-body-compact text-nite-text-secondary">O recurso pertence ao projeto. A solicitação exige decisão administrativa. O descarte definitivo permanece sujeito à política de retenção e à liberação operacional.</p>
      <label className="grid gap-2">Motivo<textarea required maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} className="min-h-28 rounded-control border border-nite-border-control bg-nite-background p-3"/></label>
      {error&&<p role="alert">{error}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="min-h-10 px-3">Cancelar</button><button type="submit" disabled={busy||!reason.trim()} className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-white disabled:opacity-50">{busy?"Enviando…":"Enviar solicitação"}</button></div>
    </form>}
  </section></div>;
}
