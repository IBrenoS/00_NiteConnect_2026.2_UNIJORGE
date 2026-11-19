"use client";
import { TransientFeedback } from "../ui/transient-feedback";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect,useMemo,useRef,useState,type ChangeEvent,type FormEvent,type KeyboardEvent,type MouseEvent,type ReactNode } from "react";
import { parseActivityListing,parseDocumentInformation,parseLibraryFile,parseLibraryListing,parseSharedListing,parseSentListing,parseVersionPage,resourceOwnerLabel,type ActivityListing,type DocumentCapabilities,type DocumentInformation,type LibraryActivity,type LibraryFile,type LibraryFolder,type LibraryListing,type LibraryTemplate,type SharedItem,type SentItem,type DocumentVersionPage } from "../../lib/documents/library-contracts";
import { copyLibraryItem,createLibraryFolder,createPersonalTemplateCopy,organizeLibraryFile,trashLibraryItem,updateLibraryFolder } from "../../lib/documents/library-actions";
import { partitionUploadEntries } from "../../lib/documents/upload-batches";
import { ProjectDocumentActionDialog } from "../projects/project-document-action-dialog";
import { FileRequestsDialog } from "./file-requests-dialog";
import { DocumentBatchDialog,type BatchResource,type BatchAction } from "./document-batch-dialog";
import { DocumentAutomationDialog } from "./document-automation-dialog";

type View="personal"|"shared"|"sent";
type ProjectContext={id:string;name:string;basePath:string;trashPath:string;canRequestDeletion?:boolean;canViewTrash?:boolean;requestsPath?:string};
type Props={projectContext?:ProjectContext;listing:LibraryListing|null;ancestors?:LibraryFolder[];sharedItems?:SharedItem[];sentItems?:SentItem[];hasMore?:boolean;nextCursor?:string|null;issue:string|null;view:View;memberId?:string;canArchivePersonal?:boolean;templates:LibraryTemplate[];params:{folder?:string;error?:string;saved?:string;uploaded?:string;search?:string;type?:string;sort?:string;direction?:string}};
type Item={id:string;name:string;kind:"folder"|"file";folder?:LibraryFolder;file?:LibraryFile;permission?:"VIEW"|"EDIT";shared?:SharedItem;sent?:SentItem};
type ItemCapability="canShare"|"canDownload"|"canRename"|"canMove"|"canArchiveInstitutionally";
const EMPTY_SHARED:SharedItem[]=[];
const EMPTY_SENT:SentItem[]=[];
const itemCapabilities=(item:Item):DocumentCapabilities|null|undefined=>item.folder?.capabilities??item.file?.capabilities??item.shared?.capabilities??item.sent?.capabilities;
function batchActions(items:Item[]):BatchAction[] {
  const actions:BatchAction[]=["FAVORITE","UNFAVORITE"];
  if(items.every((item)=>itemCapabilities(item)?.canCopy))actions.push("COPY");
  if(items.every((item)=>itemCapabilities(item)?.canMove))actions.push("MOVE");
  if(items.every((item)=>itemCapabilities(item)?.canDeleteToTrash))actions.push("TRASH");
  return actions;
}
const allows=(item:Item,capability:ItemCapability,legacy:boolean)=>{void legacy;return itemCapabilities(item)?.[capability]??false;};
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
const explorerQueryString=(view:View,folder:string|undefined,values:Record<string,string|undefined>,projectContext?:ProjectContext)=>{
  const params=new URLSearchParams({view});if(folder)params.set("folder",folder);
  for(const [key,value] of Object.entries(values))if(value&&(view!=="sent"||key==="search"||key==="cursor"))params.set(key,value);
  if(projectContext){params.delete("view");return `${projectContext.basePath}?${params.toString()}`;}
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

function ListGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 4h10M7 8h10M7 12h10M7 16h10"/><circle cx="3.5" cy="4" r=".7" fill="currentColor"/><circle cx="3.5" cy="8" r=".7" fill="currentColor"/><circle cx="3.5" cy="12" r=".7" fill="currentColor"/><circle cx="3.5" cy="16" r=".7" fill="currentColor"/></svg>;
}

function GridGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="12" y="2" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="12" y="12" width="6" height="6" rx="1"/></svg>;
}

function MoreGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor"><circle cx="4" cy="10" r="1.35"/><circle cx="10" cy="10" r="1.35"/><circle cx="16" cy="10" r="1.35"/></svg>;
}

type OneDriveMenuIconName="share"|"copy-link"|"request-files"|"manage-access"|"delete"|"add-to-favorites"|"download"|"rename"|"move-to"|"copy-to"|"duplicate"|"folder-color"|"details"|"options"|"page"|"upload-file"|"upload-folder";
function OneDriveMenuIcon({name}:{name:OneDriveMenuIconName}) {
  const source=`/icons/onedrive-menu/${name}.svg`;
  return <span aria-hidden="true" className="inline-block size-4 shrink-0 bg-current" style={{maskImage:`url("${source}")`,WebkitMaskImage:`url("${source}")`,maskRepeat:"no-repeat",WebkitMaskRepeat:"no-repeat",maskPosition:"center",WebkitMaskPosition:"center",maskSize:"contain",WebkitMaskSize:"contain"}}/>;
}

export function CreateMenuActions({variant,onClose,onCreateFolder,onUploadFiles,onUploadFolder}:{variant:"title"|"primary";onClose:(event:MouseEvent<HTMLButtonElement>)=>void;onCreateFolder:()=>void;onUploadFiles:()=>void;onUploadFolder:()=>void}) {
  const buttonClassName="flex h-9 w-full items-center gap-2 rounded-[4px] px-2 text-left text-[14px] font-normal leading-5 text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus";
  const buttonStyle={fontSize:"14px",lineHeight:"20px"};
  const run=(event:MouseEvent<HTMLButtonElement>,action:()=>void)=>{onClose(event);action();};
  return <>
    <button type="button" role="menuitem" onClick={(event)=>run(event,onCreateFolder)} className={buttonClassName} style={buttonStyle}><FolderGlyph color="#f6c445" className="size-4"/>{variant==="title"?"Nova pasta":"Pasta"}</button>
    <div className="my-1 border-t border-nite-border-soft" aria-hidden="true"/>
    <button type="button" role="menuitem" onClick={(event)=>run(event,onUploadFiles)} className={buttonClassName} style={buttonStyle}><OneDriveMenuIcon name="upload-file"/>Carregamento de arquivos</button>
    <button type="button" role="menuitem" onClick={(event)=>run(event,onUploadFolder)} className={buttonClassName} style={buttonStyle}><OneDriveMenuIcon name="upload-folder"/>Carregamento de pasta</button>
  </>;
}

function SelectionAction({label,disabledReason,onClick,children,variant="toolbar"}:{label:string;disabledReason?:string;onClick?:()=>void;children:ReactNode;variant?:"toolbar"|"menu"}) {
  const disabled=disabledReason!==undefined;
  const layout=variant==="menu"?"flex min-h-9 w-full items-center gap-1 rounded-control px-2 text-left":"inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control px-2.5 sm:px-3";
  return <button type="button" role={variant==="menu"?"menuitem":undefined} disabled={disabled} title={disabledReason} onClick={(event)=>{if(variant==="menu"){event.stopPropagation();event.currentTarget.closest("details")?.removeAttribute("open");}onClick?.();}} className={`${layout} text-type-body-compact ${variant==="menu"?"font-normal":"font-semibold"} text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:text-nite-text-muted disabled:opacity-65`}>{children}{label}</button>;
}

export function toggleDetailsPanel(isOpen:boolean,onOpen:()=>void,onClose:()=>void):void {
  if(isOpen){onClose();return;}
  onOpen();
}

function FavoriteGlyph({active=false}:{active?:boolean}) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill={active?"currentColor":"none"} stroke="currentColor" strokeWidth="1.5"><path d="m10 2.5 2.35 4.77 5.27.77-3.81 3.71.9 5.25L10 14.52l-4.71 2.48.9-5.25-3.81-3.71 5.27-.77z"/></svg>;
}

function SelectionCheckbox({checked,label,onChange,className="",indeterminate=false}:{checked:boolean;label:string;onChange:(checked:boolean)=>void;className?:string;indeterminate?:boolean}) {
  return <label className={`relative grid size-5 shrink-0 cursor-pointer place-items-center rounded-full ${className}`} onClick={(event)=>event.stopPropagation()}>
    <input aria-label={label} aria-checked={indeterminate?"mixed":checked} type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)} className="peer absolute inset-0 size-full cursor-pointer opacity-0"/>
    <span aria-hidden="true" className={`grid size-[18px] place-items-center rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-nite-focus ${checked||indeterminate?"border-nite-brand-primary bg-nite-brand-primary text-white":"border-nite-border-control bg-nite-background text-transparent"}`}>
      {indeterminate?<span className="h-0.5 w-2.5 rounded-full bg-current"/>:checked&&<svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m3 8 3.2 3.2L13 4.5"/></svg>}
    </span>
  </label>;
}

