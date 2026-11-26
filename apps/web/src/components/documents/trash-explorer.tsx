"use client";
import { TransientFeedback } from "../ui/transient-feedback";

import Link from "next/link";
import { ProjectDocumentActionDialog } from "../projects/project-document-action-dialog";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback,useEffect,useRef,useState } from "react";
import type { TrashEntry,TrashListing } from "../../lib/documents/library-contracts";

type Operation={id:string;status:string;itemCount:number;estimatedBytes:number;resultCode:string|null};
type Progress={operation:Operation;items?:{reasonCode:string|null}[];selectedCount?:number};
type PurgeTarget=string|string[]|"empty";
type BatchResource={id:string;type:"DOCUMENT"|"FOLDER";name:string};
type BatchResult={action:"RESTORE";items:{type:"DOCUMENT"|"FOLDER";id:string;sourceId:string}[]};
type FeedbackKind="success"|"pending"|"error";
type Feedback={id:number;text:string;kind:FeedbackKind};
const terminalPurgeStatuses=new Set(["COMPLETED","FAILED","BLOCKED","BLOCKED_POLICY"]);
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
export function purgeConfirmationCopy(target:PurgeTarget,itemName?:string) {
  if(target==="empty")return {title:"Esvaziar lixeira?",message:"Todos os itens elegíveis serão excluídos permanentemente e não poderão ser recuperados."};
  const targets=Array.isArray(target)?target:[target];
  return targets.length===1
    ? {title:"Excluir permanentemente?",message:`Tem certeza de que deseja excluir permanentemente este item “${itemName??""}” da Lixeira? Ele não poderá ser recuperado.`}
    : {title:"Excluir permanentemente?",message:"Tem certeza de que deseja excluir permanentemente esses itens da Lixeira? Eles não poderão ser recuperados."};
}
export function purgeOutcomeMessage(progress:Progress[]) {
  const completed=progress.filter(({operation})=>operation.status==="COMPLETED");
  const failed=progress.filter(({operation})=>!terminalPurgeStatuses.has(operation.status)||operation.status!=="COMPLETED");
  if(completed.length===progress.length) {
    const count=completed.reduce((total,{operation,selectedCount})=>total+(selectedCount??operation.itemCount),0);
    return `${count} ${count===1?"item excluído":"itens excluídos"}`;
  }
  const code=failed.flatMap(({operation,items=[]})=>[operation.resultCode,...items.map(item=>item.reasonCode)]).find((value):value is string=>Boolean(value));
  const reason=code?({
    PRESERVATION_REFERENCE:"Há uma referência documental protegida.",REFERENCE_EXISTS:"Há uma referência documental protegida.",
    HOLD:"O item está protegido por uma retenção.",PROTECTED:"O item está protegido e não pode ser excluído.",
    OUT_OF_SCOPE:"Você não tem permissão para excluir este item.",OPERATIONAL_RELEASE_REQUIRED:"A liberação institucional ainda não foi aprovada.",
    POLICY_NOT_APPROVED:"A política institucional ainda não permite a exclusão.",RETENTION_NOT_CONFIGURED:"A política de retenção não está configurada.",
    RETENTION_PERIOD:"O prazo de retenção ainda não terminou.",PROCESSING_DISABLED:"O processamento de descarte está desabilitado neste ambiente."
  } as Record<string,string>)[code]:undefined;
  if(completed.length===0)return reason?`Não foi possível excluir os itens. ${reason}`:"Não foi possível excluir os itens.";
  const count=completed.reduce((total,{operation,selectedCount})=>total+(selectedCount??operation.itemCount),0);
  return `${count} ${count===1?"item excluído":"itens excluídos"}. Não foi possível excluir os demais itens${reason?`. ${reason}`:"."}`;
}
export function purgeSubmissionFailureMessage(progress:Progress[],failureReasons:readonly string[]=[]) {
  if(!progress.length)return failureReasons[0]??"Não foi possível excluir os itens.";
  const completed=progress.filter(({operation})=>operation.status==="COMPLETED");
  const pending=progress.filter(({operation})=>!terminalPurgeStatuses.has(operation.status));
  const blocked=progress.filter(({operation})=>terminalPurgeStatuses.has(operation.status)&&operation.status!=="COMPLETED");
  const completedCount=completed.reduce((total,{operation,selectedCount})=>total+(selectedCount??operation.itemCount),0);
  const pendingCount=pending.reduce((total,{operation,selectedCount})=>total+(selectedCount??operation.itemCount),0);
  const parts:string[]=[];
  if(completedCount)parts.push(`${completedCount} ${completedCount===1?"item excluído.":"itens excluídos."}`);
  if(blocked.length)parts.push(purgeOutcomeMessage(blocked));
  if(pendingCount)parts.push(`${pendingCount} ${pendingCount===1?"item está":"itens estão"} em processamento.`);
  parts.push(failureReasons[0]??"Não foi possível solicitar a exclusão dos demais itens.");
  return parts.join(" ");
}

