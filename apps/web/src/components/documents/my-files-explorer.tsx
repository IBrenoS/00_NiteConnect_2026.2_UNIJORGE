"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect,useMemo,useState,type ChangeEvent,type FormEvent,type KeyboardEvent } from "react";
import { parseActivityListing,parseLibraryFile,parseLibraryListing,parseSharedListing,type ActivityListing,type LibraryActivity,type LibraryFile,type LibraryFolder,type LibraryListing,type LibraryTemplate,type SharedItem } from "../../lib/documents/library-contracts";
import { createLibraryFolder,createPersonalTemplateCopy,organizeLibraryFile,updateLibraryFolder } from "../../lib/documents/library-actions";
import { partitionUploadEntries } from "../../lib/documents/upload-batches";

type View="personal"|"shared";
type Props={listing:LibraryListing|null;sharedItems?:SharedItem[];hasMore?:boolean;nextCursor?:string|null;issue:string|null;view:View;templates:LibraryTemplate[];params:{folder?:string;permission?:string;error?:string;saved?:string;uploaded?:string;search?:string;type?:string;sort?:string;direction?:string}};
type Item={id:string;name:string;kind:"folder"|"file";folder?:LibraryFolder;file?:LibraryFile;permission?:"VIEW"|"EDIT";shared?:SharedItem};
const bytes=(size:number)=>size<1024?`${size} bytes`:size<1024*1024?`${(size/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} KB`:`${(size/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} MB`;
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"Não disponível";
const icon=(file:LibraryFile)=>file.mimeType.includes("wordprocessing")?"DOCX":file.mimeType.includes("pdf")?"PDF":file.mimeType.startsWith("image/")?"IMG":"ARQ";
const relativePath=(file:File)=>{const value=Reflect.get(file,"webkitRelativePath");return typeof value==="string"&&value?value:file.name;};
const permissionValue=(value:string):"VIEW"|"EDIT"=>value==="EDIT"?"EDIT":"VIEW";
function containDialogFocus(event:KeyboardEvent<HTMLElement>,close:()=>void) {
  if(event.key==="Escape"){event.preventDefault();close();return;}
  if(event.key!=="Tab")return;
  const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((element)=>element.getAttribute("aria-hidden")!=="true");
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
}
type ShareGrant={id:string;memberId:string;memberName:string;permission:"VIEW"|"EDIT";grantedByName:string};
const shareGrant=(value:unknown):value is ShareGrant=>typeof value==="object"&&value!==null&&"id" in value&&typeof value.id==="string"&&"memberId" in value&&typeof value.memberId==="string"&&"memberName" in value&&typeof value.memberName==="string"&&"permission" in value&&(value.permission==="VIEW"||value.permission==="EDIT")&&"grantedByName" in value&&typeof value.grantedByName==="string";
const queryString=(view:View,folder:string|undefined,values:Record<string,string|undefined>)=>{
  const params=new URLSearchParams({view});if(folder)params.set("folder",folder);
  for(const [key,value] of Object.entries(values))if(value)params.set(key,value);
  return `/documentos?${params.toString()}`;
};
function errorText(code:string|undefined) {
  if(!code)return null;
  const messages:Record<string,string>={invalid:"O arquivo ou os dados não atendem aos limites aceitos.",access:"Você não tem acesso a essa operação.",conflict:"Já existe um item com esse nome.",unavailable:"O serviço documental está indisponível. Tente novamente."};
  return messages[code]??"A operação não foi concluída.";
}
function ItemIcon({item}:{item:Item}) {
  if(item.kind==="folder")return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 text-nite-brand-primary" fill="currentColor"><path d="M3.5 5.75A1.75 1.75 0 0 1 5.25 4h4.1c.47 0 .92.19 1.25.52l1.23 1.23h6.92a1.75 1.75 0 0 1 1.75 1.75v10.75A1.75 1.75 0 0 1 18.75 20h-13.5A1.75 1.75 0 0 1 3.5 18.25z"/></svg>;
  const label=item.file?icon(item.file):"ARQ";
  return <span aria-hidden="true" className="text-[9px] font-bold tracking-tight text-nite-text-secondary">{label}</span>;
}