export function SelectionToolbar({projectContext,items,view,details,canArchivePersonal=false,onShare,onCopyLink,onDownload,onArchive,onRename,onMove,onClear,onDetails,onFavorite,onCopy,onDuplicate,onRequest,onZip,onBatch,onAutomate}:{projectContext?:ProjectContext;items:Item[];view:View;details:boolean;canArchivePersonal?:boolean;onShare:(item:Item)=>void;onCopyLink:(item:Item)=>void;onDownload:(item:Item)=>void;onArchive:(item:Item)=>void;onRename:(item:Item)=>void;onMove:(item:Item)=>void;onClear:()=>void;onDetails:()=>void;onFavorite?:(item:Item)=>void;onCopy?:(item:Item)=>void;onDuplicate?:(item:Item)=>void;onRequest?:(item:Item)=>void;onZip?:(items:Item[])=>void;onBatch?:()=>void;onAutomate?:(item:Item)=>void}) {
  void canArchivePersonal;
  const item=items.length===1?items[0]:undefined;
  const oneItemReason=items.length===1?undefined:"Ação em lote ainda não está disponível para esta operação.";
  const legacyOrganize=!!item&&view==="personal"&&(item.kind==="folder"?item.folder?.kind==="CUSTOM":item.file?.context==="PERSONAL");
  const canRename=!!item&&view==="personal"&&allows(item,"canRename",legacyOrganize);
  const canMove=!!item&&view==="personal"&&allows(item,"canMove",legacyOrganize);
  const unavailable=(reason:string)=>oneItemReason??reason;
  const toolbarRef=useRef<HTMLDivElement>(null);
  const trailingRef=useRef<HTMLDivElement>(null);
  const measureRef=useRef<HTMLDivElement>(null);
  const [visibleCount,setVisibleCount]=useState(9);
  useEffect(()=>{
    const toolbar=toolbarRef.current,trailing=trailingRef.current,measure=measureRef.current;
    if(!toolbar||!trailing||!measure)return;
    const update=()=>{
      const available=toolbar.clientWidth-trailing.getBoundingClientRect().width-68;
      let used=0,count=0;
      for(const child of Array.from(measure.children)) {
        const width=child.getBoundingClientRect().width;
        if(used+width>available)break;
        used+=width+(width?4:0);count++;
      }
      setVisibleCount(count);
    };
    const observer=new ResizeObserver(update);
    observer.observe(toolbar);observer.observe(trailing);observer.observe(measure);
    update();
    return ()=>observer.disconnect();
  },[items.length,view]);
  const actions=[
    (variant:"toolbar"|"menu")=>item&&<SelectionAction variant={variant} label="Compartilhar" disabledReason={view==="personal"&&allows(item,"canShare",true)?undefined:"Compartilhamento não está disponível para esta seleção."} onClick={()=>onShare(item)}><OneDriveMenuIcon name="share"/></SelectionAction>,
    (variant:"toolbar"|"menu")=>item&&<SelectionAction variant={variant} label="Copiar link" onClick={()=>onCopyLink(item)}><OneDriveMenuIcon name="copy-link"/></SelectionAction>,
    (variant:"toolbar"|"menu")=>!projectContext&&item?.kind==="folder"&&<SelectionAction variant={variant} label="Solicitar arquivos" disabledReason={itemCapabilities(item)?.canAddChild&&onRequest?undefined:"Selecione uma pasta que permita receber arquivos."} onClick={onRequest?()=>onRequest(item):undefined}><OneDriveMenuIcon name="request-files"/></SelectionAction>,
    (variant:"toolbar"|"menu")=>view==="personal"&&<SelectionAction variant={variant} label={projectContext?.canRequestDeletion&&item&&!itemCapabilities(item)?.canDeleteToTrash?"Solicitar exclusão":"Excluir"} disabledReason={item&&(itemCapabilities(item)?.canDeleteToTrash||projectContext?.canRequestDeletion)?oneItemReason:unavailable("Exclusão não autorizada para este item.")} onClick={item?()=>onArchive(item):undefined}><OneDriveMenuIcon name="delete"/></SelectionAction>,
    (variant:"toolbar"|"menu")=>!projectContext&&<SelectionAction variant={variant} label="Adicionar aos favoritos" disabledReason={item&&itemCapabilities(item)?.canView&&onFavorite?oneItemReason:unavailable("Favorito indisponível para esta seleção.")} onClick={item&&onFavorite?()=>onFavorite(item):undefined}><OneDriveMenuIcon name="add-to-favorites"/></SelectionAction>,
    (variant:"toolbar"|"menu")=><SelectionAction variant={variant} label="Baixar" disabledReason={items.length>0&&items.every((entry)=>entry.kind==="folder"?itemCapabilities(entry)?.canView:itemCapabilities(entry)?.canDownload)?undefined:"Download não autorizado para esta seleção."} onClick={()=>{if(item?.kind==="file")onDownload(item);else onZip?.(items);}}><OneDriveMenuIcon name="download"/></SelectionAction>,
    (variant:"toolbar"|"menu")=><SelectionAction variant={variant} label="Duplicar" disabledReason={item&&itemCapabilities(item)?.canCopy&&onDuplicate?oneItemReason:unavailable("Duplicação não autorizada.")} onClick={item&&onDuplicate?()=>onDuplicate(item):undefined}><OneDriveMenuIcon name="duplicate"/></SelectionAction>,
    (variant:"toolbar"|"menu")=><SelectionAction variant={variant} label="Mover para" disabledReason={canMove?undefined:unavailable("Este item não pode ser movido neste contexto.")} onClick={item&&canMove?()=>onMove(item):undefined}><OneDriveMenuIcon name="move-to"/></SelectionAction>,
    (variant:"toolbar"|"menu")=><SelectionAction variant={variant} label="Copiar para" disabledReason={item&&itemCapabilities(item)?.canCopy&&onCopy?oneItemReason:unavailable("Cópia não autorizada.")} onClick={item&&onCopy?()=>onCopy(item):undefined}><OneDriveMenuIcon name="copy-to"/></SelectionAction>,
  ];
  return <div ref={toolbarRef} role="toolbar" aria-label="Ações para a seleção" className="relative flex h-[52px] min-w-0 flex-1 flex-nowrap items-center rounded-[8px] bg-nite-surface px-2.5 text-type-body-compact text-nite-text-secondary" style={{fontFamily:'"Segoe UI", Tahoma, Arial, sans-serif'}}>
    <div ref={measureRef} aria-hidden="true" inert className="pointer-events-none invisible absolute flex w-max gap-1">{actions.map((render,index)=><span key={index} className="shrink-0">{render("toolbar")}</span>)}</div>
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1">
      {actions.slice(0,visibleCount).map((render,index)=><span key={index} className="shrink-0">{render("toolbar")}</span>)}
      <details className="group/selection-actions relative shrink-0">
        <summary aria-label="Mais opções de organização" className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden"><MoreGlyph/></summary>
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-[232px] rounded-control border border-nite-border-soft bg-nite-surface p-1 shadow-nite-floating" aria-label="Opções de organização">
          {actions.slice(visibleCount).map((render,index)=><div key={index}>{render("menu")}</div>)}
          {!projectContext&&items.length>1&&<SelectionAction variant="menu" label="Operações em lote" disabledReason={onBatch?undefined:"Operações em lote indisponíveis."} onClick={onBatch}><MoreGlyph/></SelectionAction>}
          <SelectionAction variant="menu" label="Renomear" disabledReason={canRename?undefined:unavailable("Este item não pode ser renomeado neste contexto.")} onClick={item&&canRename?()=>onRename(item):undefined}><OneDriveMenuIcon name="rename"/></SelectionAction>
          {onAutomate&&<SelectionAction variant="menu" label="Automatizar" disabledReason={item&&itemCapabilities(item)?.canView?oneItemReason:unavailable("Item indisponível para automação.")} onClick={item?()=>onAutomate(item):undefined}><MoreGlyph/></SelectionAction>}
        </div>
      </details>
    </div>
    <div ref={trailingRef} className="ml-auto flex shrink-0 items-center gap-1.5">
      <button type="button" onClick={onClear} aria-label="Limpar seleção" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control border border-nite-border-soft px-3 font-semibold text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus"><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m5 5 10 10m0-10L5 15"/></svg>{items.length} selecionado{items.length===1?"":"s"}</button>
      <button type="button" onClick={onDetails} aria-expanded={details} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control px-3 font-semibold text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus ${details?"bg-nite-surface-elevated text-nite-text-primary":""}`}><OneDriveMenuIcon name="details"/>Detalhes</button>
    </div>
  </div>;
}

export function MyFilesExplorer({projectContext,listing:initialListing,ancestors=[],sharedItems=EMPTY_SHARED,sentItems=EMPTY_SENT,hasMore=false,nextCursor=null,issue,view,memberId="",canArchivePersonal=false,templates,params}:Props) {
  const queryString=(perspective:View,folder:string|undefined,values:Record<string,string|undefined>)=>explorerQueryString(perspective,folder,values,projectContext);
  const listingUrl=(search:string)=>`/api/library/listing${search}${projectContext?`${search?"&":"?"}projectId=${encodeURIComponent(projectContext.id)}`:""}`;
  const explorerGridRef=useRef<HTMLDivElement>(null);
  const [gridWidth,setGridWidth]=useState(0);
  useEffect(()=>{
    const grid=explorerGridRef.current;
    if(!grid)return;
    const observer=new ResizeObserver(()=>setGridWidth(grid.getBoundingClientRect().width));
    observer.observe(grid);
    return ()=>observer.disconnect();
  },[]);
  const titleMenuRef=useRef<HTMLDetailsElement>(null);
  const createMenuRef=useRef<HTMLDivElement>(null);
  const filesInputRef=useRef<HTMLInputElement>(null);
  const directoryInputRef=useRef<HTMLInputElement>(null);
  const [desktopPaneLayout,setDesktopPaneLayout]=useState(false);
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]),[layout,setLayout]=useState<"list"|"compact"|"grid">("list");
  const [createMenu,setCreateMenu]=useState(false),[dialog,setDialog]=useState<"folder"|null>(null);
  const [filtersOpen,setFiltersOpen]=useState(false),[quickFiltersVisible,setQuickFiltersVisible]=useState(true),[folderColor,setFolderColor]=useState(folderColors[0]!.value),[folderName,setFolderName]=useState("");
  const [details,setDetails]=useState(false),[detailItem,setDetailItem]=useState<Item|null>(null),[detailPayload,setDetailPayload]=useState<{file?:LibraryFile;folder?:LibraryFolder;info?:DocumentInformation;activity?:ActivityListing}|null>(null);
  const [shareTarget,setShareTarget]=useState<Item|null>(null),[shareDialogMode,setShareDialogMode]=useState<"share"|"manage">("share"),[managementTarget,setManagementTarget]=useState<Item|null>(null),[managementMode,setManagementMode]=useState<"organize"|"copy">("organize"),[duplicateTarget,setDuplicateTarget]=useState<Item|null>(null),[requestFolder,setRequestFolder]=useState<Item|null>(null),[archiveTarget,setArchiveTarget]=useState<Item|null>(null),[folderColorUpdating,setFolderColorUpdating]=useState(false),[openItemMenu,setOpenItemMenu]=useState<string|null>(null),[openFolderColorMenu,setOpenFolderColorMenu]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null),[favoritesIssue,setFavoritesIssue]=useState<string|null>(null);
  const [favorites,setFavorites]=useState<string[]>([]),[favoriteBusy,setFavoriteBusy]=useState<string|null>(null);
  const [requestsOpen,setRequestsOpen]=useState(false);
  const [batchOpen,setBatchOpen]=useState(false);
  const [automationOpen,setAutomationOpen]=useState(false),[automationTarget,setAutomationTarget]=useState<Item|null>(null);
  const [progress,setProgress]=useState<{sent:number;total:number;percent:number}|null>(null),[uploadSummary,setUploadSummary]=useState<string|null>(null);
  const [loadingDetails,setLoadingDetails]=useState(false),[loadedListing,setLoadedListing]=useState(initialListing),[receivedItems,setReceivedItems]=useState(sharedItems),[sentResults,setSentResults]=useState(sentItems),[receivedCursor,setReceivedCursor]=useState(nextCursor),[receivedHasMore,setReceivedHasMore]=useState(hasMore);
  useEffect(()=>{if(projectContext)return;let active=true;void fetch(`/api/library/manage?path=${encodeURIComponent("/api/v1/me/favorites")}`).then(async(response)=>{
    if(!response.ok)throw new Error();const value:unknown=await response.json();
    if(!Array.isArray(value))throw new Error();if(active)setFavorites(value.filter((item):item is {type:string;id:string}=>typeof item==="object"&&item!==null&&"type" in item&&typeof item.type==="string"&&"id" in item&&typeof item.id==="string").map((item)=>`${item.type}:${item.id}`));
  }).catch(()=>{if(active)setFavoritesIssue("Não foi possível consultar os favoritos.");});return()=>{active=false;};},[projectContext]);
  useEffect(()=>{
    if(!openItemMenu)return;
    function closeWhenOutside(event:globalThis.PointerEvent) {
      if(event.target instanceof Element&&!event.target.closest("[data-item-actions]")){setOpenItemMenu(null);setOpenFolderColorMenu(null);}
    }
    document.addEventListener("pointerdown",closeWhenOutside);
    return()=>document.removeEventListener("pointerdown",closeWhenOutside);
  },[openItemMenu]);
  useEffect(()=>{
    function closeMenus(event:globalThis.PointerEvent) {
      if(!(event.target instanceof Node))return;
      if(!titleMenuRef.current?.contains(event.target))titleMenuRef.current?.removeAttribute("open");
      if(!createMenuRef.current?.contains(event.target))setCreateMenu(false);
    }
    function closeOnEscape(event:globalThis.KeyboardEvent) {
      if(event.key!=="Escape")return;
      titleMenuRef.current?.removeAttribute("open");setCreateMenu(false);
    }
    document.addEventListener("pointerdown",closeMenus);
    document.addEventListener("keydown",closeOnEscape);
    return()=>{document.removeEventListener("pointerdown",closeMenus);document.removeEventListener("keydown",closeOnEscape);};
  },[]);
  const listing=loadedListing;
  const current=listing?.folder,folderId=current?.id;
  const items=useMemo<Item[]>(()=>[
    ...(listing?.folders??[]).map((folder):Item=>({id:folder.id,name:folder.name,kind:"folder",folder,permission:folder.effectivePermission??"VIEW"})),
    ...(listing?.files??[]).map((file):Item=>({id:file.id,name:file.title,kind:"file",file,permission:file.effectivePermission??"VIEW"})),
    ...receivedItems.map((shared):Item=>({id:shared.id,name:shared.name,kind:shared.type==="FOLDER"?"folder":"file",permission:shared.permission,shared})),
    ...sentResults.map((sent):Item=>({id:sent.id,name:sent.name,kind:sent.type==="FOLDER"?"folder":"file",permission:sent.capabilities.canEdit?"EDIT":"VIEW",sent})),
  ],[listing,receivedItems,sentResults]);
  const displayedItems=items;
  const selectedItems=items.filter((item)=>selected.includes(item.id));
  const allItemsSelected=items.length>0&&items.every((item)=>selected.includes(item.id));
  const query={search:params.search,type:params.type,sort:params.sort,direction:params.direction};
  const rootHref=queryString(view,undefined,query);
  async function refreshCurrent() {
    const url=queryString(view,folderId,query);
    try {const response=await fetch(listingUrl(new URL(url,"http://local").search));
      if(!response.ok)throw new Error();const data:unknown=await response.json();
      if(listing){const next=parseLibraryListing(data);if(!next)throw new Error();setLoadedListing(next);}
      else if(view==="shared"){const next=parseSharedListing(data);if(!next)throw new Error();setReceivedItems(next.items);setReceivedCursor(next.nextCursor);setReceivedHasMore(next.hasMore);}
      else {const next=parseSentListing(data);if(!next)throw new Error();setSentResults(next.items);setReceivedCursor(next.nextCursor);setReceivedHasMore(next.hasMore);}
      setSelected([]);router.refresh();
    }catch {setMessage("A alteração foi enviada, mas não foi possível atualizar a listagem. Tente novamente.");}
  }
  function select(id:string,checked:boolean) {
    const next=checked?[...new Set([...selected,id])]:selected.filter((item)=>item!==id);
    setSelected(next);
    if(details)void(next[0]?showDetails(items.find((item)=>item.id===next[0])):showDetails(undefined,true));
  }
  function selectAll(checked:boolean) {
    const next=checked?items.map((item)=>item.id):[];
    setSelected(next);
    if(details)void(next[0]?showDetails(items.find((item)=>item.id===next[0])):showDetails(undefined,true));
  }
  function clearSelection() {
    setSelected([]);
    if(details)void showDetails(undefined,true);
  }
  async function copyLink(item:Item) {
    if(projectContext){try {const url=item.kind==="folder"?queryString(view,item.id,{}):`/documentos/${item.id}?returnTo=${encodeURIComponent(queryString(view,folderId,{}))}`;await navigator.clipboard.writeText(`${window.location.origin}${url}`);setMessage("Link interno copiado. O acesso continua sujeito às permissões do integrante.");}catch {setMessage("Não foi possível copiar o link neste navegador.");}return;}
    try {const path=`/api/v1/library/links/${item.kind==="folder"?"folder":"document"}/${item.id}`;
      const response=await fetch(`/api/library/manage?path=${encodeURIComponent(path)}`);if(!response.ok)throw new Error();
      const value:unknown=await response.json();if(typeof value!=="object"||value===null||!("url" in value)||typeof value.url!=="string"||!value.url.startsWith("/documentos"))throw new Error();
      await navigator.clipboard.writeText(`${window.location.origin}${value.url}`);setMessage("Link interno copiado. O acesso continua sujeito às permissões do integrante.");}
    catch {setMessage("Não foi possível copiar o link neste navegador.");}
  }
  async function toggleFavorite(item:Item) {
    const key=`${item.kind==="folder"?"FOLDER":"DOCUMENT"}:${item.id}`,active=favorites.includes(key);
    setFavoriteBusy(key);try {const path=`/api/v1/me/favorites/${key.replace(":","/")}`;
      const response=await fetch(`/api/library/manage?path=${encodeURIComponent(path)}`,{method:active?"DELETE":"PUT"});if(!response.ok)throw new Error();
      setFavorites((before)=>active?before.filter((value)=>value!==key):[...before,key]);router.refresh();
    }catch {setMessage("Não foi possível atualizar os favoritos.");}finally {setFavoriteBusy(null);}
  }
  async function downloadItems(items:Item[]) {
    if(items.length===1&&items[0]?.kind==="file") {window.open(`/api/library/download/${items[0].id}`,"_blank","noopener,noreferrer");return;}
    setMessage("Preparando arquivo ZIP…");
    try {const response=await fetch("/api/library/download-zip",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({items:items.map((item)=>({type:item.kind==="folder"?"FOLDER":"DOCUMENT",id:item.id}))})});
      if(!response.ok)throw new Error();const blob=await response.blob(),url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");anchor.href=url;anchor.download="documentos.zip";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);setMessage("Download iniciado.");
    }catch {setMessage("Não foi possível gerar o ZIP. Confira o acesso aos itens selecionados.");}
  }
  async function changeFolderColor(item:Item,color:string) {
    setFolderColorUpdating(true);
    try {
      const path=`/api/v1/library/folders/${item.id}`;
      const response=await fetch(`/api/library/manage?path=${encodeURIComponent(path)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:null,color,parentId:null,moveToRoot:false})});
      if(!response.ok)throw new Error();
      setOpenFolderColorMenu(null);setOpenItemMenu(null);await refreshCurrent();
    } catch {setMessage("Não foi possível alterar a cor desta pasta.");}
    finally {setFolderColorUpdating(false);}
  }
  async function showDetails(item?:Item,activityOnly=false) {
    const target=item??(activityOnly?undefined:selectedItems[0])??(current?{id:current.id,name:current.name,kind:"folder" as const,folder:current}:undefined);
    if(!target){setMessage("Selecione um item para ver os detalhes.");return;}
    setDetailItem(activityOnly?null:item??selectedItems[0]??null);
    setDetails(true);setLoadingDetails(true);setDetailPayload(null);
    const path=target.kind==="file"?`/api/v1/library/documents/${target.id}`:`/api/v1/library/folders/${target.id}`;
    try {
      const [response,infoResponse]=await Promise.all([
        target.kind==="file"?fetch(`/api/library/manage?path=${encodeURIComponent(path)}`):Promise.resolve(null),
        fetch(`/api/library/manage?path=${encodeURIComponent(`${path}/info`)}`),
      ]);
      const fileValue:unknown=response?.ok?await response.json():null;
      const infoValue:unknown=infoResponse.ok?await infoResponse.json():null;
      const file=target.kind==="file"?parseLibraryFile(fileValue)??undefined:undefined;
      const info=parseDocumentInformation(infoValue)??undefined;
      if(!info)throw new Error();
      const folder=target.kind==="folder"?target.folder:undefined;
      setDetailPayload({file,folder,info,activity:info.activity});
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
    if(item.kind==="folder")router.push(queryString(view,item.id,query));
    else if(item.file?.mimeType.includes("wordprocessing")&&itemCapabilities(item)?.canView)router.push(`/documentos/${item.id}${projectContext?`?returnTo=${encodeURIComponent(queryString(view,folderId,{}))}`:""}`);
    else if(item.shared||item.sent)void fetch(`/api/library/manage?path=${encodeURIComponent(`/api/v1/library/documents/${item.id}`)}`).then(async(response)=>{
      if(!response.ok){setMessage("Este arquivo não está disponível para sua conta.");return;}
      const file=parseLibraryFile(await response.json());if(!file){setMessage("O serviço retornou dados de arquivo inválidos.");return;}
      if(file.mimeType.includes("wordprocessing")&&file.capabilities?.canView)router.push(`/documentos/${item.id}${projectContext?`?returnTo=${encodeURIComponent(queryString(view,folderId,{}))}`:""}`);
      else if(file.capabilities?.canDownload)window.open(`/api/library/download/${item.id}`,"_blank","noopener,noreferrer");
    }).catch(()=>setMessage("Não foi possível abrir este arquivo."));
    else if(itemCapabilities(item)?.canDownload)window.open(`/api/library/download/${item.id}`,"_blank","noopener,noreferrer");
  }
  async function loadMore() {
    const cursor=listing?.nextCursor??receivedCursor;if(!cursor)return;
    const url=queryString(view,folderId,{...query,cursor});
    try {const response=await fetch(listingUrl(new URL(url,"http://local").search));if(!response.ok)throw new Error();
      const payload:unknown=await response.json(),next=parseLibraryListing(payload),sharedNext=parseSharedListing(payload),sentNext=parseSentListing(payload);
      if(next&&listing)setLoadedListing({...listing,files:[...listing.files,...next.files],nextCursor:next.nextCursor,hasMore:next.hasMore});
      else if(sharedNext){setReceivedItems((before)=>[...before,...sharedNext.items]);setReceivedCursor(sharedNext.nextCursor);setReceivedHasMore(sharedNext.hasMore);}
      else if(sentNext){setSentResults((before)=>[...before,...sentNext.items]);setReceivedCursor(sentNext.nextCursor);setReceivedHasMore(sentNext.hasMore);}
    }catch {setMessage("Não foi possível carregar mais resultados.");}
  }
  async function loadFiles(event:ChangeEvent<HTMLInputElement>,hierarchical:boolean) {
    const input=event.currentTarget,files=[...(input.files??[])];input.value="";
    if(!files.length||!folderId)return;
    const entries=files.map((file)=>({file,path:hierarchical?relativePath(file):file.name}));
    await uploadEntries(entries);
  }
  function openFolderDialog() {
    setFolderName("");setFolderColor(folderColors[0]!.value);setDialog("folder");
  }
  function openFilesPicker() {filesInputRef.current?.click();}
  function openDirectoryPicker() {void pickDirectory();}
  async function uploadEntries(entries:Array<{file:File;path:string}>) {
    if(!folderId)return;
    const {batches,rejected}=partitionUploadEntries(entries),acceptedCount=batches.reduce((sum,batch)=>sum+batch.length,0);
    let sent=0,completed=0,failed=rejected.length;const failedStatuses:number[]=[];
    setProgress({sent:0,total:acceptedCount,percent:0});setUploadSummary(null);setMessage(null);
    for(const batch of batches) {
      const result=await new Promise<number>((resolve)=>{
        const body=new FormData();batch.forEach(({file,path})=>{body.append("files",file,file.name);body.append("paths",path);});
        const xhr=new XMLHttpRequest();xhr.open("POST",`/api/library/folders/${folderId}/upload-tree${projectContext?`?projectId=${encodeURIComponent(projectContext.id)}`:""}`);
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
    const failureSummary=failed?`${failed} de ${entries.length} arquivo(s) não foram enviados.${reasons.length?` Rejeitados antes do envio: ${reasons.join(", ")}.`:""}${apiErrors.length?` Resultado dos lotes: ${apiErrors.join(", ")}.`:""}${batches.length>1?` Foram processados ${batches.length} lotes independentes.`:""}`:null;
    setProgress(null);setUploadSummary(failureSummary);
    if(sent>0) {
      const refreshParams=new URLSearchParams({view,folder:folderId});for(const [key,value] of Object.entries(query))if(value)refreshParams.set(key,value);
      try {const response=await fetch(listingUrl(`?${refreshParams.toString()}`));const payload:unknown=response.ok?await response.json():null;const updated=parseLibraryListing(payload);if(updated)setLoadedListing(updated);else setMessage("Não foi possível atualizar a listagem após o envio.");}
      catch {setMessage("Não foi possível atualizar a listagem após o envio.");}
    }
  }
  async function pickDirectory() {
    const picker:unknown=Reflect.get(window,"showDirectoryPicker");
    if(!folderId)return;
    if(typeof picker!=="function") {directoryInputRef.current?.setAttribute("webkitdirectory","");directoryInputRef.current?.click();return;}
    type DirectoryHandle={kind:"directory";name:string;values:()=>AsyncIterable<unknown>};
    type FileHandle={kind:"file";name:string;getFile:()=>Promise<File>};
    const isDirectory=(value:unknown):value is DirectoryHandle=>typeof value==="object"&&value!==null&&"kind" in value&&value.kind==="directory"&&"name" in value&&typeof value.name==="string"&&"values" in value&&typeof value.values==="function";
    const isFile=(value:unknown):value is FileHandle=>typeof value==="object"&&value!==null&&"kind" in value&&value.kind==="file"&&"name" in value&&typeof value.name==="string"&&"getFile" in value&&typeof value.getFile==="function";
    try {const root:unknown=await picker.call(window);if(!isDirectory(root))throw new Error();
      const entries:Array<{file:File;path:string}>=[],directories:string[]=[];
      async function walk(handle:DirectoryHandle,path:string,depth:number):Promise<void> {
        if(depth>32||directories.length+entries.length>5000)throw new Error("Pasta acima do limite operacional.");
        directories.push(path);
        for await(const child of handle.values()) {
          if(isDirectory(child))await walk(child,`${path}/${child.name}`,depth+1);
          else if(isFile(child))entries.push({file:await child.getFile(),path:`${path}/${child.name}`});
        }
      }
      await walk(root,root.name,0);
      for(let start=0;start<directories.length;start+=100) {
        const body=new FormData();for(const path of directories.slice(start,start+100))body.append("directories",path);
        const response=await fetch(`/api/library/folders/${folderId}/upload-tree${projectContext?`?projectId=${encodeURIComponent(projectContext.id)}`:""}`,{method:"POST",body});
        if(!response.ok)throw new Error(`Falha ao criar diretórios (${response.status}). Parte da pasta pode ter sido enviada.`);
      }
      if(entries.length)await uploadEntries(entries);
      else {router.refresh();setMessage(`${directories.length} pasta(s) criada(s), inclusive vazias.`);}
    }catch(cause){if(cause instanceof Error&&cause.name==="AbortError")return;setMessage(cause instanceof Error?cause.message:"Não foi possível carregar a pasta.");}
  }
  const baseAction=queryString(view,folderId,{});
  const canAddContent=Boolean(listing?.folder.capabilities?.canAddChild);
  const wordMime="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const quickTypes=[
    {label:"Word",mime:wordMime,src:"/images/documents/NiteConnect-Word.svg",supported:true},
    {label:"Excel",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",src:"/images/documents/NiteConnect-Excel.svg",supported:false},
    {label:"PowerPoint",mime:"application/vnd.openxmlformats-officedocument.presentationml.presentation",src:"/images/documents/NiteConnect-PowerPoint.svg",supported:false},
    {label:"PDF",mime:"application/pdf",src:"/images/documents/NiteConnect-PDF.svg",supported:true},
  ];
  const inFolder=Boolean(params.folder)&&(!projectContext||current?.kind!=="PROJECT");
  const sidePaneOpen=details||filtersOpen;
  useEffect(()=>{
    const paneMedia=window.matchMedia("(min-width: 1024px)");
    const updatePaneLayout=()=>setDesktopPaneLayout(paneMedia.matches);
    updatePaneLayout();
    paneMedia.addEventListener("change",updatePaneLayout);
    return ()=>paneMedia.removeEventListener("change",updatePaneLayout);
  },[]);
  const pageTitle=inFolder?current?.name??"Pasta":view==="shared"?"Com você":view==="sent"?"Por você":projectContext?`Documentos · ${projectContext.name}`:"Meus arquivos";
  const typeOptions=[{label:"Documento Word",mime:wordMime},{label:"PDF",mime:"application/pdf"},{label:"Imagem PNG",mime:"image/png"},{label:"Imagem JPEG",mime:"image/jpeg"}];
  function toggleType(mime:string) {
    router.push(queryString(view,folderId,{...query,type:params.type===mime?undefined:mime}));
  }
  return <section className="document-explorer h-[calc(100svh-6.5rem)] min-w-0 overflow-hidden sm:h-[calc(100svh-7rem)] lg:mb-[-1.75rem] lg:h-[calc(100svh-6.25rem)]" aria-label={projectContext?`Documentos de ${projectContext.name}`:"Meus arquivos"}>
    <div ref={explorerGridRef} style={desktopPaneLayout?{gridTemplateColumns:sidePaneOpen?"minmax(0, 1fr) minmax(18rem, 22rem)":"minmax(0, 1fr) 0px",columnGap:sidePaneOpen?"1rem":"0px"}:undefined} className={`grid h-full min-h-0 min-w-0 items-stretch gap-4 transition-[grid-template-columns,column-gap] duration-200 ease-in-out motion-reduce:transition-none ${sidePaneOpen?"lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]":"grid-cols-1 lg:grid-cols-[minmax(0,1fr)_0px] lg:gap-0"}`}>
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        {inFolder&&<nav aria-label="Caminho da pasta" className="mb-2 flex flex-wrap items-center gap-2 text-type-body-compact">
          <Link href={rootHref} className="text-nite-text-secondary hover:text-nite-brand-primary">{projectContext?projectContext.name:view==="shared"?"Com você":view==="sent"?"Por você":"Meus arquivos"}</Link>
          {ancestors.filter((ancestor)=>!projectContext||(ancestor.projectId===projectContext.id&&ancestor.kind!=="PROJECT")).map((ancestor)=><span key={ancestor.id} className="inline-flex min-w-0 items-center gap-2"><svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 text-nite-text-muted" fill="none" stroke="currentColor"><path d="m6 3 5 5-5 5"/></svg><Link href={queryString(view,ancestor.id,query)} className="max-w-48 truncate text-nite-text-secondary hover:text-nite-brand-primary">{ancestor.name}</Link></span>)}
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 text-nite-text-muted" fill="none" stroke="currentColor"><path d="m6 3 5 5-5 5"/></svg>
          <span aria-current="page" className="truncate font-semibold text-nite-text-primary">{pageTitle}</span>
        </nav>}
        {canAddContent?<details ref={titleMenuRef} className="group relative w-fit" onClick={()=>setCreateMenu(false)}>
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control py-1 font-display text-type-page-title font-semibold text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden">
            {pageTitle}<svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div className="absolute left-0 top-full z-30 mt-0.5 w-[245px] rounded-[8px] bg-[color-mix(in_srgb,var(--nite-background)_88%,var(--nite-text-primary))] p-1 shadow-nite-floating" role="menu" aria-label="Criar ou carregar pelo título" style={{fontFamily:'"Segoe UI",Tahoma,Arial,sans-serif'}}>
            <CreateMenuActions
              variant="title"
              onClose={(event)=>event.currentTarget.closest("details")?.removeAttribute("open")}
              onCreateFolder={openFolderDialog}
              onUploadFiles={openFilesPicker}
              onUploadFolder={openDirectoryPicker}
            />
          </div>
        </details>:<h1 className="py-1 font-display text-type-page-title font-semibold text-nite-text-primary">{pageTitle}</h1>}
      </div>
      <div ref={createMenuRef} className="relative">
        <button type="button" disabled={!canAddContent} onClick={()=>{titleMenuRef.current?.removeAttribute("open");setCreateMenu((open)=>!open);}} aria-expanded={canAddContent&&createMenu} title={canAddContent?undefined:"Você não tem permissão para adicionar arquivos nesta pasta."} style={{fontFamily:'"Segoe UI", Tahoma, Arial, sans-serif',fontSize:"14px",lineHeight:"20px",fontWeight:600}} className="inline-flex min-h-9 items-center gap-2.5 rounded-xl bg-nite-brand-primary py-2 pl-2.5 pr-3 text-sm font-semibold text-white shadow-sm hover:brightness-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:opacity-60">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3v14M3 10h14"/></svg>Criar ou carregar
        </button>
        {canAddContent&&createMenu&&<div className="absolute right-0 top-full z-30 mt-1 w-[245px] rounded-[8px] bg-[color-mix(in_srgb,var(--nite-background)_88%,var(--nite-text-primary))] p-1 shadow-nite-floating" role="menu" aria-label="Criar ou carregar" style={{fontFamily:'"Segoe UI",Tahoma,Arial,sans-serif'}}>
          <CreateMenuActions
            variant="primary"
            onClose={()=>setCreateMenu(false)}
            onCreateFolder={openFolderDialog}
            onUploadFiles={openFilesPicker}
            onUploadFolder={openDirectoryPicker}
          />
        </div>}
      </div>
    </div>
    <input ref={filesInputRef} type="file" multiple accept=".docx,.pdf,.png,.jpg,.jpeg" className="hidden" aria-label="Selecionar arquivos para carregar" onChange={(event)=>void loadFiles(event,false)}/>
    <input ref={directoryInputRef} type="file" multiple className="hidden" aria-label="Selecionar pasta para carregar" onChange={(event)=>void loadFiles(event,true)}/>

    {projectContext?<nav aria-label="Documentos do projeto" className="flex gap-4 border-b border-nite-border-soft text-type-body-compact"><Link href={rootHref} className="min-h-10 py-2 text-nite-brand-primary">Documentos</Link>{projectContext.canViewTrash&&<Link href={projectContext.trashPath} className="min-h-10 py-2 text-nite-text-secondary">Lixeira do projeto</Link>}{projectContext.canRequestDeletion&&projectContext.requestsPath&&<Link href={projectContext.requestsPath} className="min-h-10 py-2 text-nite-text-secondary">Aprovações</Link>}</nav>:<nav aria-label="Perspectivas dos arquivos" className="flex flex-wrap gap-1 border-b border-nite-border-soft text-type-body-compact">
      {([["personal","Meus arquivos"],["shared","Com você"],["sent","Por você"]] as const).map(([perspective,label])=><Link key={perspective} href={queryString(perspective,undefined,query)} aria-current={view===perspective?"page":undefined} className={`min-h-10 rounded-t-control px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-nite-focus ${view===perspective?"border-b-2 border-nite-brand-primary font-semibold text-nite-brand-primary":"text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>{label}</Link>)}
      <button type="button" onClick={()=>setRequestsOpen(true)} className="ml-auto min-h-10 rounded-t-control px-4 text-nite-text-secondary hover:bg-nite-surface-subtle">Solicitações</button>
      <button type="button" onClick={()=>{setAutomationTarget(current?.capabilities?.canView?{id:current.id,name:current.name,kind:"folder",folder:current}:null);setAutomationOpen(true);}} className="min-h-10 rounded-t-control px-4 text-nite-text-secondary hover:bg-nite-surface-subtle">Automações</button>
      {canAddContent&&templates.length>0&&<details className="group relative"><summary className="flex min-h-10 cursor-pointer list-none items-center rounded-t-control px-4 text-nite-text-secondary hover:bg-nite-surface-subtle [&::-webkit-details-marker]:hidden">Modelos</summary><div className="absolute right-0 top-full z-30 w-60 rounded-control border border-nite-border-soft bg-nite-surface p-1 shadow-nite-floating">{templates.map((template)=><form key={template.id} action={createPersonalTemplateCopy}><input type="hidden" name="templateId" value={template.id}/><input type="hidden" name="returnTo" value={baseAction}/><button type="submit" className="w-full truncate rounded-control px-3 py-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">{template.title}</button></form>)}</div></details>}
    </nav>}

    <div className={`relative flex ${selected.length>0?"min-h-[52px] flex-nowrap":"min-h-11 flex-wrap"} items-center justify-between gap-3`} aria-label="Ferramentas dos arquivos">
      {selected.length>0?<SelectionToolbar projectContext={projectContext} items={selectedItems} view={view} details={details} canArchivePersonal={canArchivePersonal} onShare={setShareTarget} onCopyLink={(item)=>void copyLink(item)} onDownload={(item)=>void downloadItems([item])} onZip={(items)=>void downloadItems(items)} onArchive={setArchiveTarget} onRename={(item)=>{setManagementMode("organize");setManagementTarget(item);}} onMove={(item)=>{setManagementMode("organize");setManagementTarget(item);}} onCopy={(item)=>{setManagementMode("copy");setManagementTarget(item);}} onDuplicate={setDuplicateTarget} onFavorite={(item)=>void toggleFavorite(item)} onRequest={setRequestFolder} onBatch={()=>setBatchOpen(true)} onAutomate={projectContext?undefined:(item)=>{setAutomationTarget(item);setAutomationOpen(true);}} onClear={clearSelection} onDetails={()=>toggleDetailsPanel(details,()=>void showDetails(),()=>setDetails(false))}/>:<>
      <div className="flex min-w-0 items-center gap-2">
        {view!=="sent"&&<button type="button" aria-label="Filtros" aria-expanded={filtersOpen} onClick={()=>{setDetails(false);setFiltersOpen((open)=>!open);}} className={`grid size-10 shrink-0 place-items-center rounded-full border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${filtersOpen?"bg-nite-surface-elevated":""}`}>
          <Image aria-hidden="true" alt="" src="/images/documents/NiteConnect-Filtro.svg" width={20} height={20} className="size-5"/>
        </button>}
        {quickFiltersVisible&&view!=="sent"&&<div className="flex flex-wrap items-center gap-2" aria-label="Filtros rápidos por tipo">
          {quickTypes.filter((item)=>!projectContext||item.supported).map((item)=>{
            const active=params.type===item.mime;
            return <button key={item.label} type="button" disabled={!item.supported} aria-label={`${item.label}${item.supported?active?", filtro aplicado":", filtrar":", formato não suportado"}`} aria-pressed={item.supported?active:undefined} title={item.supported?item.label:`${item.label} ainda não é aceito no módulo documental`} onClick={()=>toggleType(item.mime)} className={`grid size-10 place-items-center rounded-full border border-transparent bg-nite-surface-subtle transition-colors hover:bg-nite-surface-elevated focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:opacity-65 ${active?"ring-2 ring-nite-brand-primary ring-offset-2 ring-offset-nite-background":""}`}><Image aria-hidden="true" alt="" src={item.src} width={24} height={24} className="size-6"/></button>;
          })}
        </div>}
        {view!=="sent"&&<button type="button" aria-label={quickFiltersVisible?"Ocultar filtros aplicados":"Mostrar filtros aplicados"} aria-expanded={quickFiltersVisible} onClick={()=>setQuickFiltersVisible((visible)=>!visible)} className="grid size-8 shrink-0 place-items-center rounded-full border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 transition-transform motion-reduce:transition-none ${quickFiltersVisible?"rotate-180":""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 4 6 6-6 6"/></svg>
        </button>}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {!projectContext&&<Link href="/documentos?advanced=1" className="min-h-10 rounded-control px-3 py-2 text-type-body-compact text-nite-brand-primary hover:bg-nite-surface-subtle">Pesquisa avançada</Link>}
        <div className="relative flex items-center gap-2">
          <details className="group relative">
            <summary aria-label="Opções de visualização e classificação" className="grid size-10 cursor-pointer list-none place-items-center rounded-full border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden"><OneDriveMenuIcon name="options"/></summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-control border border-nite-border-soft bg-nite-surface p-2 shadow-nite-floating"><p className="px-2 py-2 text-type-metadata font-semibold text-nite-text-muted">Visualização</p>{([["list","Lista"],["compact","Lista compacta"],["grid","Blocos"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={layout===value} onClick={()=>setLayout(value)} className={`flex min-h-10 w-full items-center gap-3 rounded-control px-2 text-left text-type-body-compact ${layout===value?"bg-nite-brand-soft text-nite-brand-primary":"text-nite-text-primary hover:bg-nite-surface-subtle"}`}>{value==="grid"?<GridGlyph/>:<ListGlyph/>}{label}</button>)}{view!=="sent"&&<><div className="my-2 border-t border-nite-border-soft"/><p className="px-2 py-2 text-type-metadata font-semibold text-nite-text-muted">Classificar por</p>{([["name","Nome"],["modifiedAt","Modificado"],["createdAt","Criado"],["size","Tamanho do arquivo"]] as const).map(([sort,label])=><Link key={sort} href={queryString(view,folderId,{...query,sort,direction:query.sort===sort&&query.direction!=="desc"?"desc":"asc"})} className="flex min-h-9 items-center rounded-control px-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">{label}</Link>)}</>}</div>
          </details>
          <button type="button" aria-expanded={details} aria-label="Detalhes" onClick={()=>{setFiltersOpen(false);if(details){setDetails(false);return;}void showDetails();}} className={`inline-flex min-h-10 items-center gap-2 rounded-control border border-nite-border-soft px-3 text-type-body-compact text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${details?"border-nite-brand-primary text-nite-brand-primary":""}`}>
            <OneDriveMenuIcon name="details"/>Detalhes
          </button>
        </div>
      </div>
      </>}
    </div>

    {params.error&&<TransientFeedback messageKey={params.error} queryParam="error" occurrenceKey={params}><p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft px-4 py-3 text-type-body-compact text-status-error">{errorText(params.error)}</p></TransientFeedback>}
    {params.saved&&<TransientFeedback messageKey={params.saved} queryParam="saved" occurrenceKey={params}><p role="status" className="rounded-control border border-nite-border-soft bg-nite-surface-subtle px-4 py-3 text-type-body-compact text-nite-text-primary">Alteração concluída e listagem atualizada.</p></TransientFeedback>}
    {uploadSummary&&<TransientFeedback messageKey={uploadSummary} onDismiss={()=>setUploadSummary(null)}><p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft px-4 py-3 text-type-body-compact text-status-error">{uploadSummary}</p></TransientFeedback>}
    {favoritesIssue&&<p role="status" className="rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-type-body-compact text-status-warning">{favoritesIssue}</p>}
    {message==="Preparando arquivo ZIP…"?<p role="status" className="rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-type-body-compact text-status-warning">{message}</p>:message&&<TransientFeedback messageKey={message} onDismiss={()=>setMessage(null)}><p role="status" className="rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-type-body-compact text-status-warning">{message}</p></TransientFeedback>}
    {progress&&<div role="status" aria-live="polite" className="rounded-panel border border-nite-border-soft bg-nite-surface p-4"><div className="mb-2 flex justify-between text-type-body-compact text-nite-text-primary"><span>Enviando arquivos · {progress.sent} de {progress.total}</span><span>{progress.percent}%</span></div><progress className="h-2 w-full accent-nite-brand-primary" max={100} value={progress.percent}/></div>}

    {issue&&<div role="alert" className="grid min-h-72 place-content-center gap-2 rounded-panel border border-nite-border-soft bg-nite-surface px-4 text-center"><p className="font-medium text-nite-text-primary">{issue==="access"?"Você não tem acesso a esta pasta.":issue==="not-found"?"A pasta não existe ou não está disponível para sua conta.":"Não foi possível carregar os arquivos."}</p><p className="text-type-body-compact text-nite-text-secondary">{issue==="access"||issue==="not-found"?"Volte para uma área compartilhada com você.":"Verifique a conexão com o serviço documental e tente novamente."}</p><button onClick={()=>router.refresh()} className="mx-auto min-h-10 rounded-control border border-nite-border-control px-4 text-nite-text-primary">Tentar novamente</button></div>}
    {!issue&&(listing||view!=="personal")&&<div className={`min-h-0 min-w-0 flex-1 ${view==="personal"?"-mt-[5px]":"-mt-[8px]"}`}>
      <div className={`flex h-full min-w-0 min-h-0 flex-col overflow-hidden rounded-[8px] ${projectContext?"bg-nite-surface-elevated":"bg-[#292827]"}`} style={{fontFamily:'"Segoe UI", Tahoma, Arial, sans-serif'}}>
        {displayedItems.length===0?<div className="grid min-h-80 flex-1 place-content-center gap-2 px-5 text-center"><p className="font-display text-[20px] font-semibold leading-[27px] text-nite-text-primary">{params.search||params.type?"Nenhum resultado encontrado":view==="shared"?"Nenhum arquivo compartilhado com você":view==="sent"?"Nenhum arquivo compartilhado por você":"Esta pasta está vazia"}</p><p className="max-w-md text-xs leading-4 text-nite-text-secondary">{params.search||params.type?"Ajuste a pesquisa ou remova o filtro para ver outros arquivos.":view==="shared"?"Quando alguém compartilhar um arquivo ou pasta com você, o item aparecerá aqui.":view==="sent"?"Os itens que você compartilhar aparecerão aqui.":"Crie uma pasta ou carregue arquivos para começar."}</p>{canAddContent&&!params.search&&!params.type&&<button onClick={openFilesPicker} className="mx-auto min-h-10 rounded-control bg-nite-brand-primary px-4 text-white">Carregar arquivos</button>}</div>
          :layout==="grid"?<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-4 sm:grid-cols-2 xl:grid-cols-3">{displayedItems.map((item)=><button key={item.id} onClick={()=>select(item.id,!selected.includes(item.id))} onDoubleClick={()=>openItem(item)} className={`rounded-panel border p-4 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${selected.includes(item.id)?"border-nite-brand-primary bg-nite-brand-soft":"border-nite-border-soft hover:bg-nite-surface-subtle"}`}><span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-control bg-nite-surface-subtle"><ItemIcon item={item}/></span><span className="min-w-0 truncate font-medium text-nite-text-primary">{item.name}</span></span><span className="mt-3 block text-type-metadata text-nite-text-muted">{item.kind==="folder"?"Pasta":item.file?bytes(item.file.size):"Arquivo"}</span></button>)}</div>
          :<div style={{containerType:"inline-size"}} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"><table style={{"--document-baseline-width":`${gridWidth}px`} as React.CSSProperties} className={`w-full min-w-0 table-fixed text-left ${layout==="compact"?"text-type-metadata":"text-type-body-compact"}`}>
            <colgroup>
              <col className="w-[3.55%] 2xl:w-[56px]"/><col className="w-[2.55%] 2xl:w-[40px]"/>
              <col className="w-[93.9%] md:w-[51.9%] lg:w-[39.9%] xl:w-[31.9%] 2xl:w-auto document-column-name"/>
              <col className="hidden md:table-column md:w-[42%] lg:w-[25%] xl:w-[12.65%] 2xl:w-[200px]"/>
              <col className="hidden xl:table-column xl:w-[26%] 2xl:w-auto document-column-owner"/>
              <col className="hidden lg:table-column lg:w-[29%] xl:w-[6.96%] 2xl:w-[140px]"/>
              <col className="hidden xl:table-column xl:w-[16.39%] 2xl:w-[160px]"/>
              <col className="hidden 2xl:table-column 2xl:w-auto document-column-activity"/>
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-nite-border-soft bg-inherit text-sm font-semibold text-nite-text-secondary"><tr className="h-[49px]">
              <th className="h-[49px] px-3 py-0">{selected.length>0&&<SelectionCheckbox label="Selecionar todas as linhas" checked={allItemsSelected} indeterminate={!allItemsSelected} onChange={selectAll}/>}</th><th className="h-[49px] px-2 py-0"><OneDriveMenuIcon name="page"/></th>
              <th className="h-[49px] min-w-0 px-3 py-0">{view==="sent"?"Nome":<SortLink label="Nome" sort="name" {...{view,folderId,query,projectContext}}/>}</th>
              <th className="hidden h-[49px] min-w-0 px-3 py-0 md:table-cell">{view==="sent"?"Compartilhado":<SortLink label="Modificado" sort="modifiedAt" {...{view,folderId,query,projectContext}}/>}</th>
              <th className="hidden h-[49px] min-w-0 overflow-hidden px-3 py-0 xl:table-cell"><span className="block truncate" title="Modificado por">Modificado por</span></th>
              <th className="hidden h-[49px] min-w-0 overflow-hidden px-3 py-0 lg:table-cell">{view==="shared"&&!listing||view==="sent"?<span className="block truncate" title="Tamanho do arquivo">Tamanho do arquivo</span>:<SortLink label="Tamanho do arquivo" sort="size" {...{view,folderId,query,projectContext}}/>}</th>
              <th className="hidden h-[49px] min-w-0 overflow-hidden px-3 py-0 xl:table-cell"><span aria-label="Compartilhamento" title="Compartilhamento" className="block truncate">Compartilhamento</span></th>
              <th className="hidden h-[49px] min-w-0 overflow-hidden px-3 py-0 2xl:table-cell"><span className="block truncate" title="Atividade">Atividade</span></th>
            </tr></thead>
            <tbody>{displayedItems.map((item)=>{const isSelected=selected.includes(item.id);return <tr key={item.id} tabIndex={0} aria-selected={isSelected} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select(item.id,!isSelected);}if(event.key==="ArrowRight")openItem(item);}} onDoubleClick={()=>openItem(item)} onClick={()=>select(item.id,!isSelected)} style={{backgroundColor:isSelected?"color-mix(in srgb, var(--nite-brand-primary) 24%, var(--nite-background))":undefined}} className="group cursor-pointer border-b border-nite-border-soft/70 transition-colors hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus">
              <td className="px-3 py-2"><SelectionCheckbox label={`Selecionar ${item.name}`} checked={isSelected} onChange={(checked)=>select(item.id,checked)} className={`transition-opacity focus-within:opacity-100 ${isSelected?"opacity-100":"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}/></td>
              <td className="px-2 py-2"><ItemIcon item={item}/></td>
              <td className="min-w-0 px-3 py-2"><div className="relative flex min-w-0 items-center gap-2" onClick={(event)=>event.stopPropagation()}>
                <button onClick={()=>openItem(item)} className={`min-w-0 flex-1 truncate text-left font-medium text-nite-text-primary hover:text-nite-brand-primary hover:underline focus-visible:outline-2 focus-visible:outline-nite-focus ${isSelected?"pr-24":"group-hover:pr-24 group-focus-within:pr-24"}`}>{item.name}</button>
                {item.kind==="file"&&item.file?.sharedWithCount?<span aria-label="Compartilhado" title="Compartilhado" className="shrink-0 text-nite-text-secondary"><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="6" r="2.5"/><path d="M2.5 16a4.5 4.5 0 0 1 9 0m1-8h5m-2.5-2.5v5"/></svg></span>:null}
                <div className={`absolute right-[-1px] top-1/2 flex -translate-y-1/2 items-center gap-1 ${isSelected?"opacity-100":"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
                  <div data-item-actions className="relative mr-px">
                    <button type="button" aria-label={`Mais ações para ${item.name}`} aria-haspopup="menu" aria-expanded={openItemMenu===item.id} onClick={(event)=>{event.stopPropagation();setOpenFolderColorMenu(null);setOpenItemMenu(openItemMenu===item.id?null:item.id);}} onKeyDown={(event)=>{if(event.key==="Escape"){setOpenItemMenu(null);setOpenFolderColorMenu(null);}}} className="grid size-7 shrink-0 place-items-center rounded-full text-nite-text-secondary hover:bg-nite-surface-elevated focus-visible:outline-2 focus-visible:outline-nite-focus"><MoreGlyph/></button>
                    <div role="menu" aria-label={`Ações para ${item.name}`} hidden={openItemMenu!==item.id} onClick={(event)=>event.stopPropagation()} onKeyDown={(event)=>{if(event.key==="Escape"){setOpenItemMenu(null);setOpenFolderColorMenu(null);return;}if(event.key!=="ArrowDown"&&event.key!=="ArrowUp"&&event.key!=="Home"&&event.key!=="End")return;const actions=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));const currentIndex=event.target instanceof HTMLButtonElement?actions.indexOf(event.target):-1;if(actions.length===0)return;event.preventDefault();const nextIndex=event.key==="Home"?0:event.key==="End"?actions.length-1:event.key==="ArrowDown"?(currentIndex+1)%actions.length:(currentIndex<=0?actions.length-1:currentIndex-1);actions[nextIndex]?.focus();}} className="absolute left-0 top-0 z-50 w-60 rounded-[8px] border border-nite-border-soft bg-nite-surface p-1 shadow-nite-floating">
                      <SelectionAction variant="menu" label="Compartilhar" disabledReason={view==="personal"&&allows(item,"canShare",true)?undefined:"Compartilhamento não autorizado para este item."} onClick={()=>{setOpenItemMenu(null);setShareDialogMode("share");setShareTarget(item);}}><OneDriveMenuIcon name="share"/></SelectionAction>
                      <SelectionAction variant="menu" label="Copiar link" onClick={()=>{setOpenItemMenu(null);void copyLink(item);}}><OneDriveMenuIcon name="copy-link"/></SelectionAction>
                      {!projectContext&&<SelectionAction variant="menu" label="Solicitar arquivos" disabledReason={item.kind==="folder"&&itemCapabilities(item)?.canAddChild?undefined:"Selecione uma pasta que permita receber arquivos."} onClick={()=>{setOpenItemMenu(null);setRequestFolder(item);}}><OneDriveMenuIcon name="request-files"/></SelectionAction>}
                      <SelectionAction variant="menu" label="Gerenciar acesso" disabledReason={view==="personal"&&allows(item,"canShare",true)?undefined:"Gerenciamento de acesso não autorizado para este item."} onClick={()=>{setOpenItemMenu(null);setShareDialogMode("manage");setShareTarget(item);}}><OneDriveMenuIcon name="manage-access"/></SelectionAction>
                      <div className="my-1 border-t border-nite-border-soft" aria-hidden="true"/>
                      <SelectionAction variant="menu" label={projectContext?.canRequestDeletion&&!itemCapabilities(item)?.canDeleteToTrash?"Solicitar exclusão":"Excluir"} disabledReason={view==="personal"&&(itemCapabilities(item)?.canDeleteToTrash||projectContext?.canRequestDeletion)?undefined:"Exclusão não autorizada para este item."} onClick={()=>{setOpenItemMenu(null);setArchiveTarget(item);}}><OneDriveMenuIcon name="delete"/></SelectionAction>
                      {!projectContext&&<SelectionAction variant="menu" label={favorites.includes(`${item.kind==="folder"?"FOLDER":"DOCUMENT"}:${item.id}`)?"Remover dos favoritos":"Adicionar aos favoritos"} disabledReason={favoriteBusy?"Atualizando favoritos…":undefined} onClick={()=>{setOpenItemMenu(null);void toggleFavorite(item);}}><OneDriveMenuIcon name="add-to-favorites"/></SelectionAction>}
                      <SelectionAction variant="menu" label="Baixar" disabledReason={item.kind==="folder"?itemCapabilities(item)?.canView?undefined:"Pasta indisponível.":itemCapabilities(item)?.canDownload?undefined:"Download não autorizado."} onClick={()=>{setOpenItemMenu(null);void downloadItems([item]);}}><OneDriveMenuIcon name="download"/></SelectionAction>
                      <SelectionAction variant="menu" label="Renomear" disabledReason={view==="personal"&&allows(item,"canRename",item.kind==="folder"?item.folder?.kind==="CUSTOM":item.file?.context==="PERSONAL")?undefined:"Este item não pode ser renomeado neste contexto."} onClick={()=>{if(view==="personal"){setOpenItemMenu(null);setManagementMode("organize");setManagementTarget(item);}}}><OneDriveMenuIcon name="rename"/></SelectionAction>
                      <SelectionAction variant="menu" label="Mover para" disabledReason={view==="personal"&&allows(item,"canMove",item.kind==="folder"?item.folder?.kind==="CUSTOM":item.file?.context==="PERSONAL")?undefined:"Este item não pode ser movido neste contexto."} onClick={()=>{if(view==="personal"){setOpenItemMenu(null);setManagementMode("organize");setManagementTarget(item);}}}><OneDriveMenuIcon name="move-to"/></SelectionAction>
                      <SelectionAction variant="menu" label="Copiar para" disabledReason={itemCapabilities(item)?.canCopy?undefined:"Cópia não autorizada."} onClick={()=>{setOpenItemMenu(null);setManagementMode("copy");setManagementTarget(item);}}><OneDriveMenuIcon name="copy-to"/></SelectionAction>
                      <SelectionAction variant="menu" label="Duplicata" disabledReason={itemCapabilities(item)?.canCopy?undefined:"Duplicação não autorizada."} onClick={()=>{setOpenItemMenu(null);setDuplicateTarget(item);}}><OneDriveMenuIcon name="duplicate"/></SelectionAction>
                      {!projectContext&&itemCapabilities(item)?.canView&&<SelectionAction variant="menu" label="Automatizar" onClick={()=>{setOpenItemMenu(null);setAutomationTarget(item);setAutomationOpen(true);}}><MoreGlyph/></SelectionAction>}
                      {item.kind==="folder"&&<div className="relative">
                        <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={openFolderColorMenu===item.id} disabled={view!=="personal"||item.folder?.kind!=="CUSTOM"||!allows(item,"canRename",true)||folderColorUpdating} title={view==="personal"&&item.folder?.kind==="CUSTOM"&&allows(item,"canRename",true)?undefined:"A cor só pode ser alterada em pastas organizáveis."} onClick={(event)=>{event.stopPropagation();setOpenFolderColorMenu(openFolderColorMenu===item.id?null:item.id);}} className="flex min-h-9 w-full items-center gap-1 rounded-control px-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:text-nite-text-muted disabled:opacity-65"><OneDriveMenuIcon name="folder-color"/>Cor da pasta<span aria-label={`Cor atual: ${folderColors.find((color)=>color.value===(item.folder?.color??folderColors[0]!.value))?.name??"Personalizada"}`} className="ml-auto size-3 shrink-0 rounded-full ring-1 ring-black/20" style={{backgroundColor:item.folder?.color??folderColors[0]!.value}}/><svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 3 5 5-5 5"/></svg></button>
                        {openFolderColorMenu===item.id&&<div role="menu" aria-label="Selecionar cor da pasta" className="absolute left-full top-0 z-[60] ml-1 w-44 rounded-[8px] border border-nite-border-soft bg-nite-surface p-3 shadow-nite-floating"><p className="mb-2 text-type-metadata font-medium text-nite-text-secondary">Cor da pasta</p><div className="grid grid-cols-4 gap-2">{folderColors.map((color)=><button key={color.value} type="button" role="menuitemradio" aria-label={color.name} aria-checked={(item.folder?.color??folderColors[0]!.value)===color.value} title={color.name} disabled={folderColorUpdating} onClick={()=>void changeFolderColor(item,color.value)} className="grid size-7 place-items-center rounded-full ring-1 ring-black/20 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus" style={{backgroundColor:color.value}}>{(item.folder?.color??folderColors[0]!.value)===color.value&&<svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 text-white drop-shadow" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m4 10 4 4 8-8"/></svg>}</button>)}</div></div>}
                      </div>}
                      <div className="my-1 border-t border-nite-border-soft" aria-hidden="true"/>
                      <SelectionAction variant="menu" label="Detalhes" onClick={()=>{setOpenItemMenu(null);void showDetails(item);}}><OneDriveMenuIcon name="details"/></SelectionAction>
                    </div>
                  </div>
                  {view==="personal"&&allows(item,"canShare",true)&&<button type="button" aria-label={`Compartilhar ${item.name}`} title="Compartilhar" onClick={()=>{setShareDialogMode("share");setShareTarget(item);}} className="grid size-7 shrink-0 place-items-center rounded-full text-nite-text-secondary hover:bg-nite-surface-elevated focus-visible:outline-2 focus-visible:outline-nite-focus"><OneDriveMenuIcon name="share"/></button>}
                  {!projectContext&&<button type="button" aria-label={`${favorites.includes(`${item.kind==="folder"?"FOLDER":"DOCUMENT"}:${item.id}`)?"Remover":"Adicionar"} ${item.name} ${favorites.includes(`${item.kind==="folder"?"FOLDER":"DOCUMENT"}:${item.id}`)?"dos":"aos"} favoritos`} title="Alternar favorito" disabled={favoriteBusy!==null} onClick={()=>void toggleFavorite(item)} className="grid size-7 shrink-0 place-items-center rounded-full text-nite-text-secondary hover:text-nite-brand-primary disabled:opacity-50">{favorites.includes(`${item.kind==="folder"?"FOLDER":"DOCUMENT"}:${item.id}`)?<FavoriteGlyph active/>:<OneDriveMenuIcon name="add-to-favorites"/>}</button>}
                </div>
              </div></td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-nite-text-secondary md:table-cell">{date(item.sent?.sharedAt??(item.kind==="folder"?item.folder?.modifiedAt:item.file?.modifiedAt??item.shared?.modifiedAt))}</td>
              <td className="hidden max-w-48 truncate px-3 py-2 text-nite-text-secondary xl:table-cell" title={item.kind==="folder"?item.folder?.modifiedByName??"Não disponível":item.file?.modifiedByName??item.file?.createdByName??"Não disponível"}>{item.kind==="folder"?item.folder?.modifiedByName??"Não disponível":item.file?.modifiedByName??item.file?.createdByName??"Não disponível"}</td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-nite-text-secondary lg:table-cell">{item.kind==="folder"?"Não disponível":item.file?bytes(item.file.size):"Não disponível"}</td>
              <td className="hidden truncate px-3 py-2 text-nite-text-secondary xl:table-cell" title={item.sent?item.sent.recipients.map((grant)=>grant.memberName).join(", "):item.shared?.sharedByName??(item.kind==="folder"?projectContext?"Projeto":"Particular":item.file?.sharedWithCount?`${item.file.sharedWithCount} acesso(s)`:item.permission??"Particular")}>{item.sent?`${item.sent.recipients.length} destinatário(s)`:item.shared?.sharedByName??(item.kind==="folder"?projectContext?"Projeto":"Particular":item.file?.sharedWithCount?`${item.file.sharedWithCount} acesso(s)`:item.permission??"Particular")}</td>
              <td className="hidden px-3 py-2 text-nite-text-secondary 2xl:table-cell">{item.kind==="file"&&item.file?.lastOpenedAt?`Aberto ${date(item.file.lastOpenedAt)}`:"—"}</td>
            </tr>;})}</tbody></table></div>}
        {(listing?.hasMore||listing?.nextCursor||receivedHasMore||receivedCursor)&&<div className="border-t border-nite-border-soft p-3 text-center"><button type="button" onClick={()=>void loadMore()} className="min-h-10 rounded-control border border-nite-border-control px-4 text-type-body-compact font-medium text-nite-text-primary hover:bg-nite-surface-subtle">Carregar mais arquivos</button></div>}
      </div>
    </div>}
    </div>
    {filtersOpen&&<aside aria-label="Filtros de arquivos" className="fixed right-0 top-16 z-40 h-[calc(100svh-4rem)] w-[min(22rem,calc(100vw-1rem))] min-w-0 overflow-y-auto rounded-l-panel border border-nite-border-soft bg-nite-surface p-4 lg:static lg:right-auto lg:top-auto lg:z-auto lg:h-auto lg:w-auto lg:rounded-panel lg:max-h-[min(70svh,54rem)] lg:overflow-y-auto"><div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-semibold text-nite-text-primary">Filtros</h2><button type="button" aria-label="Fechar filtros" onClick={()=>setFiltersOpen(false)} className="grid size-9 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">×</button></div><fieldset className="grid gap-1"><legend className="mb-2 text-type-metadata font-semibold text-nite-text-secondary">Tipo de arquivo</legend><label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle"><input type="radio" name="library-type" checked={!params.type} onChange={()=>params.type&&toggleType(params.type)} className="size-4 accent-nite-brand-primary"/>Todos os tipos</label>{typeOptions.map((option)=><label key={option.mime} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-2 text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle"><input type="radio" name="library-type" checked={params.type===option.mime} onChange={()=>toggleType(option.mime)} className="size-4 accent-nite-brand-primary"/>{option.label}</label>)}</fieldset></aside>}
    {details&&!filtersOpen&&<DetailsPanel item={detailItem??selectedItems[0]??{id:current?.id??"",name:pageTitle,kind:"folder",folder:current??undefined}} file={detailPayload?.file} folder={detailPayload?.folder} info={detailPayload?.info} activity={detailPayload?.activity} activityOnly={!detailItem&&selectedItems.length===0} loading={loadingDetails} currentFolder={current} ancestors={ancestors.filter((ancestor)=>!projectContext||(ancestor.projectId===projectContext.id&&ancestor.kind!=="PROJECT"))} view={view} rootLabel={projectContext?.name} atRoot={!inFolder} onClose={()=>setDetails(false)} onLoadMoreActivity={()=>void loadMoreActivity()} onChanged={()=>{void refreshCurrent();void showDetails(detailItem??undefined);}}/>}
    </div>

    {dialog==="folder"&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)setDialog(null);}}>
      <section role="dialog" aria-modal="true" aria-labelledby="my-files-dialog-title" onKeyDown={(event)=>containDialogFocus(event,()=>setDialog(null))} className="w-full max-w-[440px] rounded-[8px] bg-[color-mix(in_srgb,var(--nite-background)_94%,var(--nite-text-primary))] p-6 shadow-nite-modal" style={{fontFamily:'"Segoe UI",Tahoma,Arial,sans-serif',fontSize:"14px"}}>
        <div className="mb-5 flex items-start justify-between gap-3"><h2 id="my-files-dialog-title" className="text-xl font-semibold leading-6 text-nite-text-primary">Crie uma pasta</h2><button type="button" onClick={()=>setDialog(null)} aria-label="Fechar diálogo" className="grid size-6 place-items-center rounded-[4px] text-xl leading-none text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus">×</button></div>
        <form action={createLibraryFolder} className="grid gap-7">
          <input type="hidden" name="parentId" value={folderId??""}/><input type="hidden" name="color" value={folderColor}/><input type="hidden" name="returnTo" value={baseAction}/>{projectContext&&<input type="hidden" name="projectId" value={projectContext.id}/>}
          <label className="grid gap-2 text-sm font-semibold text-nite-text-primary">Nome<input name="name" autoFocus value={folderName} onChange={(event)=>setFolderName(event.target.value)} maxLength={190} className="h-8 rounded-[3px] border border-nite-border-control bg-nite-background px-2 font-normal text-nite-text-primary focus-visible:outline-2 focus-visible:outline-nite-focus"/></label>
          <fieldset><legend className="mb-3 text-sm font-semibold text-nite-text-primary">Cor da pasta</legend><div className="grid grid-cols-[repeat(8,32px)] justify-between gap-y-2.5">{folderColors.map((color)=><label key={color.value} title={color.name} className="grid size-8 cursor-pointer place-items-center rounded-full focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-nite-focus"><input type="radio" name="folder-color" value={color.value} checked={folderColor===color.value} onChange={()=>setFolderColor(color.value)} aria-label={color.name} className="sr-only"/><span aria-hidden="true" className={`size-6 rounded-full ${folderColor===color.value?"ring-2 ring-nite-brand-primary ring-offset-2 ring-offset-nite-background":"hover:ring-2 hover:ring-nite-border-strong hover:ring-offset-2 hover:ring-offset-nite-background"}`} style={{backgroundColor:color.value}}/></label>)}</div></fieldset>
          <div className="flex justify-end gap-2"><button type="submit" disabled={!folderName.trim()} className="h-8 min-w-20 rounded-full bg-nite-brand-primary px-4 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:bg-nite-surface-elevated disabled:text-nite-text-muted disabled:hover:brightness-100">Criar</button><button type="button" onClick={()=>setDialog(null)} className="h-8 min-w-[88px] rounded-full border border-nite-border-control px-4 text-sm font-semibold text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Cancelar</button></div>
        </form>
      </section>
    </div>}
    {shareTarget&&<ShareDialog item={shareTarget} mode={shareDialogMode} onClose={()=>setShareTarget(null)} onMessage={setMessage} onChanged={()=>void refreshCurrent()}/>}
    {managementTarget&&view==="personal"&&<ItemManagementDialog item={managementTarget} mode={managementMode} returnTo={baseAction} projectContext={projectContext} onClose={()=>setManagementTarget(null)}/>}
    {duplicateTarget&&view==="personal"&&<DuplicateDialog item={duplicateTarget} returnTo={baseAction} projectContext={projectContext} onClose={()=>setDuplicateTarget(null)}/>}
    {requestFolder&&requestFolder.kind==="folder"&&itemCapabilities(requestFolder)?.canAddChild&&<RequestFilesDialog folder={requestFolder} onClose={()=>setRequestFolder(null)} onCreated={()=>{setRequestFolder(null);setMessage("Solicitação de arquivos criada.");router.refresh();}}/>}
    {requestsOpen&&<FileRequestsDialog onClose={()=>setRequestsOpen(false)} onChanged={()=>void refreshCurrent()}/>}
    {automationOpen&&<DocumentAutomationDialog memberId={memberId} target={automationTarget?{id:automationTarget.id,name:automationTarget.name,type:automationTarget.kind==="folder"?"FOLDER":"DOCUMENT"}:undefined} onClose={()=>setAutomationOpen(false)}/>}
    {batchOpen&&selectedItems.length>1&&<DocumentBatchDialog items={selectedItems.map((item):BatchResource=>({id:item.id,type:item.kind==="folder"?"FOLDER":"DOCUMENT",name:item.name}))} actions={batchActions(selectedItems)} projectContext={projectContext} onClose={()=>setBatchOpen(false)} onDone={(result)=>{setBatchOpen(false);setSelected([]);setMessage(result);void refreshCurrent();}}/>}
    {archiveTarget&&projectContext?.canRequestDeletion&&!itemCapabilities(archiveTarget)?.canDeleteToTrash&&<ProjectDocumentActionDialog projectId={projectContext.id} resourceId={archiveTarget.id} resourceType={archiveTarget.kind==="folder"?"FOLDER":"DOCUMENT"} name={archiveTarget.name} action="TRASH" requestsPath={projectContext.requestsPath??`${projectContext.basePath}/aprovacoes`} onClose={()=>setArchiveTarget(null)}/>}
    {archiveTarget&&view==="personal"&&itemCapabilities(archiveTarget)?.canDeleteToTrash&&<TrashDialog item={archiveTarget} returnTo={baseAction} projectContext={projectContext} onClose={()=>setArchiveTarget(null)}/>}
  </section>;
}

function TrashDialog({item,returnTo,projectContext,onClose}:{item:Item;returnTo:string;projectContext?:ProjectContext;onClose:()=>void}) {
  const folder=item.kind==="folder";
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <section role="dialog" aria-modal="true" aria-labelledby="trash-dialog-title" onKeyDown={(event)=>containDialogFocus(event,onClose)} className="grid w-full max-w-md gap-4 rounded-dialog border border-nite-border-soft bg-nite-background p-6 shadow-nite-modal">
      <header className="flex items-start justify-between gap-3"><div><h2 id="trash-dialog-title" className="font-display text-type-section-title font-semibold text-nite-text-primary">Excluir {folder?"pasta":"arquivo"}</h2><p className="mt-1 break-words text-type-body-compact text-nite-text-secondary">{item.name}</p></div><button type="button" autoFocus onClick={onClose} aria-label="Fechar confirmação de exclusão" className="grid size-9 shrink-0 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle">×</button></header>
      <p className="text-type-body-compact text-nite-text-secondary">O item será enviado à Lixeira e poderá ser restaurado. {folder?"A pasta e seu conteúdo serão validados e excluídos como uma unidade.":"As versões serão preservadas."}</p>
      <form action={trashLibraryItem} className="flex justify-end gap-2 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="type" value={folder?"FOLDER":"DOCUMENT"}/><input type="hidden" name="returnTo" value={returnTo}/>{projectContext&&<input type="hidden" name="projectId" value={projectContext.id}/>}<button type="button" onClick={onClose} className="min-h-10 rounded-control border border-nite-border-control px-4 text-type-body-compact text-nite-text-primary">Cancelar</button><button type="submit" className="min-h-10 rounded-control bg-status-error px-4 text-type-body-compact font-medium text-white">Excluir{folder?" pasta e conteúdo":" arquivo"}</button></form>
    </section>
  </div>;
}

function SortLink({label,sort,view,folderId,query,projectContext}:{projectContext?:ProjectContext;label:string;sort:string;view:View;folderId:string|undefined;query:Record<string,string|undefined>}) {
  const direction=query.sort===sort&&query.direction!=="desc"?"desc":"asc";
  return <Link href={explorerQueryString(view,folderId,{...query,sort,direction},projectContext)} aria-label={`Ordenar por ${label}${query.sort===sort?query.direction==="desc"?", decrescente":", crescente":""}`} className="flex min-w-0 max-w-full items-center gap-1 font-semibold hover:text-nite-text-primary"><span className="min-w-0 truncate">{label}</span><svg aria-hidden="true" viewBox="0 0 16 16" className={`size-3 shrink-0 transition-transform ${query.sort===sort&&query.direction==="desc"?"rotate-180":""}`} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 6 4 4 4-4"/></svg></Link>;
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

export function DetailsPanel({item,file,folder,info,activity,activityOnly,loading,currentFolder,ancestors=[],view="personal",rootLabel:projectRootLabel,atRoot,onClose,onLoadMoreActivity,onChanged}:{item:Item;file?:LibraryFile;folder?:LibraryFolder;info?:DocumentInformation;activity?:ActivityListing;activityOnly:boolean;loading:boolean;currentFolder?:LibraryFolder;ancestors?:LibraryFolder[];view?:View;rootLabel?:string;atRoot:boolean;onClose:()=>void;onLoadMoreActivity:()=>void;onChanged?:()=>void}) {
  const detailsFile=file??item.file;
  const detailsFolder=folder??item.folder;
  const rootLabel=projectRootLabel??(view==="shared"?"Com você":view==="sent"?"Por você":"Meus arquivos");
  const basePath=[rootLabel,...ancestors.map((ancestor)=>ancestor.name),...(atRoot?[]:currentFolder?[currentFolder.name]:[])];
  const path=activityOnly||item.name===rootLabel?basePath.join(" > "):[...basePath,item.name].join(" > ");
  const modifiedAt=item.kind==="folder"?detailsFolder?.modifiedAt:item.shared?.modifiedAt??detailsFile?.modifiedAt;
  const createdAt=item.kind==="folder"?detailsFolder?.createdAt:item.shared?.createdAt??detailsFile?.createdAt;
  const size=item.kind==="file"&&detailsFile?bytes(detailsFile.size):"Não disponível";
  const createdBy=item.kind==="folder"?detailsFolder?.createdByName:item.shared?.createdByName??detailsFile?.createdByName;
  const owner=resourceOwnerLabel(info?.identity??(item.kind==="folder"?detailsFolder?.identity??item.shared?.identity??item.sent?.identity:
    detailsFile?.identity??item.shared?.identity??item.sent?.identity),createdBy,
    item.kind==="folder"?detailsFolder?.ownerName:item.shared?.ownerName??detailsFile?.ownerName);
  const modifiedBy=item.kind==="folder"?detailsFolder?.modifiedByName:item.shared?.modifiedByName??detailsFile?.modifiedByName;
  return <div role="complementary" aria-label="Detalhes do item" className="fixed right-0 top-16 z-40 flex h-[calc(100svh-4rem)] w-[min(22rem,calc(100vw-1rem))] min-w-0 min-h-0 flex-col overflow-hidden rounded-l-[8px] border border-nite-border-soft bg-nite-surface lg:relative lg:right-auto lg:top-auto lg:z-auto lg:h-full lg:w-auto lg:rounded-[8px]">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-nite-border-soft p-4"><div className="flex min-w-0 items-center gap-2"><ItemIcon item={item}/><p className="truncate font-medium text-nite-text-primary">{item.name}</p></div><button type="button" onClick={onClose} aria-label="Fechar detalhes" className="grid size-9 shrink-0 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">×</button></header>
    <div className="document-details-scroll min-h-0 flex-1 overflow-y-auto">
      <section aria-labelledby="details-activity-title" className="border-b border-nite-border-soft p-4"><h3 id="details-activity-title" className="mb-3 font-medium text-nite-text-primary">Atividade</h3>{activity?.items.length?<div className="grid gap-2">{activityGroups(activity).map((group)=><section key={group.label}><h4 className="mb-2 text-type-metadata font-semibold text-nite-text-secondary">{group.label}</h4><ul className="grid gap-2">{group.items.map((entry:LibraryActivity)=><li key={entry.id} className="flex gap-3 rounded-control bg-nite-surface-subtle p-3"><ActivityGlyph action={entry.action}/><div className="min-w-0"><p className="text-type-body-compact text-nite-text-primary">{entry.actorName??"Responsável não informado"} {activityAction(entry.action)}</p>{entry.reason&&<p className="mt-1 text-type-body-compact text-nite-text-secondary">{entry.reason}</p>}<p className="mt-2 text-type-metadata text-nite-text-muted"><time dateTime={entry.occurredAt}>{dateTime(entry.occurredAt)}</time></p></div></li>)}</ul></section>)}</div>:<p role={loading?"status":undefined} className="rounded-control bg-nite-surface-subtle px-3 py-4 text-type-body-compact text-nite-text-secondary">{loading?"Carregando atividade…":activity?"Nenhuma atividade registrada.":"Atividade recente indisponível para este item."}</p>}{activity?.hasMore&&<button type="button" onClick={onLoadMoreActivity} className="mt-3 min-h-9 rounded-control border border-nite-border-control px-3 text-type-body-compact text-nite-text-primary">Carregar atividades anteriores</button>}</section>
      {!activityOnly&&<><dl className="grid gap-4 p-4 text-type-body-compact"><Detail label="Tipo" value={item.kind==="folder"?"Pasta":info?.mimeType??item.shared?.mimeType??detailsFile?.mimeType??"Não disponível"}/><Detail label="Tamanho" value={info?bytes(info.size):item.shared?.size!==undefined&&item.shared.size!==null?bytes(item.shared.size):size}/><Detail label="Proprietário" value={owner??"Não disponível"}/><Detail label="Criado por" value={createdBy??info?.identity.createdBy??"Não disponível"}/><Detail label="Modificado por" value={modifiedBy??info?.identity.modifiedBy??"Não disponível"}/><Detail label="Modificado" value={dateTime(info?.modifiedAt??modifiedAt)}/><Detail label="Data de criação" value={dateTime(info?.createdAt??createdAt)}/><Detail label="Localização" value={info?.parentName??path}/>{info&&<><Detail label="Origem" value={info.identity.origin}/><Detail label="Classificação" value={info.identity.protection}/><Detail label="Guarda" value={info.identity.retentionHold?"Ativa":"Sem hold"}/><Detail label="Permissão efetiva" value={info.access.effectivePermission??(info.capabilities.canEdit?"EDIT":info.capabilities.canView?"VIEW":"Sem acesso")}/><Detail label="Compartilhamento" value={info.access.grants.length?`${info.access.grants.length} concessão(ões)`:"Sem grants visíveis"}/>{info.access.grants.length>0&&<Detail label="Destinatários" value={info.access.grants.map((entry)=>entry.grant.memberName).join(", ")}/>}</>}{info?.type==="FOLDER"&&<><Detail label="Pastas" value={String(info.folderCount)}/><Detail label="Arquivos" value={String(info.fileCount)}/></>}{detailsFile&&<Detail label="Versão atual" value={String(detailsFile.revision)}/>}</dl>{item.kind==="file"&&info&&<VersionsSection documentId={item.id} canEdit={info.capabilities.canEdit} onChanged={onChanged}/>}</>}
    </div>
  </div>;
}
function Detail({label,value}:{label:string;value:string}) {return <div><dt className="text-type-metadata text-nite-text-muted">{label}</dt><dd className="break-words text-nite-text-primary">{value}</dd></div>;}
function VersionsSection({documentId,canEdit,onChanged}:{documentId:string;canEdit:boolean;onChanged?:()=>void}) {
  const [page,setPage]=useState<DocumentVersionPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[loadError,setLoadError]=useState<string|null>(null);
  async function load(before?:number) {const path=`/api/v1/documents/${documentId}/versions`;
    const url=`/api/library/manage?path=${encodeURIComponent(path)}&limit=30${before?`&beforeRevision=${before}`:""}`;
    const response=await fetch(url);if(!response.ok)throw new Error();const parsed=parseVersionPage(await response.json());if(!parsed)throw new Error();
    setPage((current)=>before&&current?{...parsed,items:[...current.items,...parsed.items]}:parsed);
  }
  useEffect(()=>{let active=true;void fetch(`/api/library/manage?path=${encodeURIComponent(`/api/v1/documents/${documentId}/versions`)}&limit=30`).then(async(response)=>{
    if(!response.ok)throw new Error();const parsed=parseVersionPage(await response.json());if(!parsed)throw new Error();if(active)setPage(parsed);
  }).catch(()=>{if(active)setLoadError("Histórico de versões indisponível.");});return()=>{active=false;};},[documentId]);
  async function restore(versionId:string) {if(!canEdit||busy||!window.confirm("Restaurar esta versão como uma nova revisão?"))return;
    setBusy(true);setError(null);try {const path=`/api/v1/documents/${documentId}/versions/${versionId}/restore`;
      const response=await fetch(`/api/library/manage?path=${encodeURIComponent(path)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
      if(!response.ok)throw new Error(response.status===409?"Documento em edição ou alterado. Tente novamente.":"Restauração não autorizada ou indisponível.");
      await load();onChanged?.();
    }catch(cause){setError(cause instanceof Error?cause.message:"Restauração não concluída.");}finally{setBusy(false);}}
  return <section aria-label="Histórico de versões" className="border-t border-nite-border-soft p-4"><h3 className="mb-3 font-medium text-nite-text-primary">Histórico de versões</h3>{error&&<TransientFeedback messageKey={error} onDismiss={()=>setError(null)}><p role="alert" className="mb-2 text-type-metadata text-status-error">{error}</p></TransientFeedback>}{loadError&&<p role="alert" className="mb-2 text-type-metadata text-status-error">{loadError}</p>}{!page&&!loadError?<p role="status" className="text-type-metadata text-nite-text-muted">Carregando versões…</p>:page?.items.length===0?<p className="text-type-metadata text-nite-text-muted">Nenhuma revisão disponível.</p>:<ul className="grid gap-2">{page?.items.map((version)=><li key={version.id} className="rounded-control bg-nite-surface-subtle p-3 text-type-metadata"><p className="font-medium text-nite-text-primary">Revisão {version.revision}{version.current?" · atual":""}</p><p className="text-nite-text-secondary">{dateTime(version.createdAt)} · {bytes(version.size)}</p><div className="mt-2 flex gap-3"><a href={`/api/library/download-version/${documentId}/${version.id}`} className="text-nite-brand-primary hover:underline">Baixar</a>{!version.current&&canEdit&&<button type="button" disabled={busy} onClick={()=>void restore(version.id)} className="text-nite-brand-primary disabled:opacity-50">Restaurar conteúdo</button>}</div></li>)}</ul>}{page?.hasMore&&page.nextBeforeRevision&&<button type="button" disabled={busy} onClick={()=>{setBusy(true);void load(page.nextBeforeRevision??undefined).catch(()=>setError("Não foi possível carregar outras versões.")).finally(()=>setBusy(false));}} className="mt-3 min-h-9 rounded-control border border-nite-border-control px-3 text-type-metadata text-nite-text-primary">Carregar mais</button>}</section>;
}

function ActivityGlyph({action}:{action:string}) {
  const normalized=action.toUpperCase(),kind=normalized.includes("ARCHIVED")||normalized.includes("DELETED")?"delete":normalized.includes("CREATED")?"create":normalized.includes("UPDATED")||normalized.includes("SAVED")||normalized.includes("ORGANIZED")?"edit":"activity";
  return <span aria-hidden="true" className="mt-0.5 shrink-0 text-nite-brand-accent">{kind==="delete"?<svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 5h14M8 5V3h4v2m3 0-.8 11H5.8L5 5m3 3v5m4-5v5"/></svg>:kind==="create"?<svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10 3v14M3 10h14"/></svg>:kind==="edit"?<svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m3 14.5-.8 3.3 3.3-.8L16 7.5 12.5 4zM11.5 5l3.5 3.5"/></svg>:<svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>}</span>;
}

function ItemManagementDialog({item,mode="organize",returnTo,projectContext,onClose}:{item:Item;mode?:"organize"|"copy";returnTo:string;projectContext?:ProjectContext;onClose:()=>void}) {
  const [destinations,setDestinations]=useState<LibraryFolder[]>([]),[loadingDestinations,setLoadingDestinations]=useState(true),[destinationIssue,setDestinationIssue]=useState(false);
  useEffect(()=>{
    let active=true;
    async function load() {
      try {
        async function listing(folder?:string):Promise<LibraryListing> {
          const query=new URLSearchParams({view:"personal"});if(projectContext)query.set("projectId",projectContext.id);if(folder)query.set("folder",folder);
          const response=await fetch("/api/library/listing?"+query.toString());
          if(!response.ok)throw new Error("Folder listing unavailable");
          const parsed=parseLibraryListing(await response.json());if(!parsed)throw new Error("Folder listing invalid");
          return parsed;
        }
        const root=await listing(),found=new Map<string,LibraryFolder>([[root.folder.id,root.folder]]),queue=root.folders.map((folder)=>folder.id),visited=new Set<string>([root.folder.id]);
        while(queue.length&&found.size<2000) {
          const batch=queue.splice(0,4).filter((id)=>!visited.has(id));batch.forEach((id)=>visited.add(id));
          const pages=await Promise.all(batch.map((id)=>listing(id)));
          for(const page of pages) {
            found.set(page.folder.id,page.folder);
            for(const folder of page.folders)if(!visited.has(folder.id))queue.push(folder.id);
          }
        }
        if(queue.length)throw new Error("Folder tree exceeds safe traversal limit");
        // The projectId query scopes every response. CUSTOM descendants may have projectId=null in storage.
        if(active)setDestinations([...found.values()].filter((folder)=>folder.capabilities?.canAddChild));
      } catch {if(active)setDestinationIssue(true);}
      finally {if(active)setLoadingDestinations(false);}
    }
    void load();return()=>{active=false;};
  },[item.id,projectContext]);
  const folderMap=new Map(destinations.map((folder)=>[folder.id,folder]));
  function folderLabel(id:string) {
    const names:string[]=[];let current=folderMap.get(id),depth=0;
    while(current&&depth<64){names.unshift(current.name);if(current.kind==="PERSONAL")break;current=current.parentId?folderMap.get(current.parentId):undefined;depth++;}
    return names.join(" / ");
  }
  function isInsideManagedFolder(id:string) {
    let current=folderMap.get(id),depth=0;
    while(current&&depth<64){if(current.id===item.id)return true;current=current.parentId?folderMap.get(current.parentId):undefined;depth++;}
    return false;
  }
  const destinationsForFolder=destinations.filter((folder)=>!isInsideManagedFolder(folder.id));
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-labelledby="item-management-title" onKeyDown={(event)=>containDialogFocus(event,onClose)} className="grid max-h-[85svh] w-full max-w-lg gap-4 overflow-y-auto rounded-control border border-nite-border-soft bg-nite-surface p-6 shadow-nite-modal"><header className="flex items-center justify-between gap-3"><h2 id="item-management-title" className="font-display text-type-section-title font-semibold text-nite-text-primary">{mode==="copy"?"Copiar para":"Renomear ou mover"}</h2><button type="button" autoFocus onClick={onClose} aria-label="Fechar diálogo" className="grid size-9 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle">×</button></header><p className="truncate text-type-body-compact text-nite-text-secondary">{item.name}</p>
    {mode==="copy"?<form action={copyLibraryItem} className="grid gap-3 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="type" value={item.kind==="folder"?"FOLDER":"DOCUMENT"}/><input type="hidden" name="returnTo" value={returnTo}/>{projectContext&&<input type="hidden" name="projectId" value={projectContext.id}/>}<label className="grid gap-1 text-type-metadata text-nite-text-secondary">Nome da cópia<input name="name" defaultValue={item.name} required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Destino<select name="destinationId" required disabled={loadingDestinations||destinationIssue} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-2 text-nite-text-primary"><option value="">Selecione uma pasta</option>{destinations.filter((folder)=>folder.capabilities?.canAddChild&&(!item.folder||!isInsideManagedFolder(folder.id))).map((folder)=><option key={folder.id} value={folder.id}>{folderLabel(folder.id)}</option>)}</select></label>{destinationIssue?<p role="alert" className="text-status-error">Não foi possível carregar os destinos.</p>:<button disabled={loadingDestinations} className="min-h-10 justify-self-end rounded-control bg-nite-brand-primary px-4 text-white disabled:opacity-50">Copiar</button>}</form>
    :item.kind==="file"&&item.file?<><form hidden={!allows(item,"canRename",true)} action={organizeLibraryFile} className="grid gap-3 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="folderId" value={item.file.folderId??""}/><input type="hidden" name="returnTo" value={returnTo}/>{projectContext&&<input type="hidden" name="projectId" value={projectContext.id}/>}<label className="grid gap-1 text-type-metadata text-nite-text-secondary">Novo nome<input name="title" defaultValue={item.name} required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><button className="min-h-10 justify-self-end rounded-control bg-nite-brand-primary px-4 text-type-body-compact font-medium text-white">Salvar nome</button></form><form hidden={!allows(item,"canMove",true)} action={organizeLibraryFile} className="grid gap-3 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="title" value={item.name}/><input type="hidden" name="returnTo" value={returnTo}/>{projectContext&&<input type="hidden" name="projectId" value={projectContext.id}/>}<label className="grid gap-1 text-type-metadata text-nite-text-secondary">Mover arquivo<select name="folderId" defaultValue={item.file.folderId??""} disabled={loadingDestinations||destinationIssue||destinations.length===0} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-2 text-nite-text-primary">{destinations.map((folder)=><option key={folder.id} value={folder.id}>{folderLabel(folder.id)}</option>)}</select></label>{loadingDestinations?<p role="status" className="text-type-metadata text-nite-text-muted">Carregando destinos válidos…</p>:destinationIssue?<p role="alert" className="text-type-metadata text-status-error">Não foi possível validar os destinos. Tente novamente.</p>:<button className="min-h-10 justify-self-end rounded-control border border-nite-border-control px-4 text-type-body-compact text-nite-text-primary">Mover arquivo</button>}</form></>:item.kind==="folder"&&item.folder?<><form hidden={!allows(item,"canRename",true)} action={updateLibraryFolder} className="grid gap-3 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="returnTo" value={returnTo}/>{projectContext&&<input type="hidden" name="projectId" value={projectContext.id}/>}<label className="grid gap-1 text-type-metadata text-nite-text-secondary">Novo nome<input name="name" defaultValue={item.name} required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><button className="min-h-10 justify-self-end rounded-control bg-nite-brand-primary px-4 text-type-body-compact font-medium text-white">Salvar nome</button></form><form hidden={!allows(item,"canMove",true)} action={updateLibraryFolder} className="grid gap-3 border-t border-nite-border-soft pt-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="name" value={item.name}/><input type="hidden" name="returnTo" value={returnTo}/>{projectContext&&<input type="hidden" name="projectId" value={projectContext.id}/>}<label className="grid gap-1 text-type-metadata text-nite-text-secondary">Mover pasta<select name="parentId" defaultValue={item.folder.parentId??""} disabled={loadingDestinations||destinationIssue||destinationsForFolder.length===0} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-2 text-nite-text-primary">{destinationsForFolder.map((folder)=><option key={folder.id} value={folder.id}>{folderLabel(folder.id)}</option>)}</select></label>{loadingDestinations?<p role="status" className="text-type-metadata text-nite-text-muted">Carregando destinos válidos…</p>:destinationIssue?<p role="alert" className="text-type-metadata text-status-error">Não foi possível validar os destinos. Tente novamente.</p>:<button className="min-h-10 justify-self-end rounded-control border border-nite-border-control px-4 text-type-body-compact text-nite-text-primary">Mover pasta</button>}</form></>:<p className="text-type-body-compact text-nite-text-secondary">Os dados necessários para organizar este item não estão disponíveis.</p>}
  </section></div>;
}
function DuplicateDialog({item,returnTo,projectContext,onClose}:{item:Item;returnTo:string;projectContext?:ProjectContext;onClose:()=>void}) {
  const dot=item.kind==="file"?item.name.lastIndexOf("."):-1;
  const suggestion=dot>0?`${item.name.slice(0,dot)} (cópia)${item.name.slice(dot)}`:`${item.name} (cópia)`;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="duplicate-title" onKeyDown={(event)=>containDialogFocus(event,onClose)} className="w-full max-w-md rounded-dialog bg-nite-surface p-6 shadow-nite-modal"><h2 id="duplicate-title" className="font-display text-type-section-title text-nite-text-primary">Duplicar {item.kind==="folder"?"pasta":"arquivo"}</h2><form action={copyLibraryItem} className="mt-4 grid gap-4"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="type" value={item.kind==="folder"?"FOLDER":"DOCUMENT"}/><input type="hidden" name="returnTo" value={returnTo}/>{projectContext&&<input type="hidden" name="projectId" value={projectContext.id}/>}<label className="grid gap-1 text-type-body-compact text-nite-text-secondary">Nome da duplicata<input name="name" defaultValue={suggestion} required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label><div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="min-h-10 px-3 text-nite-text-secondary">Cancelar</button><button type="submit" className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-white">Duplicar</button></div></form></section></div>;
}
function RequestFilesDialog({folder,onClose,onCreated}:{folder:Item;onClose:()=>void;onCreated:()=>void}) {
  const [search,setSearch]=useState(""),[matches,setMatches]=useState<Array<{id:string;name:string}>>([]),[recipients,setRecipients]=useState<Array<{id:string;name:string}>>([]),[dueAt,setDueAt]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  async function find(value:string) {setSearch(value);if(value.trim().length<2){setMatches([]);return;}
    try {const response=await fetch(`/api/library/manage?path=${encodeURIComponent("/api/v1/library/share-recipients")}&search=${encodeURIComponent(value.trim())}&limit=20`);
      if(!response.ok)throw new Error();const data:unknown=await response.json();if(!Array.isArray(data))throw new Error();
      setMatches(data.filter((item):item is {id:string;name:string}=>typeof item==="object"&&item!==null&&"id" in item&&typeof item.id==="string"&&"name" in item&&typeof item.name==="string"));
    }catch {setError("Não foi possível localizar integrantes ativos.");}}
  async function submit(event:FormEvent) {event.preventDefault();if(!recipients.length||busy)return;setBusy(true);setError(null);
    try {const response=await fetch(`/api/library/manage?path=${encodeURIComponent("/api/v1/file-requests")}`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({targetFolderId:folder.id,recipientIds:recipients.map((member)=>member.id),dueAt:dueAt?new Date(dueAt).toISOString():null})});
      if(!response.ok)throw new Error(response.status===409?"Destino ou solicitação em conflito.":response.status===403?"Você não pode solicitar arquivos para esta pasta.":"Solicitação não concluída.");
      onCreated();
    }catch(cause){setError(cause instanceof Error?cause.message:"Solicitação não concluída.");}finally{setBusy(false);}}
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="request-files-title" onKeyDown={(event)=>containDialogFocus(event,onClose)} className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-dialog bg-nite-surface p-6 shadow-nite-modal"><header className="flex justify-between gap-3"><div><h2 id="request-files-title" className="font-display text-type-section-title text-nite-text-primary">Solicitar arquivos</h2><p className="text-type-body-compact text-nite-text-secondary">Destino: {folder.name}. Os destinatários poderão enviar arquivos sem acessar o conteúdo da pasta.</p></div><button type="button" onClick={onClose} aria-label="Fechar solicitação" className="size-9 rounded-control text-nite-text-secondary">×</button></header><form onSubmit={(event)=>void submit(event)} className="mt-4 grid gap-4"><label className="grid gap-1 text-type-body-compact text-nite-text-secondary">Destinatários<input value={search} onChange={(event)=>void find(event.target.value)} placeholder="Pesquise integrantes ativos" className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label>{matches.length>0&&<ul className="max-h-36 overflow-y-auto rounded-control border border-nite-border-soft">{matches.filter((member)=>!recipients.some((selected)=>selected.id===member.id)).map((member)=><li key={member.id}><button type="button" onClick={()=>{setRecipients((before)=>[...before,member]);setSearch("");setMatches([]);}} className="min-h-9 w-full px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle">{member.name}</button></li>)}</ul>}{recipients.length>0&&<ul className="flex flex-wrap gap-2">{recipients.map((member)=><li key={member.id} className="rounded-control bg-nite-brand-soft px-2 py-1 text-type-metadata text-nite-brand-primary">{member.name} <button type="button" aria-label={`Remover ${member.name}`} onClick={()=>setRecipients((before)=>before.filter((item)=>item.id!==member.id))}>×</button></li>)}</ul>}<label className="grid gap-1 text-type-body-compact text-nite-text-secondary">Prazo opcional<input type="datetime-local" value={dueAt} onChange={(event)=>setDueAt(event.target.value)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-background px-3 text-nite-text-primary"/></label>{error&&<TransientFeedback messageKey={error} onDismiss={()=>setError(null)}><p role="alert" className="text-type-body-compact text-status-error">{error}</p></TransientFeedback>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="min-h-10 px-3 text-nite-text-secondary">Cancelar</button><button type="submit" disabled={busy||recipients.length===0} className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-white disabled:opacity-50">{busy?"Criando…":"Criar solicitação"}</button></div></form></section></div>;
}
function ShareDialog({item,mode,onClose,onMessage,onChanged}:{item:Item;mode:"share"|"manage";onClose:()=>void;onMessage:(message:string)=>void;onChanged?:()=>void}) {
  const [search,setSearch]=useState(""),[recipients,setRecipients]=useState<Array<{id:string;name:string}>>([]),[shares,setShares]=useState<ShareGrant[]>([]),[inherited,setInherited]=useState<Array<{grant:ShareGrant;sourceFolderId:string|null}>>([]),[permission,setPermission]=useState<"VIEW"|"EDIT">("VIEW"),[loading,setLoading]=useState(false);
  const path=item.kind==="file"?`/api/v1/library/documents/${item.id}/shares`:`/api/v1/library/folders/${item.id}/shares`;
  async function refresh() {setLoading(true);try{const [response,accessResponse]=await Promise.all([
    fetch(`/api/library/manage?path=${encodeURIComponent(path)}`),
    fetch(`/api/library/manage?path=${encodeURIComponent(path.replace(/\/shares$/,"/access"))}`)]);
    if(!response.ok||!accessResponse.ok)throw new Error();const value:unknown=await response.json(),access:unknown=await accessResponse.json();
    if(!Array.isArray(value)||!value.every(shareGrant))throw new Error();setShares(value);
    if(typeof access==="object"&&access!==null&&"grants" in access&&Array.isArray(access.grants))setInherited(access.grants.filter((entry):entry is {grant:ShareGrant;sourceFolderId:string|null;origin:string}=>typeof entry==="object"&&entry!==null&&"grant" in entry&&shareGrant(entry.grant)&&"origin" in entry&&entry.origin==="INHERITED"&&"sourceFolderId" in entry&&(entry.sourceFolderId===null||typeof entry.sourceFolderId==="string")));
  }catch{onMessage("Não foi possível consultar os acessos deste item.");}finally{setLoading(false);}}
  useEffect(()=>{let active=true;void Promise.all([
    fetch(`/api/library/manage?path=${encodeURIComponent(path)}`),
    fetch(`/api/library/manage?path=${encodeURIComponent(path.replace(/\/shares$/,"/access"))}`)
  ]).then(async([response,accessResponse])=>{
    if(!response.ok||!accessResponse.ok)throw new Error();const value:unknown=await response.json(),access:unknown=await accessResponse.json();
    if(!Array.isArray(value)||!value.every(shareGrant))throw new Error();if(active)setShares(value);
    if(active&&typeof access==="object"&&access!==null&&"grants" in access&&Array.isArray(access.grants))setInherited(access.grants.filter((entry):entry is {grant:ShareGrant;sourceFolderId:string|null;origin:string}=>typeof entry==="object"&&entry!==null&&"grant" in entry&&shareGrant(entry.grant)&&"origin" in entry&&entry.origin==="INHERITED"&&"sourceFolderId" in entry&&(entry.sourceFolderId===null||typeof entry.sourceFolderId==="string")));
  }).catch(()=>{if(active)onMessage("Não foi possível consultar os acessos deste item.");});return()=>{active=false;};},[path,onMessage]);
  async function find(value:string) {setSearch(value);if(value.trim().length<2){setRecipients([]);return;}try{const response=await fetch(`/api/library/manage?path=${encodeURIComponent("/api/v1/library/share-recipients")}&search=${encodeURIComponent(value.trim())}&limit=20`);if(response.ok){const data:unknown=await response.json();if(Array.isArray(data)&&data.every((item)=>typeof item==="object"&&item!==null&&"id" in item&&typeof item.id==="string"&&"name" in item&&typeof item.name==="string") )setRecipients(data);}}catch{onMessage("A pesquisa de integrantes está indisponível.");}}
  async function change(method:"POST"|"PATCH"|"DELETE",shareId?:string,body?:unknown) {
    setLoading(true);try{const target=method==="POST"?path:`/api/v1/library/shares/${shareId}`;const response=await fetch(`/api/library/manage?path=${encodeURIComponent(target)}`,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});if(!response.ok)throw new Error();await refresh();setRecipients([]);setSearch("");onMessage("Acessos atualizados.");onChanged?.();}catch{onMessage("A API não autorizou ou não concluiu a alteração de acesso.");}finally{setLoading(false);}
  }
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" onKeyDown={(event)=>containDialogFocus(event,onClose)} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-dialog border border-nite-border-soft bg-nite-background p-6 shadow-nite-modal">
    <header className="mb-5 flex items-start justify-between"><div><h2 id="share-dialog-title" className="font-display text-type-section-title text-nite-text-primary">{mode==="manage"?"Gerenciar acesso":"Compartilhar"}</h2><p className="mt-1 break-all text-type-body-compact text-nite-text-secondary">{item.name}</p></div><button onClick={onClose} aria-label="Fechar compartilhamento" className="grid size-9 place-items-center rounded-control hover:bg-nite-surface-subtle">×</button></header>
    <form onSubmit={(event:FormEvent)=>{event.preventDefault();void refresh();}} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"><label className="sr-only" htmlFor="share-recipient">Pesquisar integrante ativo</label><input id="share-recipient" value={search} onChange={(event)=>void find(event.target.value)} placeholder="Nome do integrante (2+ caracteres)" className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-3 text-type-body-compact text-nite-text-primary"/><label className="sr-only" htmlFor="share-permission">Nível de acesso</label><select id="share-permission" value={permission} onChange={(event)=>setPermission(permissionValue(event.target.value))} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-type-body-compact text-nite-text-primary"><option value="VIEW">Pode visualizar</option><option value="EDIT">Pode editar</option></select><button type="submit" className="min-h-10 rounded-control bg-nite-brand-primary px-3 text-type-body-compact font-medium text-white" disabled={loading}>Atualizar lista</button></form>
    {recipients.length>0&&<ul className="my-3 max-h-40 overflow-y-auto rounded-control border border-nite-border-soft">{recipients.map((recipient)=><li key={recipient.id} className="flex items-center justify-between gap-2 border-b border-nite-border-soft px-3 py-2 last:border-0"><span className="text-type-body-compact text-nite-text-primary">{recipient.name}</span><button onClick={()=>void change("POST",undefined,{memberId:recipient.id,permission})} disabled={loading} className="rounded-control px-3 py-1 text-type-body-compact text-nite-brand-primary hover:bg-nite-surface-subtle">Conceder {permission}</button></li>)}</ul>}
    <section className="mt-5"><h3 className="mb-2 font-medium text-nite-text-primary">Acessos diretos</h3>{shares.length===0?<p className="text-type-body-compact text-nite-text-secondary">{loading?"Carregando…":"Nenhum acesso direto listado."}</p>:<ul className="divide-y divide-nite-border-soft">{shares.map((share)=><li key={share.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-type-body-compact text-nite-text-primary">{share.memberName}</p><p className="text-type-metadata text-nite-text-muted">Acesso direto · {share.grantedByName||"Concessor não disponível"}</p></div><div className="flex items-center gap-2"><select aria-label={`Permissão de ${share.memberName}`} value={share.permission} onChange={(event)=>void change("PATCH",share.id,{permission:permissionValue(event.target.value)})} className="min-h-9 rounded-control border border-nite-border-control bg-nite-surface px-2 text-type-metadata text-nite-text-primary"><option value="VIEW">Visualizar</option><option value="EDIT">Editar</option></select><button onClick={()=>void change("DELETE",share.id)} className="min-h-9 rounded-control px-2 text-type-metadata text-status-error">Revogar</button></div></li>)}</ul>}</section>
    <section className="mt-4"><h3 className="font-medium text-nite-text-primary">Acessos herdados</h3>{inherited.length?<ul className="mt-2 grid gap-2 text-type-metadata text-nite-text-secondary">{inherited.map((entry)=><li key={entry.grant.id}>{entry.grant.memberName} · {entry.grant.permission} · pasta de origem {entry.sourceFolderId??"não informada"}</li>)}</ul>:<p className="text-type-metadata text-nite-text-muted">Nenhum acesso herdado visível. A revogação deve ocorrer na pasta de origem.</p>}</section>
  </section></div>;
}