function isBatchResult(value:unknown):value is BatchResult {
  return typeof value==="object"&&value!==null&&"action" in value&&value.action==="RESTORE"&&"items" in value&&Array.isArray(value.items)
    &&value.items.every((item:unknown)=>typeof item==="object"&&item!==null&&"type" in item&&(item.type==="DOCUMENT"||item.type==="FOLDER")
      &&"id" in item&&typeof item.id==="string"&&"sourceId" in item&&typeof item.sourceId==="string");
}
export function restoreFailureMessage(status:number,detail?:string) {
  const normalized=detail?.toLocaleLowerCase("pt-BR")??"";
  if(status===409&&normalized.includes("nome"))return "Já existe um item com este nome na pasta original. Libere o nome e tente restaurar novamente.";
  if(status===409&&normalized.includes("pasta original"))return "A pasta original não está disponível. Nenhum item foi movido nem renomeado.";
  if(status===409&&normalized.includes("lixeira"))return "Um ou mais itens não estão disponíveis para restauração nesta Lixeira ou estão protegidos por política. Nada foi alterado.";
  if(status===409)return "O estado da seleção mudou. Atualize a Lixeira e tente restaurar novamente.";
  if(status===400)return "A seleção não pode ser restaurada. Atualize a Lixeira e tente novamente.";
  if(status===401||status===403)return "Sua autorização ou a política documental impede a restauração.";
  if(status===404)return "Um ou mais itens não estão mais na Lixeira.";
  return "Não foi possível restaurar os itens. Tente novamente.";
}
export function restoredCountMessage(result:BatchResult,requested:readonly BatchResource[]) {
  const expected=new Set(requested.map(({type,id})=>`${type}:${id}`));
  const actual=result.items.map(({type,id,sourceId})=>`${type}:${id===sourceId?id:"invalid"}`);
  if(result.action!=="RESTORE"||result.items.length!==expected.size||actual.some((key)=>!expected.has(key))||new Set(actual).size!==expected.size)
    throw new Error("Não foi possível confirmar a restauração. Atualize a Lixeira e tente novamente.");
  return `${result.items.length} ${result.items.length===1?"item restaurado":"itens restaurados"}`;
}
export async function requestTrashRestore(items:readonly BatchResource[],idempotencyKey:string) {
  const response=await fetch(endpoint("/api/v1/library/operations/batch"),{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":idempotencyKey},
    body:JSON.stringify({action:"RESTORE",items,destinationId:null}),cache:"no-store"});
  if(!response.ok)throw new Error(restoreFailureMessage(response.status,await problemDetail(response)));
  const result:unknown=await response.json();
  if(!isBatchResult(result))throw new Error("Não foi possível confirmar a restauração. Atualize a Lixeira e tente novamente.");
  return result;
}

async function problemDetail(response:Response):Promise<string|undefined> {
  try {
    const body:unknown=await response.json();
    return typeof body==="object"&&body!==null&&"detail" in body&&typeof body.detail==="string"?body.detail:undefined;
  } catch {return undefined;}
}
function apiFailureMessage(status:number,detail?:string) {
  const normalized=detail?.toLocaleLowerCase("pt-BR")??"";
  if(normalized.includes("referência documental")||normalized.includes("referências documentais"))return "Há uma referência documental protegida; o descarte foi bloqueado.";
  if(normalized.includes("retenção")||normalized.includes("política"))return "A política de retenção impede o descarte deste item.";
  if(status===403||status===404)return "Você não tem autorização para descartar um ou mais itens.";
  if(status===409)return "O estado da Lixeira mudou. Atualize a lista e tente novamente.";
  return "Não foi possível solicitar o descarte dos itens.";
}

