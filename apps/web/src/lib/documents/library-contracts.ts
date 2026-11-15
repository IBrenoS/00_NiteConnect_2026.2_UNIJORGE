export type DocumentIdentity={
  spaceOwnerId:string|null;resourceOwnerKind:"MEMBER"|"PROJECT"|"INSTITUTION"|"UNKNOWN";
  resourceOwnerId:string|null;createdBy:string|null;modifiedBy:string|null;createdFor:string|null;
  origin:string;protection:"NONE"|"OFFICIAL"|"ACADEMIC"|"ACADEMIC_NITE"|"ADMINISTRATIVE"|"UNKNOWN";
  retentionHold:boolean;protectionReason:string|null;protectionSetBy:string|null;protectionRevision:number;
};
export type DocumentCapabilities={
  policyVersion:number;canView:boolean;canDownload:boolean;canEdit:boolean;canAddChild:boolean;
  canRename:boolean;canMove:boolean;canCopy:boolean;canShare:boolean;canDeleteToTrash:boolean;
  canRestore:boolean;canPermanentlyDelete:boolean;canArchiveInstitutionally:boolean;
  canManageProtection:boolean;deniedReasons:Record<string,string>;
};
export function resourceOwnerLabel(identity:DocumentIdentity|null|undefined,createdByName:string|null|undefined,
                                   legacyOwnerName:string|null|undefined):string {
  if(!identity)return legacyOwnerName??"NITE";
  switch(identity.resourceOwnerKind) {
    case "MEMBER":return createdByName??"Integrante";
    case "PROJECT":return "Projeto";
    case "INSTITUTION":return "NITE";
    case "UNKNOWN":return "Não determinado";
  }
}
export type LibraryFolder={
  id:string;parentId:string|null;name:string;color:string;kind:"ROOT"|"PERSONAL"|"PROJECT"|"CUSTOM";
  systemKey:string|null;ownerId:string|null;ownerName:string|null;projectId:string|null;createdByName:string|null;
  createdAt:string|null;modifiedByName:string|null;modifiedAt:string;effectivePermission?:"VIEW"|"EDIT"|null;
  identity?:DocumentIdentity|null;capabilities?:DocumentCapabilities|null;
};
export type LibraryFile={
  id:string;folderId:string|null;title:string;context:string;ownerId:string|null;projectId:string|null;mimeType:string;
  revision:number;size:number;ownerName:string|null;createdByName:string;createdAt:string;modifiedByName:string|null;
  modifiedAt:string;sharedByName:string|null;sharedAt:string|null;sharedWithCount:number;lastOpenedByName:string|null;
  lastOpenedAt:string|null;folderName:string|null;effectivePermission?:"VIEW"|"EDIT"|null;
  identity?:DocumentIdentity|null;capabilities?:DocumentCapabilities|null;
};
export type LibraryListing={folder:LibraryFolder;folders:LibraryFolder[];files:LibraryFile[];totalFiles:number;nextCursor:string|null;hasMore:boolean};
export type SharedItem={grantId:string;id:string;type:"FOLDER"|"DOCUMENT";name:string;permission:"VIEW"|"EDIT";ownerId:string|null;ownerName:string|null;sharedBy:string|null;sharedByName:string|null;sharedAt:string;modifiedAt:string|null;createdAt?:string|null;mimeType?:string|null;size?:number|null;createdByName?:string|null;modifiedByName?:string|null;identity?:DocumentIdentity|null;capabilities?:DocumentCapabilities|null};
export type SharedListing={items:SharedItem[];nextCursor:string|null;hasMore:boolean};
export type SentGrant={id:string;memberId:string;memberName:string;permission:"VIEW"|"EDIT";grantedBy:string;grantedByName:string;createdAt:string;revokedAt:string|null};
export type SentItem={id:string;type:"FOLDER"|"DOCUMENT";name:string;sharedAt:string;recipients:SentGrant[];identity:DocumentIdentity;capabilities:DocumentCapabilities};
export type SentListing={items:SentItem[];nextCursor:string|null;hasMore:boolean};
export type TrashItem={id:string;name:string;type:"DOCUMENT"|"FOLDER";resourceOwnerKind:string;createdBy:string|null;createdByName:string|null;createdAt:string;deletedBy:string|null;deletedByName:string|null;deletedAt:string;originalFolderId:string|null;originalFolderName:string|null;origin:string;protection:string;retentionHold:boolean;size:number;subtreeItems:number;batchId:string|null};
export type TrashEntry={item:TrashItem;capabilities:DocumentCapabilities};
export type TrashListing={items:TrashEntry[];limit:number;offset:number;hasMore:boolean};
export type DocumentInformation={id:string;type:"DOCUMENT"|"FOLDER";name:string;extension:string;mimeType:string|null;size:number;parentId:string|null;parentName:string|null;identity:DocumentIdentity;createdBy:string|null;createdAt:string;modifiedBy:string|null;modifiedAt:string;lifecycleState:string;folderCount:number;fileCount:number;capabilities:DocumentCapabilities;access:{effectivePermission:string|null;canManage:boolean;grants:Array<{grant:SentGrant;origin:string;sourceFolderId:string|null;depth:number}>;capabilities:DocumentCapabilities};activity:ActivityListing};
export type DocumentVersion={id:string;revision:number;size:number;createdBy:string|null;createdAt:string;current:boolean};
export type DocumentVersionPage={items:DocumentVersion[];nextBeforeRevision:number|null;hasMore:boolean};
export type FileRequestView={id:string;requestedBy:string;targetFolderId:string|null;targetFolderName:string|null;recipientIds:string[];status:string;dueAt:string|null;createdAt:string;cancelledAt:string|null;uploads:Array<{documentId:string;name:string;size:number;uploadedBy:string;uploadedAt:string}>;events:Array<{action:string;actorId:string;occurredAt:string;documentId:string|null}>};
export type FileRequestPage={items:FileRequestView[];limit:number;offset:number;hasMore:boolean};
export type SearchItem={id:string;type:"DOCUMENT"|"FOLDER";name:string;mimeType:string|null;size:number|null;createdAt:string;modifiedAt:string;identity:DocumentIdentity;capabilities:DocumentCapabilities};
export type SearchPage={items:SearchItem[];nextCursor:string|null;hasMore:boolean};
export type LibraryActivity={id:string;action:string;reason:string|null;actorId:string|null;actorName:string|null;occurredAt:string};
export type ActivityListing={items:LibraryActivity[];nextCursor:string|null;hasMore:boolean};
export type LibraryTemplate={id:string;title:string;autoAssign:boolean;retired:boolean;currentVersionId:string|null;revision:number};
export type LibraryRecipient={id:string;name:string};
export type LibraryArchivedItem={id:string;name:string;type:"FOLDER"|"DOCUMENT";folderId:string|null;archivedAt:string};

