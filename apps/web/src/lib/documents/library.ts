import "server-only";
import { getApiJson } from "../api/server";
import { parseActivityListing,parseArray,parseLibraryFile,parseLibraryFolder,parseLibraryListing,parseSharedListing,validUuid } from "./library-contracts";
import type { LibraryArchivedItem,LibraryFolder,LibraryRecipient,LibraryTemplate } from "./library-contracts";
export * from "./library-contracts";

const query=(values:Record<string,string|undefined>)=>{const params=new URLSearchParams();for(const [key,value] of Object.entries(values))if(value)params.set(key,value);return params.toString();};
type ListingOptions={search?:string;mimeType?:string;sortBy?:string;direction?:string;cursor?:string;limit?:number};
const listingQuery=(options:ListingOptions)=>query({...options,limit:options.limit?String(options.limit):undefined});
export const getPersonalLibrary=(bearer:string,folderId?:string,options:ListingOptions={})=>getApiJson(
  `/api/v1/me/library?${query({folderId,...options,limit:String(options.limit??100)})}`,bearer,parseLibraryListing);
export const getAdminRoots=(bearer:string)=>getApiJson("/api/v1/library/roots",bearer,value=>parseArray(value,parseLibraryFolder));
export const getAdminTree=(bearer:string)=>getApiJson("/api/v1/library/tree",bearer,value=>parseArray(value,parseLibraryFolder));
export const getAdminFolder=(bearer:string,id:string,options:ListingOptions={})=>getApiJson(
  `/api/v1/library/folders/${encodeURIComponent(id)}?${listingQuery(options)}`,bearer,parseLibraryListing);
export const getProjectFolderTree=(bearer:string,project:string)=>getApiJson(
  `/api/v1/projects/${encodeURIComponent(project)}/library/tree`,bearer,value=>parseArray(value,parseLibraryFolder));
export const getProjectLibrary=(bearer:string,project:string,folderId?:string)=>getApiJson(
  `/api/v1/projects/${encodeURIComponent(project)}/library${folderId?`?folderId=${encodeURIComponent(folderId)}`:""}`,bearer,parseLibraryListing);
export const getSharedListing=(bearer:string,options:ListingOptions={})=>getApiJson(
  `/api/v1/me/shared-with-me?${listingQuery({...options,limit:options.limit??50})}`,bearer,parseSharedListing);
export const getSharedFolder=(bearer:string,id:string,options:ListingOptions={})=>getApiJson(
  `/api/v1/library/folders/${encodeURIComponent(id)}?${query({...options,limit:String(options.limit??100)})}`,bearer,parseLibraryListing);
export async function getFolderAncestors(bearer:string,folder:LibraryFolder):Promise<LibraryFolder[]> {
  const ancestors:LibraryFolder[]=[];let parentId=folder.parentId,childKind=folder.kind;
  for(let depth=0;parentId&&childKind!=="PERSONAL"&&depth<64;depth++) {
    const response=await getSharedFolder(bearer,parentId,{limit:1});
    const parent=response.data?.folder;if(!parent)break;
    if(parent.kind!=="PERSONAL")ancestors.push(parent);
    if(parent.kind==="PERSONAL")break;
    childKind=parent.kind;parentId=parent.parentId;
  }
  return ancestors.reverse();
}
export const getDocumentDetails=(bearer:string,id:string)=>getApiJson(`/api/v1/library/documents/${encodeURIComponent(id)}`,bearer,parseLibraryFile);
export const getDocumentActivity=(bearer:string,id:string)=>getApiJson(`/api/v1/library/documents/${encodeURIComponent(id)}/activity?limit=50`,bearer,parseActivityListing);
export const getFolderActivity=(bearer:string,id:string)=>getApiJson(`/api/v1/library/folders/${encodeURIComponent(id)}/activity?limit=50`,bearer,parseActivityListing);
const template=(value:unknown):LibraryTemplate|null=>{
  if(typeof value!=="object"||value===null||Array.isArray(value))return null;
  const item=value as Record<string,unknown>;
  if(!validUuid(item.id)||typeof item.title!=="string"||typeof item.autoAssign!=="boolean"||typeof item.retired!=="boolean"
      ||!(item.currentVersionId===null||validUuid(item.currentVersionId))||typeof item.revision!=="number")return null;
  return item as LibraryTemplate;
};
export const getTemplates=(bearer:string)=>getApiJson("/api/v1/library/templates",bearer,value=>parseArray(value,template));
const recipient=(value:unknown):LibraryRecipient|null=>{
  if(typeof value!=="object"||value===null||Array.isArray(value))return null;
  const item=value as Record<string,unknown>;
  if(!validUuid(item.id)||typeof item.name!=="string")return null;
  return item as LibraryRecipient;
};
export const getRecipients=(bearer:string)=>getApiJson("/api/v1/library/recipients",bearer,value=>parseArray(value,recipient));
const archivedItem=(value:unknown):LibraryArchivedItem|null=>{
  if(typeof value!=="object"||value===null||Array.isArray(value))return null;
  const item=value as Record<string,unknown>;
  if(!validUuid(item.id)||typeof item.name!=="string"||!(item.folderId===null||validUuid(item.folderId))||typeof item.archivedAt!=="string"
      ||(item.type!=="FOLDER"&&item.type!=="DOCUMENT"))return null;
  return item as LibraryArchivedItem;
};
export const getArchivedItems=(bearer:string)=>getApiJson("/api/v1/library/archived",bearer,value=>parseArray(value,archivedItem));
