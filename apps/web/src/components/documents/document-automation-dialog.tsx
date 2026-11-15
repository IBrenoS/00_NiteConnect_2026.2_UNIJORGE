"use client";

import Link from "next/link";
import { useCallback,useEffect,useState } from "react";
import { parseFileRequestPage,validUuid,type FileRequestView } from "../../lib/documents/library-contracts";

type EventType="NEW_FILE_IN_FOLDER"|"FILE_REQUEST_FULFILLED"|"DOCUMENT_SHARED_WITH_ME";
type TargetType="FOLDER"|"DOCUMENT"|"REQUEST"|"SELF";
type Rule={id:string;ownerId:string;targetType:TargetType;targetId:string;eventType:EventType;enabled:boolean;createdAt:string;updatedAt:string};
type Delivery={id:string;eventType:EventType;resourceId:string|null;state:string;attempts:number;errorCode:string|null;createdAt:string;completedAt:string|null};
type Notification={id:string;eventType:EventType;resourceType:"DOCUMENT"|"FOLDER";resourceId:string;createdAt:string;readAt:string|null};
type Target={id:string;name:string;type:"DOCUMENT"|"FOLDER"};
const path=(value:string)=>`/api/library/manage?path=${encodeURIComponent(value)}`;
const eventLabel:Record<EventType,string>={NEW_FILE_IN_FOLDER:"Novo arquivo na pasta",FILE_REQUEST_FULFILLED:"Solicitação atendida",DOCUMENT_SHARED_WITH_ME:"Compartilhado comigo"};
const isEvent=(value:unknown):value is EventType=>value==="NEW_FILE_IN_FOLDER"||value==="FILE_REQUEST_FULFILLED"||value==="DOCUMENT_SHARED_WITH_ME";
const record=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const isRule=(value:unknown):value is Rule=>record(value)&&validUuid(value.id)&&validUuid(value.ownerId)
  &&(value.targetType==="FOLDER"||value.targetType==="DOCUMENT"||value.targetType==="REQUEST"||value.targetType==="SELF")&&validUuid(value.targetId)
  &&isEvent(value.eventType)&&typeof value.enabled==="boolean"&&typeof value.createdAt==="string"&&typeof value.updatedAt==="string";
const isDelivery=(value:unknown):value is Delivery=>record(value)&&validUuid(value.id)&&isEvent(value.eventType)
  &&(value.resourceId===null||validUuid(value.resourceId))&&typeof value.state==="string"&&typeof value.attempts==="number"
  &&(value.errorCode===null||typeof value.errorCode==="string")&&typeof value.createdAt==="string"
  &&(value.completedAt===null||typeof value.completedAt==="string");
const isNotification=(value:unknown):value is Notification=>record(value)&&validUuid(value.id)&&isEvent(value.eventType)
  &&(value.resourceType==="DOCUMENT"||value.resourceType==="FOLDER")&&validUuid(value.resourceId)
  &&typeof value.createdAt==="string"&&(value.readAt===null||typeof value.readAt==="string");