const object=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const str=(value:unknown):value is string=>typeof value==="string";
const optionalStr=(value:unknown):value is string|null=>value===null||str(value);
const uuid=(value:unknown):value is string=>str(value)&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export const validUuid=uuid;
function optionalUuid(value:unknown):value is string|null {return value===null||uuid(value);}
function parseDocumentIdentity(value:unknown):value is DocumentIdentity {
  return object(value)&&optionalUuid(value.spaceOwnerId)&&["MEMBER","PROJECT","INSTITUTION","UNKNOWN"].includes(String(value.resourceOwnerKind))
    &&optionalUuid(value.resourceOwnerId)&&optionalUuid(value.createdBy)&&optionalUuid(value.modifiedBy)&&optionalUuid(value.createdFor)
    &&str(value.origin)&&["NONE","OFFICIAL","ACADEMIC","ACADEMIC_NITE","ADMINISTRATIVE","UNKNOWN"].includes(String(value.protection))
    &&typeof value.retentionHold==="boolean"&&optionalStr(value.protectionReason)&&optionalUuid(value.protectionSetBy)
    &&Number.isInteger(value.protectionRevision);
}
function parseDocumentCapabilities(value:unknown):value is DocumentCapabilities {
  const flags=["canView","canDownload","canEdit","canAddChild","canRename","canMove","canCopy","canShare",
    "canDeleteToTrash","canRestore","canPermanentlyDelete","canArchiveInstitutionally","canManageProtection"];
  return object(value)&&Number.isInteger(value.policyVersion)&&flags.every(flag=>typeof value[flag]==="boolean")
    &&object(value.deniedReasons)&&Object.values(value.deniedReasons).every(str);
}
function validDocumentPolicy(value:Record<string,unknown>):boolean {
  return (value.identity===undefined||value.identity===null||parseDocumentIdentity(value.identity))
    &&(value.capabilities===undefined||value.capabilities===null||parseDocumentCapabilities(value.capabilities));
}
export function parseLibraryFolder(value:unknown):LibraryFolder|null {
  if(!object(value)||!uuid(value.id)||!str(value.name)||!str(value.color)||!str(value.kind)||!optionalStr(value.parentId)
      ||!optionalStr(value.ownerId)||!optionalStr(value.ownerName)||!optionalStr(value.projectId)||!optionalStr(value.systemKey)
      ||!optionalStr(value.createdByName)||!optionalStr(value.createdAt)||!optionalStr(value.modifiedByName)||!str(value.modifiedAt)
      ||(value.effectivePermission!==undefined&&value.effectivePermission!==null&&value.effectivePermission!=="VIEW"&&value.effectivePermission!=="EDIT")
      ||!validDocumentPolicy(value))return null;
  if(!["ROOT","PERSONAL","PROJECT","CUSTOM"].includes(value.kind))return null;
  return value as LibraryFolder;
}
export function parseLibraryFile(value:unknown):LibraryFile|null {
  if(!object(value)||!uuid(value.id)||!optionalStr(value.folderId)||!str(value.title)||!str(value.context)||!str(value.mimeType)
      ||typeof value.revision!=="number"||typeof value.size!=="number"||!optionalStr(value.ownerId)||!optionalStr(value.projectId)
      ||!optionalStr(value.ownerName)||!str(value.createdByName)||!str(value.createdAt)||!optionalStr(value.modifiedByName)
      ||!str(value.modifiedAt)||!optionalStr(value.sharedByName)||!optionalStr(value.sharedAt)||typeof value.sharedWithCount!=="number"
      ||!optionalStr(value.lastOpenedByName)||!optionalStr(value.lastOpenedAt)||!optionalStr(value.folderName)
      ||(value.effectivePermission!==undefined&&value.effectivePermission!==null&&value.effectivePermission!=="VIEW"&&value.effectivePermission!=="EDIT")
      ||!validDocumentPolicy(value))return null;
  return value as LibraryFile;
}
export function parseArray<T>(value:unknown,parser:(item:unknown)=>T|null):T[]|null {
  if(!Array.isArray(value))return null;const parsed=value.map(parser);
  return parsed.every((item)=>item!==null)?parsed as T[]:null;
}
export function parseLibraryListing(value:unknown):LibraryListing|null {
  if(!object(value))return null;
  const folder=parseLibraryFolder(value.folder),folders=parseArray(value.folders,parseLibraryFolder),files=parseArray(value.files,parseLibraryFile);
  if(!folder||!folders||!files)return null;
  return {folder,folders,files,totalFiles:typeof value.totalFiles==="number"?value.totalFiles:files.length,
    nextCursor:optionalStr(value.nextCursor)?value.nextCursor:null,hasMore:typeof value.hasMore==="boolean"?value.hasMore:false};
}
function parseSharedItem(value:unknown):SharedItem|null {
  if(!object(value)||!uuid(value.grantId)||!uuid(value.id)||(value.type!=="FOLDER"&&value.type!=="DOCUMENT")||!str(value.name)
      ||(value.permission!=="VIEW"&&value.permission!=="EDIT")||!optionalStr(value.ownerId)||!optionalStr(value.ownerName)
      ||!optionalStr(value.sharedBy)||!optionalStr(value.sharedByName)||!str(value.sharedAt)||!optionalStr(value.modifiedAt)
      ||(value.createdAt!==undefined&&!optionalStr(value.createdAt))||(value.mimeType!==undefined&&!optionalStr(value.mimeType))
      ||(value.size!==undefined&&value.size!==null&&typeof value.size!=="number")
      ||(value.createdByName!==undefined&&!optionalStr(value.createdByName))||(value.modifiedByName!==undefined&&!optionalStr(value.modifiedByName))
      ||!validDocumentPolicy(value))return null;
  return value as SharedItem;
}
export function parseSharedListing(value:unknown):SharedListing|null {
  if(!object(value))return null;const items=parseArray(value.items,parseSharedItem);
  return items?{items,nextCursor:optionalStr(value.nextCursor)?value.nextCursor:null,hasMore:typeof value.hasMore==="boolean"?value.hasMore:false}:null;
}
function parseSentGrant(value:unknown):value is SentGrant {
  return object(value)&&uuid(value.id)&&uuid(value.memberId)&&str(value.memberName)
    &&(value.permission==="VIEW"||value.permission==="EDIT")&&uuid(value.grantedBy)
    &&str(value.grantedByName)&&str(value.createdAt)&&optionalStr(value.revokedAt);
}
function parseSentItem(value:unknown):SentItem|null {
  if(!object(value)||!uuid(value.id)||(value.type!=="DOCUMENT"&&value.type!=="FOLDER")||!str(value.name)
      ||!str(value.sharedAt)||!Array.isArray(value.recipients)||!parseDocumentIdentity(value.identity)
      ||!parseDocumentCapabilities(value.capabilities))return null;
  if(!value.recipients.every(parseSentGrant))return null;
  return value as SentItem;
}
export function parseSentListing(value:unknown):SentListing|null {
  if(!object(value))return null;
  const items=parseArray(value.items,parseSentItem);
  return items?{items,nextCursor:optionalStr(value.nextCursor)?value.nextCursor:null,hasMore:typeof value.hasMore==="boolean"?value.hasMore:false}:null;
}
export function parseTrashListing(value:unknown):TrashListing|null {
  if(!object(value)||!Array.isArray(value.items)||!Number.isInteger(value.limit)||!Number.isInteger(value.offset)
      ||typeof value.hasMore!=="boolean")return null;
  for(const entry of value.items) {
    if(!object(entry)||!object(entry.item)||!parseDocumentCapabilities(entry.capabilities))return null;
    const item=entry.item;
    if(!uuid(item.id)||!str(item.name)||(item.type!=="DOCUMENT"&&item.type!=="FOLDER")||!str(item.resourceOwnerKind)
        ||!optionalUuid(item.createdBy)||!optionalStr(item.createdByName)||!str(item.createdAt)
        ||!optionalUuid(item.deletedBy)||!optionalStr(item.deletedByName)||!str(item.deletedAt)
        ||!optionalUuid(item.originalFolderId)||!optionalStr(item.originalFolderName)||!str(item.origin)
        ||!str(item.protection)||typeof item.retentionHold!=="boolean"||typeof item.size!=="number"
        ||typeof item.subtreeItems!=="number"||!optionalUuid(item.batchId))return null;
  }
  return value as TrashListing;
}
export function parseDocumentInformation(value:unknown):DocumentInformation|null {
  if(!object(value)||!uuid(value.id)||(value.type!=="DOCUMENT"&&value.type!=="FOLDER")||!str(value.name)
      ||!str(value.extension)||!optionalStr(value.mimeType)||typeof value.size!=="number"
      ||!optionalUuid(value.parentId)||!optionalStr(value.parentName)||!parseDocumentIdentity(value.identity)
      ||!optionalUuid(value.createdBy)||!str(value.createdAt)||!optionalUuid(value.modifiedBy)||!str(value.modifiedAt)
      ||!str(value.lifecycleState)||typeof value.folderCount!=="number"||typeof value.fileCount!=="number"
      ||!parseDocumentCapabilities(value.capabilities)||!object(value.access)||!optionalStr(value.access.effectivePermission)
      ||typeof value.access.canManage!=="boolean"||!parseDocumentCapabilities(value.access.capabilities)
      ||!Array.isArray(value.access.grants)||!value.access.grants.every((entry:unknown)=>object(entry)
        &&parseSentGrant(entry.grant)&&str(entry.origin)&&optionalUuid(entry.sourceFolderId)&&Number.isInteger(entry.depth))
      ||!parseActivityListing(value.activity))return null;
  return value as DocumentInformation;
}
export function parseVersionPage(value:unknown):DocumentVersionPage|null {
  if(!object(value)||!Array.isArray(value.items)||typeof value.hasMore!=="boolean"
      ||!(value.nextBeforeRevision===null||Number.isInteger(value.nextBeforeRevision)))return null;
  for(const item of value.items)if(!object(item)||!uuid(item.id)||!Number.isInteger(item.revision)
      ||typeof item.size!=="number"||!optionalUuid(item.createdBy)||!str(item.createdAt)||typeof item.current!=="boolean")return null;
  return value as DocumentVersionPage;
}
export function parseFileRequestPage(value:unknown):FileRequestPage|null {
  if(!object(value)||!Array.isArray(value.items)||!Number.isInteger(value.limit)||!Number.isInteger(value.offset)
      ||typeof value.hasMore!=="boolean")return null;
  for(const item of value.items)if(!object(item)||!uuid(item.id)||!uuid(item.requestedBy)
      ||!optionalUuid(item.targetFolderId)||!optionalStr(item.targetFolderName)||!Array.isArray(item.recipientIds)
      ||!item.recipientIds.every(uuid)||!str(item.status)||!optionalStr(item.dueAt)||!str(item.createdAt)
      ||!optionalStr(item.cancelledAt)||!Array.isArray(item.uploads)||!Array.isArray(item.events))return null;
  return value as FileRequestPage;
}
export function parseSearchPage(value:unknown):SearchPage|null {
  if(!object(value)||!Array.isArray(value.items)||!optionalStr(value.nextCursor)||typeof value.hasMore!=="boolean")return null;
  for(const item of value.items)if(!object(item)||!uuid(item.id)||(item.type!=="DOCUMENT"&&item.type!=="FOLDER")
      ||!str(item.name)||!optionalStr(item.mimeType)||!(item.size===null||typeof item.size==="number")
      ||!str(item.createdAt)||!str(item.modifiedAt)||!parseDocumentIdentity(item.identity)||!parseDocumentCapabilities(item.capabilities))return null;
  return value as SearchPage;
}
function parseActivity(value:unknown):LibraryActivity|null {
  if(!object(value)||!uuid(value.id)||!str(value.action)||!optionalStr(value.reason)||!optionalStr(value.actorId)||!optionalStr(value.actorName)||!str(value.occurredAt))return null;
  return value as LibraryActivity;
}
export function parseActivityListing(value:unknown):ActivityListing|null {
  if(!object(value))return null;const items=parseArray(value.items,parseActivity);
  return items?{items,nextCursor:optionalStr(value.nextCursor)?value.nextCursor:null,hasMore:typeof value.hasMore==="boolean"?value.hasMore:false}:null;
}
