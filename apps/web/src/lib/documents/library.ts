import "server-only";
import { getApiJson } from "../api/server";

export type LibraryFolder = {
  id: string; parentId: string|null; name: string; color: string;
  kind: "ROOT"|"PERSONAL"|"PROJECT"|"CUSTOM";
  systemKey: string|null; ownerId: string|null; projectId: string|null; modifiedAt: string;
};
export type LibraryFile = {
  id: string; folderId: string; title: string; context: string; ownerId: string|null;
  projectId: string|null; mimeType: string; revision: number; size: number;
  ownerName: string|null; createdByName: string; modifiedByName: string|null; modifiedAt: string; sharedByName:string|null; sharedAt:string|null; lastOpenedByName:string|null; lastOpenedAt:string|null;
};
export type LibraryListing = { folder: LibraryFolder; folders: LibraryFolder[]; files: LibraryFile[] };
export type LibraryTemplate = { id:string; title:string; autoAssign:boolean; retired:boolean; currentVersionId:string|null; revision:number };
export type LibraryRecipient = { id:string; name:string };
export type LibraryArchivedItem = {id:string;name:string;type:"FOLDER"|"DOCUMENT";folderId:string|null;archivedAt:string};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==="string";
const optionalStr=(v:unknown):v is string|null=>v===null||str(v);
const uuid=(v:unknown):v is string=>str(v)&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
export const validUuid=uuid;
function folder(v:unknown):LibraryFolder|null {
  if(!object(v)||!uuid(v.id)||!str(v.name)||!str(v.color)||!str(v.kind)||!optionalStr(v.parentId)
      ||!optionalStr(v.ownerId)||!optionalStr(v.projectId)||!optionalStr(v.systemKey)||!str(v.modifiedAt)) return null;
  if(!["ROOT","PERSONAL","PROJECT","CUSTOM"].includes(v.kind)) return null;
  return v as LibraryFolder;
}
function file(v:unknown):LibraryFile|null {
  if(!object(v)||!uuid(v.id)||!uuid(v.folderId)||!str(v.title)||!str(v.context)||!str(v.mimeType)
      ||typeof v.revision!=="number"||typeof v.size!=="number"||!optionalStr(v.ownerId)
      ||!optionalStr(v.projectId)||!optionalStr(v.ownerName)||!str(v.createdByName)||!optionalStr(v.modifiedByName)||!str(v.modifiedAt)||!optionalStr(v.sharedByName)||!optionalStr(v.sharedAt)||!optionalStr(v.lastOpenedByName)||!optionalStr(v.lastOpenedAt))return null;
  return v as LibraryFile;
}
function parseList<T>(v:unknown,parser:(x:unknown)=>T|null):T[]|null {
  if(!Array.isArray(v))return null;
  const items=v.map(parser);
  return items.every((x)=>x!==null)?items as T[]:null;
}
function listing(v:unknown):LibraryListing|null {
  if(!object(v))return null;
  const f=folder(v.folder),fs=parseList(v.folders,folder),files=parseList(v.files,file);
  return f&&fs&&files?{folder:f,folders:fs,files}:null;
}
export const getPersonalLibrary=(bearer:string,folderId?:string)=>getApiJson(
  `/api/v1/me/library${folderId?`?folderId=${encodeURIComponent(folderId)}`:""}`,bearer,listing);
export const getAdminRoots=(bearer:string)=>getApiJson("/api/v1/library/roots",bearer,v=>parseList(v,folder));
export const getAdminTree=(bearer:string)=>getApiJson("/api/v1/library/tree",bearer,v=>parseList(v,folder));
export const getAdminFolder=(bearer:string,id:string)=>getApiJson(`/api/v1/library/folders/${encodeURIComponent(id)}`,bearer,listing);
export const getProjectFolderTree=(bearer:string,project:string)=>getApiJson(
  `/api/v1/projects/${encodeURIComponent(project)}/library/tree`,bearer,v=>parseList(v,folder));
export const getProjectLibrary=(bearer:string,project:string,folderId?:string)=>getApiJson(
  `/api/v1/projects/${encodeURIComponent(project)}/library${folderId?`?folderId=${encodeURIComponent(folderId)}`:""}`,bearer,listing);
function template(v:unknown):LibraryTemplate|null {
  if(!object(v)||!uuid(v.id)||!str(v.title)||typeof v.autoAssign!=="boolean"||typeof v.retired!=="boolean"
      ||!optionalStr(v.currentVersionId)||typeof v.revision!=="number")return null;
  return v as LibraryTemplate;
}
function recipient(v:unknown):LibraryRecipient|null {
  if(!object(v)||!uuid(v.id)||!str(v.name))return null;
  return v as LibraryRecipient;
}
export const getTemplates=(bearer:string)=>getApiJson("/api/v1/library/templates",bearer,v=>parseList(v,template));
export const getRecipients=(bearer:string)=>getApiJson("/api/v1/library/recipients",bearer,v=>parseList(v,recipient));

function archivedItem(v:unknown):LibraryArchivedItem|null {
  if(!object(v)||!uuid(v.id)||!str(v.name)||!optionalStr(v.folderId)||!str(v.archivedAt)
      ||(v.type!=="FOLDER"&&v.type!=="DOCUMENT"))return null;
  return v as LibraryArchivedItem;
}
export const getArchivedItems=(bearer:string)=>getApiJson("/api/v1/library/archived",bearer,v=>parseList(v,archivedItem));