function clearQueryParam(queryParam:string|undefined,queryValue:string|undefined) {
  if(!queryParam||!queryValue)return;
  const url=new URL(window.location.href);
  if(url.searchParams.get(queryParam)!==queryValue)return;
  url.searchParams.delete(queryParam);
  window.history.replaceState(window.history.state,"",`${url.pathname}${url.search}${url.hash}`);
}
export function TrashToast({messageKey,message,kind,queryParam,queryValue,occurrenceKey,onDismiss,actionHref,actionLabel}:{messageKey:string;message:string;kind:FeedbackKind;queryParam?:string;queryValue?:string;occurrenceKey?:object;onDismiss?:()=>void;actionHref?:string;actionLabel?:string}) {
  const [visible,setVisible]=useState(true);
  function dismiss() {clearQueryParam(queryParam,queryValue);setVisible(false);onDismiss?.();}
  if(!visible)return null;
  const icon=kind==="success"?<path d="m5 10 3.1 3.1L15 6.5" strokeLinecap="round" strokeLinejoin="round"/>:kind==="pending"?<><circle cx="10" cy="10" r="6.5"/><path d="M10 6v4l2.5 1.5" strokeLinecap="round"/></>:<><path d="M10 6v5" strokeLinecap="round"/><circle cx="10" cy="14.5" r=".7" fill="currentColor" stroke="none"/></>;
  const iconTone=kind==="success"?"bg-[#107c10] text-white":kind==="pending"?"bg-[#deecf9] text-[#0078d4]":"bg-[#fde7e9] text-[#a4262c]";
  return <TransientFeedback messageKey={messageKey} queryParam={queryParam} occurrenceKey={occurrenceKey} onDismiss={()=>{setVisible(false);onDismiss?.();}}
    className="fixed bottom-4 left-1/2 z-[90] w-[calc(100%-2rem)] max-w-[390px] -translate-x-1/2">
    <div role={kind==="error"?"alert":"status"} aria-live={kind==="error"?"assertive":"polite"} className="flex min-h-12 items-center gap-3 rounded-[4px] border border-[#dedede] bg-[#f5f5f5] px-3 py-2 text-left text-[13px] leading-[18px] text-[#242424] shadow-[0_4px_12px_rgba(0,0,0,.24)]">
      <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full ${iconTone}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">{icon}</svg></span>
      <span className={`min-w-0 flex-1 ${actionHref&&actionLabel?"flex flex-col items-start gap-1":""}`}><span>{message}</span>{actionHref&&actionLabel&&<Link href={actionHref} className="text-[#0078d4] hover:underline">{actionLabel}</Link>}</span>
      <button type="button" aria-label="Fechar notificação" onClick={dismiss} className="grid size-6 shrink-0 place-items-center rounded-[4px] text-[#666] hover:bg-[#e5e5e5] focus-visible:outline-2 focus-visible:outline-[#0078d4]">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 5 10 10M15 5 5 15" strokeLinecap="round"/></svg>
      </button>
    </div>
  </TransientFeedback>;
}

