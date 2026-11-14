"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect,useMemo,useState,type ChangeEvent,type FormEvent,type KeyboardEvent,type ReactNode } from "react";
import { parseActivityListing,parseLibraryFile,parseLibraryListing,parseSharedListing,type ActivityListing,type LibraryActivity,type LibraryFile,type LibraryFolder,type LibraryListing,type LibraryTemplate,type SharedItem } from "../../lib/documents/library-contracts";
import { createPersonalTemplateCopy,organizeLibraryFile,updateLibraryFolder } from "../../lib/documents/library-actions";
import { partitionUploadEntries } from "../../lib/documents/upload-batches";

type View="personal"|"shared";
type Props={listing:LibraryListing|null;sharedItems?:SharedItem[];hasMore?:boolean;nextCursor?:string|null;issue:string|null;view:View;templates:LibraryTemplate[];params:{folder?:string;permission?:string;error?:string;saved?:string;uploaded?:string;search?:string;type?:string;sort?:string;direction?:string}};
type Item={id:string;name:string;kind:"folder"|"file";folder?:LibraryFolder;file?:LibraryFile;permission?:"VIEW"|"EDIT";shared?:SharedItem};
const bytes=(size:number)=>size<1024?`${size} bytes`:size<1024*1024?`${(size/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} KB`:`${(size/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} MB`;
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"Não disponível";
const dateTime=(value:string|null|undefined)=>value?new Date(value).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Não disponível";
const relativePath=(file:File)=>{const value=Reflect.get(file,"webkitRelativePath");return typeof value==="string"&&value?value:file.name;};
const permissionValue=(value:string):"VIEW"|"EDIT"=>value==="EDIT"?"EDIT":"VIEW";
const folderColors=[
  {name:"Amarelo",value:"#f6c445"},{name:"Vermelho escuro",value:"#d83b01"},{name:"Laranja escuro",value:"#ca5010"},{name:"Verde escuro",value:"#107c10"},
  {name:"Verde azulado",value:"#038387"},{name:"Azul escuro",value:"#0078d4"},{name:"Púrpura escuro",value:"#5c2d91"},{name:"Rosa escuro",value:"#c239b3"},
  {name:"Cinza",value:"#a19f9d"},{name:"Vermelho claro",value:"#f4b7a7"},{name:"Laranja claro",value:"#fce1d5"},{name:"Verde claro",value:"#9fd89f"},
  {name:"Verde azulado claro",value:"#9ad9db"},{name:"Azul claro",value:"#8ec8f4"},{name:"Púrpura claro",value:"#c7b0e3"},{name:"Rosa claro",value:"#edbbe7"},
];
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
  if(item.kind==="folder"){
    const color=item.folder?.color&&/^#[\da-f]{6}$/i.test(item.folder.color)?item.folder.color:"#f6c445";
    return <FolderGlyph color={color} className="size-8"/>;
  }
  const mime=item.file?.mimeType??"";
  const family=mime.includes("wordprocessing")?"word":mime.includes("spreadsheet")?"excel":mime.includes("presentation")?"powerpoint":mime.includes("pdf")?"pdf":mime.startsWith("image/")?"image":"file";
  const documentIcons:Record<string,string>={word:"/images/documents/NiteConnect-Word.svg",excel:"/images/documents/NiteConnect-Excel.svg",powerpoint:"/images/documents/NiteConnect-PowerPoint.svg",pdf:"/images/documents/NiteConnect-PDF.svg"};
  const documentSource=documentIcons[family];
  if(documentSource)return <Image aria-hidden="true" alt="" src={documentSource} width={28} height={28} className="size-7 shrink-0"/>;
  const tone=family==="word"?"#185abd":family==="excel"?"#107c41":family==="powerpoint"?"#c43e1c":family==="pdf"?"#d83b01":family==="image"?"#7c3aed":"#64748b";
  const label=family==="word"?"W":family==="excel"?"X":family==="powerpoint"?"P":family==="pdf"?"PDF":family==="image"?"IMG":"ARQ";
  return <FileGlyph label={label} tone={tone} className="size-7"/>;
}

function FileGlyph({label,tone,className="size-6"}:{label:string;tone:string;className?:string}) {
  return <svg aria-hidden="true" viewBox="0 0 32 36" className={`${className} shrink-0 drop-shadow-sm`} fill="none">
    <path d="M5 1.5h14l8 8V32a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 3 32V4a2.5 2.5 0 0 1 2-2.5Z" fill="white" stroke="#cbd5e1"/>
    <path d="M19 1.5v6a2 2 0 0 0 2 2h6" fill="#e2e8f0"/>
    <path d="M3 19h19v9a1.5 1.5 0 0 1-1.5 1.5h-16A1.5 1.5 0 0 1 3 28z" fill={tone}/>
    <text x="12.5" y="27" textAnchor="middle" fill="white" fontSize={label==="PDF"?"6.5":"10"} fontWeight="700" fontFamily="Arial, sans-serif">{label}</text>
    </svg>;
}

function FolderGlyph({color,className="size-5"}:{color:string;className?:string}) {
  return <svg aria-hidden="true" viewBox="0 0 32 26" className={`${className} shrink-0`} fill="none"><path d="M2.5 5A2.5 2.5 0 0 1 5 2.5h7.1l3 3H27A2.5 2.5 0 0 1 29.5 8v13A2.5 2.5 0 0 1 27 23.5H5A2.5 2.5 0 0 1 2.5 21z" fill={color} stroke="color-mix(in srgb, currentColor 18%, transparent)" strokeWidth=".7"/><path d="M2.8 8h26.4" stroke="white" strokeOpacity=".48" strokeWidth="1"/></svg>;
}

function UploadGlyph({kind}:{kind:"file"|"folder"}) {
  return kind==="file"
    ? <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 text-nite-text-secondary" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2.5h6l4 4V12M11 2.5v4h4M5 2.5a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 5 17.5h5"/><path d="M14 17v-7m-3 3 3-3 3 3"/></svg>
    : <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 text-nite-text-secondary" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 6a1.5 1.5 0 0 1 1.5-1.5h4l1.5 1.7h6.5A1.5 1.5 0 0 1 17.5 7.7v5.8A1.5 1.5 0 0 1 16 15H8"/><path d="M5.5 17v-7m-3 3 3-3 3 3"/></svg>;
}

function ListGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 4h10M7 8h10M7 12h10M7 16h10"/><circle cx="3.5" cy="4" r=".7" fill="currentColor"/><circle cx="3.5" cy="8" r=".7" fill="currentColor"/><circle cx="3.5" cy="12" r=".7" fill="currentColor"/><circle cx="3.5" cy="16" r=".7" fill="currentColor"/></svg>;
}

function GridGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="12" y="2" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="12" y="12" width="6" height="6" rx="1"/></svg>;
}

function MoreGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor"><circle cx="4" cy="10" r="1.35"/><circle cx="10" cy="10" r="1.35"/><circle cx="16" cy="10" r="1.35"/></svg>;
}

function CopyGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="7" y="6" width="10" height="11" rx="1.5"/><path d="M13 6V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v8A1.5 1.5 0 0 0 4.5 14H7"/></svg>;
}

function RenameGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12.5 4.5 3 3M3 17l3.6-.8L16 6.8a2.12 2.12 0 0 0-3-3L3.8 13z"/><path d="M11 17h6"/></svg>;
}

function LinkGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 12 12 8m-6.5 6.5 1.2-1.2m6.6-6.6 1.2-1.2a3 3 0 0 1 4.2 4.2l-3.2 3.2a3 3 0 0 1-4.2 0m-4.6-.4a3 3 0 0 1-4.2 0 3 3 0 0 1 0-4.2l3.2-3.2a3 3 0 0 1 4.2 0"/></svg>;
}

function RequestGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l1.5 1.5h5A1.5 1.5 0 0 1 16.5 8v7A1.5 1.5 0 0 1 15 16.5H4.5A1.5 1.5 0 0 1 3 15z"/><path d="M10 9v5m-2.5-2.5L10 9l2.5 2.5"/></svg>;
}

function DeleteGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5h14M8 5V3h4v2m3 0-.8 11H5.8L5 5m2.5 3v5m5-5v5"/></svg>;
}

function DownloadGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 2.5v10m-4-4 4 4 4-4M3.5 13v3A1.5 1.5 0 0 0 5 17.5h10a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg>;
}

function DuplicateGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="7" y="6" width="10" height="11" rx="1.5"/><path d="M13 6V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v8A1.5 1.5 0 0 0 4.5 14H7"/><path d="M10 11.5h4m-2-2v4"/></svg>;
}

function MoveGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 6a1.5 1.5 0 0 1 1.5-1.5h4l1.5 1.7h6.5A1.5 1.5 0 0 1 17.5 7.7v5.8A1.5 1.5 0 0 1 16 15H9"/><path d="M2.5 12h8m-2.5-2.5L10.5 12 8 14.5"/></svg>;
}

function AutomationGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m11 2.5-7 8h5l-1 7 8-9h-5z"/></svg>;
}

function SelectionAction({label,disabledReason,onClick,children,variant="toolbar"}:{label:string;disabledReason?:string;onClick?:()=>void;children:ReactNode;variant?:"toolbar"|"menu"}) {
  const disabled=disabledReason!==undefined;
  const layout=variant==="menu"?"flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-left":"inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control px-2.5 sm:px-3";
  return <button type="button" disabled={disabled} title={disabledReason} onClick={onClick} className={`${layout} text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:text-nite-text-muted disabled:opacity-65`}>{children}{label}</button>;
}

export function toggleDetailsPanel(isOpen:boolean,onOpen:()=>void,onClose:()=>void):void {
  if(isOpen){onClose();return;}
  onOpen();
}

function FavoriteGlyph({active=false}:{active?:boolean}) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill={active?"currentColor":"none"} stroke="currentColor" strokeWidth="1.5"><path d="m10 2.5 2.35 4.77 5.27.77-3.81 3.71.9 5.25L10 14.52l-4.71 2.48.9-5.25-3.81-3.71 5.27-.77z"/></svg>;
}

function SelectionCheckbox({checked,label,onChange,className=""}:{checked:boolean;label:string;onChange:(checked:boolean)=>void;className?:string}) {
  return <label className={`relative grid size-5 shrink-0 cursor-pointer place-items-center rounded-full ${className}`} onClick={(event)=>event.stopPropagation()}>
    <input aria-label={label} type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)} className="peer absolute inset-0 size-full cursor-pointer opacity-0"/>
    <span aria-hidden="true" className={`grid size-[18px] place-items-center rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-nite-focus ${checked?"border-nite-brand-primary bg-nite-brand-primary text-white":"border-nite-border-control bg-nite-background text-transparent"}`}>
      {checked&&<svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m3 8 3.2 3.2L13 4.5"/></svg>}
    </span>
  </label>;
}

export function SelectionToolbar({items,view,details,onShare,onDownload,onRename,onMove,onClear,onDetails}:{items:Item[];view:View;details:boolean;onShare:(item:Item)=>void;onDownload:(item:Item)=>void;onRename:(item:Item)=>void;onMove:(item:Item)=>void;onClear:()=>void;onDetails:()=>void}) {
  const item=items.length===1?items[0]:undefined;
  const oneItemReason=items.length===1?undefined:"Ação em lote ainda não está disponível para esta operação.";
  const canOrganize=!!item&&view==="personal"&&(item.kind==="folder"?item.folder?.kind==="CUSTOM":item.file?.context==="PERSONAL");
  const unavailable=(reason:string)=>oneItemReason??reason;
  return <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 rounded-control border border-nite-border-soft bg-nite-surface-subtle px-2 py-1 text-type-body-compact text-nite-text-secondary">
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
      <SelectionAction label="Compartilhar" disabledReason={view==="personal"&&item?undefined:unavailable("Compartilhamento não está disponível para esta seleção.")} onClick={item?()=>onShare(item):undefined}><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="10" r="2.4"/><circle cx="14" cy="5" r="2.2"/><circle cx="14" cy="15" r="2.2"/><path d="m8 9 4-3m-4 5 4 3"/></svg></SelectionAction>
      <SelectionAction label="Copiar link" disabledReason={unavailable("Links compartilháveis ainda não estão disponíveis no módulo documental.")}><LinkGlyph/></SelectionAction>
      <SelectionAction label="Solicitar arquivos" disabledReason={unavailable("Solicitação de arquivos ainda não está disponível no módulo documental.")}><RequestGlyph/></SelectionAction>
      <SelectionAction label="Excluir" disabledReason={unavailable("O arquivamento pela área pessoal exige perfil administrador.")}><DeleteGlyph/></SelectionAction>
      <SelectionAction label="Adicionar aos favoritos" disabledReason={unavailable("Favoritos ainda não estão disponíveis no módulo documental.")}><FavoriteGlyph/></SelectionAction>
      <SelectionAction label="Baixar" disabledReason={item?.kind==="file"?oneItemReason:unavailable("O download de pastas ainda não está disponível no módulo documental.")} onClick={item?.kind==="file"?()=>onDownload(item):undefined}><DownloadGlyph/></SelectionAction>
      {!details&&<>
        <SelectionAction label="Duplicar" disabledReason={unavailable("Duplicação ainda não está disponível no módulo documental.")}><DuplicateGlyph/></SelectionAction>
        <SelectionAction label="Mover para" disabledReason={canOrganize?undefined:unavailable("Este item não pode ser movido neste contexto.")} onClick={item&&canOrganize?()=>onMove(item):undefined}><MoveGlyph/></SelectionAction>
        <SelectionAction label="Copiar para" disabledReason={unavailable("Cópia de itens ainda não está disponível no módulo documental.")}><CopyGlyph/></SelectionAction>
      </>}
      <details className="group/selection-actions relative">
        <summary aria-label="Mais opções de organização" className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden"><MoreGlyph/></summary>
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-control border border-nite-border-soft bg-nite-surface p-1 shadow-nite-floating" aria-label="Opções de organização">
          {details&&<>
            <SelectionAction variant="menu" label="Duplicar" disabledReason={unavailable("Duplicação ainda não está disponível no módulo documental.")}><DuplicateGlyph/></SelectionAction>
            <SelectionAction variant="menu" label="Mover para" disabledReason={canOrganize?undefined:unavailable("Este item não pode ser movido neste contexto.")} onClick={item&&canOrganize?()=>onMove(item):undefined}><MoveGlyph/></SelectionAction>
            <SelectionAction variant="menu" label="Copiar para" disabledReason={unavailable("Cópia de itens ainda não está disponível no módulo documental.")}><CopyGlyph/></SelectionAction>
          </>}
          <SelectionAction variant="menu" label="Renomear" disabledReason={canOrganize?undefined:unavailable("Este item não pode ser renomeado neste contexto.")} onClick={item&&canOrganize?()=>onRename(item):undefined}><RenameGlyph/></SelectionAction>
          <SelectionAction variant="menu" label="Automatizar" disabledReason="Automatizações ainda não estão disponíveis no módulo documental."><AutomationGlyph/><svg aria-hidden="true" viewBox="0 0 20 20" className="ml-auto size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m7 4 6 6-6 6"/></svg></SelectionAction>
        </div>
      </details>
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <button type="button" onClick={onClear} aria-label="Limpar seleção" className="inline-flex min-h-9 items-center gap-2 rounded-control border border-nite-border-soft px-3 text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus"><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m5 5 10 10m0-10L5 15"/></svg>{items.length} selecionado{items.length===1?"":"s"}</button>
      <button type="button" onClick={onDetails} aria-expanded={details} className={`inline-flex min-h-9 items-center gap-2 rounded-control border border-nite-border-soft px-3 text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus ${details?"border-nite-brand-primary text-nite-brand-primary":""}`}><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2.5" y="3" width="15" height="14" rx="2"/><path d="M7 3v14M10 7h5m-5 3h5m-5 3h4"/></svg>Detalhes</button>
    </div>
  </div>;
}

