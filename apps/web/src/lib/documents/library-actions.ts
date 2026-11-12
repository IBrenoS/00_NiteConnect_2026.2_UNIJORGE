"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedNiteSession } from "../auth/server-session";
import { resolveApiUrl } from "../api/server";
import { validUuid } from "./library";

function target(form:FormData) {
  const requested=form.get("returnTo");
  if(typeof requested!=="string")return "/documentos";
  // No untrusted external redirection or unexpected application routes.
  if(!/^\/(?:documentos|biblioteca|projetos\/[a-f0-9-]+\/arquivos)(?:\?[a-zA-Z0-9=_&%-]+)?$/.test(requested))return "/documentos";
  return requested;
}
function field(form:FormData,key:string):string {
  const value=form.get(key);return typeof value==="string"?value.trim():"";
}
async function request(path:string,method:string,body:BodyInit|null,contentType?:string):Promise<string> {
  const session=await requireAuthenticatedNiteSession();
  const url=resolveApiUrl(path);
  if(!url)return "unavailable";
  try {
    const headers:Record<string,string>={Authorization:`Bearer ${session.bearer}`};
    if(contentType)headers["Content-Type"]=contentType;
    const response=await fetch(url,{method,headers,body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(35_000)});
    if(response.ok)return "ok";
    if(response.status===409)return "conflict";
    if(response.status===400)return "invalid";
    if(response.status===401||response.status===403||response.status===404)return "access";
    return "unavailable";
  }catch{return "unavailable";}
}
function finish(form:FormData,outcome:string):never {
  revalidatePath("/documentos");revalidatePath("/biblioteca");
  const url=target(form);
  redirect(`${url}${url.includes("?")?"&":"?"}${outcome==="ok"?"saved=1":`error=${outcome}`}`);
}
export async function uploadLibraryFile(form:FormData):Promise<void> {
  const folderId=field(form,"folderId"), file=form.get("file"),name=field(form,"title");
  if(!validUuid(folderId)||!(file instanceof File)||file.size===0||file.size>8*1024*1024||!name||name.length>190)finish(form,"invalid");
  const upload=new FormData();upload.set("file",file,file.name);upload.set("title",name);
  finish(form,await request(`/api/v1/library/folders/${folderId}/files`,"POST",upload));
}
export async function createLibraryFolder(form:FormData):Promise<void> {
  const parentId=field(form,"parentId"),name=field(form,"name"),color=field(form,"color")||"#D6A432";
  if(!name||name.length>190||(parentId&&!validUuid(parentId)))finish(form,"invalid");
  finish(form,await request("/api/v1/library/folders","POST",JSON.stringify({parentId:parentId||null,name,color}),"application/json"));
}
export async function updateLibraryFolder(form:FormData):Promise<void> {
  const id=field(form,"id"),parentId=field(form,"parentId"),name=field(form,"name"),color=field(form,"color");
  if(!validUuid(id)||(parentId&&!validUuid(parentId)))finish(form,"invalid");
  const body={name:name||null,color:color||null,parentId:parentId||null,moveToRoot:field(form,"moveToRoot")==="true"};
  finish(form,await request(`/api/v1/library/folders/${id}`,"PATCH",JSON.stringify(body),"application/json"));
}
export async function archiveLibraryFolder(form:FormData):Promise<void> {
  const id=field(form,"id");if(!validUuid(id))finish(form,"invalid");
  finish(form,await request(`/api/v1/library/folders/${id}${field(form,"recursive")==="on"?"?recursive=true":""}`,"DELETE",null));
}
export async function organizeLibraryFile(form:FormData):Promise<void> {
  const id=field(form,"id"),folderId=field(form,"folderId"),title=field(form,"title");
  if(!validUuid(id)||!validUuid(folderId)||!title)finish(form,"invalid");
  finish(form,await request(`/api/v1/library/documents/${id}`,"PATCH",JSON.stringify({folderId,title}),"application/json"));
}
export async function archiveLibraryFile(form:FormData):Promise<void> {
  const id=field(form,"id");if(!validUuid(id))finish(form,"invalid");
  finish(form,await request(`/api/v1/library/documents/${id}`,"DELETE",null));
}
export async function createOfficialTemplate(form:FormData):Promise<void> {
  const file=form.get("file"),title=field(form,"title");
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".docx")||file.size<1||file.size>8*1024*1024||!title)finish(form,"invalid");
  const body=new FormData();body.set("file",file,file.name);body.set("title",title);
  body.set("autoAssignOnJoin",field(form,"autoAssignOnJoin")==="on"?"true":"false");
  finish(form,await request("/api/v1/library/templates","POST",body));
}
export async function publishTemplateVersion(form:FormData):Promise<void> {
  const id=field(form,"templateId"),file=form.get("file");
  if(!validUuid(id)||!(file instanceof File)||file.size<1||file.size>8*1024*1024)finish(form,"invalid");
  const body=new FormData();body.set("file",file,file.name);
  finish(form,await request(`/api/v1/library/templates/${id}/versions`,"POST",body));
}
export async function distributeOfficialTemplate(form:FormData):Promise<void> {
  const id=field(form,"templateId");
  const recipients=form.getAll("recipientId").filter((v):v is string=>typeof v==="string"&&validUuid(v));
  if(!validUuid(id)||recipients.length===0||recipients.length>100)finish(form,"invalid");
  finish(form,await request(`/api/v1/library/templates/${id}/distribute`,"POST",JSON.stringify({memberIds:recipients}),"application/json"));
}
export async function createPersonalTemplateCopy(form:FormData):Promise<void> {
  const id=field(form,"templateId");if(!validUuid(id))finish(form,"invalid");
  finish(form,await request(`/api/v1/me/library/templates/${id}/create`,"POST",null));
}
export async function provisionLibraryMembers(form:FormData):Promise<void> {
  finish(form,await request("/api/v1/library/provision-existing","POST",null));
}

export async function setProjectDocumentEditGrant(form:FormData):Promise<void> {
  const id=field(form,"id"),memberId=field(form,"memberId");
  if(!validUuid(id)||!validUuid(memberId))finish(form,"invalid");
  finish(form,await request(`/api/v1/library/documents/${id}/edit-grants/${memberId}`,
    "PUT",JSON.stringify({canEdit:field(form,"canEdit")==="true"}),"application/json"));
}

export async function restoreArchivedItem(form:FormData):Promise<void> {
  const id=field(form,"id"),type=field(form,"type");
  if(!validUuid(id)||(type!=="FOLDER"&&type!=="DOCUMENT"))finish(form,"invalid");
  const path=type==="FOLDER"?`/api/v1/library/folders/${id}/restore`:`/api/v1/library/documents/${id}/restore`;
  finish(form,await request(path,"POST",null));
}
