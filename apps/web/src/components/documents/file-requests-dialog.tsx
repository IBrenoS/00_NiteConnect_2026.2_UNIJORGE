"use client";
import { useEffect,useState,type FormEvent } from "react";
import { parseFileRequestPage,type FileRequestView } from "../../lib/documents/library-contracts";

type Role="REQUESTED"|"RECEIVED";
const endpoint=(path:string)=>`/api/library/manage?path=${encodeURIComponent(path)}`;
const date=(value:string|null)=>value?new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"Sem prazo";
export function FileRequestsDialog({onClose,onChanged}:{onClose:()=>void;onChanged:()=>void}) {
  const [role,setRole]=useState<Role>("RECEIVED"),[items,setItems]=useState<FileRequestView[]>([]),[offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
  async function load(nextRole:Role,nextOffset=0) {setLoading(true);setMessage(null);
    try {const response=await fetch(`${endpoint("/api/v1/me/file-requests")}&role=${nextRole}&limit=30&offset=${nextOffset}`);
      if(!response.ok)throw new Error();const data=parseFileRequestPage(await response.json());if(!data)throw new Error();
      setItems((previous)=>nextOffset?[...previous,...data.items]:data.items);setOffset(nextOffset);setHasMore(data.hasMore);
    }catch {setMessage("Não foi possível consultar as solicitações.");}finally{setLoading(false);}}
  useEffect(()=>{let active=true;
    void fetch(`${endpoint("/api/v1/me/file-requests")}&role=${role}&limit=30&offset=0`).then(async(response)=>{
      if(!response.ok)throw new Error();const data=parseFileRequestPage(await response.json());if(!data)throw new Error();
      if(active){setItems(data.items);setOffset(0);setHasMore(data.hasMore);setLoading(false);}
    }).catch(()=>{if(active){setMessage("Não foi possível consultar as solicitações.");setLoading(false);}});
    return()=>{active=false;};},[role]);
  async function cancel(id:string) {if(!window.confirm("Cancelar esta solicitação?"))return;setBusy(id);
    try {const response=await fetch(endpoint(`/api/v1/file-requests/${id}/cancel`),{method:"POST"});if(!response.ok)throw new Error();
      await load(role);onChanged();setMessage("Solicitação cancelada.");
    }catch {setMessage("Não foi possível cancelar a solicitação.");}finally{setBusy(null);}}
  async function upload(event:FormEvent<HTMLFormElement>,request:FileRequestView) {event.preventDefault();if(busy)return;
    const form=event.currentTarget,file=form.querySelector<HTMLInputElement>('input[name="file"]');
    const selected=file?.files?.[0];if(!selected||selected.size>8*1024*1024){setMessage("Escolha um arquivo de até 8 MiB.");return;}
    setBusy(request.id);setMessage(null);try {const body=new FormData();body.set("file",selected,selected.name);body.set("title",selected.name);
      const response=await fetch(`/api/library/file-requests/${request.id}/uploads`,{method:"POST",body});
      if(!response.ok)throw new Error(response.status===409?"Solicitação encerrada ou arquivo em conflito.":"Envio não autorizado ou indisponível.");
      form.reset();await load(role);onChanged();setMessage("Arquivo enviado.");
    }catch(cause){setMessage(cause instanceof Error?cause.message:"Arquivo não enviado.");}finally{setBusy(null);}}
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="file-requests-title" className="max-h-[90svh] w-full max-w-2xl overflow-y-auto rounded-dialog bg-nite-surface p-6 shadow-nite-modal"><header className="flex items-start justify-between gap-3"><div><h2 id="file-requests-title" className="font-display text-type-section-title text-nite-text-primary">Solicitações de arquivos</h2><p className="text-type-body-compact text-nite-text-secondary">Envios são autenticados e não concedem acesso às pastas de destino.</p></div><button type="button" onClick={onClose} aria-label="Fechar solicitações" className="size-9 rounded-control text-nite-text-secondary">×</button></header><nav aria-label="Perspectiva das solicitações" className="mt-4 flex gap-2 border-b border-nite-border-soft">{([["RECEIVED","Recebidas"],["REQUESTED","Enviadas"]] as const).map(([value,label])=><button key={value} type="button" aria-current={role===value?"page":undefined} onClick={()=>{setLoading(true);setRole(value);}} className={`min-h-10 px-3 ${role===value?"border-b-2 border-nite-brand-primary text-nite-brand-primary":"text-nite-text-secondary"}`}>{label}</button>)}</nav>{message&&<p role="status" className="mt-3 rounded-control bg-nite-surface-subtle p-3 text-type-body-compact text-nite-text-primary">{message}</p>}{loading&&<p role="status" className="mt-4 text-nite-text-secondary">Carregando solicitações…</p>}<ul className="mt-4 grid gap-3">{items.map((item)=><li key={item.id} className="rounded-control border border-nite-border-soft p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium text-nite-text-primary">{role==="REQUESTED"?item.targetFolderName??"Destino indisponível":`Solicitação ${item.id.slice(0,8)}`}</p><p className="text-type-metadata text-nite-text-secondary">{item.status} · criada em {date(item.createdAt)} · prazo {date(item.dueAt)}</p></div>{role==="REQUESTED"&&item.status==="OPEN"&&<button type="button" disabled={busy!==null} onClick={()=>void cancel(item.id)} className="text-type-body-compact text-status-error disabled:opacity-50">Cancelar</button>}</div>{item.uploads.length>0&&<p className="mt-2 text-type-metadata text-nite-text-secondary">{item.uploads.length} arquivo(s) enviado(s): {item.uploads.map((upload)=>upload.name).join(", ")}</p>}{role==="RECEIVED"&&item.status==="OPEN"&&<form onSubmit={(event)=>void upload(event,item)} className="mt-3 flex flex-wrap items-center gap-2"><label className="text-type-metadata text-nite-text-secondary">Enviar arquivo<input name="file" type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" required className="ml-2 text-nite-text-primary"/></label><button type="submit" disabled={busy!==null} className="min-h-9 rounded-control bg-nite-brand-primary px-3 text-type-body-compact text-white disabled:opacity-50">{busy===item.id?"Enviando…":"Enviar"}</button></form>}</li>)}</ul>{!loading&&items.length===0&&<p className="mt-4 text-type-body-compact text-nite-text-secondary">Nenhuma solicitação nesta perspectiva.</p>}{hasMore&&<button type="button" disabled={loading} onClick={()=>void load(role,offset+30)} className="mt-4 min-h-10 rounded-control border border-nite-border-control px-4 text-nite-text-primary">Carregar mais</button>}</section></div>;
}
