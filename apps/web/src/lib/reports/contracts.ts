import {parseDocumentCapabilities,validUuid,type DocumentCapabilities} from "../documents/library-contracts";

export type ReportEntry={id:string;type:"FOLDER"|"DOCUMENT";name:string;parentId:string|null;modifiedAt:string;
  modifiedByName:string|null;size:number;mimeType:string|null;capabilities:DocumentCapabilities;
  sharing:{memberId:string;memberName:string;permission:"VIEW"|"EDIT"}[]};
export type ReportListing={memberId:string;items:ReportEntry[];limit:number;offset:number;hasMore:boolean};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
function entry(v:unknown):ReportEntry|null {
  if(!object(v)||!validUuid(v.id)||(v.type!=="FOLDER"&&v.type!=="DOCUMENT")||typeof v.name!=="string"
    ||(v.parentId!==null&&!validUuid(v.parentId))||typeof v.modifiedAt!=="string"||!Number.isFinite(Date.parse(v.modifiedAt))
    ||(v.modifiedByName!==null&&typeof v.modifiedByName!=="string")||typeof v.size!=="number"||v.size<0
    ||(v.mimeType!==null&&typeof v.mimeType!=="string")||!parseDocumentCapabilities(v.capabilities)||!Array.isArray(v.sharing))return null;
  const sharing:ReportEntry["sharing"]=[];
  for(const access of v.sharing) {
    if(!object(access)||!object(access.grant))return null;
    const g=access.grant;
    if(!validUuid(g.memberId)||typeof g.memberName!=="string"||(g.permission!=="VIEW"&&g.permission!=="EDIT"))return null;
    if(!sharing.some(item=>item.memberId===g.memberId&&item.permission===g.permission))sharing.push({memberId:g.memberId,memberName:g.memberName,permission:g.permission});
  }
  return {id:v.id,type:v.type,name:v.name,parentId:v.parentId,modifiedAt:v.modifiedAt,modifiedByName:v.modifiedByName,
    size:v.size,mimeType:v.mimeType,capabilities:v.capabilities,sharing};
}
export function parseReportListing(v:unknown):ReportListing|null {
  if(!object(v)||!validUuid(v.memberId)||!Array.isArray(v.items)||typeof v.limit!=="number"||typeof v.offset!=="number"
    ||!Number.isInteger(v.limit)||v.limit<1||v.limit>100||!Number.isInteger(v.offset)||v.offset<0||typeof v.hasMore!=="boolean")return null;
  const items=v.items.map(entry);
  if(items.some(item=>item===null))return null;
  return {memberId:v.memberId,items:items.filter(item=>item!==null),limit:v.limit,offset:v.offset,hasMore:v.hasMore};
}
export function reportLocation(memberId:string,parentId?:string,offset=0):string {
  const query=new URLSearchParams();if(parentId)query.set("folder",parentId);if(offset)query.set("offset",String(offset));
  return `/relatorios/${memberId}${query.size?`?${query}`:""}`;
}
export function reportFileHref(item:ReportEntry,back:string):string|null {
  if(!item.capabilities.canView)return null;
  if(item.mimeType==="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return `/documentos/${item.id}?returnTo=${encodeURIComponent(back)}`;
  return item.capabilities.canDownload?`/api/library/download/${item.id}`:null;
}
