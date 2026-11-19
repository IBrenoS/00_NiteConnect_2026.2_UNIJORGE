"use server";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedNiteSession } from "../auth/server-session";
import { mutateActivity } from "../activities/mutations";
import { validUuid } from "../documents/library-contracts";
import { getProjectDocumentRequest, parseProjectDocumentActionRequest, type ProjectDocumentActionRequest } from "./document-requests";

export type DocumentRequestResult={data:ProjectDocumentActionRequest|null;issue:string|null};
function refresh(projectId:string){
  revalidatePath(`/meus-projetos/${projectId}/documentos`,"layout");
  revalidatePath(`/projetos/${projectId}/arquivos`,"layout");
}
const reasonValid=(value:unknown):value is string=>typeof value==="string"&&value.trim().length>0&&value.length<=1000;
export async function requestProjectDocumentAction(input:{projectId:string;resourceId:string;resourceType:"DOCUMENT"|"FOLDER";action:"TRASH"|"PURGE";reason:string}):Promise<DocumentRequestResult>{
  const session=await requireAuthenticatedNiteSession();
  if(!input||!validUuid(input.projectId)||!validUuid(input.resourceId)||!["DOCUMENT","FOLDER"].includes(input.resourceType)||!["TRASH","PURGE"].includes(input.action)||!reasonValid(input.reason))return {data:null,issue:"invalid"};
  const result=await mutateActivity("/api/v1/library/project-action-requests",session.bearer,"POST",{
    projectId:input.projectId,resourceId:input.resourceId,resourceType:input.resourceType,action:input.action,reason:input.reason.trim(),
  },parseProjectDocumentActionRequest);
  if(result.issue)return {data:null,issue:result.issue};
  if(!result.data||result.data.projectId!==input.projectId||result.data.resourceId!==input.resourceId||result.data.resourceType!==input.resourceType||result.data.action!==input.action)return {data:null,issue:"invalid"};
  refresh(input.projectId);return {data:result.data,issue:null};
}
export async function decideProjectDocumentRequest(projectId:string,requestId:string,input:{approve:boolean;reason:string;confirmed:boolean}):Promise<DocumentRequestResult>{
  const session=await requireAuthenticatedNiteSession();
  if(!validUuid(projectId)||!validUuid(requestId)||!input||typeof input.approve!=="boolean"||typeof input.confirmed!=="boolean"||!reasonValid(input.reason)||(input.approve&&!input.confirmed))return {data:null,issue:"invalid"};
  const current=await getProjectDocumentRequest(session.bearer,projectId,requestId);
  if(current.issue)return {data:null,issue:current.issue};
  const result=await mutateActivity(`/api/v1/library/project-action-requests/${requestId}/decision`,session.bearer,"POST",{
    approve:input.approve,confirmed:input.confirmed,reason:input.reason.trim(),
  },parseProjectDocumentActionRequest);
  if(result.issue)return {data:null,issue:result.issue};
  if(!result.data||result.data.projectId!==projectId||result.data.id!==requestId)return {data:null,issue:"invalid"};
  refresh(projectId);return {data:result.data,issue:null};
}
