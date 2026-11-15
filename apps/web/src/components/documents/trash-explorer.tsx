"use client";

import Link from "next/link";
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
type Props={listing:TrashListing|null;issue:string|null;params:{offset?:string;type?:string;sortBy?:string;direction?:string;error?:string;saved?:string}};
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
    : <Image aria-hidden="true" alt="" src="/icons/onedrive-menu/delete.svg" width={16} height={16} className="size-4 brightness-0 invert" unoptimized/>;
}
export const trashBlockReason=(code:string)=>({OPERATIONAL_RELEASE_REQUIRED:"Descarte não liberado operacionalmente.",PROCESSING_DISABLED:"Processamento de descarte desabilitado neste ambiente.",POLICY_NOT_APPROVED:"Política interna ainda sem vigência.",HOLD:"Guarda ativa.",UNKNOWN:"Propriedade indeterminada.",OWNER_UNKNOWN:"Propriedade indeterminada.",RETENTION_PERIOD:"Prazo de 30 dias não concluído.",TECHNICAL_REFERENCE:"Referência documental impeditiva.",OUT_OF_SCOPE:"Sem autoridade para descarte."})[code]??`Bloqueio: ${code}`;
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
export function TrashExplorer({listing,issue,params}:Props) {
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]),[restoring,setRestoring]=useState<TrashEntry|null>(null);
  const [name,setName]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null);
  const [preview,setPreview]=useState<Preview|EmptyPreview|null>(null),[previewTarget,setPreviewTarget]=useState<string|string[]|null>(null);
  const [operation,setOperation]=useState<Progress|null>(null);
  const [batchOpen,setBatchOpen]=useState(false);
  const [menuId,setMenuId]=useState<string|null>(null);
  const rows=listing?.items??[];
  useEffect(()=>{
    if(!operation||["COMPLETED","FAILED","BLOCKED"].includes(operation.operation.status))return;
    const timer=setInterval(()=>{void jsonRequest<Progress>(`/api/v1/me/trash/purge-operations/${operation.operation.id}`,"GET")
      .then((result)=>{setOperation(result);if(["COMPLETED","FAILED","BLOCKED"].includes(result.operation.status))router.refresh();})
      .catch(()=>setMessage("Não foi possível consultar o progresso. Tente novamente."));},2500);
    return()=>clearInterval(timer);
  },[operation,router]);
  async function loadPreview(target?:string|string[]) {
    setBusy(true);setMessage(null);setPreview(null);
    try {
      const result=Array.isArray(target)?{items:await Promise.all(target.map((id)=>jsonRequest<Preview>(`/api/v1/me/trash/${id}/purge/preview`,"POST"))),limit:target.length,truncated:false}
        :target?await jsonRequest<Preview>(`/api/v1/me/trash/${target}/purge/preview`,"POST")
        :await jsonRequest<EmptyPreview>("/api/v1/me/trash/empty/preview","POST");
      setPreviewTarget(target??"empty");setPreview(result);
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível obter a prévia.");}
    finally{setBusy(false);}
  }
  async function submitPurge() {
    if(!preview||!previewTarget||!window.confirm("Confirma a solicitação de descarte definitivo dos itens elegíveis indicados na prévia?"))return;
    setBusy(true);setMessage(null);
    try {
      const targets=Array.isArray(previewTarget)?previewTarget:[previewTarget];
      let progress:Progress|null=null;const failures:string[]=[];
      for(const target of targets){
        const path=target==="empty"?"/api/v1/me/trash/empty":`/api/v1/me/trash/${target}/purge`;
        try{const result=await jsonRequest<Operation>(path,"POST",undefined,{"Idempotency-Key":crypto.randomUUID(),"X-Confirm-Purge":"true"});progress=await jsonRequest<Progress>(`/api/v1/me/trash/purge-operations/${result.id}`,"GET");}
        catch{failures.push(target);}
      }
      if(progress)setOperation(progress);
      setPreview(null);setPreviewTarget(null);setSelected([]);router.refresh();
      if(failures.length)setMessage(`${failures.length} item(ns) não puderam ser enviados para descarte. A Lixeira foi atualizada.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Solicitação não concluída.");}
    finally{setBusy(false);}
  }
  const previews=preview?("items" in preview?preview.items:[preview]):[];
  const canSubmit=previews.length>0&&previews.every((item)=>item.decision==="ELIGIBLE")&&!(preview&&"truncated" in preview&&preview.truncated);
  const pageUrl=(offset:number)=>`/documentos/lixeira?${new URLSearchParams({offset:String(offset),...(params.type?{type:params.type}:{}),...(params.sortBy?{sortBy:params.sortBy}:{}),...(params.direction?{direction:params.direction}:{})})}`;
  const selectedRows=rows.filter((entry)=>selected.includes(entry.item.id));
  const sortUrl=(sortBy:"name"|"deletedAt",direction:"asc"|"desc")=>`/documentos/lixeira?${new URLSearchParams({sortBy,direction,...(params.type?{type:params.type}:{})})}`;
  const sortDirection=(sortBy:"name"|"deletedAt")=>params.sortBy===sortBy&&params.direction==="asc"?"desc":"asc";
  const openRestore=(entry:TrashEntry)=>{setRestoring(entry);setName("");};
  const restoreSelection=()=>{
    if(selectedRows.length===1&&selectedRows[0]?.capabilities.canRestore)openRestore(selectedRows[0]);
    else if(selectedRows.length>1&&selectedRows.every((entry)=>entry.capabilities.canRestore))setBatchOpen(true);
  };
  return <section style={{fontFamily:'"Segoe UI", Tahoma, Arial, sans-serif'}} className="flex min-h-[calc(100svh-9rem)] flex-col gap-5 text-[#e8e8e8] lg:-ml-[17px] lg:-mr-[23px] lg:-mt-7" aria-label="Lixeira documental">
    <div className={`flex min-h-[52px] items-center justify-between rounded-[12px] px-2 ${selectedRows.length>0?"bg-[#292827]":"bg-transparent"}`}>
      {selectedRows.length===0?<button type="button" onClick={()=>void loadPreview()} disabled={busy||rows.length===0} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-1.5 rounded-[11px] border border-[#3d3d3d] pl-[10px] pr-3 hover:bg-[#383838] focus-visible:outline-2 focus-visible:outline-[#78b9ff] disabled:opacity-50"><ActionIcon kind="trash"/>Esvaziar lixeira</button>
        :<><div className="flex items-center gap-1"><button type="button" disabled={busy||!selectedRows.every((entry)=>entry.capabilities.canRestore)} onClick={restoreSelection} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 hover:bg-[#383838] focus-visible:outline-2 focus-visible:outline-[#78b9ff] disabled:opacity-50"><ActionIcon kind="restore"/>Restaurar</button><button type="button" disabled={busy} onClick={()=>void loadPreview(selectedRows.map((entry)=>entry.item.id))} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 hover:bg-[#383838] focus-visible:outline-2 focus-visible:outline-[#78b9ff] disabled:opacity-50"><ActionIcon kind="trash"/>Excluir</button></div><button type="button" onClick={()=>{setSelected([]);setMenuId(null);}} aria-label="Cancelar seleção" style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 text-[#adadad] hover:bg-[#383838] focus-visible:outline-2 focus-visible:outline-[#78b9ff]"><span aria-hidden="true">×</span>{selectedRows.length} selecionados</button></>}
    </div>
    <h1 style={{marginTop:7,marginLeft:8,fontSize:24,lineHeight:"32px",letterSpacing:"normal"}} className="font-semibold">Lixeira</h1>
    {params.error&&<p role="alert" className="rounded-md bg-status-error-soft p-3 text-status-error">{params.error==="conflict"?"Conflito no destino. Informe outro nome para restaurar.":"Não foi possível concluir a operação."}</p>}
    {params.saved&&<p role="status" className="rounded-md bg-nite-brand-soft p-3 text-nite-text-primary">Restauração concluída.</p>}
    {message&&<p role="alert" className="rounded-md bg-status-warning-soft p-3 text-status-warning">{message}</p>}
    {issue?<div role="alert" className="rounded-[12px] bg-[#252525] p-6">Não foi possível carregar a Lixeira. <button type="button" onClick={()=>router.refresh()} className="text-[#78b9ff] underline">Tentar novamente</button></div>
      :<div className="min-h-[calc(100svh-246px)] overflow-x-auto rounded-[12px] bg-[#292827]">
        <div className="px-px pt-px">
        <table className="w-full min-w-[1582px] table-fixed text-left text-[14px] leading-[normal]">
          <colgroup><col className="w-[45px]"/><col className="w-[566.25px]"/><col className="w-[215.72px]"/><col className="w-[269.66px]"/><col className="w-[269.64px]"/><col className="w-[215.73px]"/></colgroup>
          <thead><tr className="group h-12 border-b border-[#393939] text-[14px] font-semibold leading-[normal] text-[#adadad]"><th className="pl-[18px] font-semibold"><SelectionCheckbox checked={rows.length>0&&selectedRows.length===rows.length} label="Selecionar todas as linhas" onChange={()=>{setMenuId(null);setSelected(selectedRows.length===rows.length?[]:rows.map((entry)=>entry.item.id));}}/></th><th className="pl-2 font-semibold"><Link href={sortUrl("name",sortDirection("name"))} className="inline-flex items-center gap-3 hover:text-white focus-visible:outline-2 focus-visible:outline-[#78b9ff]">Nome <span aria-hidden="true">{params.sortBy==="name"?(params.direction==="desc"?"↓":"↑"):"⌄"}</span></Link></th><th className="pl-2 font-semibold"><Link href={sortUrl("deletedAt",sortDirection("deletedAt"))} className="inline-flex items-center gap-3 hover:text-white focus-visible:outline-2 focus-visible:outline-[#78b9ff]">Excluído <span aria-hidden="true">{params.sortBy==="deletedAt"&&params.direction==="asc"?"↑":"↓"}</span></Link></th><th className="pl-2 font-semibold">Excluído por</th><th className="pl-2 font-semibold">Criada por</th><th className="pl-2 font-semibold">Tamanho do arquivo</th></tr></thead>
          <tbody>{rows.map((entry)=>{const item=entry.item,isSelected=selected.includes(item.id);return <tr key={item.id} aria-selected={isSelected} className={`group h-14 border-b border-[#393939] last:border-b-0 transition-all ${isSelected?"bg-[#0c3b5e] hover:bg-[#10456c]":"hover:bg-[#303030]"}`} onClick={(event)=>{if(event.target instanceof HTMLElement&&event.target.closest("button,input,a"))return;setSelected((current)=>selectTrashItem(current,item.id,"row"));setMenuId(null);}}>
            <td className="pl-[18px]"><SelectionCheckbox checked={isSelected} label={`Selecionar ${item.name}`} onChange={()=>{setMenuId(null);setSelected((current)=>selectTrashItem(current,item.id,"checkbox"));}}/></td>
            <td><div className="flex min-w-0 items-center gap-4 pl-2 pr-3"><TrashIcon name={item.name} type={item.type}/><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-normal leading-[19px] text-white" title={item.name}>{item.name}</div><div className="truncate text-[12px] leading-4 text-[#adadad]">{item.originalFolderId&& !item.originalFolderName?"Local indisponível":`Meus Arquivos${item.originalFolderName?` > ${item.originalFolderName}`:""}`}</div></div><div className="relative shrink-0"><button type="button" aria-label={`Mais ações para ${item.name}`} aria-haspopup="menu" aria-expanded={menuId===item.id} onClick={(event)=>{event.stopPropagation();setSelected([item.id]);setMenuId(menuId===item.id?null:item.id);}} className="invisible -ml-1 h-7 w-7 rounded p-1 text-lg leading-none hover:bg-[#555] focus:visible focus-visible:outline-2 focus-visible:outline-[#78b9ff] group-hover:visible">···</button><div role="menu" hidden={menuId!==item.id} style={{boxShadow:"0px 3.2px 7.2px rgba(0,0,0,.133), 0px .6px 1.8px rgba(0,0,0,.11)"}} className="absolute -left-px -mt-px top-full z-20 w-60 rounded-md bg-[#292929] p-1"><button role="menuitem" type="button" disabled={!entry.capabilities.canRestore||busy} title={entry.capabilities.deniedReasons.canRestore} onClick={()=>{setMenuId(null);openRestore(entry);}} style={{fontSize:14,lineHeight:"36px",fontWeight:400}} className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-[#d6d6d6] hover:bg-[#3a3a3a] disabled:opacity-50"><ActionIcon kind="restore"/>Restaurar</button><button role="menuitem" type="button" disabled={busy} onClick={()=>{setMenuId(null);void loadPreview(item.id);}} style={{fontSize:14,lineHeight:"36px",fontWeight:400}} className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-[#d6d6d6] hover:bg-[#3a3a3a] disabled:opacity-50"><ActionIcon kind="trash"/>Excluir</button></div></div></div></td>
            <td title={date(item.deletedAt)} className="truncate pr-3 text-[#adadad]">{deletedDate(item.deletedAt)}</td><td className="truncate pr-3 text-[#adadad]" title={item.deletedByName??"Não informado"}>{item.deletedByName??"Não informado"}</td><td className="truncate pr-3 text-[#adadad]" title={item.createdByName??"Não informado"}>{item.createdByName??"Não informado"}</td><td className="truncate pr-3 text-[#adadad]">{size(item.size)}</td>
          </tr>;})}</tbody>
        </table>
        </div>
        {rows.length===0&&<p className="p-8 text-center text-[#aaa]">A Lixeira está vazia.</p>}
      </div>}
    {listing&&(listing.hasMore||listing.offset>0)&&<nav aria-label="Páginas da Lixeira" className="flex justify-between text-[13px] text-[#b6b6b6]"><Link href={pageUrl(Math.max(0,listing.offset-listing.limit))} aria-disabled={listing.offset===0} className={listing.offset===0?"pointer-events-none opacity-50":"hover:underline"}>Anterior</Link><span>{listing.offset+1}–{listing.offset+rows.length}</span><Link href={pageUrl(listing.offset+listing.limit)} aria-disabled={!listing.hasMore} className={!listing.hasMore?"pointer-events-none opacity-50":"hover:underline"}>Próxima</Link></nav>}
    {restoring&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="restore-title" className="w-full max-w-md rounded-dialog bg-nite-surface p-6 shadow-nite-modal"><h2 id="restore-title" className="font-display text-type-section-title text-nite-text-primary">Restaurar {restoring.item.name}</h2><p className="mt-2 text-type-body-compact text-nite-text-secondary">O destino original será usado. Em caso de conflito, informe um novo nome e tente novamente.</p><form action={restoreTrashItem} className="mt-4 grid gap-4"><input type="hidden" name="id" value={restoring.item.id}/><input type="hidden" name="returnTo" value="/documentos/lixeira"/><label className="grid gap-1 text-type-body-compact text-nite-text-secondary">Novo nome opcional<input name="name" value={name} onChange={(event)=>setName(event.target.value)} maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><div className="flex justify-end gap-3"><button type="button" onClick={()=>setRestoring(null)} className="min-h-10 px-3 text-nite-text-secondary">Cancelar</button><button type="submit" className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-white">Restaurar</button></div></form></section></div>}
    {preview&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="purge-title" className="max-h-[85svh] w-full max-w-lg overflow-y-auto rounded-dialog bg-nite-surface p-6 shadow-nite-modal"><h2 id="purge-title" className="font-display text-type-section-title text-nite-text-primary">Prévia do descarte</h2><p className="mt-2 text-type-body-compact text-nite-text-secondary">{previews.length} item(ns) · {size(previews.reduce((total,item)=>total+item.estimatedBytes,0))} estimados</p><ul className="mt-4 grid gap-2">{previews.map((item)=><li key={item.resourceId} className="rounded-control bg-nite-surface-subtle p-3 text-type-body-compact text-nite-text-primary">{item.resourceType} · {item.itemCount} item(ns) · {item.decision==="ELIGIBLE"?"Elegível":trashBlockReason(item.reasonCode)}</li>)}</ul>{"truncated" in preview&&preview.truncated&&<p role="alert" className="mt-3 text-status-warning">A prévia excede o limite do lote.</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" onClick={()=>setPreview(null)} className="min-h-10 px-3 text-nite-text-secondary">Fechar</button><button type="button" disabled={!canSubmit||busy} title={!canSubmit?"Há bloqueios ou liberação operacional pendente.":undefined} onClick={()=>void submitPurge()} className="min-h-10 rounded-control bg-status-error px-4 text-white disabled:cursor-not-allowed disabled:opacity-50">Solicitar descarte</button></div></section></div>}
    {operation&&<section aria-label="Progresso do descarte" className="rounded-panel border border-nite-border-soft bg-nite-surface p-4 text-type-body-compact text-nite-text-primary"><h2 className="font-semibold">Operação {operation.operation.status}</h2><p>{operation.purgedObjects} de {operation.objectCount} objetos processados · {operation.failedObjects} falhas · {operation.blockedObjects} bloqueios</p>{operation.operation.resultCode&&<p>{trashBlockReason(operation.operation.resultCode)}</p>}</section>}
    {batchOpen&&<DocumentBatchDialog items={rows.filter((entry)=>selected.includes(entry.item.id)).map((entry):BatchResource=>({id:entry.item.id,type:entry.item.type,name:entry.item.name}))} actions={["RESTORE"]} onClose={()=>setBatchOpen(false)} onDone={(result)=>{setBatchOpen(false);setSelected([]);setMessage(result);router.refresh();}}/>}
  </section>;
}
