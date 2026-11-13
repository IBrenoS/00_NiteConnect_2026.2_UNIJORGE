export type LibraryFolder={
  id:string;parentId:string|null;name:string;color:string;kind:"ROOT"|"PERSONAL"|"PROJECT"|"CUSTOM";
  systemKey:string|null;ownerId:string|null;ownerName:string|null;projectId:string|null;createdByName:string|null;
  createdAt:string|null;modifiedByName:string|null;modifiedAt:string;
};
export type LibraryFile={
  id:string;folderId:string|null;title:string;context:string;ownerId:string|null;projectId:string|null;mimeType:string;
  revision:number;size:number;ownerName:string|null;createdByName:string;createdAt:string;modifiedByName:string|null;
  modifiedAt:string;sharedByName:string|null;sharedAt:string|null;sharedWithCount:number;lastOpenedByName:string|null;
  lastOpenedAt:string|null;folderName:string|null;
};
export type LibraryListing={folder:LibraryFolder;folders:LibraryFolder[];files:LibraryFile[];totalFiles:number;nextCursor:string|null;hasMore:boolean};
export type SharedItem={grantId:string;id:string;type:"FOLDER"|"DOCUMENT";name:string;permission:"VIEW"|"EDIT";ownerId:string|null;ownerName:string|null;sharedBy:string|null;sharedByName:string|null;sharedAt:string;modifiedAt:string|null};
export type SharedListing={items:SharedItem[];nextCursor:string|null;hasMore:boolean};
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
export function parseLibraryFolder(value:unknown):LibraryFolder|null {
  if(!object(value)||!uuid(value.id)||!str(value.name)||!str(value.color)||!str(value.kind)||!optionalStr(value.parentId)
      ||!optionalStr(value.ownerId)||!optionalStr(value.ownerName)||!optionalStr(value.projectId)||!optionalStr(value.systemKey)
      ||!optionalStr(value.createdByName)||!optionalStr(value.createdAt)||!optionalStr(value.modifiedByName)||!str(value.modifiedAt))return null;
  if(!["ROOT","PERSONAL","PROJECT","CUSTOM"].includes(value.kind))return null;
  return value as LibraryFolder;
}
export function parseLibraryFile(value:unknown):LibraryFile|null {
  if(!object(value)||!uuid(value.id)||!optionalStr(value.folderId)||!str(value.title)||!str(value.context)||!str(value.mimeType)
      ||typeof value.revision!=="number"||typeof value.size!=="number"||!optionalStr(value.ownerId)||!optionalStr(value.projectId)
      ||!optionalStr(value.ownerName)||!str(value.createdByName)||!str(value.createdAt)||!optionalStr(value.modifiedByName)
      ||!str(value.modifiedAt)||!optionalStr(value.sharedByName)||!optionalStr(value.sharedAt)||typeof value.sharedWithCount!=="number"
      ||!optionalStr(value.lastOpenedByName)||!optionalStr(value.lastOpenedAt)||!optionalStr(value.folderName))return null;
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
      ||!optionalStr(value.sharedBy)||!optionalStr(value.sharedByName)||!str(value.sharedAt)||!optionalStr(value.modifiedAt))return null;
  return value as SharedItem;
}
export function parseSharedListing(value:unknown):SharedListing|null {
  if(!object(value))return null;const items=parseArray(value.items,parseSharedItem);
  return items?{items,nextCursor:optionalStr(value.nextCursor)?value.nextCursor:null,hasMore:typeof value.hasMore==="boolean"?value.hasMore:false}:null;
}
function parseActivity(value:unknown):LibraryActivity|null {
  if(!object(value)||!uuid(value.id)||!str(value.action)||!optionalStr(value.reason)||!optionalStr(value.actorId)||!optionalStr(value.actorName)||!str(value.occurredAt))return null;
  return value as LibraryActivity;
}
export function parseActivityListing(value:unknown):ActivityListing|null {
  if(!object(value))return null;const items=parseArray(value.items,parseActivity);
  return items?{items,nextCursor:optionalStr(value.nextCursor)?value.nextCursor:null,hasMore:typeof value.hasMore==="boolean"?value.hasMore:false}:null;
}
