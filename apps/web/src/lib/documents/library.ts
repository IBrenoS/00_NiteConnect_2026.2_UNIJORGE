import "server-only";
import type { ApiResult } from "../api/contracts";
import { getApiJson } from "../api/server";
import { parseActivityListing,parseArray,parseLibraryFile,parseLibraryFolder,parseLibraryListing,parseSharedListing,parseSentListing,parseTrashListing,validUuid } from "./library-contracts";
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
export const getProjectLibrary=(bearer:string,project:string,folderId?:string,options:ListingOptions={})=>getApiJson(
  `/api/v1/projects/${encodeURIComponent(project)}/library?${query({folderId,...options,limit:String(options.limit??100)})}`,bearer,parseLibraryListing);
export const getSharedListing=(bearer:string,options:ListingOptions={})=>getApiJson(
  `/api/v1/me/shared-with-me?${listingQuery({...options,limit:options.limit??50})}`,bearer,parseSharedListing);
export const getSentListing=(bearer:string,options:ListingOptions={})=>getApiJson(
  `/api/v1/me/shared-by-me?${query({search:options.search,cursor:options.cursor,limit:String(options.limit??50)})}`,bearer,parseSentListing);
export const getTrashListing=(bearer:string,options:{limit?:number;offset?:number;type?:string;sortBy?:string;direction?:string}={})=>getApiJson(
  `/api/v1/me/trash?${query({limit:String(options.limit??50),offset:String(options.offset??0),type:options.type,sortBy:options.sortBy,direction:options.direction})}`,bearer,parseTrashListing);
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


export const getProjectTrashListing=(bearer:string,project:string,options:{limit?:number;offset?:number;type?:string;sortBy?:string;direction?:string}={})=>getApiJson(
 `/api/v1/projects/${encodeURIComponent(project)}/trash?${query({limit:String(options.limit??50),offset:String(options.offset??0),type:options.type,sortBy:options.sortBy,direction:options.direction})}`,bearer,parseTrashListing);

export async function getProjectFolderAncestors(bearer:string,project:string,folder:LibraryFolder):Promise<ApiResult<LibraryFolder[]>> {
 if((folder.projectId!==null&&folder.projectId!==project) || (folder.kind!=="PROJECT" && folder.kind!=="CUSTOM")) return {data:null,issue:"invalid"};
 if(folder.kind==="PROJECT") return folder.projectId===project?{data:[],issue:null}:{data:null,issue:"invalid"};
 const ancestors:LibraryFolder[]=[],seen=new Set([folder.id]);let parentId=folder.parentId;
 for(let depth=0;parentId&&depth<64;depth++) {
  if(seen.has(parentId))return {data:null,issue:"invalid"};seen.add(parentId);
  const result=await getProjectLibrary(bearer,project,parentId,{limit:1});
  if(result.issue)return result;
  const parent=result.data.folder;
  if(parent.id!==parentId||(parent.projectId!==null&&parent.projectId!==project)||(parent.kind!=="PROJECT"&&parent.kind!=="CUSTOM"))return {data:null,issue:"invalid"};
  // CUSTOM folders inherit context through ancestry; project_id is stored only on the PROJECT root.
  ancestors.push(parent.projectId===null?{...parent,projectId:project}:parent);
  if(parent.kind==="PROJECT")return parent.projectId===project?{data:ancestors.reverse(),issue:null}:{data:null,issue:"invalid"};
  parentId=parent.parentId;
 }
 return {data:null,issue:"invalid"};
}