export function MyFilesExplorer({listing:initialListing,sharedItems=[],hasMore=false,nextCursor=null,issue,view,templates,params}:Props) {
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]),[layout,setLayout]=useState<"list"|"compact"|"grid">("list");
  const [createMenu,setCreateMenu]=useState(false),[dialog,setDialog]=useState<"folder"|"files"|"directory"|null>(null);
  const [filtersOpen,setFiltersOpen]=useState(false),[quickFiltersVisible,setQuickFiltersVisible]=useState(true),[folderColor,setFolderColor]=useState(folderColors[0]!.value),[folderName,setFolderName]=useState("");
  const [details,setDetails]=useState(false),[detailItem,setDetailItem]=useState<Item|null>(null),[detailPayload,setDetailPayload]=useState<{file?:LibraryFile;activity?:ActivityListing}|null>(null);
  const [shareTarget,setShareTarget]=useState<Item|null>(null),[managementTarget,setManagementTarget]=useState<Item|null>(null),[message,setMessage]=useState<string|null>(null);
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
  function select(id:string,checked:boolean) {
    const next=checked?[...new Set([...selected,id])]:selected.filter((item)=>item!==id);
    setSelected(next);
    if(details)void(next[0]?showDetails(items.find((item)=>item.id===next[0])):showDetails(undefined,true));
  }
  function clearSelection() {
    setSelected([]);
    if(details)void showDetails(undefined,true);
  }
  async function showDetails(item?:Item,activityOnly=false) {
    const target=item??(activityOnly?undefined:selectedItems[0])??(current?{id:current.id,name:current.name,kind:"folder" as const,folder:current}:undefined);
    if(!target){setMessage("Selecione um item para ver os detalhes.");return;}
    setDetailItem(activityOnly?null:item??selectedItems[0]??null);
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
    const item=detailItem??selectedItems[0]??(current?{id:current.id,name:current.name,kind:"folder" as const,folder:current}:null);
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
  const wordMime="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const quickTypes=[
    {label:"Word",mime:wordMime,src:"/images/documents/NiteConnect-Word.svg",supported:true},
    {label:"Excel",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",src:"/images/documents/NiteConnect-Excel.svg",supported:false},
    {label:"PowerPoint",mime:"application/vnd.openxmlformats-officedocument.presentationml.presentation",src:"/images/documents/NiteConnect-PowerPoint.svg",supported:false},
    {label:"PDF",mime:"application/pdf",src:"/images/documents/NiteConnect-PDF.svg",supported:true},
  ];
  const inFolder=Boolean(params.folder);
  const pageTitle=inFolder?current?.name??"Pasta":view==="shared"?"Compartilhado comigo":"Meus arquivos";
  const typeOptions=[{label:"Documento Word",mime:wordMime},{label:"PDF",mime:"application/pdf"},{label:"Imagem PNG",mime:"image/png"},{label:"Imagem JPEG",mime:"image/jpeg"}];
  function toggleType(mime:string) {
    router.push(queryString(view,folderId,{...query,type:params.type===mime?undefined:mime}));
  }
  return <section className="h-[calc(100svh-6.5rem)] min-w-0 overflow-hidden sm:h-[calc(100svh-7rem)] lg:mb-[-1.75rem] lg:h-[calc(100svh-5.75rem)]" aria-label="Meus arquivos">
    <div className={`grid h-full min-h-0 min-w-0 items-stretch gap-4 ${details||filtersOpen?"lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]":"grid-cols-1"}`}>
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        {inFolder&&<nav aria-label="Caminho da pasta" className="mb-2 flex flex-wrap items-center gap-2 text-type-body-compact">
          <Link href={rootHref} className="text-nite-text-secondary hover:text-nite-brand-primary">{view==="shared"?"Compartilhado comigo":"Meus arquivos"}</Link>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 text-nite-text-muted" fill="none" stroke="currentColor"><path d="m6 3 5 5-5 5"/></svg>
          <span className="truncate font-semibold text-nite-text-primary">{pageTitle}</span>
        </nav>}
        <details className="group relative w-fit">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control py-1 font-display text-type-page-title font-semibold text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden">
            {pageTitle}<svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-control border border-nite-border-soft bg-nite-surface-elevated p-1 shadow-nite-floating" role="group" aria-label="Criar ou carregar">
            <button type="button" onClick={(event)=>{event.currentTarget.closest("details")?.removeAttribute("open");setFolderName("");setFolderColor(folderColors[0]!.value);setDialog("folder");}} className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-nite-focus"><FolderGlyph color="#f6c445"/>Nova pasta</button>
            <button type="button" onClick={(event)=>{event.currentTarget.closest("details")?.removeAttribute("open");setDialog("files");}} className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-nite-focus"><UploadGlyph kind="file"/>Carregar arquivos</button>
            <button type="button" onClick={(event)=>{event.currentTarget.closest("details")?.removeAttribute("open");setDialog("directory");}} className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-nite-focus"><UploadGlyph kind="folder"/>Carregar pasta</button>
          </div>
        </details>
      </div>
      {view==="personal"&&<div className="relative">
        <button type="button" onClick={()=>setCreateMenu((open)=>!open)} aria-expanded={createMenu} style={{fontFamily:'"Segoe UI", Tahoma, Arial, sans-serif',fontSize:"14px",lineHeight:"20px",fontWeight:600}} className="inline-flex min-h-9 items-center gap-2.5 rounded-xl bg-nite-brand-primary py-2 pl-2.5 pr-3 text-sm font-semibold text-white shadow-sm hover:brightness-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3v14M3 10h14"/></svg>Criar ou carregar
        </button>
        {createMenu&&<div className="absolute right-0 z-30 mt-2 max-h-[min(70vh,32rem)] w-72 overflow-y-auto rounded-control border border-nite-border-soft bg-nite-surface p-1 shadow-nite-floating" role="group" aria-label="Criar ou carregar">
          <button type="button" onClick={()=>{setFolderName("");setFolderColor(folderColors[0]!.value);setDialog("folder");setCreateMenu(false);}} className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle"><FolderGlyph color="#f6c445"/>Nova pasta</button>
          <button type="button" onClick={()=>{setDialog("files");setCreateMenu(false);}} className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle"><UploadGlyph kind="file"/>Carregar arquivos</button>
          <button type="button" onClick={()=>{setDialog("directory");setCreateMenu(false);}} className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle"><UploadGlyph kind="folder"/>Carregar pasta</button>
          {templates.length>0&&<div className="mt-1 border-t border-nite-border-soft pt-1"><p className="px-3 py-2 text-type-metadata text-nite-text-muted">Modelos disponíveis</p>{templates.map((template)=><form key={template.id} action={createPersonalTemplateCopy}><input type="hidden" name="templateId" value={template.id}/><input type="hidden" name="returnTo" value={baseAction}/><button onClick={()=>setCreateMenu(false)} className="w-full truncate rounded-control px-3 py-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">{template.title}</button></form>)}</div>}
        </div>}
      </div>}
    </div>

    <div className="relative flex min-h-11 flex-wrap items-center justify-between gap-3" aria-label="Ferramentas dos arquivos">
      {selected.length>0?<SelectionToolbar items={selectedItems} view={view} details={details} onShare={setShareTarget} onDownload={(item)=>window.open(`/api/library/download/${item.id}`,"_blank","noopener,noreferrer")} onRename={setManagementTarget} onMove={setManagementTarget} onClear={clearSelection} onDetails={()=>toggleDetailsPanel(details,()=>void showDetails(),()=>setDetails(false))}/>:<>
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" aria-label="Filtros" aria-expanded={filtersOpen} onClick={()=>{setDetails(false);setFiltersOpen((open)=>!open);}} className={`grid size-10 shrink-0 place-items-center rounded-full border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${filtersOpen?"bg-nite-surface-elevated":""}`}>
          <Image aria-hidden="true" alt="" src="/images/documents/NiteConnect-Filtro.svg" width={20} height={20} className="size-5"/>
        </button>
        {quickFiltersVisible&&<div className="flex flex-wrap items-center gap-2" aria-label="Filtros rápidos por tipo">
          {quickTypes.map((item)=>{
            const active=params.type===item.mime;
            return <button key={item.label} type="button" disabled={!item.supported} aria-label={`${item.label}${item.supported?active?", filtro aplicado":", filtrar":", formato não suportado"}`} aria-pressed={item.supported?active:undefined} title={item.supported?item.label:`${item.label} ainda não é aceito no módulo documental`} onClick={()=>toggleType(item.mime)} className={`grid size-10 place-items-center rounded-full border border-transparent bg-nite-surface-subtle transition-colors hover:bg-nite-surface-elevated focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:opacity-65 ${active?"ring-2 ring-nite-brand-primary ring-offset-2 ring-offset-nite-background":""}`}><Image aria-hidden="true" alt="" src={item.src} width={24} height={24} className="size-6"/></button>;
          })}
        </div>}
        <button type="button" aria-label={quickFiltersVisible?"Ocultar filtros aplicados":"Mostrar filtros aplicados"} aria-expanded={quickFiltersVisible} onClick={()=>setQuickFiltersVisible((visible)=>!visible)} className="grid size-8 shrink-0 place-items-center rounded-full border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 transition-transform motion-reduce:transition-none ${quickFiltersVisible?"rotate-180":""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 4 6 6-6 6"/></svg>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex items-center gap-2">
          <details className="group relative">
            <summary aria-label="Opções de visualização e classificação" className="grid size-10 cursor-pointer list-none place-items-center rounded-full border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden"><svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--nite-background)"/><circle cx="15" cy="12" r="2" fill="var(--nite-background)"/><circle cx="11" cy="18" r="2" fill="var(--nite-background)"/></svg></summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-control border border-nite-border-soft bg-nite-surface p-2 shadow-nite-floating"><p className="px-2 py-2 text-type-metadata font-semibold text-nite-text-muted">Visualização</p>{([["list","Lista"],["compact","Lista compacta"],["grid","Blocos"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={layout===value} onClick={()=>setLayout(value)} className={`flex min-h-10 w-full items-center gap-3 rounded-control px-2 text-left text-type-body-compact ${layout===value?"bg-nite-brand-soft text-nite-brand-primary":"text-nite-text-primary hover:bg-nite-surface-subtle"}`}>{value==="grid"?<GridGlyph/>:<ListGlyph/>}{label}</button>)}<div className="my-2 border-t border-nite-border-soft"/><p className="px-2 py-2 text-type-metadata font-semibold text-nite-text-muted">Classificar por</p>{([["name","Nome"],["modifiedAt","Modificado"],["createdAt","Criado"],["size","Tamanho do arquivo"]] as const).map(([sort,label])=><Link key={sort} href={queryString(view,folderId,{...query,sort,direction:query.sort===sort&&query.direction!=="desc"?"desc":"asc"})} className="flex min-h-9 items-center rounded-control px-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">{label}</Link>)}</div>
          </details>
          <button type="button" aria-expanded={details} aria-label="Detalhes" onClick={()=>{setFiltersOpen(false);if(details){setDetails(false);return;}void showDetails();}} className={`inline-flex min-h-10 items-center gap-2 rounded-control border border-nite-border-soft px-3 text-type-body-compact text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${details?"border-nite-brand-primary text-nite-brand-primary":""}`}>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2.5" y="3" width="15" height="14" rx="2"/><path d="M7 3v14M10 7h5m-5 3h5m-5 3h4"/></svg>Detalhes
          </button>
        </div>
      </div>
      </>}
    </div>

    {params.error&&<p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft px-4 py-3 text-type-body-compact text-status-error">{errorText(params.error)}</p>}
    {(params.saved||params.uploaded)&&<p role="status" className="rounded-control border border-status-validated-border bg-status-validated-soft px-4 py-3 text-type-body-compact text-status-validated">{params.uploaded?"Upload concluído.":"Alterações salvas."}</p>}
    {uploadSummary&&<p role="status" className="rounded-control border border-nite-border-soft bg-nite-surface-subtle px-4 py-3 text-type-body-compact text-nite-text-primary">{uploadSummary}</p>}
    {message&&<p role="status" className="rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-type-body-compact text-status-warning">{message}</p>}
    {progress&&<div role="status" aria-live="polite" className="rounded-panel border border-nite-border-soft bg-nite-surface p-4"><div className="mb-2 flex justify-between text-type-body-compact text-nite-text-primary"><span>Enviando arquivos · {progress.sent} de {progress.total}</span><span>{progress.percent}%</span></div><progress className="h-2 w-full accent-nite-brand-primary" max={100} value={progress.percent}/></div>}

    {issue&&<div role="alert" className="grid min-h-72 place-content-center gap-2 rounded-panel border border-nite-border-soft bg-nite-surface px-4 text-center"><p className="font-medium text-nite-text-primary">{issue==="access"?"Você não tem acesso a esta pasta.":issue==="not-found"?"A pasta não existe ou não está disponível para sua conta.":"Não foi possível carregar os arquivos."}</p><p className="text-type-body-compact text-nite-text-secondary">{issue==="access"||issue==="not-found"?"Volte para uma área compartilhada com você.":"Verifique a conexão com o serviço documental e tente novamente."}</p><button onClick={()=>router.refresh()} className="mx-auto min-h-10 rounded-control border border-nite-border-control px-4 text-nite-text-primary">Tentar novamente</button></div>}
    {!issue&&(listing||view==="shared")&&<div className="min-h-0 min-w-0 flex-1">
      <div className="flex h-full min-w-0 min-h-0 flex-col overflow-hidden bg-nite-background">
        {displayedItems.length===0?<div className="grid min-h-80 flex-1 place-content-center gap-2 px-5 text-center"><p className="font-display text-type-section-title text-nite-text-primary">{params.search||params.type?"Nenhum resultado encontrado":view==="shared"?"Nenhum arquivo compartilhado":"Esta pasta está vazia"}</p><p className="max-w-md text-type-body-compact text-nite-text-secondary">{params.search||params.type?"Ajuste a pesquisa ou remova o filtro para ver outros arquivos.":view==="shared"?"Quando alguém compartilhar um arquivo ou pasta com você, o item aparecerá aqui.":"Crie uma pasta ou carregue arquivos para começar."}</p>{view==="personal"&&!params.search&&!params.type&&<button onClick={()=>setDialog("files")} className="mx-auto min-h-10 rounded-control bg-nite-brand-primary px-4 text-white">Carregar arquivos</button>}</div>
          :layout==="grid"?<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-4 sm:grid-cols-2 xl:grid-cols-3">{displayedItems.map((item)=><button key={item.id} onClick={()=>select(item.id,!selected.includes(item.id))} onDoubleClick={()=>openItem(item)} className={`rounded-panel border p-4 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${selected.includes(item.id)?"border-nite-brand-primary bg-nite-brand-soft":"border-nite-border-soft hover:bg-nite-surface-subtle"}`}><span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-control bg-nite-surface-subtle"><ItemIcon item={item}/></span><span className="min-w-0 truncate font-medium text-nite-text-primary">{item.name}</span></span><span className="mt-3 block text-type-metadata text-nite-text-muted">{item.kind==="folder"?"Pasta":item.file?bytes(item.file.size):"Arquivo"}</span></button>)}</div>
          :<div className="min-h-0 flex-1 overflow-auto"><table className={`w-full min-w-[680px] table-fixed text-left ${layout==="compact"?"text-type-metadata":"text-type-body-compact"}`}>
            <thead className="sticky top-0 z-10 border-b border-nite-border-soft bg-nite-background text-sm text-nite-text-muted"><tr><th aria-hidden="true" className="w-12 px-3 py-3"/><th className="w-10 px-2 py-3"><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 text-nite-text-muted" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M5 2.5h6l4 4v10A1.5 1.5 0 0 1 13.5 18h-8A1.5 1.5 0 0 1 4 16.5v-12A2 2 0 0 1 5 2.5Z"/><path d="M11 2.5v4h4"/></svg></th>
              <th className="min-w-40 px-3 py-3"><SortLink label="Nome" sort="name" {...{view,folderId,query}}/></th><th className="hidden min-w-28 px-3 py-3 md:table-cell"><SortLink label="Modificado" sort="modifiedAt" {...{view,folderId,query}}/></th><th className="hidden min-w-32 px-3 py-3 xl:table-cell">Modificado por</th><th className="hidden min-w-24 px-3 py-3 lg:table-cell">{view==="shared"&&!listing?"Tamanho":<SortLink label="Tamanho" sort="size" {...{view,folderId,query}}/>}</th><th className="hidden min-w-28 px-3 py-3 xl:table-cell">Compartilhamento</th><th className="hidden min-w-24 px-3 py-3 2xl:table-cell">Atividade</th><th className="w-10 px-1 py-3"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{displayedItems.map((item)=><tr key={item.id} tabIndex={0} aria-selected={selected.includes(item.id)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select(item.id,!selected.includes(item.id));}if(event.key==="ArrowRight")openItem(item);}} onDoubleClick={()=>openItem(item)} onClick={()=>select(item.id,!selected.includes(item.id))} style={{backgroundColor:selected.includes(item.id)?"color-mix(in srgb, var(--nite-brand-primary) 24%, var(--nite-background))":undefined}} className="group cursor-pointer border-b border-nite-border-soft/70 transition-colors hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus">
              <td className="px-3 py-2"><SelectionCheckbox label={`Selecionar ${item.name}`} checked={selected.includes(item.id)} onChange={(checked)=>select(item.id,checked)} className={`transition-opacity focus-within:opacity-100 ${selected.includes(item.id)?"opacity-100":"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}/></td>
              <td className="px-2 py-2"><ItemIcon item={item}/></td>
              <td className="max-w-[26rem] px-3 py-2"><div className="flex min-w-0 items-center gap-2"><button onClick={(event)=>{event.stopPropagation();openItem(item);}} className="min-w-0 truncate text-left font-medium text-nite-text-primary hover:text-nite-brand-primary hover:underline focus-visible:outline-2 focus-visible:outline-nite-focus">{item.name}</button>{item.kind==="file"&&item.file?.sharedWithCount?<span aria-label="Compartilhado" title="Compartilhado" className="shrink-0 text-nite-text-secondary"><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="6" r="2.5"/><path d="M2.5 16a4.5 4.5 0 0 1 9 0m1-8h5m-2.5-2.5v5"/></svg></span>:null}</div></td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-nite-text-secondary md:table-cell">{date(item.kind==="folder"?item.folder?.modifiedAt:item.file?.modifiedAt??item.shared?.modifiedAt)}</td><td className="hidden max-w-48 truncate px-3 py-2 text-nite-text-secondary xl:table-cell">{item.kind==="folder"?item.folder?.modifiedByName??"Não disponível":item.file?.modifiedByName??item.file?.createdByName??"Não disponível"}</td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-nite-text-secondary lg:table-cell">{item.kind==="folder"?"Não disponível":item.file?bytes(item.file.size):"Não disponível"}</td><td className="hidden px-3 py-2 text-nite-text-secondary xl:table-cell">{item.kind==="folder"?"Particular":item.file?.sharedWithCount?`${item.file.sharedWithCount} acesso(s)`:item.permission??"Particular"}</td>
              <td className="hidden px-3 py-2 text-nite-text-secondary 2xl:table-cell">{item.kind==="file"&&item.file?.lastOpenedAt?`Aberto ${date(item.file.lastOpenedAt)}`:"—"}</td>
              <td className="px-2 py-2" onClick={(event)=>event.stopPropagation()}><div className="flex items-center justify-end gap-0.5"><button type="button" aria-label={`Adicionar ${item.name} aos favoritos`} title="Favoritos ainda não estão disponíveis no módulo documental" disabled className="grid size-8 cursor-not-allowed place-items-center rounded-full text-nite-text-muted opacity-0 group-hover:opacity-60 group-focus-within:opacity-60"><FavoriteGlyph/></button>{view==="personal"&&<button type="button" aria-label={`Compartilhar ${item.name}`} title="Compartilhar" onClick={()=>setShareTarget(item)} className="grid size-8 place-items-center rounded-full text-nite-text-secondary opacity-0 hover:bg-nite-surface-elevated focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 3.5h5v5m-.5-4.5-7 7"/><path d="M15 11.5v3A1.5 1.5 0 0 1 13.5 16h-9A1.5 1.5 0 0 1 3 14.5v-9A1.5 1.5 0 0 1 4.5 4h3"/></svg></button>}<details className="group/actions relative"><summary aria-label={`Mais ações para ${item.name}`} onClick={(event)=>event.stopPropagation()} className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-nite-text-secondary opacity-0 hover:bg-nite-surface-elevated focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [&::-webkit-details-marker]:hidden"><MoreGlyph/></summary><div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-control border border-nite-border-soft bg-nite-surface p-1 shadow-nite-floating"><button type="button" onClick={()=>void showDetails(item)} className="flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">Detalhes</button>{view==="personal"&&<><button type="button" disabled title="Copiar itens ainda não está disponível no módulo documental" className="flex min-h-10 w-full cursor-not-allowed items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-muted opacity-70"><CopyGlyph/>Copiar para</button><button type="button" onClick={()=>setManagementTarget(item)} className="flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle"><RenameGlyph/>Renomear</button></>}{item.kind==="file"&&<button type="button" onClick={()=>openItem(item)} className="w-full rounded-control px-3 py-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">Abrir ou baixar</button>}</div></details></div></td>
            </tr>)}</tbody></table></div>}
        {(listing?.hasMore||listing?.nextCursor||receivedHasMore||receivedCursor)&&<div className="border-t border-nite-border-soft p-3 text-center"><button type="button" onClick={()=>void loadMore()} className="min-h-10 rounded-control border border-nite-border-control px-4 text-type-body-compact font-medium text-nite-text-primary hover:bg-nite-surface-subtle">Carregar mais arquivos</button></div>}
      </div>
    </div>}
    </div>
    {filtersOpen&&<aside aria-label="Filtros de arquivos" className="fixed right-0 top-16 z-40 h-[calc(100svh-4rem)] w-[min(22rem,calc(100vw-1rem))] min-w-0 overflow-y-auto rounded-l-panel border border-nite-border-soft bg-nite-surface p-4 lg:static lg:right-auto lg:top-auto lg:z-auto lg:h-auto lg:w-auto lg:rounded-panel lg:max-h-[min(70svh,54rem)] lg:overflow-y-auto"><div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-semibold text-nite-text-primary">Filtros</h2><button type="button" aria-label="Fechar filtros" onClick={()=>setFiltersOpen(false)} className="grid size-9 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">×</button></div><fieldset className="grid gap-1"><legend className="mb-2 text-type-metadata font-semibold text-nite-text-secondary">Tipo de arquivo</legend><label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle"><input type="radio" name="library-type" checked={!params.type} onChange={()=>params.type&&toggleType(params.type)} className="size-4 accent-nite-brand-primary"/>Todos os tipos</label>{typeOptions.map((option)=><label key={option.mime} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle"><input type="radio" name="library-type" checked={params.type===option.mime} onChange={()=>toggleType(option.mime)} className="size-4 accent-nite-brand-primary"/>{option.label}</label>)}</fieldset></aside>}
    {details&&!filtersOpen&&<DetailsPanel item={detailItem??selectedItems[0]??{id:current?.id??"",name:"Meus arquivos",kind:"folder",folder:current??undefined}} file={detailPayload?.file} activity={detailPayload?.activity} activityOnly={!detailItem&&selectedItems.length===0} loading={loadingDetails} currentFolder={current} atRoot={!inFolder} onClose={()=>setDetails(false)} onLoadMoreActivity={()=>void loadMoreActivity()}/>}
    </div>

    {dialog&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)setDialog(null);}}>
      <section role="dialog" aria-modal="true" aria-labelledby="my-files-dialog-title" onKeyDown={(event)=>containDialogFocus(event,()=>setDialog(null))} className="w-full max-w-lg rounded-control border border-nite-border-soft bg-nite-surface p-6 shadow-nite-modal">
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="my-files-dialog-title" className="font-display text-type-section-title text-nite-text-primary">{dialog==="folder"?"Crie uma pasta":dialog==="files"?"Carregar arquivos":"Carregar pasta"}</h2>{dialog!=="folder"&&<p className="mt-1 text-type-body-compact text-nite-text-secondary">Destino: {current?.name??"Meus arquivos"}</p>}</div><button autoFocus onClick={()=>setDialog(null)} aria-label="Fechar diálogo" className="grid size-9 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle">×</button></div>
        {dialog==="folder"?<div className="grid gap-5">
          <label className="grid gap-2 text-type-body-compact font-medium text-nite-text-secondary">Nome<input autoFocus value={folderName} onChange={(event)=>setFolderName(event.target.value)} maxLength={190} className="min-h-11 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus"/></label>
          <fieldset><legend className="mb-3 text-type-body-compact font-medium text-nite-text-secondary">Cor da pasta</legend><div className="grid max-w-[22rem] grid-cols-8 gap-2">{folderColors.map((color)=><label key={color.value} title={color.name} className={`grid size-8 cursor-pointer place-items-center rounded-full focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-nite-focus ${folderColor===color.value?"ring-2 ring-nite-brand-primary ring-offset-2 ring-offset-nite-surface":""}`} style={{backgroundColor:color.value}}><input type="radio" name="folder-color" value={color.value} checked={folderColor===color.value} onChange={()=>setFolderColor(color.value)} aria-label={color.name} className="sr-only"/>{folderColor===color.value&&<svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 text-white drop-shadow" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m4 10 4 4 8-8"/></svg>}</label>)}</div></fieldset>
          <div className="flex justify-end gap-2 border-t border-nite-border-soft pt-4"><button type="button" onClick={()=>setDialog(null)} className="min-h-10 rounded-control px-4 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">Cancelar</button><button type="button" disabled className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-type-body-compact font-medium text-white opacity-55" title="A criação de pastas será ativada em uma etapa posterior">Criar</button></div>
        </div>
          :<div className="grid gap-4"><label className="grid min-h-32 cursor-pointer place-content-center gap-2 rounded-panel border border-dashed border-nite-border-strong bg-nite-surface-subtle p-5 text-center hover:bg-nite-surface-focus"><span className="font-medium text-nite-text-primary">{dialog==="files"?"Selecionar arquivos":"Selecionar uma pasta"}</span><span className="text-type-body-compact text-nite-text-secondary">DOCX, PDF, PNG e JPEG · até 8 MiB por arquivo</span><input type="file" multiple accept=".docx,.pdf,.png,.jpg,.jpeg" className="sr-only" onClick={(event)=>{if(dialog==="directory")event.currentTarget.setAttribute("webkitdirectory","");}} onChange={(event)=>void loadFiles(event,dialog==="directory")}/></label><p className="text-type-metadata text-nite-text-muted">Pastas são enviadas em lotes independentes de até 100 itens e 32 MiB. Erros por lote são informados no resultado.</p><div className="flex justify-end"><button type="button" onClick={()=>setDialog(null)} className="min-h-10 rounded-control px-4 text-nite-text-secondary">Fechar</button></div></div>}
      </section>
    </div>}
    {shareTarget&&<ShareDialog item={shareTarget} onClose={()=>setShareTarget(null)} onMessage={setMessage}/>}
    {managementTarget&&view==="personal"&&<ItemManagementDialog item={managementTarget} folders={listing?.folders??[]} parentFolderId={current?.parentId??null} returnTo={baseAction} onClose={()=>setManagementTarget(null)}/>}
  </section>;
}

function SortLink({label,sort,view,folderId,query}:{label:string;sort:string;view:View;folderId:string|undefined;query:Record<string,string|undefined>}) {
  const direction=query.sort===sort&&query.direction!=="desc"?"desc":"asc";
  return <Link href={queryString(view,folderId,{...query,sort,direction})} aria-label={`Ordenar por ${label}${query.sort===sort?query.direction==="desc"?", decrescente":", crescente":""}`} className="inline-flex items-center gap-1 hover:text-nite-text-primary">{label}<svg aria-hidden="true" viewBox="0 0 16 16" className={`size-3 transition-transform ${query.sort===sort&&query.direction==="desc"?"rotate-180":""}`} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 6 4 4 4-4"/></svg></Link>;
}

function activityGroups(activity:ActivityListing) {
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),previousMonth=new Date(now.getFullYear(),now.getMonth()-1,1);
  const groups=new Map<string,LibraryActivity[]>();
  for(const entry of activity.items) {
    const occurred=new Date(entry.occurredAt),day=new Date(occurred.getFullYear(),occurred.getMonth(),occurred.getDate());
    const days=Math.floor((today.getTime()-day.getTime())/86_400_000);
    const label=Number.isNaN(occurred.getTime())?"Data indisponível":days===0?"Hoje":days===1?"Ontem":days<0?"Data futura":occurred.getMonth()===now.getMonth()&&occurred.getFullYear()===now.getFullYear()?"Este mês":occurred.getMonth()===previousMonth.getMonth()&&occurred.getFullYear()===previousMonth.getFullYear()?"Mês passado":"Anteriormente";
    groups.set(label,[...(groups.get(label)??[]),entry]);
  }
  return [...groups].map(([label,items])=>({label,items}));
}

function activityAction(action:string) {
  const labels:Record<string,string>={FOLDER_CREATED:"criou uma pasta",FOLDER_UPDATED:"alterou uma pasta",FOLDER_ARCHIVED:"arquivou uma pasta",FOLDER_RESTORED:"restaurou uma pasta",DOCUMENT_CREATED:"criou um documento",DOCUMENT_ORGANIZED:"moveu ou renomeou um documento",DOCUMENT_ARCHIVED:"arquivou um documento",DOCUMENT_RESTORED:"restaurou um documento",WOPI_SAVED:"editou um documento",SHARE_GRANTED:"compartilhou um documento",SHARE_CHANGED:"alterou um acesso",SHARE_REVOKED:"revogou um acesso",EDIT_GRANTED:"concedeu permissão de edição",EDIT_REVOKED:"removeu permissão de edição"};
  return labels[action.toUpperCase()]??action.replaceAll("_"," ").toLocaleLowerCase("pt-BR");
}

export function DetailsPanel({item,file,activity,activityOnly,loading,currentFolder,atRoot,onClose,onLoadMoreActivity}:{item:Item;file?:LibraryFile;activity?:ActivityListing;activityOnly:boolean;loading:boolean;currentFolder?:LibraryFolder;atRoot:boolean;onClose:()=>void;onLoadMoreActivity:()=>void}) {
  const detailsFile=file??item.file;
  const path=item.shared?"Compartilhado comigo":atRoot?item.kind==="folder"?`Meus arquivos > ${item.name}`:"Meus arquivos":currentFolder?`${currentFolder.name}${item.kind==="folder"?` > ${item.name}`:""}`:"Não disponível";
  const modifiedAt=item.kind==="folder"?item.folder?.modifiedAt:item.shared?.modifiedAt??detailsFile?.modifiedAt;
  const createdAt=item.kind==="folder"?item.folder?.createdAt:detailsFile?.createdAt;
  const size=item.kind==="file"&&detailsFile?bytes(detailsFile.size):"Não disponível";
  return <div role="complementary" aria-label="Detalhes do item" className="fixed right-0 top-16 z-40 flex h-[calc(100svh-4rem)] w-[min(22rem,calc(100vw-1rem))] min-w-0 min-h-0 flex-col overflow-hidden rounded-l-[8px] border border-nite-border-soft bg-nite-surface lg:relative lg:right-auto lg:top-auto lg:z-auto lg:h-full lg:w-auto lg:rounded-[8px]">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-nite-border-soft p-4"><div className="flex min-w-0 items-center gap-2"><ItemIcon item={item}/><p className="truncate font-medium text-nite-text-primary">{item.name}</p></div><button type="button" onClick={onClose} aria-label="Fechar detalhes" className="grid size-9 shrink-0 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">×</button></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section aria-labelledby="details-activity-title" className="border-b border-nite-border-soft p-4"><h3 id="details-activity-title" className="mb-3 font-medium text-nite-text-primary">Atividade</h3>{activity?.items.length?<div className="grid gap-2">{activityGroups(activity).map((group)=><section key={group.label}><h4 className="mb-2 text-type-metadata font-semibold text-nite-text-secondary">{group.label}</h4><ul className="grid gap-2">{group.items.map((entry:LibraryActivity)=><li key={entry.id} className="flex gap-3 rounded-control bg-nite-surface-subtle p-3"><ActivityGlyph action={entry.action}/><div className="min-w-0"><p className="text-type-body-compact text-nite-text-primary">{entry.actorName??"Responsável não informado"} {activityAction(entry.action)}</p>{entry.reason&&<p className="mt-1 text-type-body-compact text-nite-text-secondary">{entry.reason}</p>}<p className="mt-2 text-type-metadata text-nite-text-muted"><time dateTime={entry.occurredAt}>{dateTime(entry.occurredAt)}</time></p></div></li>)}</ul></section>)}</div>:<p role={loading?"status":undefined} className="rounded-control bg-nite-surface-subtle px-3 py-4 text-type-body-compact text-nite-text-secondary">{loading?"Carregando atividade…":activity?"Nenhuma atividade registrada.":"Atividade recente indisponível para este item."}</p>}{activity?.hasMore&&<button type="button" onClick={onLoadMoreActivity} className="mt-3 min-h-9 rounded-control border border-nite-border-control px-3 text-type-body-compact text-nite-text-primary">Carregar atividades anteriores</button>}</section>
      {!activityOnly&&<dl className="grid gap-4 p-4 text-type-body-compact"><Detail label="Tipo" value={item.kind==="folder"?"Pasta":detailsFile?.mimeType??"Não disponível"}/><Detail label="Modificado" value={dateTime(modifiedAt)}/><Detail label="Data de criação" value={dateTime(createdAt)}/><Detail label="Caminho" value={path}/><Detail label="Dimensionar" value={size}/></dl>}
    </div>
  </div>;
}
function Detail({label,value}:{label:string;value:string}) {return <div><dt className="text-type-metadata text-nite-text-muted">{label}</dt><dd className="break-words text-nite-text-primary">{value}</dd></div>;}

function ActivityGlyph({action}:{action:string}) {
  const normalized=action.toUpperCase(),kind=normalized.includes("ARCHIVED")||normalized.includes("DELETED")?"delete":normalized.includes("CREATED")?"create":normalized.includes("UPDATED")||normalized.includes("SAVED")||normalized.includes("ORGANIZED")?"edit":"activity";
  return <span aria-hidden="true" className="mt-0.5 shrink-0 text-nite-brand-accent">{kind==="delete"?<svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 5h14M8 5V3h4v2m3 0-.8 11H5.8L5 5m3 3v5m4-5v5"/></svg>:kind==="create"?<svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10 3v14M3 10h14"/></svg>:kind==="edit"?<svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m3 14.5-.8 3.3 3.3-.8L16 7.5 12.5 4zM11.5 5l3.5 3.5"/></svg>:<svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>}</span>;
}

function ItemManagementDialog({item,folders,parentFolderId,returnTo,onClose}:{item:Item;folders:LibraryFolder[];parentFolderId:string|null;returnTo:string;onClose:()=>void}) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-labelledby="item-management-title" onKeyDown={(event)=>containDialogFocus(event,onClose)} className="grid max-h-[85svh] w-full max-w-lg gap-4 overflow-y-auto rounded-control border border-nite-border-soft bg-nite-surface p-6 shadow-nite-modal"><header className="flex items-center justify-between gap-3"><h2 id="item-management-title" className="font-display text-type-section-title font-semibold text-nite-text-primary">Renomear ou mover</h2><button type="button" autoFocus onClick={onClose} aria-label="Fechar diálogo" className="grid size-9 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle">×</button></header><p className="truncate text-type-body-compact text-nite-text-secondary">{item.name}</p>
    {item.kind==="file"&&item.file?<><form action={organizeLibraryFile} className="grid gap-3 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="folderId" value={item.file.folderId??""}/><input type="hidden" name="returnTo" value={returnTo}/><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Novo nome<input name="title" defaultValue={item.name} required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><button className="min-h-10 justify-self-end rounded-control bg-nite-brand-primary px-4 text-type-body-compact font-medium text-white">Salvar nome</button></form><form action={organizeLibraryFile} className="grid gap-3 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="title" value={item.name}/><input type="hidden" name="returnTo" value={returnTo}/><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Mover arquivo<select name="folderId" defaultValue={item.file.folderId??folders[0]?.id??""} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-2 text-nite-text-primary">{parentFolderId&&<option value={parentFolderId}>Pasta anterior</option>}{folders.map((folder)=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button className="min-h-10 justify-self-end rounded-control border border-nite-border-control px-4 text-type-body-compact text-nite-text-primary">Mover arquivo</button></form></>:item.kind==="folder"&&item.folder?<><form action={updateLibraryFolder} className="grid gap-3 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="returnTo" value={returnTo}/><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Novo nome<input name="name" defaultValue={item.name} required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><button className="min-h-10 justify-self-end rounded-control bg-nite-brand-primary px-4 text-type-body-compact font-medium text-white">Salvar nome</button></form>{parentFolderId&&item.folder.parentId&&<form action={updateLibraryFolder} className="flex justify-end border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="name" value={item.name}/><input type="hidden" name="parentId" value={parentFolderId}/><input type="hidden" name="returnTo" value={returnTo}/><button className="min-h-10 rounded-control border border-nite-border-control px-4 text-type-body-compact text-nite-text-primary">Mover para pasta anterior</button></form>}</>:<p className="text-type-body-compact text-nite-text-secondary">Os dados necessários para organizar este item não estão disponíveis.</p>}
  </section></div>;
}

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
