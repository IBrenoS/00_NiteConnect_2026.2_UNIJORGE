import { NextResponse } from "next/server";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { resolveApiUrl } from "../../../../lib/api/server";
import { validUuid } from "../../../../lib/documents/library";

export const dynamic="force-dynamic";
const uuid="[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
function isRecord(value:unknown):value is Record<string,unknown> {return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function allowed(path:string,method:string):boolean {
  if(method==="GET")return new RegExp(`^/api/v1/library/(?:documents/${uuid}(?:/(?:activity|shares|access|info))?|folders/${uuid}(?:/(?:activity|shares|access|info))?|links/(?:document|folder)/${uuid}|share-recipients)$`).test(path)
    ||path==="/api/v1/me/document-automations"||path==="/api/v1/me/document-automations/options"
    ||new RegExp(`^/api/v1/me/document-automations/${uuid}/history$`).test(path)
    ||path==="/api/v1/me/document-notifications"
    ||new RegExp(`^/api/v1/documents/${uuid}/versions$`).test(path)
    ||new RegExp(`^/api/v1/(?:me/(?:favorites|trash)|file-requests/${uuid}|me/file-requests)$`).test(path)
    ||new RegExp(`^/api/v1/me/trash/purge-operations/${uuid}$`).test(path);
  if(method==="POST")return new RegExp(`^/api/v1/library/(?:documents|folders)/${uuid}/(?:shares|copy|duplicate|trash)$`).test(path)
    ||path==="/api/v1/me/document-automations"||new RegExp(`^/api/v1/me/document-notifications/${uuid}/read$`).test(path)
    ||path==="/api/v1/library/operations/preview"||path==="/api/v1/library/operations/batch"
    ||path==="/api/v1/file-requests"||new RegExp(`^/api/v1/file-requests/${uuid}/cancel$`).test(path)
    ||new RegExp(`^/api/v1/documents/${uuid}/versions/${uuid}/restore$`).test(path)
    ||new RegExp(`^/api/v1/me/trash/(?:${uuid}/(?:restore|purge(?:/preview)?)|empty(?:/preview)?)$`).test(path);
  if(method==="PATCH")return new RegExp(`^/api/v1/library/(?:shares/${uuid}|folders/${uuid})$`).test(path)
    ||new RegExp(`^/api/v1/me/document-automations/${uuid}$`).test(path);
  if(method==="PUT")return new RegExp(`^/api/v1/me/favorites/(?:DOCUMENT|FOLDER)/${uuid}$`).test(path);
  return method==="DELETE"&&(new RegExp(`^/api/v1/library/shares/${uuid}$`).test(path)
    ||new RegExp(`^/api/v1/me/document-automations/${uuid}$`).test(path)
    ||new RegExp(`^/api/v1/me/favorites/(?:DOCUMENT|FOLDER)/${uuid}$`).test(path));
}
export async function GET(request:Request) {return proxy(request,"GET");}
export async function POST(request:Request) {return proxy(request,"POST");}
export async function PATCH(request:Request) {return proxy(request,"PATCH");}
export async function PUT(request:Request) {return proxy(request,"PUT");}
export async function DELETE(request:Request) {return proxy(request,"DELETE");}
async function proxy(request:Request,method:string) {
  const session=await requireAuthenticatedNiteSession();
  const incoming=new URL(request.url),path=incoming.searchParams.get("path")??"";
  if(!allowed(path,method))return NextResponse.json({message:"Operação inválida."},{status:400});
  const query=new URLSearchParams();
  for(const key of ["search","limit","cursor","offset","type","sortBy","direction","role","beforeRevision","recursive","targetType","targetId"]) {const value=incoming.searchParams.get(key);if(value)query.set(key,value);}
  const url=resolveApiUrl(`${path}${query.size?`?${query}`:""}`);
  if(!url)return NextResponse.json({message:"Serviço documental indisponível."},{status:503});
  let body:BodyInit|undefined;
  if(method==="POST"||method==="PATCH") {
    const raw=await request.text();
    let value:unknown=null;
    try {if(raw)value=JSON.parse(raw);}catch {return NextResponse.json({message:"JSON inválido."},{status:400});}
    if(value!==null&&!isRecord(value))return NextResponse.json({message:"Dados inválidos."},{status:400});
    const record=value;
    if(method==="POST"&&path.endsWith("/shares")&&(!record||!validUuid(record.memberId)||!(["VIEW","EDIT"].includes(String(record.permission)))))return NextResponse.json({message:"Concessão inválida."},{status:400});
    if(method==="PATCH"&&path.startsWith("/api/v1/library/shares/")&&(!record||!(["VIEW","EDIT"].includes(String(record.permission)))))return NextResponse.json({message:"Permissão inválida."},{status:400});
    if(method==="PATCH"&&path.startsWith("/api/v1/library/folders/")&&(!record||(
      !(record.name===null||(typeof record.name==="string"&&record.name.length<=190))
      ||!(record.color===null||(typeof record.color==="string"&&/^#[\da-fA-F]{6}$/.test(record.color)))
      ||!(record.parentId===null||validUuid(record.parentId))
      ||typeof record.moveToRoot!=="boolean"
    )))return NextResponse.json({message:"Alteração de pasta inválida."},{status:400});
    if(value!==null)body=JSON.stringify(value);
  }
  try {
    const response=await fetch(url,{method,body,headers:{Authorization:`Bearer ${session.bearer}`,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{}),
      ...(request.headers.get("Idempotency-Key")?{"Idempotency-Key":request.headers.get("Idempotency-Key")??""}:{}),
      ...(request.headers.get("X-Confirm-Purge")==="true"?{"X-Confirm-Purge":"true"}:{})},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(35_000)});
    const payload=response.status===204?null:await response.json().catch(()=>null);
    return payload===null?new NextResponse(null,{status:response.status}):NextResponse.json(payload,{status:response.status,headers:{"Cache-Control":"no-store"}});
  } catch {return NextResponse.json({message:"Não foi possível concluir a operação."},{status:502});}
}