export function PurgeConfirmationDialog({target,itemName,busy,onCancel,onConfirm}:{target:PurgeTarget;itemName?:string;busy:boolean;onCancel:()=>void;onConfirm:()=>void}) {
  const copy=purgeConfirmationCopy(target,itemName);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="purge-title" aria-describedby="purge-message" onKeyDown={(event)=>{if(event.key==="Escape"&&!busy)onCancel();}}
      className="w-full max-w-[480px] rounded-[4px] border border-nite-border-soft bg-nite-surface px-6 pb-5 pt-5 shadow-nite-modal">
      <header className="flex items-center justify-between gap-4">
        <h2 id="purge-title" className="text-[20px] font-semibold leading-7 text-nite-text-primary">{copy.title}</h2>
        <button type="button" autoFocus aria-label="Fechar" disabled={busy} onClick={onCancel} className="grid size-8 shrink-0 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m5 5 10 10M15 5 5 15" strokeLinecap="round"/></svg>
        </button>
      </header>
      <p id="purge-message" className="mt-3 text-[14px] leading-5 text-nite-text-secondary">{copy.message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onConfirm} className="min-h-9 rounded-[4px] border border-status-error-border bg-transparent px-4 text-[14px] font-semibold text-status-error hover:bg-status-error-soft focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50">Excluir</button>
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-9 rounded-[4px] bg-nite-brand-primary px-4 text-[14px] font-semibold text-white hover:brightness-95 focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50">Cancelar</button>
      </div>
    </section>
  </div>;
}
export function selectTrashItem(current:string[],id:string,source:"row"|"checkbox") {
  if(source==="row")return [id];
  return current.includes(id)?current.filter((selected)=>selected!==id):[...current,id];
}
const endpoint=(path:string)=>`/api/library/manage?path=${encodeURIComponent(path)}`;
async function jsonRequest<T>(path:string,method:"GET"|"POST",body?:object,headers?:Record<string,string>):Promise<T> {
  const response=await fetch(endpoint(path),{method,headers:{...(body?{"Content-Type":"application/json"}:{}),...headers},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  if(!response.ok)throw new Error(apiFailureMessage(response.status,await problemDetail(response)));
  return response.json() as Promise<T>;
}
export function TrashExplorer({listing,issue,params,projectContext}:Props) {
  const router=useRouter();
  const trashPath=projectContext?.basePath??"/documentos/lixeira";
  const [requestedItem,setRequestedItem]=useState<TrashEntry|null>(null);
  const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState<Feedback|null>(null);
  const [purgeTarget,setPurgeTarget]=useState<PurgeTarget|null>(null),[purgeItemName,setPurgeItemName]=useState<string|undefined>();
  const purgeKeys=useRef(new Map<string,string>());
  const restoreKeys=useRef(new Map<string,string>()),restoreInFlight=useRef(false),purgeInFlight=useRef(false),feedbackSequence=useRef(0);
  const [operations,setOperations]=useState<Progress[]>([]);
  const [menuId,setMenuId]=useState<string|null>(null);
  const rows=listing?.items??[];
  const showMessage=useCallback((text:string,kind:FeedbackKind)=>{
    feedbackSequence.current+=1;
    setMessage({id:feedbackSequence.current,text,kind});
  },[]);
  useEffect(()=>{
    if(!operations.length||operations.every((operation)=>terminalPurgeStatuses.has(operation.operation.status)))return;
    let polling=false;
    const timer=setInterval(()=>{if(polling)return;polling=true;void Promise.all(operations.map((operation)=>terminalPurgeStatuses.has(operation.operation.status)?Promise.resolve(operation):jsonRequest<Progress>(`/api/v1/me/trash/purge-operations/${operation.operation.id}`,"GET")))
      .then((updates)=>{const results=updates.map((result)=>({...result,selectedCount:operations.find(({operation})=>operation.id===result.operation.id)?.selectedCount??result.operation.itemCount}));
        const updatedIds=new Set(results.map(({operation})=>operation.id));if(results.every((operation)=>terminalPurgeStatuses.has(operation.operation.status))){showMessage(purgeOutcomeMessage(results),results.every(({operation})=>operation.status==="COMPLETED")?"success":"error");router.refresh();}
        setOperations(current=>{const untouched=current.filter(({operation})=>!updatedIds.has(operation.id));return results.every((operation)=>terminalPurgeStatuses.has(operation.operation.status))?untouched:[...untouched,...results];});})
      .catch(()=>showMessage("Ainda não foi possível consultar o resultado da exclusão.","error"))
      .finally(()=>{polling=false;});},2500);
    return()=>clearInterval(timer);
  },[operations,router,showMessage]);
  async function restoreItems(entries:TrashEntry[]) {
    if(!entries.length||busy||restoreInFlight.current)return;
    restoreInFlight.current=true;setBusy(true);
    const items=entries.map(({item}):BatchResource=>({id:item.id,type:item.type,name:item.name})).sort((left,right)=>`${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
    const signature=items.map(({type,id})=>`${type}:${id}`).sort().join("|");
    const idempotencyKey=restoreKeys.current.get(signature)??crypto.randomUUID();
    restoreKeys.current.set(signature,idempotencyKey);
    showMessage(items.length===1?"Restaurando item…":"Restaurando itens…","pending");
    try {
      const result=await requestTrashRestore(items,idempotencyKey);
      const confirmed=restoredCountMessage(result,items);
      restoreKeys.current.delete(signature);setSelected([]);showMessage(confirmed,"success");router.refresh();
    } catch(error) {
      const copy=error instanceof Error&&([400,401,403,404,409].some((status)=>error.message===restoreFailureMessage(status))||error.message.startsWith("Não foi possível confirmar"))
        ?error.message:"Não foi possível restaurar os itens. Tente novamente.";
      showMessage(copy,"error");
    } finally {restoreInFlight.current=false;setBusy(false);}
  }
  function targetIds(target:PurgeTarget) {
    return target==="empty"?["empty"]:Array.isArray(target)?target:[target];
  }
  function openPurge(target:PurgeTarget,itemName?:string) {
    const requested=Array.isArray(target)?target:[target];
    const seenUnits=new Set<string>();
    const normalized=target==="empty"?target:requested.filter(id=>{
      const item=rows.find(entry=>entry.item.id===id)?.item;
      const unit=item?.batchId?`batch:${item.batchId}`:`item:${id}`;
      if(seenUnits.has(unit))return false;
      seenUnits.add(unit);return true;
    });
    if(projectContext&&normalized!=="empty"&&targetIds(normalized).some(id=>!rows.find(entry=>entry.item.id===id)?.capabilities.canPermanentlyDelete))return;
    for(const id of targetIds(normalized))if(!purgeKeys.current.has(id))purgeKeys.current.set(id,crypto.randomUUID());
    setMessage(null);setPurgeTarget(normalized);setPurgeItemName(itemName);
  }
  function closePurge() {
    if(purgeTarget)for(const id of targetIds(purgeTarget))purgeKeys.current.delete(id);
    setPurgeTarget(null);setPurgeItemName(undefined);
  }
  async function submitPurge() {
    if(!purgeTarget||busy||purgeInFlight.current)return;
    purgeInFlight.current=true;
    setBusy(true);setMessage(null);
    try {
      const targets=targetIds(purgeTarget);
      let emptyRootCount=0;
      if(targets.includes("empty")) {
        const preview=await jsonRequest<{items:unknown[];truncated:boolean}>("/api/v1/me/trash/empty/preview?limit=200","POST");
        if(preview.truncated)throw new Error("A Lixeira excede o limite de exclusão em lote. Exclua os itens elegíveis por partes.");
        emptyRootCount=preview.items.length;
      }
      const progress:Progress[]=[];const failureReasons:string[]=[];
      for(const target of targets){
        const path=target==="empty"?"/api/v1/me/trash/empty":`/api/v1/me/trash/${target}/purge`;
        try{
          const result=await jsonRequest<Operation>(path,"POST",undefined,{"Idempotency-Key":purgeKeys.current.get(target)??crypto.randomUUID(),"X-Confirm-Purge":"true"});
          progress.push({operation:result,selectedCount:target==="empty"?emptyRootCount:1});purgeKeys.current.delete(target);
        } catch(error) { failureReasons.push(error instanceof Error?error.message:"Não foi possível solicitar o descarte dos itens."); }
      }
      setPurgeTarget(null);setPurgeItemName(undefined);
      if(progress.length){
        const terminal=progress.filter(({operation})=>terminalPurgeStatuses.has(operation.status));
        const pending=progress.filter(({operation})=>!terminalPurgeStatuses.has(operation.status));
        if(pending.length){const count=pending.reduce((total,{operation,selectedCount})=>total+(selectedCount??operation.itemCount),0);showMessage(count===1?"Excluindo item…":"Excluindo itens…","pending");}
        else showMessage(purgeOutcomeMessage(terminal),terminal.every(({operation})=>operation.status==="COMPLETED")?"success":"error");
        if(pending.length)setOperations(current=>[...current,...progress]);
        if(terminal.length&&!pending.length)router.refresh();
        setSelected([]);
      }
      if(failureReasons.length>0)showMessage(purgeSubmissionFailureMessage(progress,failureReasons),progress.some(({operation})=>!terminalPurgeStatuses.has(operation.status))?"pending":"error");
    } catch(error) {
      closePurge();
      showMessage(error instanceof Error?error.message:"Não foi possível consultar os itens da Lixeira.","error");
    } finally {purgeInFlight.current=false;setBusy(false);}
  }
  const pageUrl=(offset:number)=>`${trashPath}?${new URLSearchParams({offset:String(offset),...(params.type?{type:params.type}:{}),...(params.sortBy?{sortBy:params.sortBy}:{}),...(params.direction?{direction:params.direction}:{})})}`;
  const selectedRows=rows.filter((entry)=>selected.includes(entry.item.id));
  const sortUrl=(sortBy:"name"|"deletedAt",direction:"asc"|"desc")=>`${trashPath}?${new URLSearchParams({sortBy,direction,...(params.type?{type:params.type}:{})})}`;
  const sortDirection=(sortBy:"name"|"deletedAt")=>params.sortBy===sortBy&&params.direction==="asc"?"desc":"asc";
  return <section style={{fontFamily:'"Segoe UI", Tahoma, Arial, sans-serif'}} className={`flex min-w-0 flex-col gap-3 ${projectContext?"document-project-trash min-h-0 flex-1 text-nite-text-primary":"min-h-[calc(100svh-9rem)] gap-5 text-nite-text-primary lg:-ml-[17px] lg:-mr-[23px] lg:-mt-7"}`} aria-label="Lixeira documental">
    {!projectContext&&<h1 className="font-display text-type-page-title font-semibold text-nite-text-primary">Lixeira</h1>}
    {projectContext&&<nav aria-label="Documentos do projeto" className="flex flex-wrap gap-4 border-b border-nite-border-soft text-type-body-compact"><Link href={projectContext.libraryPath} className="min-h-10 py-2 text-nite-text-secondary">Documentos</Link><span aria-current="page" className="min-h-10 border-b-2 border-nite-brand-primary py-2 font-medium text-nite-brand-primary">Lixeira</span></nav>}
    <div className={`flex min-h-[52px] items-center justify-between rounded-[12px] px-2 ${selectedRows.length>0?(projectContext?"bg-nite-surface-elevated":"bg-nite-surface-elevated"):"bg-transparent"}`}>
      {selectedRows.length===0?projectContext?<span/>:<button type="button" onClick={()=>openPurge("empty")} disabled={busy||rows.length===0} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-1.5 rounded-[11px] border border-nite-border-control pl-[10px] pr-3 hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50"><ActionIcon kind="trash"/>Esvaziar lixeira</button>
        :<><div className="flex items-center gap-1"><button type="button" disabled={busy||!selectedRows.every((entry)=>entry.capabilities.canRestore)} onClick={()=>void restoreItems(selectedRows)} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50"><ActionIcon kind="restore"/>Restaurar</button><button type="button" disabled={busy||(!!projectContext&&!selectedRows.every(entry=>entry.capabilities.canPermanentlyDelete))} onClick={()=>openPurge(selectedRows.map((entry)=>entry.item.id),selectedRows.length===1?selectedRows[0]?.item.name:undefined)} style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:opacity-50"><ActionIcon kind="trash"/>Excluir</button></div><button type="button" onClick={()=>{setSelected([]);setMenuId(null);}} aria-label="Cancelar seleção" style={{fontSize:14,lineHeight:"normal",fontWeight:600}} className="flex min-h-9 items-center gap-2 rounded-md px-3 text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus"><span aria-hidden="true">×</span>{selectedRows.length} selecionados</button></>}
    </div>
    {params.error&&<TrashToast key={`error:${params.error}`} messageKey={params.error} queryParam="error" queryValue={params.error} occurrenceKey={params} kind="error" message={params.error==="conflict"?restoreFailureMessage(409):"Não foi possível concluir a operação."}/>}
    {params.saved&&<TrashToast key={`saved:${params.saved}`} messageKey={params.saved} queryParam="saved" queryValue={params.saved} occurrenceKey={params} kind="success" message="1 item restaurado"/>}
    {message&&<TrashToast key={message.id} messageKey={String(message.id)} kind={message.kind} message={message.text} onDismiss={()=>setMessage(null)}/>}
    {issue?<div role="alert" className="rounded-[12px] bg-nite-surface-elevated p-6">Não foi possível carregar a Lixeira. <button type="button" onClick={()=>router.refresh()} className="text-nite-brand-primary underline">Tentar novamente</button></div>
      :<div className={`document-data-grid-surface min-h-0 min-w-0 flex-1 overflow-auto rounded-[8px] ${projectContext?"":"min-h-[calc(100svh-246px)]"}`}>
        <div className="px-px pt-px">
        {rows.length===0?<div className="grid min-h-80 flex-1 place-content-center gap-2 px-5 text-center"><p className={`font-display text-[20px] font-semibold leading-[27px] ${"text-nite-text-primary"}`}>A Lixeira está vazia</p><p className={`max-w-md text-xs leading-4 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}>Os itens excluídos desta biblioteca aparecerão aqui.</p></div>:<table className={`w-full ${projectContext ? "min-w-[760px]" : "min-w-[1582px]"} table-fixed text-left text-[14px] leading-[normal]`}>
          <colgroup>{projectContext?<><col className="w-[45px]"/><col className="w-[32%]"/><col className="w-[15%]"/><col className="w-[17%]"/><col className="w-[17%]"/><col className="w-[12%]"/></>:<><col className="w-[45px]"/><col className="w-[566.25px]"/><col className="w-[215.72px]"/><col className="w-[269.66px]"/><col className="w-[269.64px]"/><col className="w-[215.73px]"/></>}</colgroup>
          <thead className="document-data-grid-surface sticky top-0 z-10"><tr className={`group h-12 border-b text-[14px] font-medium leading-[normal] ${projectContext?"border-nite-border-soft text-nite-text-secondary":"border-nite-border-soft text-nite-text-secondary"}`}><th className="pl-[18px] font-medium"><SelectionCheckbox checked={rows.length>0&&selectedRows.length===rows.length} label="Selecionar todas as linhas" onChange={()=>{setMenuId(null);setSelected(selectedRows.length===rows.length?[]:rows.map((entry)=>entry.item.id));}}/></th><th className="pl-2 font-medium"><Link href={sortUrl("name",sortDirection("name"))} className={`inline-flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-nite-focus ${projectContext?"hover:text-nite-text-primary":"hover:text-white"}`}>Nome <span aria-hidden="true">{params.sortBy==="name"?(params.direction==="desc"?"↓":"↑"):"⌄"}</span></Link></th><th className="pl-2 font-medium"><Link href={sortUrl("deletedAt",sortDirection("deletedAt"))} className={`inline-flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-nite-focus ${projectContext?"hover:text-nite-text-primary":"hover:text-white"}`}>Excluído <span aria-hidden="true">{params.sortBy==="deletedAt"&&params.direction==="asc"?"↑":"↓"}</span></Link></th><th className="pl-2 font-medium">Excluído por</th><th className="pl-2 font-medium">Criada por</th><th className="pl-2 font-medium">{projectContext?"Tamanho":"Tamanho do arquivo"}</th></tr></thead>
          <tbody>{rows.map((entry)=>{const item=entry.item,isSelected=selected.includes(item.id);return <tr key={item.id} aria-selected={isSelected} className={`group h-14 border-b last:border-b-0 transition-all ${projectContext?"border-nite-border-soft":"border-nite-border-soft"} ${isSelected?(projectContext?"bg-nite-brand-soft hover:bg-nite-brand-soft":"bg-nite-brand-soft hover:bg-nite-brand-soft"):(projectContext?"hover:bg-nite-surface-subtle":"hover:bg-nite-surface-subtle")}`} onClick={(event)=>{if(event.target instanceof HTMLElement&&event.target.closest("button,input,a"))return;setSelected((current)=>selectTrashItem(current,item.id,"row"));setMenuId(null);}}>
            <td className="pl-[18px]"><SelectionCheckbox checked={isSelected} label={`Selecionar ${item.name}`} onChange={()=>{setMenuId(null);setSelected((current)=>selectTrashItem(current,item.id,"checkbox"));}}/></td>
            <td><div className="flex min-w-0 items-center gap-4 pl-2 pr-3"><TrashIcon name={item.name} type={item.type}/><div className="min-w-0 flex-1"><div className={`truncate text-[14px] font-normal leading-[19px] ${"text-nite-text-primary"}`} title={item.name}>{item.name}</div>{projectContext&&<div className="text-[12px] text-nite-text-secondary">{item.resourceOwnerKind==="MEMBER"?"Pessoal":item.resourceOwnerKind==="PROJECT"?"Institucional · Projeto":item.resourceOwnerKind==="INSTITUTION"?"Institucional · NITE":"Titular não determinado"} · Origem: {item.origin}</div>}<div className={`truncate text-[12px] leading-4 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}>{item.originalFolderId&& !item.originalFolderName?"Local indisponível":`${projectContext?projectContext.name:"Meus Arquivos"}${item.originalFolderName?` > ${item.originalFolderName}`:""}`}</div></div><div className="relative shrink-0"><button type="button" aria-label={`Mais ações para ${item.name}`} aria-haspopup="menu" aria-expanded={menuId===item.id} onClick={(event)=>{event.stopPropagation();setSelected([item.id]);setMenuId(menuId===item.id?null:item.id);}} className="invisible -ml-1 h-7 w-7 rounded p-1 text-lg leading-none hover:bg-nite-surface-subtle focus:visible focus-visible:outline-2 focus-visible:outline-nite-focus group-hover:visible">···</button><div role="menu" hidden={menuId!==item.id} style={{boxShadow:"0px 3.2px 7.2px rgba(0,0,0,.133), 0px .6px 1.8px rgba(0,0,0,.11)"}} className="absolute -left-px -mt-px top-full z-20 w-60 rounded-md bg-nite-surface p-1"><button role="menuitem" type="button" disabled={!entry.capabilities.canRestore||busy} title={entry.capabilities.deniedReasons.canRestore} onClick={()=>{setMenuId(null);void restoreItems([entry]);}} style={{fontSize:14,lineHeight:"36px",fontWeight:400}} className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-nite-text-primary hover:bg-nite-surface-subtle disabled:opacity-50"><ActionIcon kind="restore"/>Restaurar</button><button role="menuitem" type="button" disabled={busy||(!!projectContext&&!entry.capabilities.canPermanentlyDelete)} title={entry.capabilities.deniedReasons.canPermanentlyDelete} onClick={()=>{setMenuId(null);openPurge(item.id,item.name);}} style={{fontSize:14,lineHeight:"36px",fontWeight:400}} className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-nite-text-primary hover:bg-nite-surface-subtle disabled:opacity-50"><ActionIcon kind="trash"/>Excluir</button>{projectContext?.canRequestActions&&!entry.capabilities.canPermanentlyDelete&&item.resourceOwnerKind==="PROJECT"&&<button role="menuitem" type="button" disabled={busy} onClick={()=>{setMenuId(null);setRequestedItem(entry);}} className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-nite-text-primary hover:bg-nite-surface-subtle">Solicitar descarte</button>}</div></div></div></td>
            <td title={date(item.deletedAt)} className={`truncate pr-3 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}>{deletedDate(item.deletedAt)}</td><td className={`truncate pr-3 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`} title={item.deletedByName??"Não informado"}>{item.deletedByName??"Não informado"}</td><td className={`truncate pr-3 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`} title={item.createdByName??"Não informado"}>{item.createdByName??"Não informado"}</td><td className={`truncate pr-3 ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}>{size(item.size)}</td>
          </tr>;})}</tbody>
        </table>}
        </div>
      </div>}
    {listing&&(listing.hasMore||listing.offset>0)&&<nav aria-label="Páginas da Lixeira" className={`flex justify-between text-[13px] ${projectContext?"text-nite-text-secondary":"text-nite-text-secondary"}`}><Link href={pageUrl(Math.max(0,listing.offset-listing.limit))} aria-disabled={listing.offset===0} className={listing.offset===0?"pointer-events-none opacity-50":"hover:underline"}>Anterior</Link><span>{listing.offset+1}–{listing.offset+rows.length}</span><Link href={pageUrl(listing.offset+listing.limit)} aria-disabled={!listing.hasMore} className={!listing.hasMore?"pointer-events-none opacity-50":"hover:underline"}>Próxima</Link></nav>}
    {purgeTarget&&<PurgeConfirmationDialog target={purgeTarget} itemName={purgeItemName} busy={busy} onCancel={closePurge} onConfirm={()=>void submitPurge()}/>}
    {requestedItem&&projectContext&&<ProjectDocumentActionDialog projectId={projectContext.id} resourceId={requestedItem.item.id} resourceType={requestedItem.item.type} name={requestedItem.item.name} action="PURGE" requestsPath={projectContext.requestsPath} onClose={()=>setRequestedItem(null)}/>}
  </section>;
}