export function MyFilesExplorer({listing:initialListing,sharedItems=[],hasMore=false,nextCursor=null,issue,view,templates,params}:Props) {
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]),[layout,setLayout]=useState<"list"|"compact"|"grid">("list");
  const [createMenu,setCreateMenu]=useState(false),[dialog,setDialog]=useState<"folder"|"files"|"directory"|null>(null);
  const [details,setDetails]=useState(false),[detailPayload,setDetailPayload]=useState<{file?:LibraryFile;activity?:ActivityListing}|null>(null);
  const [shareTarget,setShareTarget]=useState<Item|null>(null),[message,setMessage]=useState<string|null>(null);
  const [progress,setProgress]=useState<{sent:number;total:number;percent:number}|null>(null),[uploadSummary,setUploadSummary]=useState<string|null>(null);
  const [loadingDetails,setLoadingDetails]=useState(false),[loadedListing,setLoadedListing]=useState(initialListing),[receivedItems,setReceivedItems]=useState(sharedItems),[receivedCursor,setReceivedCursor]=useState(nextCursor),[receivedHasMore,setReceivedHasMore]=useState(hasMore);
  const listing=loadedListing;
  const current=listing?.folder,folderId=current?.id;
  const items=useMemo<Item[]>(()=>[
    ...(listing?.folders??[]).map((folder):Item=>({id:folder.id,name:folder.name,kind:"folder",folder,permission:permissionValue(params.permission??"")})),
    ...(listing?.files??[]).map((file):Item=>({id:file.id,name:file.title,kind:"file",file,permission:permissionValue(params.permission??"")})),
    ...receivedItems.map((shared):Item=>({id:shared.id,name:shared.name,kind:shared.type==="FOLDER"?"folder":"file",permission:shared.permission,shared})),
  ],[listing,receivedItems,params.permission]);
  const displayedItems=useMemo(()=>{
    let values=items;
    if(view==="shared"&&!listing&&params.search)values=values.filter((item)=>item.name.toLocaleLowerCase("pt-BR").includes(params.search!.toLocaleLowerCase("pt-BR")));
    if(view==="shared"&&!listing&&params.sort==="name")values=[...values].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")*(params.direction==="desc"?-1:1));
    if(view==="shared"&&!listing&&params.sort==="modifiedAt")values=[...values].sort((a,b)=>(a.shared?.modifiedAt??a.shared?.sharedAt??"").localeCompare(b.shared?.modifiedAt??b.shared?.sharedAt??"")*(params.direction==="desc"?-1:1));
    return values;
  },[items,view,listing,params.search,params.sort,params.direction]);
  const selectedItems=items.filter((item)=>selected.includes(item.id));
  const query={search:params.search,type:params.type,sort:params.sort,direction:params.direction,permission:params.permission};
  const rootHref=queryString(view,undefined,{});
  function select(id:string,checked:boolean) {setSelected((before)=>checked?[...new Set([...before,id])]:before.filter((item)=>item!==id));}
  async function showDetails(item?:Item) {
    const target=item??selectedItems[0]??(current?{id:current.id,name:current.name,kind:"folder" as const,folder:current}:undefined);
    if(!target){setMessage("Selecione um item para ver os detalhes.");return;}
    setDetails(true);setLoadingDetails(true);setDetailPayload(null);
    const path=target.kind==="file"?`/api/v1/library/documents/${target.id}`:`/api/v1/library/folders/${target.id}`;
    try {
      const [response,activityResponse]=await Promise.all([
        target.kind==="file"?fetch(`/api/library/manage?path=${encodeURIComponent(path)}`):Promise.resolve(null),
        fetch(`/api/library/manage?path=${encodeURIComponent(`${path}/${target.kind==="file"?"activity":"activity"}`)}`),
      ]);
      const fileValue:unknown=response?.ok?await response.json():null;
      const activityValue:unknown=activityResponse.ok?await activityResponse.json():null;
      const file=parseLibraryFile(fileValue)??undefined,activity=parseActivityListing(activityValue)??undefined;
      setDetailPayload({file,activity});
    } catch {setMessage("Não foi possível carregar os detalhes e a atividade.");}
    finally {setLoadingDetails(false);}
  }
  async function loadMoreActivity() {
    const item=selectedItems[0]??(current?{id:current.id,name:current.name,kind:"folder" as const,folder:current}:null);
    const cursor=detailPayload?.activity?.nextCursor;if(!item||!cursor)return;
    const path=item.kind==="file"?`/api/v1/library/documents/${item.id}/activity`:`/api/v1/library/folders/${item.id}/activity`;
    try {const response=await fetch(`/api/library/manage?path=${encodeURIComponent(path)}&cursor=${encodeURIComponent(cursor)}&limit=50`);if(!response.ok)throw new Error();const page=parseActivityListing(await response.json());if(!page)throw new Error();setDetailPayload((before)=>before?.activity?{...before,activity:{...page,items:[...before.activity.items,...page.items]}}:before);}
    catch {setMessage("Não foi possível carregar as atividades anteriores.");}
  }
  function openItem(item:Item) {
    if(item.kind==="folder")router.push(queryString(view,item.id,{...query,permission:view==="shared"?item.permission:undefined}));
    else if(item.file?.mimeType.includes("wordprocessing")&&(view==="personal"||item.permission==="EDIT"))router.push(`/documentos/${item.id}`);
    else if(item.shared)void fetch(`/api/library/manage?path=${encodeURIComponent(`/api/v1/library/documents/${item.id}`)}`).then(async(response)=>{
      if(!response.ok){setMessage("Este arquivo não está disponível para sua conta.");return;}
      const file=parseLibraryFile(await response.json());if(!file){setMessage("O serviço retornou dados de arquivo inválidos.");return;}
      if(file.mimeType.includes("wordprocessing")&&(view==="personal"||item.permission==="EDIT"))router.push(`/documentos/${item.id}`);
      else window.open(`/api/library/download/${item.id}`,"_blank","noopener,noreferrer");
    }).catch(()=>setMessage("Não foi possível abrir este arquivo."));
    else window.open(`/api/library/download/${item.id}`,"_blank","noopener,noreferrer");
  }
  async function loadMore() {
    const cursor=listing?.nextCursor??receivedCursor;if(!cursor)return;
    const url=queryString(view,folderId,{...query,cursor});
    try {const response=await fetch(`/api/library/listing${new URL(url,"http://local").search}`);if(!response.ok)throw new Error();
      const payload:unknown=await response.json(),next=parseLibraryListing(payload),sharedNext=parseSharedListing(payload);
      if(next&&listing)setLoadedListing({...listing,files:[...listing.files,...next.files],nextCursor:next.nextCursor,hasMore:next.hasMore});
      else if(sharedNext){setReceivedItems((before)=>[...before,...sharedNext.items]);setReceivedCursor(sharedNext.nextCursor);setReceivedHasMore(sharedNext.hasMore);}
    }catch {setMessage("Não foi possível carregar mais resultados.");}
  }
  async function loadFiles(event:ChangeEvent<HTMLInputElement>,hierarchical:boolean) {
    const input=event.currentTarget,files=[...(input.files??[])];input.value="";
    if(!files.length||!folderId)return;
    const entries=files.map((file)=>({file,path:hierarchical?relativePath(file):file.name}));
    const {batches,rejected}=partitionUploadEntries(entries),acceptedCount=batches.reduce((sum,batch)=>sum+batch.length,0);
    let sent=0,completed=0,failed=rejected.length;const failedStatuses:number[]=[];
    setProgress({sent:0,total:acceptedCount,percent:0});setUploadSummary(null);setMessage(null);
    for(const batch of batches) {
      const result=await new Promise<number>((resolve)=>{
        const body=new FormData();batch.forEach(({file,path})=>{body.append("files",file,file.name);body.append("paths",path);});
        const xhr=new XMLHttpRequest();xhr.open("POST",`/api/library/folders/${folderId}/upload-tree`);
        xhr.upload.onprogress=(progressEvent)=>{if(progressEvent.lengthComputable)setProgress({sent:completed,total:acceptedCount,percent:Math.min(99,Math.round((completed+progressEvent.loaded/progressEvent.total*batch.length)/acceptedCount*100))});};
        xhr.onload=()=>resolve(xhr.status);xhr.onerror=()=>resolve(0);xhr.onabort=()=>resolve(0);xhr.send(body);
      });
      if(result>=200&&result<300){sent+=batch.length;completed+=batch.length;}else{failed+=batch.length;failedStatuses.push(result);completed+=batch.length;}
      setProgress({sent:completed,total:acceptedCount,percent:acceptedCount?Math.round(completed/acceptedCount*100):100});
    }
    const rejectedCounts=rejected.reduce<Record<string,number>>((counts,item)=>({...counts,[item.reason]:(counts[item.reason]??0)+1}),{});
    const reasons=[rejectedCounts["file-too-large"]?`${rejectedCounts["file-too-large"]} acima de 8 MiB`:null,rejectedCounts["unsupported-format"]?`${rejectedCounts["unsupported-format"]} em formato não aceito`:null,rejectedCounts["invalid-path"]?`${rejectedCounts["invalid-path"]} com caminho inválido`:null,rejectedCounts.empty?`${rejectedCounts.empty} vazios`:null].filter((reason):reason is string=>reason!==null);
    const statusCounts=failedStatuses.reduce<Record<string,number>>((counts,status)=>({...counts,[String(status)]:(counts[String(status)]??0)+1}),{});
    const apiErrors=[statusCounts["400"]?`${statusCounts["400"]} lote(s) inválido(s)`:null,statusCounts["401"]||statusCounts["403"]?`${(statusCounts["401"]??0)+(statusCounts["403"]??0)} lote(s) sem autorização`:null,statusCounts["404"]?`${statusCounts["404"]} pasta(s) indisponível(is)`:null,statusCounts["409"]?`${statusCounts["409"]} conflito(s) de nome`:null,statusCounts["413"]?`${statusCounts["413"]} lote(s) acima do limite da requisição`:null,statusCounts["0"]?`${statusCounts["0"]} falha(s) de conexão`:null,failedStatuses.some((status)=>status>=500)?"serviço documental indisponível":null].filter((reason):reason is string=>reason!==null);
    setProgress(null);setDialog(null);setUploadSummary(`${sent} de ${files.length} arquivo(s) carregado(s)${failed?`; ${failed} não enviado(s)`:""}${reasons.length?`. Rejeitados antes do envio: ${reasons.join(", ")}`:""}${apiErrors.length?`. Resultado dos lotes: ${apiErrors.join(", ")}`:""}. ${batches.length>1?`${batches.length} lotes independentes foram processados.`:""}`);
    if(sent>0) {
      const refreshParams=new URLSearchParams({view,folder:folderId});for(const [key,value] of Object.entries(query))if(value)refreshParams.set(key,value);
      try {const response=await fetch(`/api/library/listing?${refreshParams.toString()}`);const payload:unknown=response.ok?await response.json():null;const updated=parseLibraryListing(payload);if(updated)setLoadedListing(updated);else setMessage("Upload concluído, mas não foi possível atualizar a listagem.");}
      catch {setMessage("Upload concluído, mas não foi possível atualizar a listagem.");}
    }
  }
  const baseAction=`/documentos${folderId?`?folder=${folderId}`:""}`;
  return <section className="min-w-0 space-y-5" aria-label="Meus arquivos">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 text-type-body-compact">
          <Link href={rootHref} className="text-nite-text-secondary hover:text-nite-brand-primary">{view==="shared"?"Compartilhado comigo":"Meus arquivos"}</Link>
          {current&&<><span aria-hidden="true" className="text-nite-text-muted">/</span><span className="truncate font-semibold text-nite-text-primary">{current.name}</span></>}
          {view==="shared"&&current?.parentId&&<Link href={queryString(view,current.parentId,query)} className="text-nite-brand-primary">Pasta anterior</Link>}
        </div>
        <details className="group relative mt-2 w-fit">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control py-1 text-type-page-title font-semibold text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden">
            {current?.name??(view==="shared"?"Compartilhado comigo":"Meus arquivos")}<svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div className="absolute left-0 top-full z-20 mt-2 w-60 rounded-panel border border-nite-border-soft bg-nite-background p-1 shadow-nite-floating">
            <Link href="/documentos" className="block rounded-control px-3 py-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">Meus arquivos</Link>
            <Link href="/documentos?view=shared" className="block rounded-control px-3 py-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">Compartilhado comigo</Link>
          </div>
        </details>
      </div>
      {view==="personal"&&<div className="relative">
        <button type="button" onClick={()=>setCreateMenu((open)=>!open)} aria-expanded={createMenu} className="inline-flex min-h-11 items-center gap-2 rounded-control bg-nite-brand-primary px-4 font-semibold text-white shadow-sm hover:brightness-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
          <span aria-hidden="true" className="text-xl leading-none">+</span>Criar ou carregar
        </button>
        {createMenu&&<div className="absolute right-0 z-20 mt-2 max-h-[min(70vh,32rem)] w-64 overflow-y-auto rounded-panel border border-nite-border-soft bg-nite-background p-1 shadow-nite-floating">
          <button type="button" onClick={()=>{setDialog("folder");setCreateMenu(false);}} className="w-full rounded-control px-3 py-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">Nova pasta</button>
          <button type="button" onClick={()=>{setDialog("files");setCreateMenu(false);}} className="w-full rounded-control px-3 py-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">Carregar arquivos</button>
          <button type="button" onClick={()=>{setDialog("directory");setCreateMenu(false);}} className="w-full rounded-control px-3 py-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">Carregar pasta</button>
          {templates.length>0&&<div className="mt-1 border-t border-nite-border-soft pt-1"><p className="px-3 py-2 text-type-metadata text-nite-text-muted">Criar cópia de um modelo</p>{templates.map((template)=><form key={template.id} action={createPersonalTemplateCopy}><input type="hidden" name="templateId" value={template.id}/><input type="hidden" name="returnTo" value={baseAction}/><button onClick={()=>setCreateMenu(false)} className="w-full truncate rounded-control px-3 py-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">{template.title}</button></form>)}</div>}
        </div>}
      </div>}
    </div>

    <form action="/documentos" className="flex flex-wrap items-center gap-2 rounded-panel border border-nite-border-soft bg-nite-surface p-2" role="search">
      <input type="hidden" name="view" value={view}/>{folderId&&<input type="hidden" name="folder" value={folderId} />}{view==="shared"&&params.permission&&<input type="hidden" name="permission" value={params.permission}/>}
      {params.sort&&<input type="hidden" name="sort" value={params.sort} />}{params.direction&&<input type="hidden" name="direction" value={params.direction}/>}
      <label className="flex min-w-48 flex-1 items-center gap-2 rounded-control bg-nite-background px-3">
        <span aria-hidden="true" className="text-nite-text-muted">⌕</span><span className="sr-only">Pesquisar nesta pasta</span>
        <input name="search" defaultValue={params.search} placeholder="Pesquisar em Meus arquivos" className="min-h-10 w-full bg-transparent text-type-body-compact text-nite-text-primary outline-none placeholder:text-nite-placeholder"/>
      </label>
      {!(view==="shared"&&!listing)&&<><label className="sr-only" htmlFor="file-type">Filtrar por tipo</label>
      <select id="file-type" name="type" defaultValue={params.type??""} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-type-body-compact text-nite-text-secondary">
        <option value="">Todos os tipos</option><option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">DOCX</option><option value="application/pdf">PDF</option><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option>
      </select></>}
      <button className="min-h-10 rounded-control bg-nite-surface-subtle px-4 text-type-body-compact font-medium text-nite-text-primary hover:bg-nite-surface-focus">Pesquisar</button>
      <div className="ml-auto flex items-center gap-1 border-l border-nite-border-soft pl-2" aria-label="Visualização">
        {([["list","Lista"],["compact","Compacta"],["grid","Blocos"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={layout===value} onClick={()=>setLayout(value)} className={`min-h-9 rounded-control px-2 text-type-metadata ${layout===value?"bg-nite-brand-soft text-nite-brand-primary":"text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>{label}</button>)}
      </div>
      <button type="button" onClick={()=>void showDetails()} className="min-h-10 rounded-control border border-nite-border-control px-3 text-type-body-compact text-nite-text-secondary hover:bg-nite-surface-subtle">Detalhes</button>
    </form>

    {params.error&&<p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft px-4 py-3 text-type-body-compact text-status-error">{errorText(params.error)}</p>}
    {(params.saved||params.uploaded)&&<p role="status" className="rounded-control border border-status-validated-border bg-status-validated-soft px-4 py-3 text-type-body-compact text-status-validated">{params.uploaded?"Upload concluído.":"Alterações salvas."}</p>}
    {uploadSummary&&<p role="status" className="rounded-control border border-nite-border-soft bg-nite-surface-subtle px-4 py-3 text-type-body-compact text-nite-text-primary">{uploadSummary}</p>}
    {message&&<p role="status" className="rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-type-body-compact text-status-warning">{message}</p>}
    {progress&&<div role="status" aria-live="polite" className="rounded-panel border border-nite-border-soft bg-nite-surface p-4"><div className="mb-2 flex justify-between text-type-body-compact text-nite-text-primary"><span>Enviando arquivos · {progress.sent} de {progress.total}</span><span>{progress.percent}%</span></div><progress className="h-2 w-full accent-nite-brand-primary" max={100} value={progress.percent}/></div>}

    {issue&&<div role="alert" className="grid min-h-72 place-content-center gap-2 rounded-panel border border-nite-border-soft bg-nite-surface px-4 text-center"><p className="font-medium text-nite-text-primary">{issue==="access"?"Você não tem acesso a esta pasta.":issue==="not-found"?"A pasta não existe ou não está disponível para sua conta.":"Não foi possível carregar os arquivos."}</p><p className="text-type-body-compact text-nite-text-secondary">{issue==="access"||issue==="not-found"?"Volte para uma área compartilhada com você.":"Verifique a conexão com o serviço documental e tente novamente."}</p><button onClick={()=>router.refresh()} className="mx-auto min-h-10 rounded-control border border-nite-border-control px-4 text-nite-text-primary">Tentar novamente</button></div>}
    {!issue&&(listing||view==="shared")&&<div className={`grid min-w-0 grid-cols-1 gap-4 ${details?"lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]":""}`}>
      <div className="min-w-0 overflow-hidden rounded-panel border border-nite-border-soft bg-nite-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-nite-border-soft px-4 py-3 text-type-body-compact text-nite-text-secondary">
          <span>{listing?.folders.length??displayedItems.filter((item)=>item.kind==="folder").length} pastas · {listing?.totalFiles??displayedItems.filter((item)=>item.kind==="file").length} arquivos</span>
          {selected.length>0&&<div className="flex items-center gap-2"><span>{selected.length} selecionado(s)</span><button onClick={()=>void showDetails()} className="rounded-control px-2 py-1 text-nite-brand-primary">Detalhes</button><button onClick={()=>setSelected([])} className="rounded-control px-2 py-1">Limpar seleção</button></div>}
        </div>
        {displayedItems.length===0?<div className="grid min-h-80 place-content-center gap-2 px-5 text-center"><p className="font-display text-type-section-title text-nite-text-primary">{params.search||params.type?"Nenhum resultado encontrado":view==="shared"?"Nenhum arquivo compartilhado":"Esta pasta está vazia"}</p><p className="max-w-md text-type-body-compact text-nite-text-secondary">{params.search||params.type?"Ajuste a pesquisa ou remova o filtro para ver outros arquivos.":view==="shared"?"Quando alguém compartilhar um arquivo ou pasta com você, o item aparecerá aqui.":"Crie uma pasta ou carregue arquivos para começar."}</p>{view==="personal"&&!params.search&&!params.type&&<button onClick={()=>setDialog("files")} className="mx-auto min-h-10 rounded-control bg-nite-brand-primary px-4 text-white">Carregar arquivos</button>}</div>
          :layout==="grid"?<div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{displayedItems.map((item)=><button key={item.id} onClick={()=>select(item.id,!selected.includes(item.id))} onDoubleClick={()=>openItem(item)} className={`rounded-panel border p-4 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${selected.includes(item.id)?"border-nite-brand-primary bg-nite-brand-soft":"border-nite-border-soft hover:bg-nite-surface-subtle"}`}><span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-control bg-nite-surface-subtle"><ItemIcon item={item}/></span><span className="min-w-0 truncate font-medium text-nite-text-primary">{item.name}</span></span><span className="mt-3 block text-type-metadata text-nite-text-muted">{item.kind==="folder"?"Pasta":item.file?bytes(item.file.size):"Arquivo"}</span></button>)}</div>
          :<div className="overflow-x-auto"><table className={`w-full min-w-[560px] text-left ${layout==="compact"?"text-type-metadata":"text-type-body-compact"}`}>
            <thead className="bg-nite-surface-subtle text-type-table-header text-nite-text-muted"><tr><th className="w-10 px-3 py-3"><input aria-label="Selecionar todos os itens desta página" type="checkbox" checked={items.length>0&&selected.length===items.length} onChange={(event)=>setSelected(event.target.checked?items.map((item)=>item.id):[])} className="size-4 accent-nite-brand-primary"/></th>
              <th className="px-3 py-3"><SortLink label="Nome" sort="name" {...{view,folderId,query}}/></th><th className="hidden px-3 py-3 md:table-cell"><SortLink label="Modificado" sort="modifiedAt" {...{view,folderId,query}}/></th><th className="hidden px-3 py-3 xl:table-cell">Modificado por</th><th className="hidden px-3 py-3 lg:table-cell">{view==="shared"&&!listing?"Tamanho":<SortLink label="Tamanho" sort="size" {...{view,folderId,query}}/>}</th><th className="hidden px-3 py-3 xl:table-cell">Compartilhamento</th><th className="hidden px-3 py-3 2xl:table-cell">Atividade</th></tr></thead>
            <tbody>{displayedItems.map((item)=><tr key={item.id} tabIndex={0} aria-selected={selected.includes(item.id)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select(item.id,!selected.includes(item.id));}if(event.key==="ArrowRight")openItem(item);}} onDoubleClick={()=>openItem(item)} onClick={()=>select(item.id,!selected.includes(item.id))} className={`group cursor-pointer border-t border-nite-border-soft transition-colors hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus ${selected.includes(item.id)?"bg-nite-brand-soft":""}`}>
              <td className="px-3 py-3"><input aria-label={`Selecionar ${item.name}`} type="checkbox" checked={selected.includes(item.id)} onClick={(event)=>event.stopPropagation()} onChange={(event)=>select(item.id,event.target.checked)} className="size-4 accent-nite-brand-primary"/></td>
              <td className="max-w-[26rem] px-3 py-3"><div className="flex items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-control ${item.kind==="folder"?"bg-nite-brand-soft":"bg-nite-surface-subtle"}`}><ItemIcon item={item}/></span><div className="min-w-0"><button onClick={(event)=>{event.stopPropagation();openItem(item);}} className="max-w-full truncate text-left font-medium text-nite-text-primary hover:text-nite-brand-primary hover:underline focus-visible:outline-2 focus-visible:outline-nite-focus">{item.name}</button>{item.kind==="file"&&<div className="text-type-metadata text-nite-text-muted">{item.file?icon(item.file):"Arquivo"}{item.file?.sharedWithCount?" · Compartilhado":""}</div>}</div></div></td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-nite-text-secondary md:table-cell">{date(item.kind==="folder"?item.folder?.modifiedAt:item.file?.modifiedAt??item.shared?.modifiedAt)}</td><td className="hidden max-w-48 truncate px-3 py-3 text-nite-text-secondary xl:table-cell">{item.kind==="folder"?item.folder?.modifiedByName??"Não disponível":item.file?.modifiedByName??item.file?.createdByName??"Não disponível"}</td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-nite-text-secondary lg:table-cell">{item.kind==="folder"?"Pasta":item.file?bytes(item.file.size):"Não disponível"}</td><td className="hidden px-3 py-3 text-nite-text-secondary xl:table-cell">{item.kind==="folder"?"Particular":item.file?.sharedWithCount?`${item.file.sharedWithCount} acesso(s)`:item.permission??"Particular"}</td>
              <td className="hidden px-3 py-3 text-nite-text-secondary 2xl:table-cell">{item.kind==="file"&&item.file?.lastOpenedAt?`Aberto ${date(item.file.lastOpenedAt)}`:"—"}</td>
            </tr>)}</tbody></table></div>}
        {(listing?.hasMore||listing?.nextCursor||receivedHasMore||receivedCursor)&&<div className="border-t border-nite-border-soft p-3 text-center"><button type="button" onClick={()=>void loadMore()} className="min-h-10 rounded-control border border-nite-border-control px-4 text-type-body-compact font-medium text-nite-text-primary hover:bg-nite-surface-subtle">Carregar mais arquivos</button></div>}
      </div>
      {details&&<DetailsPanel item={selectedItems[0]??{id:current?.id??"",name:current?.name??"Meus arquivos",kind:"folder",folder:current??undefined}} file={detailPayload?.file} activity={detailPayload?.activity} loading={loadingDetails} onClose={()=>setDetails(false)} onLoadMoreActivity={()=>void loadMoreActivity()} onShare={(item)=>setShareTarget(item)} personal={view==="personal"} returnTo={baseAction} folders={listing?.folders??[]} parentFolderId={current?.parentId??null}/>}
    </div>}

    {dialog&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)setDialog(null);}}>
      <section role="dialog" aria-modal="true" aria-labelledby="my-files-dialog-title" onKeyDown={(event)=>containDialogFocus(event,()=>setDialog(null))} className="w-full max-w-lg rounded-dialog border border-nite-border-soft bg-nite-background p-6 shadow-nite-modal">
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="my-files-dialog-title" className="font-display text-type-section-title text-nite-text-primary">{dialog==="folder"?"Nova pasta":dialog==="files"?"Carregar arquivos":"Carregar pasta"}</h2><p className="mt-1 text-type-body-compact text-nite-text-secondary">Destino: {current?.name??"Meus arquivos"}</p></div><button autoFocus onClick={()=>setDialog(null)} aria-label="Fechar diálogo" className="grid size-9 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle">×</button></div>
        {dialog==="folder"?<form action={createLibraryFolder} className="grid gap-4"><input type="hidden" name="parentId" value={folderId??""}/><input type="hidden" name="returnTo" value={baseAction}/><label className="grid gap-1 text-type-body-compact text-nite-text-secondary">Nome da pasta<input autoFocus name="name" required maxLength={190} className="min-h-11 rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary"/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>setDialog(null)} className="min-h-10 rounded-control px-4 text-nite-text-secondary">Cancelar</button><button className="min-h-10 rounded-control bg-nite-brand-primary px-4 font-medium text-white">Criar pasta</button></div></form>
          :<div className="grid gap-4"><label className="grid min-h-32 cursor-pointer place-content-center gap-2 rounded-panel border border-dashed border-nite-border-strong bg-nite-surface-subtle p-5 text-center hover:bg-nite-surface-focus"><span className="font-medium text-nite-text-primary">{dialog==="files"?"Selecionar arquivos":"Selecionar uma pasta"}</span><span className="text-type-body-compact text-nite-text-secondary">DOCX, PDF, PNG e JPEG · até 8 MiB por arquivo</span><input type="file" multiple accept=".docx,.pdf,.png,.jpg,.jpeg" className="sr-only" onClick={(event)=>{if(dialog==="directory")event.currentTarget.setAttribute("webkitdirectory","");}} onChange={(event)=>void loadFiles(event,dialog==="directory")}/></label><p className="text-type-metadata text-nite-text-muted">Pastas são enviadas em lotes independentes de até 100 itens e 32 MiB. Erros por lote são informados no resultado.</p><div className="flex justify-end"><button type="button" onClick={()=>setDialog(null)} className="min-h-10 rounded-control px-4 text-nite-text-secondary">Fechar</button></div></div>}
      </section>
    </div>}
    {shareTarget&&<ShareDialog item={shareTarget} onClose={()=>setShareTarget(null)} onMessage={setMessage}/>}
  </section>;
}

