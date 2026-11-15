"use client";
import { useEffect,useState } from "react";
import { parseLibraryListing,type LibraryFolder } from "../../lib/documents/library-contracts";

export type BatchResource={type:"DOCUMENT"|"FOLDER";id:string;name:string};
export type BatchAction="COPY"|"MOVE"|"TRASH"|"RESTORE"|"FAVORITE"|"UNFAVORITE";
type Preview={action:string;items:number;bytes:number;blockers:string[]};
const isPreview=(value:unknown):value is Preview=>typeof value==="object"&&value!==null&&"action" in value&&typeof value.action==="string"&&"items" in value&&typeof value.items==="number"&&"bytes" in value&&typeof value.bytes==="number"&&"blockers" in value&&Array.isArray(value.blockers)&&value.blockers.every((item:unknown)=>typeof item==="string");
const endpoint=(path:string)=>`/api/library/manage?path=${encodeURIComponent(path)}`;
export function DocumentBatchDialog({items,actions,onClose,onDone}:{items:BatchResource[];actions:BatchAction[];onClose:()=>void;onDone:(message:string)=>void}) {
  const [action,setAction]=useState<BatchAction>(actions[0]??"FAVORITE"),[folders,setFolders]=useState<LibraryFolder[]>([]);
  const [destination,setDestination]=useState(""),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const needsDestinations=actions.some((item)=>item==="COPY"||item==="MOVE");
  useEffect(()=>{if(!needsDestinations)return;let active=true;
    async function load() {try {const rootResponse=await fetch("/api/library/listing?view=personal");
      if(!rootResponse.ok)throw new Error();const root=parseLibraryListing(await rootResponse.json());if(!root)throw new Error();
      const found=new Map<string,LibraryFolder>([[root.folder.id,root.folder]]),queue=root.folders.map((folder)=>folder.id);
      while(queue.length&&found.size<2000) {const id=queue.shift();if(!id||found.has(id))continue;
        const response=await fetch(`/api/library/listing?view=personal&folder=${id}`);if(!response.ok)continue;
        const page=parseLibraryListing(await response.json());if(!page)continue;found.set(id,page.folder);
        for(const folder of page.folders)if(!found.has(folder.id))queue.push(folder.id);
      }
      if(active)setFolders([...found.values()].filter((folder)=>folder.capabilities?.canAddChild));
    }catch {if(active)setError("Não foi possível consultar destinos.");}}
    void load();return()=>{active=false;};},[needsDestinations]);
  const request={action,items,destinationId:action==="COPY"||action==="MOVE"?destination:null};
  async function runPreview() {setBusy(true);setError(null);setPreview(null);
    try {const response=await fetch(endpoint("/api/v1/library/operations/preview"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});
      if(!response.ok)throw new Error();const value:unknown=await response.json();
      if(!isPreview(value))throw new Error();
      setPreview(value);
    }catch {setError("Não foi possível validar a operação. Confira os itens e o destino.");}finally{setBusy(false);}}
  async function execute() {if(!preview||preview.blockers.length||busy||!window.confirm(`${action==="TRASH"?"Excluir para a Lixeira":"Executar"} ${items.length} item(ns)?`))return;
    setBusy(true);setError(null);try {const response=await fetch(endpoint("/api/v1/library/operations/batch"),{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(request)});
      if(!response.ok)throw new Error(response.status===409?"Os itens ou permissões mudaram. Refaça a prévia.":"Operação não concluída.");
      onDone(`${items.length} item(ns) processado(s).`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Operação não concluída.");setPreview(null);}finally{setBusy(false);}}
  return <div className="fixed inset-0 z-[75] grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="batch-title" className="w-full max-w-lg rounded-dialog bg-nite-surface p-6 shadow-nite-modal"><header className="flex justify-between gap-3"><h2 id="batch-title" className="font-display text-type-section-title text-nite-text-primary">Operação em lote</h2><button type="button" onClick={onClose} aria-label="Fechar operação em lote" className="size-9 text-nite-text-secondary">×</button></header><p className="mt-2 text-type-body-compact text-nite-text-secondary">{items.length} item(ns) selecionado(s). A prévia valida todos antes de qualquer alteração.</p><label className="mt-4 grid gap-1 text-type-body-compact text-nite-text-secondary">Operação<select value={action} onChange={(event)=>{const selected=actions.find((item)=>item===event.target.value);if(selected)setAction(selected);setPreview(null);}} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-2 text-nite-text-primary">{actions.map((item)=><option key={item} value={item}>{({COPY:"Copiar",MOVE:"Mover",TRASH:"Excluir para Lixeira",RESTORE:"Restaurar",FAVORITE:"Favoritar",UNFAVORITE:"Remover favorito"})[item]}</option>)}</select></label>{(action==="COPY"||action==="MOVE")&&<label className="mt-3 grid gap-1 text-type-body-compact text-nite-text-secondary">Destino<select value={destination} onChange={(event)=>{setDestination(event.target.value);setPreview(null);}} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-2 text-nite-text-primary"><option value="">Selecione uma pasta</option>{folders.map((folder)=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}{preview&&<div className="mt-4 rounded-control bg-nite-surface-subtle p-3 text-type-body-compact text-nite-text-primary"><p>{preview.items} recursos · {preview.bytes} bytes</p>{preview.blockers.length>0?<ul className="mt-2 text-status-error">{preview.blockers.map((blocker)=><li key={blocker}>{blocker}</li>)}</ul>:<p>Todos os itens passaram na prévia.</p>}</div>}{error&&<p role="alert" className="mt-3 text-type-body-compact text-status-error">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="min-h-10 px-3 text-nite-text-secondary">Cancelar</button><button type="button" disabled={busy||((action==="COPY"||action==="MOVE")&&!destination)} onClick={()=>void runPreview()} className="min-h-10 rounded-control border border-nite-border-control px-3 text-nite-text-primary disabled:opacity-50">Prévia</button><button type="button" disabled={busy||!preview||preview.blockers.length>0} onClick={()=>void execute()} className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-white disabled:opacity-50">Executar</button></div></section></div>;
}
