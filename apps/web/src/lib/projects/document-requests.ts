import "server-only";
import { getApiJson } from "../api/server";
import type { ApiResult } from "../api/contracts";
import { validUuid } from "../documents/library-contracts";

export type ProjectDocumentActionRequest = {
  id:string;projectId:string;resourceId:string;resourceType:"DOCUMENT"|"FOLDER";action:"TRASH"|"PURGE";
  requestedBy:string;reason:string;status:"PENDING"|"APPROVED"|"REJECTED";requestedAt:string;
  decidedBy:string|null;decidedAt:string|null;decisionReason:string|null;purgeOperationId:string|null;
};
export function parseProjectDocumentActionRequest(value:unknown):ProjectDocumentActionRequest|null {
  if(typeof value!=="object"||value===null||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  const timestamp=(value:unknown):value is string=>typeof value==="string"&&Number.isFinite(Date.parse(value));
  if(!validUuid(v.id)||!validUuid(v.projectId)||!validUuid(v.resourceId)||!validUuid(v.requestedBy)
    ||(v.resourceType!=="DOCUMENT"&&v.resourceType!=="FOLDER")||(v.action!=="TRASH"&&v.action!=="PURGE")
    ||(v.status!=="PENDING"&&v.status!=="APPROVED"&&v.status!=="REJECTED")
    ||typeof v.reason!=="string"||!timestamp(v.requestedAt)
    ||(v.decidedBy!==null&&!validUuid(v.decidedBy))||(v.purgeOperationId!==null&&!validUuid(v.purgeOperationId))
    ||(v.decidedAt!==null&&!timestamp(v.decidedAt))||(v.decisionReason!==null&&typeof v.decisionReason!=="string"))return null;
  return {id:v.id,projectId:v.projectId,resourceId:v.resourceId,resourceType:v.resourceType,action:v.action,
    requestedBy:v.requestedBy,reason:v.reason,status:v.status,requestedAt:v.requestedAt,
    decidedBy:v.decidedBy,decidedAt:v.decidedAt,decisionReason:v.decisionReason,purgeOperationId:v.purgeOperationId};
}
export async function getProjectDocumentRequests(bearer:string,projectId:string):Promise<ApiResult<ProjectDocumentActionRequest[]>> {
  if(!validUuid(projectId))return {data:null,issue:"invalid"};
  const requests:ProjectDocumentActionRequest[]=[];
  for(let offset=0;;offset+=100){
  const result:ApiResult<ProjectDocumentActionRequest[]> = await getApiJson(`/api/v1/library/project-action-requests?projectId=${projectId}&limit=100&offset=${offset}`,bearer,(value)=>{
    if(!Array.isArray(value))return null;
    const requests=value.map(parseProjectDocumentActionRequest);
    return requests.every((item):item is ProjectDocumentActionRequest=>item!==null&&item.projectId===projectId)?requests:null;
  });
  if(result.issue)return result;
  requests.push(...result.data);
  if(result.data.length<100)return {data:requests,issue:null};
  }
}
export async function getProjectDocumentRequest(bearer:string,projectId:string,requestId:string):Promise<ApiResult<ProjectDocumentActionRequest>> {
  if(!validUuid(projectId)||!validUuid(requestId))return {data:null,issue:"invalid"};
  return getApiJson(`/api/v1/library/project-action-requests/${requestId}`,bearer,value=>{
    const request=parseProjectDocumentActionRequest(value);
    return request?.projectId===projectId?request:null;
  });
}
