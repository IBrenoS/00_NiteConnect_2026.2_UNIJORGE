"use client";
import { TransientFeedback } from "../ui/transient-feedback";

import Link from "next/link";
import { ProjectDocumentActionDialog } from "../projects/project-document-action-dialog";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect,useState } from "react";
import { restoreTrashItem } from "../../lib/documents/library-actions";
import type { TrashEntry,TrashListing } from "../../lib/documents/library-contracts";
import { DocumentBatchDialog,type BatchResource } from "./document-batch-dialog";

type Preview={resourceId:string;resourceType:string;decision:string;reasonCode:string;itemCount:number;estimatedBytes:number};
type EmptyPreview={items:Preview[];limit:number;truncated:boolean};
type Operation={id:string;status:string;itemCount:number;estimatedBytes:number;resultCode:string|null};
type Progress={operation:Operation;objectCount:number;purgedObjects:number;pendingObjects:number;retryingObjects:number;blockedObjects:number;failedObjects:number;removedBytes:number;items:Preview[]};
const terminalPurgeStatuses=new Set(["COMPLETED","FAILED","BLOCKED","BLOCKED_POLICY"]);
const purgeStatusLabel=(status:string)=>({PENDING:"Solicitação registrada",PROCESSING:"Exclusão em andamento",PARTIAL:"Processamento parcial; nova tentativa pendente",COMPLETED:"Exclusão concluída",FAILED:"Falha no processamento",BLOCKED:"Operação bloqueada",BLOCKED_POLICY:"Bloqueada por política"})[status]??"Status da operação indisponível";
export type ProjectTrashContext={id:string;name:string;basePath:string;libraryPath:string;requestsPath:string;canRequestActions:boolean};
type Props={projectContext?:ProjectTrashContext;listing:TrashListing|null;issue:string|null;params:{offset?:string;type?:string;sortBy?:string;direction?:string;error?:string;saved?:string}};
const date=(value:string)=>new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
const deletedDate=(value:string)=>{
  const timestamp=new Date(value),today=new Date();
  const day=(date:Date)=>new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime();
  const difference=Math.round((day(today)-day(timestamp))/86_400_000);
  const time=timestamp.toLocaleTimeString("pt-BR",{hour:"numeric",minute:"2-digit"}).replace(/^0/,"");
  if(difference===0)return `Hoje às ${time}`;
  if(difference===1)return `Ontem às ${time}`;
  if(difference<7&&difference>1)return `${timestamp.toLocaleDateString("pt-BR",{weekday:"short"})} às ${time}`;
  return date(value);
};
const size=(value:number)=>value<1024?`${value} bytes`:value<1024*1024?`${(value/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} KB`:`${(value/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:2})} MB`;
function TrashIcon({name,type}:{name:string;type:"DOCUMENT"|"FOLDER"}) {
  if(type==="FOLDER")return <svg aria-hidden="true" viewBox="0 0 32 28" className="size-8 shrink-0"><path fill="#e6a126" d="M2 5a3 3 0 0 1 3-3h8l3 3h11a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3Z"/><path fill="#ffca50" d="M2 10a3 3 0 0 1 3-3h22a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3Z"/></svg>;
  const ext=name.split(".").at(-1)?.toLowerCase();
  const asset=ext==="docx"||ext==="doc"?"Word":ext==="xlsx"||ext==="xls"?"Excel":ext==="pptx"||ext==="ppt"?"PowerPoint":ext==="pdf"?"PDF":null;
  if(asset)return <Image aria-hidden="true" alt="" src={`/images/documents/NiteConnect-${asset}.svg`} width={32} height={32} className="size-8 shrink-0" unoptimized/>;
  return <svg aria-hidden="true" viewBox="0 0 32 36" className="size-8 shrink-0"><path fill="#f7f7f7" d="M5 1h16l7 7v24a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3Z"/><path fill="#dedede" d="M21 1v7h7Z"/></svg>;
}
function SelectionCheckbox({checked,label,onChange}:{checked:boolean;label:string;onChange:()=>void}) {
  return <label className="relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center">
    <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="peer absolute inset-0 m-0 size-6 cursor-pointer appearance-none rounded-full opacity-0 transition-opacity duration-100 checked:opacity-100 hover:opacity-100 focus-visible:opacity-100"/>
    <span aria-hidden="true" className={`pointer-events-none absolute inline-flex size-4 items-center justify-center rounded-full border transition-all duration-100 ${checked?"border-[#0078d4] bg-[#0078d4] text-white opacity-100":"border-[#adadad] bg-transparent text-transparent opacity-0 group-hover:opacity-100 peer-hover:opacity-100 peer-focus-visible:opacity-100"}`}>
      {checked&&<svg viewBox="0 0 16 16" className="size-3" fill="none"><path d="m3.5 8 2.7 2.7 6.3-6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </span>
  </label>;
}
function ActionIcon({kind}:{kind:"trash"|"restore"}) {
  return kind==="restore"
    ? <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7 3 3 7l4 4M3 7h9a5 5 0 0 1 0 10H7"/></svg>
    : <Image aria-hidden="true" alt="" src="/icons/onedrive-menu/delete.svg" width={16} height={16} className="document-trash-delete-icon size-4" unoptimized/>;
}
export const trashBlockReason=(code:string)=>({OPERATIONAL_RELEASE_REQUIRED:"A liberação operacional para retenção institucional está pendente.",PROCESSING_DISABLED:"O processamento de descarte está desabilitado neste ambiente.",POLICY_NOT_APPROVED:"A política institucional de retenção ainda não está vigente.",RETENTION_NOT_CONFIGURED:"A política de retenção ainda não está configurada.",RETENTION_PERIOD:"O prazo institucional de 30 dias não terminou.",PRESERVATION_REFERENCE:"O item possui referência documental protegida.",REFERENCE_EXISTS:"O armazenamento mantém uma referência documental protegida.",ELIGIBILITY_CHANGED:"O item mudou durante o processamento e foi retido para revisão.",HOLD:"Há uma guarda documental ativa.",PROTECTED:"A proteção deste item impede o descarte.",UNKNOWN:"A propriedade do item é indeterminada.",OWNER_UNKNOWN:"A propriedade do item é indeterminada.",OUT_OF_SCOPE:"Sua conta não tem autoridade para descartar este item.",MIXED_POLICIES:"A seleção mistura itens com políticas diferentes."})[code]??`Bloqueio: ${code}`;
export function selectTrashItem(current:string[],id:string,source:"row"|"checkbox") {
  if(source==="row")return [id];
  return current.includes(id)?current.filter((selected)=>selected!==id):[...current,id];
}
const endpoint=(path:string)=>`/api/library/manage?path=${encodeURIComponent(path)}`;
async function jsonRequest<T>(path:string,method:"GET"|"POST",body?:object,headers?:Record<string,string>):Promise<T> {
  const response=await fetch(endpoint(path),{method,headers:{...(body?{"Content-Type":"application/json"}:{}),...headers},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  if(!response.ok)throw new Error(response.status===409?"Conflito de estado ou autorização. Atualize a Lixeira e tente novamente.":response.status===403||response.status===404?"A operação não está autorizada para este item.":"Não foi possível concluir a operação.");
  return response.json() as Promise<T>;
}
export function TrashExplorer({listing,issue,params,projectContext}:Props) {
  const router=useRouter();
  const trashPath=projectContext?.basePath??"/documentos/lixeira";
  const [requestedItem,setRequestedItem]=useState<TrashEntry|null>(null);
  const [selected,setSelected]=useState<string[]>([]),[restoring,setRestoring]=useState<TrashEntry|null>(null);
  const [name,setName]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null);
  const [preview,setPreview]=useState<Preview|EmptyPreview|null>(null),[previewTarget,setPreviewTarget]=useState<string|string[]|null>(null);
  const [purgeConfirmed,setPurgeConfirmed]=useState(false);
  const [operations,setOperations]=useState<Progress[]>([]);
  const [batchOpen,setBatchOpen]=useState(false);
  const [menuId,setMenuId]=useState<string|null>(null);
  const rows=listing?.items??[];
  useEffect(()=>{
    if(!operations.length||operations.every((operation)=>terminalPurgeStatuses.has(operation.operation.status)))return;
    const timer=setInterval(()=>{void Promise.all(operations.map((operation)=>terminalPurgeStatuses.has(operation.operation.status)?Promise.resolve(operation):jsonRequest<Progress>(`/api/v1/me/trash/purge-operations/${operation.operation.id}`,"GET")))
      .then((results)=>{setOperations(results);if(results.every((operation)=>terminalPurgeStatuses.has(operation.operation.status)))router.refresh();})
      .catch(()=>setMessage("Não foi possível consultar o progresso. Tente novamente."));},2500);
    return()=>clearInterval(timer);
  },[operations,router]);
  async function loadPreview(target?:string|string[]) {
    if(projectContext&&target&&(Array.isArray(target)?target:[target]).some(id=>!rows.find(entry=>entry.item.id===id)?.capabilities.canPermanentlyDelete))return;
    setBusy(true);setMessage(null);setPreview(null);setPurgeConfirmed(false);
    try {
      const result=Array.isArray(target)?{items:await Promise.all(target.map((id)=>jsonRequest<Preview>(`/api/v1/me/trash/${id}/purge/preview`,"POST"))),limit:target.length,truncated:false}
        :target?await jsonRequest<Preview>(`/api/v1/me/trash/${target}/purge/preview`,"POST")
        :await jsonRequest<EmptyPreview>("/api/v1/me/trash/empty/preview","POST");
      setPreviewTarget(target??"empty");setPreview(result);
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível obter a prévia.");}
    finally{setBusy(false);}
  }
  async function submitPurge() {
    if(!preview||!previewTarget||!purgeConfirmed||!canSubmit)return;
    setBusy(true);setMessage(null);
    try {
      const targets=Array.isArray(previewTarget)?previewTarget:[previewTarget];
      const progress:Progress[]=[];const failures:string[]=[];
      for(const target of targets){
        const path=target==="empty"?"/api/v1/me/trash/empty":`/api/v1/me/trash/${target}/purge`;
        try{const result=await jsonRequest<Operation>(path,"POST",undefined,{"Idempotency-Key":crypto.randomUUID(),"X-Confirm-Purge":"true"});progress.push(await jsonRequest<Progress>(`/api/v1/me/trash/purge-operations/${result.id}`,"GET"));}
        catch(error){failures.push(`${target}: ${error instanceof Error?error.message:"falha ao enviar"}`);}
      }
      if(progress.length)setOperations((current)=>[...current,...progress]);
      setPreview(null);setPreviewTarget(null);setSelected([]);
      if(failures.length)setMessage(`Não foi possível enviar ${failures.length} solicitação(ões): ${failures.join("; ")}`);
    }catch(error){setMessage(error instanceof Error?error.message:"Solicitação não concluída.");}
    finally{setBusy(false);}
  }
  const previews=preview?("items" in preview?preview.items:[preview]):[];
  const canSubmit=previews.length>0&&previews.every((item)=>item.decision==="ELIGIBLE")&&!(preview&&"truncated" in preview&&preview.truncated);
  const personalVoluntary=previews.length>0&&previews.every((item)=>{
    const entry=rows.find(row=>row.item.id===item.resourceId);
    return entry?.item.resourceOwnerKind==="MEMBER"&&entry.item.protection==="NONE";
  });
  const pageUrl=(offset:number)=>`${trashPath}?${new URLSearchParams({offset:String(offset),...(params.type?{type:params.type}:{}),...(params.sortBy?{sortBy:params.sortBy}:{}),...(params.direction?{direction:params.direction}:{})})}`;
  const selectedRows=rows.filter((entry)=>selected.includes(entry.item.id));
  const sortUrl=(sortBy:"name"|"deletedAt",direction:"asc"|"desc")=>`${trashPath}?${new URLSearchParams({sortBy,direction,...(params.type?{type:params.type}:{})})}`;
  const sortDirection=(sortBy:"name"|"deletedAt")=>params.sortBy===sortBy&&params.direction==="asc"?"desc":"asc";
  const openRestore=(entry:TrashEntry)=>{setRestoring(entry);setName("");};
  const restoreSelection=()=>{
    if(selectedRows.length===1&&selectedRows[0]?.capabilities.canRestore)openRestore(selectedRows[0]);
    else if(selectedRows.length>1&&selectedRows.every((entry)=>entry.capabilities.canRestore))setBatchOpen(true);
  };
  return <section style={{fontFamily:'"Segoe UI", Tahoma, Arial, sans-serif'}} className={`flex min-w-0 flex-col gap-3 ${projectContext?"document-project-trash min-h-0 flex-1 text-nite-text-primary":"min-h-[calc(100svh-9rem)] gap-5 text-nite-text-primary lg:-ml-[17px] lg:-mr-[23px] lg:-mt-7"}`} aria-label="Lixeira documental">
    {!projectContext&&<h1 className="font-display text-type-page-title font-semibold text-nite-text-primary">Lixeira</h1>}
    {projectContext&&<nav aria-label="Documentos do projeto" className="flex flex-wrap gap-4 border-b border-nite-border-soft text-type-body-compact"><Link href={projectContext.libraryPath} className="min-h-10 py-2 text-nite-text-secondary">Documentos</Link><span aria-current="page" className="min-h-10 border-b-2 border-nite-brand-primary py-2 font-medium text-nite-brand-primary">Lixeira</span></nav>}
    <div className={`flex min-h-[52px] items-center justify-between rounded-[12px] px-2 ${selectedRows.length>0?(projectContext?"bg-nite-surface-elevated":"bg-nite-surface-elevated"):"bg-transparent"}`}>
      {selectedRows.length===0?projectContext?<span/>:<button type="button" onClick={()=>void loadPreview()} disabled={busy||rows.length===0} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-1.5 rounded-[11px] border border-nite-border-control pl-[10px] pr-3 hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50"><ActionIcon kind="trash"/>Esvaziar lixeira</button>
        :<><div className="flex items-center gap-1"><button type="button" disabled={busy||!selectedRows.every((entry)=>entry.capabilities.canRestore)} onClick={restoreSelection} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50"><ActionIcon kind="restore"/>Restaurar</button><button type="button" disabled={busy||(!!projectContext&&!selectedRows.every(entry=>entry.capabilities.canPermanentlyDelete))} onClick={()=>void loadPreview(selectedRows.map((entry)=>entry.item.id))} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50"><ActionIcon kind="trash"/>Excluir</button></div><button type="button" onClick={()=>{setSelected([]);setMenuId(null);}} aria-label="Cancelar seleção" style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus"><span aria-hidden="true">×</span>{selectedRows.length} selecionados</button></>}
    </div>
    {params.error&&<TransientFeedback messageKey={params.error} queryParam="error" occurrenceKey={params}><p role="alert" className="rounded-md bg-status-error-soft p-3 text-status-error">{params.error==="conflict"?"Conflito no destino. Informe outro nome para restaurar.":"Não foi possível concluir a operação."}</p></TransientFeedback>}
    {params.saved&&<TransientFeedback messageKey={params.saved} queryParam="saved" occurrenceKey={params}><p role="status" className="rounded-md bg-nite-brand-soft p-3 text-nite-text-primary">Restauração concluída.</p></TransientFeedback>}
    {message&&<TransientFeedback messageKey={message} onDismiss={()=>setMessage(null)}><p role="alert" className="rounded-md bg-status-warning-soft p-3 text-status-warning">{message}</p></TransientFeedback>}
    {issue?<div role="alert" className="rounded-[12px] bg-nite-surface-elevated p-6">Não foi possível carregar a Lixeira. <button type="button" onClick={()=>router.refresh()} className="text-nite-brand-primary underline">Tentar novamente</button></div>
      :<div className={`document-data-grid-surface min-h-0 min-w-0 flex-1 overflow-auto rounded-[8px] ${projectContext?"":"min-h-[calc(100svh-246px)]"}`}>
        <div className="px-px pt-px">
        {rows.length===0?<div className="grid min-h-80 flex-1 place-content-center gap-2 px-5 text-center"><p className={`font-display text-[20px] font-semibold leading-[27px] ${"text-nite-text-primary"}`}>A Lixeira está vazia</p><p className={`max-w-md text-xs leading-4 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}>Os itens excluídos desta biblioteca aparecerão aqui.</p></div>:<table className={`w-full ${projectContext ? "min-w-[760px]" : "min-w-[1582px]"} table-fixed text-left text-[14px] leading-[normal]`}>
          <colgroup>{projectContext?<><col className="w-[45px]"/><col className="w-[32%]"/><col className="w-[15%]"/><col className="w-[17%]"/><col className="w-[17%]"/><col className="w-[12%]"/></>:<><col className="w-[45px]"/><col className="w-[566.25px]"/><col className="w-[215.72px]"/><col className="w-[269.66px]"/><col className="w-[269.64px]"/><col className="w-[215.73px]"/></>}</colgroup>
          <thead className="document-data-grid-surface sticky top-0 z-10"><tr className={`group h-12 border-b text-[14px] font-medium leading-[normal] ${projectContext?"border-nite-border-soft text-nite-text-secondary":"border-nite-border-soft text-nite-text-secondary"}`}><th className="pl-[18px] font-medium"><SelectionCheckbox checked={rows.length>0&&selectedRows.length===rows.length} label="Selecionar todas as linhas" onChange={()=>{setMenuId(null);setSelected(selectedRows.length===rows.length?[]:rows.map((entry)=>entry.item.id));}}/></th><th className="pl-2 font-medium"><Link href={sortUrl("name",sortDirection("name"))} className={`inline-flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-nite-focus ${projectContext?"hover:text-nite-text-primary":"hover:text-white"}`}>Nome <span aria-hidden="true">{params.sortBy==="name"?(params.direction==="desc"?"↓":"↑"):"⌄"}</span></Link></th><th className="pl-2 font-medium"><Link href={sortUrl("deletedAt",sortDirection("deletedAt"))} className={`inline-flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-nite-focus ${projectContext?"hover:text-nite-text-primary":"hover:text-white"}`}>Excluído <span aria-hidden="true">{params.sortBy==="deletedAt"&&params.direction==="asc"?"↑":"↓"}</span></Link></th><th className="pl-2 font-medium">Excluído por</th><th className="pl-2 font-medium">Criada por</th><th className="pl-2 font-medium">{projectContext?"Tamanho":"Tamanho do arquivo"}</th></tr></thead>
          <tbody>{rows.map((entry)=>{const item=entry.item,isSelected=selected.includes(item.id);return <tr key={item.id} aria-selected={isSelected} className={`group h-14 border-b last:border-b-0 transition-all ${projectContext?"border-nite-border-soft":"border-nite-border-soft"} ${isSelected?(projectContext?"bg-nite-brand-soft hover:bg-nite-brand-soft":"bg-nite-brand-soft hover:bg-nite-brand-soft"):(projectContext?"hover:bg-nite-surface-subtle":"hover:bg-nite-surface-subtle")}`} onClick={(event)=>{if(event.target instanceof HTMLElement&&event.target.closest("button,input,a"))return;setSelected((current)=>selectTrashItem(current,item.id,"row"));setMenuId(null);}}>
            <td className="pl-[18px]"><SelectionCheckbox checked={isSelected} label={`Selecionar ${item.name}`} onChange={()=>{setMenuId(null);setSelected((current)=>selectTrashItem(current,item.id,"checkbox"));}}/></td>
            <td><div className="flex min-w-0 items-center gap-4 pl-2 pr-3"><TrashIcon name={item.name} type={item.type}/><div className="min-w-0 flex-1"><div className={`truncate text-[14px] font-normal leading-[19px] ${"text-nite-text-primary"}`} title={item.name}>{item.name}</div>{projectContext&&<div className="text-[12px] text-nite-text-secondary">{item.resourceOwnerKind==="MEMBER"?"Pessoal":item.resourceOwnerKind==="PROJECT"?"Institucional · Projeto":item.resourceOwnerKind==="INSTITUTION"?"Institucional · NITE":"Titular não determinado"} · Origem: {item.origin}</div>}<div className={`truncate text-[12px] leading-4 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}>{item.originalFolderId&& !item.originalFolderName?"Local indisponível":`${projectContext?projectContext.name:"Meus Arquivos"}${item.originalFolderName?` > ${item.originalFolderName}`:""}`}</div></div><div className="relative shrink-0"><button type="button" aria-label={`Mais ações para ${item.name}`} aria-haspopup="menu" aria-expanded={menuId===item.id} onClick={(event)=>{event.stopPropagation();setSelected([item.id]);setMenuId(menuId===item.id?null:item.id);}} className="invisible -ml-1 h-7 w-7 rounded p-1 text-lg leading-none hover:bg-nite-surface-subtle focus:visible focus-visible:outline-2 focus-visible:outline-nite-focus group-hover:visible">···</button><div role="menu" hidden={menuId!==item.id} style={{boxShadow:"0px 3.2px 7.2px rgba(0,0,0,.133), 0px .6px 1.8px rgba(0,0,0,.11)"}} className="absolute -left-px -mt-px top-full z-20 w-60 rounded-md bg-nite-surface p-1"><button role="menuitem" type="button" disabled={!entry.capabilities.canRestore||busy} title={entry.capabilities.deniedReasons.canRestore} onClick={()=>{setMenuId(null);openRestore(entry);}} style={{fontSize:14,lineHeight:"36px",fontWeight:400}} className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-nite-text-primary hover:bg-nite-surface-subtle disabled:opacity-50"><ActionIcon kind="restore"/>Restaurar</button><button role="menuitem" type="button" disabled={busy||(!!projectContext&&!entry.capabilities.canPermanentlyDelete)} title={entry.capabilities.deniedReasons.canPermanentlyDelete} onClick={()=>{setMenuId(null);void loadPreview(item.id);}} style={{fontSize:14,lineHeight:"36px",fontWeight:400}} className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-nite-text-primary hover:bg-nite-surface-subtle disabled:opacity-50"><ActionIcon kind="trash"/>Excluir</button>{projectContext?.canRequestActions&&!entry.capabilities.canPermanentlyDelete&&item.resourceOwnerKind==="PROJECT"&&<button role="menuitem" type="button" disabled={busy} onClick={()=>{setMenuId(null);setRequestedItem(entry);}} className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-nite-text-primary hover:bg-nite-surface-subtle">Solicitar descarte</button>}</div></div></div></td>
            <td title={date(item.deletedAt)} className={`truncate pr-3 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}>{deletedDate(item.deletedAt)}</td><td className={`truncate pr-3 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`} title={item.deletedByName??"Não informado"}>{item.deletedByName??"Não informado"}</td><td className={`truncate pr-3 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`} title={item.createdByName??"Não informado"}>{item.createdByName??"Não informado"}</td><td className={`truncate pr-3 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}>{size(item.size)}</td>
          </tr>;})}</tbody>
        </table>}
        </div>
      </div>}
    {listing&&(listing.hasMore||listing.offset>0)&&<nav aria-label="Páginas da Lixeira" className={`flex justify-between text-[13px] ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}><Link href={pageUrl(Math.max(0,listing.offset-listing.limit))} aria-disabled={listing.offset===0} className={listing.offset===0?"pointer-events-none opacity-50":"hover:underline"}>Anterior</Link><span>{listing.offset+1}–{listing.offset+rows.length}</span><Link href={pageUrl(listing.offset+listing.limit)} aria-disabled={!listing.hasMore} className={!listing.hasMore?"pointer-events-none opacity-50":"hover:underline"}>Próxima</Link></nav>}
    {restoring&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="restore-title" className="w-full max-w-md rounded-dialog bg-nite-surface p-6 shadow-nite-modal"><h2 id="restore-title" className="font-display text-type-section-title text-nite-text-primary">Restaurar {restoring.item.name}</h2><p className="mt-2 text-type-body-compact text-nite-text-secondary">O destino original será usado. Em caso de conflito, informe um novo nome e tente novamente.</p><form action={restoreTrashItem} className="mt-4 grid gap-4"><input type="hidden" name="id" value={restoring.item.id}/><input type="hidden" name="returnTo" value={trashPath}/><label className="grid gap-1 text-type-body-compact text-nite-text-secondary">Novo nome opcional<input name="name" value={name} onChange={(event)=>setName(event.target.value)} maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><div className="flex justify-end gap-3"><button type="button" onClick={()=>setRestoring(null)} className="min-h-10 px-3 text-nite-text-secondary">Cancelar</button><button type="submit" className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-white">Restaurar</button></div></form></section></div>}
    {preview&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"><section role="dialog" aria-modal="true" aria-labelledby="purge-title" className="max-h-[88svh] w-full max-w-xl overflow-y-auto rounded-dialog border border-nite-border-soft bg-nite-surface p-6 shadow-nite-modal sm:p-7"><div className="flex items-start gap-4"><span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-status-error-soft text-status-error"><ActionIcon kind="trash"/></span><div><h2 id="purge-title" className="font-display text-type-section-title font-semibold text-nite-text-primary">Excluir permanentemente?</h2><p className="mt-1 text-type-body-compact text-nite-text-secondary">O processamento começa após a confirmação e não poderá ser desfeito quando concluído.</p></div></div><div className="mt-5 rounded-control border border-nite-border-soft bg-nite-surface-subtle p-4"><p className="font-medium text-nite-text-primary">{previews.reduce((total,item)=>total+item.itemCount,0)} item(ns) · {size(previews.reduce((total,item)=>total+item.estimatedBytes,0))}</p><p className="mt-1 text-type-metadata text-nite-text-secondary">A remoção inclui versões e anexos. {personalVoluntary?"A janela automática de recuperação de 30 dias não se aplica ao descarte voluntário pessoal.":"A política institucional e os bloqueios de preservação continuam aplicáveis."}</p></div><ul aria-label="Itens selecionados para exclusão" className="mt-4 grid max-h-32 gap-2 overflow-y-auto sm:max-h-48">{previews.map((item)=>{const row=rows.find(entry=>entry.item.id===item.resourceId);return <li key={item.resourceId} className="flex items-center gap-3 rounded-control border border-nite-border-soft p-3 text-type-body-compact"><TrashIcon name={row?.item.name??item.resourceType} type={row?.item.type??(item.resourceType==="FOLDER"?"FOLDER":"DOCUMENT")}/><span className="min-w-0 flex-1 truncate text-nite-text-primary">{row?.item.name??item.resourceType}<span className="block text-type-metadata text-nite-text-secondary">{item.itemCount} item(ns) · {size(item.estimatedBytes)}</span></span><span className={`max-w-[40%] shrink-0 text-right text-type-metadata ${item.decision==="ELIGIBLE"?"text-status-success":"text-status-warning"}`}>{item.decision==="ELIGIBLE"?"Pronto para excluir":trashBlockReason(item.reasonCode)}</span></li>;})}</ul>{"truncated" in preview&&preview.truncated&&<p role="alert" className="mt-3 rounded-control bg-status-warning-soft p-3 text-type-body-compact text-status-warning">A prévia excede o limite do lote. Selecione menos itens e tente novamente.</p>}{!canSubmit&&<p role="status" className="mt-3 rounded-control bg-status-warning-soft p-3 text-type-body-compact text-status-warning">Um ou mais itens estão bloqueados. A Lixeira não será esvaziada parcialmente.</p>}<label className="mt-5 flex cursor-pointer items-start gap-3 rounded-control border border-nite-border-soft p-3 text-type-body-compact text-nite-text-secondary"><input type="checkbox" checked={purgeConfirmed} onChange={(event)=>setPurgeConfirmed(event.target.checked)} disabled={!canSubmit||busy} className="mt-0.5 size-4 accent-nite-brand-primary"/><span>Entendo que os itens elegíveis serão removidos definitivamente e não poderão ser recuperados.</span></label><div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={()=>{setPreview(null);setPreviewTarget(null);setPurgeConfirmed(false);}} className="min-h-10 rounded-control px-4 text-nite-text-secondary hover:bg-nite-surface-subtle">Cancelar</button><button type="button" disabled={!canSubmit||!purgeConfirmed||busy} onClick={()=>void submitPurge()} className="min-h-10 rounded-control bg-status-error px-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Excluir permanentemente</button></div></section></div>}
    {operations.length>0&&<section aria-label="Progresso do descarte" className="grid gap-3">{operations.map((operation)=><article key={operation.operation.id} aria-live="polite" className="rounded-panel border border-nite-border-soft bg-nite-surface p-4 text-type-body-compact text-nite-text-primary"><h2 className="font-semibold">{purgeStatusLabel(operation.operation.status)}</h2><p>{operation.operation.itemCount} item(ns) · {size(operation.operation.estimatedBytes)}</p><p>{operation.purgedObjects} de {operation.objectCount} objetos removidos · {operation.pendingObjects} aguardando · {operation.retryingObjects} em nova tentativa · {operation.failedObjects} falhas · {operation.blockedObjects} bloqueios</p>{operation.operation.status==="COMPLETED"&&<p>{size(operation.removedBytes)} removidos do armazenamento.</p>}{operation.operation.resultCode&&<p>{trashBlockReason(operation.operation.resultCode)}</p>}</article>)}</section>}
    {requestedItem&&projectContext&&<ProjectDocumentActionDialog projectId={projectContext.id} resourceId={requestedItem.item.id} resourceType={requestedItem.item.type} name={requestedItem.item.name} action="PURGE" requestsPath={projectContext.requestsPath} onClose={()=>setRequestedItem(null)}/>}
    {batchOpen&&<DocumentBatchDialog items={rows.filter((entry)=>selected.includes(entry.item.id)).map((entry):BatchResource=>({id:entry.item.id,type:entry.item.type,name:entry.item.name}))} actions={["RESTORE"]} onClose={()=>setBatchOpen(false)} onDone={(result)=>{setBatchOpen(false);setSelected([]);setMessage(result);router.refresh();}}/>}
  </section>;
}