const date=(value:string)=>new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
async function request(url:string,method:"GET"|"POST"|"PATCH"|"DELETE"="GET",body?:object):Promise<unknown> {
  const response=await fetch(url,{method,headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store"});
  if(!response.ok)throw new Error(response.status===409?"Esta regra já existe ou mudou. Atualize e tente novamente.":response.status===403||response.status===404?"A operação não está autorizada neste recurso.":"Não foi possível concluir a operação.");
  return response.status===204?null:response.json();
}

export function DocumentAutomationDialog({memberId,target,onClose}:{memberId:string;target?:Target;onClose:()=>void}) {
  const [rules,setRules]=useState<Rule[]>([]),[notifications,setNotifications]=useState<Notification[]>([]);
  const [requests,setRequests]=useState<FileRequestView[]>([]),[folderAllowed,setFolderAllowed]=useState(false),[selfAllowed,setSelfAllowed]=useState(false);
  const [selectedRequest,setSelectedRequest]=useState(""),[history,setHistory]=useState<Delivery[]|null>(null),[historyRule,setHistoryRule]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    const [ruleValue,notificationValue,requestValue,folderValue,selfValue]=await Promise.all([
      request(path("/api/v1/me/document-automations")),request(path("/api/v1/me/document-notifications")),
      request(`${path("/api/v1/me/file-requests")}&role=REQUESTED&limit=50`),
      target?.type==="FOLDER"?request(`${path("/api/v1/me/document-automations/options")}&targetType=FOLDER&targetId=${encodeURIComponent(target.id)}`).catch(()=>[]):Promise.resolve([]),
      validUuid(memberId)?request(`${path("/api/v1/me/document-automations/options")}&targetType=SELF&targetId=${encodeURIComponent(memberId)}`):Promise.resolve([]),
    ]);
    if(!Array.isArray(ruleValue)||!ruleValue.every(isRule)||!Array.isArray(notificationValue)||!notificationValue.every(isNotification)
        ||!Array.isArray(folderValue)||!folderValue.every((item)=>typeof item==="string")
        ||!Array.isArray(selfValue)||!selfValue.every((item)=>typeof item==="string"))throw new Error("O serviço retornou dados inválidos.");
    const requestPage=parseFileRequestPage(requestValue);
    if(!requestPage)throw new Error("Não foi possível carregar as solicitações.");
    setRules(ruleValue);setNotifications(notificationValue);
    setRequests(requestPage.items.filter((item)=>item.status==="OPEN"));
    setFolderAllowed(folderValue.includes("NEW_FILE_IN_FOLDER"));
    setSelfAllowed(selfValue.includes("DOCUMENT_SHARED_WITH_ME"));
  },[memberId,target?.id,target?.type]);
  useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)void refresh().catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"Não foi possível carregar automações.");}).finally(()=>{if(active)setLoading(false);});});return()=>{active=false;};},[refresh]);
  async function mutate(action:()=>Promise<unknown>) {
    if(busy)return;setBusy(true);setError(null);
    try {await action();await refresh();if(historyRule)await loadHistory(historyRule);}
    catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível atualizar a automação.");}
    finally{setBusy(false);}
  }
  async function create(targetType:TargetType,targetId:string,eventType:EventType) {
    await mutate(()=>request(path("/api/v1/me/document-automations"),"POST",{targetType,targetId,eventType}));
  }
  async function loadHistory(id:string) {
    const value=await request(path(`/api/v1/me/document-automations/${id}/history`));
    if(!Array.isArray(value)||!value.every(isDelivery))throw new Error("Histórico inválido.");
    setHistory(value);setHistoryRule(id);
  }
  const exists=(type:TargetType,id:string,event:EventType)=>rules.some((rule)=>rule.targetType===type&&rule.targetId===id&&rule.eventType===event);
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <section role="dialog" aria-modal="true" aria-labelledby="automation-title" onKeyDown={(event)=>{if(event.key==="Escape")onClose();}} className="max-h-[90svh] w-full max-w-2xl overflow-y-auto rounded-dialog bg-nite-surface p-6 shadow-nite-modal">
      <header className="flex items-start justify-between gap-3"><div><h2 id="automation-title" className="font-display text-type-section-title text-nite-text-primary">Automações documentais</h2><p className="mt-1 text-type-body-compact text-nite-text-secondary">Notificações internas para eventos documentais. Nenhuma regra altera arquivos ou permissões.</p></div><div className="flex items-center gap-2"><button type="button" disabled={busy||loading} onClick={()=>void refresh().catch(()=>setError("Não foi possível atualizar as notificações."))} className="min-h-9 rounded-control px-2 text-type-body-compact text-nite-brand-primary disabled:opacity-50">Atualizar</button><button type="button" onClick={onClose} aria-label="Fechar automações" className="size-9 rounded-control text-nite-text-secondary">×</button></div></header>
      {error&&<p role="alert" className="mt-4 rounded-control bg-status-error-soft p-3 text-type-body-compact text-status-error">{error}</p>}
      {loading?<p role="status" className="mt-5 text-nite-text-secondary">Carregando automações…</p>:<div className="mt-5 grid gap-6">
        <section aria-label="Criar automação" className="grid gap-3 rounded-panel border border-nite-border-soft p-4"><h3 className="font-semibold text-nite-text-primary">Criar regra</h3>
          {target?.type==="FOLDER"&&folderAllowed&&<div className="flex items-center justify-between gap-3"><p className="text-type-body-compact text-nite-text-secondary">Novo arquivo em {target.name}</p><button type="button" disabled={busy||exists("FOLDER",target.id,"NEW_FILE_IN_FOLDER")} onClick={()=>void create("FOLDER",target.id,"NEW_FILE_IN_FOLDER")} className="min-h-9 rounded-control border border-nite-border-control px-3 text-nite-brand-primary disabled:opacity-50">Monitorar</button></div>}
          {selfAllowed&&<div className="flex items-center justify-between gap-3"><p className="text-type-body-compact text-nite-text-secondary">Documento compartilhado comigo</p><button type="button" disabled={busy||exists("SELF",memberId,"DOCUMENT_SHARED_WITH_ME")} onClick={()=>void create("SELF",memberId,"DOCUMENT_SHARED_WITH_ME")} className="min-h-9 rounded-control border border-nite-border-control px-3 text-nite-brand-primary disabled:opacity-50">Ativar</button></div>}
          {requests.length>0&&<div className="flex flex-wrap items-end gap-2"><label className="grid flex-1 gap-1 text-type-body-compact text-nite-text-secondary">Solicitação de arquivos<select value={selectedRequest} onChange={(event)=>setSelectedRequest(event.target.value)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-2 text-nite-text-primary"><option value="">Selecione</option>{requests.map((item)=><option key={item.id} value={item.id}>{item.targetFolderName??"Pasta"} · {date(item.createdAt)}</option>)}</select></label><button type="button" disabled={busy||!selectedRequest||exists("REQUEST",selectedRequest,"FILE_REQUEST_FULFILLED")} onClick={()=>void create("REQUEST",selectedRequest,"FILE_REQUEST_FULFILLED")} className="min-h-10 rounded-control border border-nite-border-control px-3 text-nite-brand-primary disabled:opacity-50">Notificar atendimento</button></div>}
        </section>
        <section aria-label="Regras documentais" className="grid gap-2"><h3 className="font-semibold text-nite-text-primary">Minhas regras</h3>{rules.length===0?<p className="text-type-body-compact text-nite-text-secondary">Nenhuma regra configurada.</p>:<ul className="grid gap-2">{rules.map((rule)=><li key={rule.id} className="rounded-control border border-nite-border-soft p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-nite-text-primary">{eventLabel[rule.eventType]}</p><p className="text-type-metadata text-nite-text-secondary">{rule.enabled?"Ativa":"Desativada"} · criada em {date(rule.createdAt)} · {rule.targetType}</p></div><div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void mutate(()=>request(path(`/api/v1/me/document-automations/${rule.id}`),"PATCH",{enabled:!rule.enabled}))} className="min-h-9 px-2 text-nite-brand-primary disabled:opacity-50">{rule.enabled?"Desativar":"Ativar"}</button><button type="button" disabled={busy} onClick={()=>void loadHistory(rule.id).catch(()=>setError("Não foi possível consultar o histórico."))} className="min-h-9 px-2 text-nite-brand-primary disabled:opacity-50">Histórico</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm("Remover esta regra de automação?"))void mutate(()=>request(path(`/api/v1/me/document-automations/${rule.id}`),"DELETE"));}} className="min-h-9 px-2 text-status-error disabled:opacity-50">Remover</button></div></div></li>)}</ul>}</section>
        {history&&<section aria-label="Histórico da regra" className="grid gap-2"><h3 className="font-semibold text-nite-text-primary">Histórico de execução</h3>{history.length===0?<p className="text-type-body-compact text-nite-text-secondary">Nenhuma execução registrada.</p>:<ul className="grid gap-1 text-type-body-compact text-nite-text-secondary">{history.map((item)=><li key={item.id}>{date(item.createdAt)} · {item.state} · {item.errorCode??"Sem erro"}</li>)}</ul>}</section>}
        <section aria-label="Notificações documentais" className="grid gap-2"><h3 className="font-semibold text-nite-text-primary">Notificações</h3>{notifications.length===0?<p className="text-type-body-compact text-nite-text-secondary">Nenhuma notificação documental.</p>:<ul className="grid gap-2">{notifications.map((item)=><li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-nite-surface-subtle p-3 text-type-body-compact"><div><Link href={item.resourceType==="DOCUMENT"?`/documentos/${item.resourceId}`:`/documentos?view=shared&folder=${item.resourceId}`} onClick={onClose} className="text-nite-brand-primary hover:underline">{eventLabel[item.eventType]}</Link><p className="text-type-metadata text-nite-text-secondary">{date(item.createdAt)} · {item.readAt?"Lida":"Não lida"}</p></div>{!item.readAt&&<button type="button" disabled={busy} onClick={()=>void mutate(()=>request(path(`/api/v1/me/document-notifications/${item.id}/read`),"POST"))} className="min-h-9 text-nite-brand-primary disabled:opacity-50">Marcar como lida</button>}</li>)}</ul>}</section>
      </div>}
    </section>
  </div>;
}