function SortLink({label,sort,view,folderId,query}:{label:string;sort:string;view:View;folderId:string|undefined;query:Record<string,string|undefined>}) {
  const direction=query.sort===sort&&query.direction!=="desc"?"desc":"asc";
  return <Link href={queryString(view,folderId,{...query,sort,direction})} className="inline-flex items-center gap-1 hover:text-nite-text-primary">{label}<span aria-hidden="true">{query.sort===sort?(direction==="asc"?"↑":"↓"):"↕"}</span></Link>;
}

function DetailsPanel({item,file,activity,loading,onClose,onLoadMoreActivity,onShare,personal,returnTo,folders,parentFolderId}:{item:Item;file?:LibraryFile;activity?:ActivityListing;loading:boolean;onClose:()=>void;onLoadMoreActivity:()=>void;onShare:(item:Item)=>void;personal:boolean;returnTo:string;folders:LibraryFolder[];parentFolderId:string|null}) {
  const [showRename,setShowRename]=useState(false),detailsFile=file??item.file;
  return <aside aria-label="Detalhes do item" className="min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface">
    <header className="flex items-start justify-between gap-3 border-b border-nite-border-soft p-4"><div className="min-w-0"><p className="text-type-metadata text-nite-text-muted">{item.kind==="folder"?"Pasta":"Arquivo"}</p><h2 className="mt-1 break-words font-medium text-nite-text-primary">{item.name}</h2></div><button onClick={onClose} aria-label="Fechar detalhes" className="grid size-9 shrink-0 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle">×</button></header>
    <div className="max-h-[65vh] space-y-5 overflow-y-auto p-4">{loading?<p role="status" className="text-type-body-compact text-nite-text-secondary">Carregando detalhes…</p>:<>
      <dl className="grid gap-3 text-type-body-compact"><Detail label="Nome" value={item.name}/><Detail label="Tipo" value={item.kind==="folder"?"Pasta":detailsFile?.mimeType??"Não disponível"}/><Detail label="Tamanho" value={item.kind==="file"&&detailsFile?bytes(detailsFile.size):"Não disponível"}/><Detail label="Localização" value={detailsFile?.folderName??item.folder?.name??"Não disponível"}/><Detail label="Proprietário" value={detailsFile?.ownerName??item.folder?.ownerName??item.shared?.ownerName??"Não disponível"}/><Detail label="Criado por" value={detailsFile?.createdByName??item.folder?.createdByName??"Não disponível"}/><Detail label="Modificado por" value={detailsFile?.modifiedByName??item.folder?.modifiedByName??"Não disponível"}/><Detail label="Criado em" value={date(detailsFile?.createdAt??item.folder?.createdAt)}/><Detail label="Modificado em" value={date(detailsFile?.modifiedAt??item.folder?.modifiedAt??item.shared?.modifiedAt)}/><Detail label="Compartilhamento" value={detailsFile?.sharedWithCount?`${detailsFile.sharedWithCount} acesso(s) interno(s)`:item.shared?`${item.permission} · compartilhado por ${item.shared.sharedByName??"Não disponível"}`:"Particular"}/></dl>
      <div className="flex flex-wrap gap-2">{item.kind==="file"&&<Link href={detailsFile?.mimeType.includes("wordprocessing")&&(!item.shared||item.permission==="EDIT")?`/documentos/${item.id}`:`/api/library/download/${item.id}`} className="min-h-9 rounded-control border border-nite-border-control px-3 py-2 text-type-body-compact text-nite-text-primary">Abrir ou baixar</Link>}{personal&&<button onClick={()=>onShare(item)} className="min-h-9 rounded-control border border-nite-border-control px-3 text-type-body-compact text-nite-text-primary">Compartilhar</button>}{personal&&<button onClick={()=>setShowRename((value)=>!value)} className="min-h-9 rounded-control border border-nite-border-control px-3 text-type-body-compact text-nite-text-primary">Renomear</button>}</div>
      {showRename&&personal&&(item.kind==="file"?<form action={organizeLibraryFile} className="grid gap-2"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="folderId" value={detailsFile?.folderId??item.file?.folderId??""}/><input type="hidden" name="returnTo" value={returnTo}/><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Novo nome<input name="title" defaultValue={item.name} required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><button className="min-h-9 rounded-control bg-nite-brand-primary px-3 text-type-body-compact text-white">Salvar nome</button></form>:<form action={updateLibraryFolder} className="grid gap-2"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="returnTo" value={returnTo}/><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Novo nome<input name="name" defaultValue={item.name} required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><button className="min-h-9 rounded-control bg-nite-brand-primary px-3 text-type-body-compact text-white">Salvar nome</button></form>)}
      {personal&&item.kind==="file"&&(folders.length>0||parentFolderId)&&detailsFile&&<form action={organizeLibraryFile} className="grid gap-2"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="title" value={item.name}/><input type="hidden" name="returnTo" value={returnTo}/><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Mover arquivo<select name="folderId" defaultValue={detailsFile.folderId??folders[0]?.id??""} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-2 text-nite-text-primary">{parentFolderId&&<option value={parentFolderId}>Pasta anterior</option>}{folders.map((folder)=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button className="min-h-9 rounded-control border border-nite-border-control px-3 text-type-body-compact text-nite-text-primary">Mover arquivo</button></form>}
      {personal&&item.kind==="folder"&&parentFolderId&&item.folder?.parentId&&<form action={updateLibraryFolder} className="grid gap-2"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="name" value={item.name}/><input type="hidden" name="parentId" value={parentFolderId}/><input type="hidden" name="returnTo" value={returnTo}/><button className="min-h-9 rounded-control border border-nite-border-control px-3 text-type-body-compact text-nite-text-primary">Mover para pasta anterior</button></form>}
      <section><h3 className="mb-2 font-medium text-nite-text-primary">Atividade</h3>{activity?.items.length?<><ul className="grid gap-3">{activity.items.map((entry:LibraryActivity)=><li key={entry.id} className="border-l-2 border-nite-brand-accent pl-3"><p className="text-type-body-compact text-nite-text-primary">{entry.action.replaceAll("_"," ")}</p><p className="text-type-metadata text-nite-text-secondary">{entry.actorName??"Responsável indisponível"} · {date(entry.occurredAt)}</p>{entry.reason&&<p className="text-type-metadata text-nite-text-muted">{entry.reason}</p>}</li>)}</ul>{activity.hasMore&&<button onClick={onLoadMoreActivity} className="mt-3 min-h-9 rounded-control border border-nite-border-control px-3 text-type-body-compact text-nite-text-primary">Carregar atividades anteriores</button>}</>:<p className="text-type-body-compact text-nite-text-secondary">{activity?"Nenhuma atividade registrada.":"Atividade indisponível para este item."}</p>}</section>
    </>}</div>
  </aside>;
}
function Detail({label,value}:{label:string;value:string}) {return <div><dt className="text-type-metadata text-nite-text-muted">{label}</dt><dd className="break-words text-nite-text-primary">{value}</dd></div>;}

function ShareDialog({item,onClose,onMessage}:{item:Item;onClose:()=>void;onMessage:(message:string)=>void}) {
  const [search,setSearch]=useState(""),[recipients,setRecipients]=useState<Array<{id:string;name:string}>>([]),[shares,setShares]=useState<ShareGrant[]>([]),[permission,setPermission]=useState<"VIEW"|"EDIT">("VIEW"),[loading,setLoading]=useState(false);
  const path=item.kind==="file"?`/api/v1/library/documents/${item.id}/shares`:`/api/v1/library/folders/${item.id}/shares`;
  async function refresh() {setLoading(true);try{const response=await fetch(`/api/library/manage?path=${encodeURIComponent(path)}`);if(!response.ok)throw new Error();const value:unknown=await response.json();if(!Array.isArray(value)||!value.every(shareGrant))throw new Error();setShares(value);}catch{onMessage("Não foi possível consultar os acessos deste item.");}finally{setLoading(false);}}
  useEffect(()=>{let active=true;void fetch(`/api/library/manage?path=${encodeURIComponent(path)}`).then(async(response)=>{
    if(!response.ok)throw new Error();const value:unknown=await response.json();if(!Array.isArray(value)||!value.every(shareGrant))throw new Error();if(active)setShares(value);
  }).catch(()=>{if(active)onMessage("Não foi possível consultar os acessos deste item.");});return()=>{active=false;};},[path,onMessage]);
  async function find(value:string) {setSearch(value);if(value.trim().length<2){setRecipients([]);return;}try{const response=await fetch(`/api/library/manage?path=${encodeURIComponent("/api/v1/library/share-recipients")}&search=${encodeURIComponent(value.trim())}&limit=20`);if(response.ok){const data:unknown=await response.json();if(Array.isArray(data)&&data.every((item)=>typeof item==="object"&&item!==null&&"id" in item&&typeof item.id==="string"&&"name" in item&&typeof item.name==="string") )setRecipients(data);}}catch{onMessage("A pesquisa de integrantes está indisponível.");}}
  async function change(method:"POST"|"PATCH"|"DELETE",shareId?:string,body?:unknown) {
    setLoading(true);try{const target=method==="POST"?path:`/api/v1/library/shares/${shareId}`;const response=await fetch(`/api/library/manage?path=${encodeURIComponent(target)}`,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});if(!response.ok)throw new Error();await refresh();setRecipients([]);setSearch("");onMessage("Acessos atualizados.");}catch{onMessage("A API não autorizou ou não concluiu a alteração de acesso.");}finally{setLoading(false);}
  }
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" onKeyDown={(event)=>containDialogFocus(event,onClose)} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-dialog border border-nite-border-soft bg-nite-background p-6 shadow-nite-modal">
    <header className="mb-5 flex items-start justify-between"><div><h2 id="share-dialog-title" className="font-display text-type-section-title text-nite-text-primary">Compartilhar</h2><p className="mt-1 break-all text-type-body-compact text-nite-text-secondary">{item.name}</p></div><button onClick={onClose} aria-label="Fechar compartilhamento" className="grid size-9 place-items-center rounded-control hover:bg-nite-surface-subtle">×</button></header>
    <form onSubmit={(event:FormEvent)=>{event.preventDefault();void refresh();}} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"><label className="sr-only" htmlFor="share-recipient">Pesquisar integrante ativo</label><input id="share-recipient" value={search} onChange={(event)=>void find(event.target.value)} placeholder="Nome do integrante (2+ caracteres)" className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-3 text-type-body-compact text-nite-text-primary"/><label className="sr-only" htmlFor="share-permission">Nível de acesso</label><select id="share-permission" value={permission} onChange={(event)=>setPermission(permissionValue(event.target.value))} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-type-body-compact text-nite-text-primary"><option value="VIEW">Pode visualizar</option><option value="EDIT">Pode editar</option></select><button type="submit" className="min-h-10 rounded-control bg-nite-brand-primary px-3 text-type-body-compact font-medium text-white" disabled={loading}>Atualizar lista</button></form>
    {recipients.length>0&&<ul className="my-3 max-h-40 overflow-y-auto rounded-control border border-nite-border-soft">{recipients.map((recipient)=><li key={recipient.id} className="flex items-center justify-between gap-2 border-b border-nite-border-soft px-3 py-2 last:border-0"><span className="text-type-body-compact text-nite-text-primary">{recipient.name}</span><button onClick={()=>void change("POST",undefined,{memberId:recipient.id,permission})} disabled={loading} className="rounded-control px-3 py-1 text-type-body-compact text-nite-brand-primary hover:bg-nite-surface-subtle">Conceder {permission}</button></li>)}</ul>}
    <section className="mt-5"><h3 className="mb-2 font-medium text-nite-text-primary">Acessos diretos</h3>{shares.length===0?<p className="text-type-body-compact text-nite-text-secondary">{loading?"Carregando…":"Nenhum acesso direto listado."}</p>:<ul className="divide-y divide-nite-border-soft">{shares.map((share)=><li key={share.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-type-body-compact text-nite-text-primary">{share.memberName}</p><p className="text-type-metadata text-nite-text-muted">Acesso direto · {share.grantedByName||"Concessor não disponível"}</p></div><div className="flex items-center gap-2"><select aria-label={`Permissão de ${share.memberName}`} value={share.permission} onChange={(event)=>void change("PATCH",share.id,{permission:permissionValue(event.target.value)})} className="min-h-9 rounded-control border border-nite-border-control bg-nite-surface px-2 text-type-metadata text-nite-text-primary"><option value="VIEW">Visualizar</option><option value="EDIT">Editar</option></select><button onClick={()=>void change("DELETE",share.id)} className="min-h-9 rounded-control px-2 text-type-metadata text-status-error">Revogar</button></div></li>)}</ul>}</section>
    <p className="mt-4 text-type-metadata text-nite-text-muted">Acessos herdados permanecem definidos pela pasta compartilhada e não podem ser revogados nesta lista.</p>
  </section></div>;
}
