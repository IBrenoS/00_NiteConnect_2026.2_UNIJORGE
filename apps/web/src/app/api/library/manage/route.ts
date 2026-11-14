import { NextResponse } from "next/server";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { resolveApiUrl } from "../../../../lib/api/server";
import { validUuid } from "../../../../lib/documents/library";

export const dynamic="force-dynamic";
const uuid="[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
function isRecord(value:unknown):value is Record<string,unknown> {return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function allowed(path:string,method:string):boolean {
  if(method==="GET")return new RegExp(`^/api/v1/library/(?:documents/${uuid}(?:/(?:activity|shares))?|folders/${uuid}(?:/(?:activity|shares))?|share-recipients)$`).test(path);
  if(method==="POST")return new RegExp(`^/api/v1/library/(?:documents|folders)/${uuid}/shares$`).test(path);
  if(method==="PATCH")return new RegExp(`^/api/v1/library/(?:shares/${uuid}|folders/${uuid})$`).test(path);
  return method==="DELETE"&&new RegExp(`^/api/v1/library/shares/${uuid}$`).test(path);
}
export async function GET(request:Request) {return proxy(request,"GET");}
export async function POST(request:Request) {return proxy(request,"POST");}
export async function PATCH(request:Request) {return proxy(request,"PATCH");}
export async function DELETE(request:Request) {return proxy(request,"DELETE");}
async function proxy(request:Request,method:string) {
  const session=await requireAuthenticatedNiteSession();
  const incoming=new URL(request.url),path=incoming.searchParams.get("path")??"";
  if(!allowed(path,method))return NextResponse.json({message:"Operação inválida."},{status:400});
  const query=new URLSearchParams();
  for(const key of ["search","limit","cursor"]) {const value=incoming.searchParams.get(key);if(value)query.set(key,value);}
  const url=resolveApiUrl(`${path}${query.size?`?${query}`:""}`);
  if(!url)return NextResponse.json({message:"Serviço documental indisponível."},{status:503});
  let body:BodyInit|undefined;
  if(method==="POST"||method==="PATCH") {
    const value:unknown=await request.json().catch(()=>null);
    if(!isRecord(value))return NextResponse.json({message:"Dados inválidos."},{status:400});
    const record=value;
    if(method==="POST"&&(!validUuid(record.memberId)||!(["VIEW","EDIT"].includes(String(record.permission)))))return NextResponse.json({message:"Concessão inválida."},{status:400});
    if(method==="PATCH"&&path.startsWith("/api/v1/library/shares/")&&!(["VIEW","EDIT"].includes(String(record.permission))))return NextResponse.json({message:"Permissão inválida."},{status:400});
    if(method==="PATCH"&&path.startsWith("/api/v1/library/folders/")&&(
      !(value.name===null||(typeof value.name==="string"&&value.name.length<=190))
      ||!(value.color===null||(typeof value.color==="string"&&/^#[\da-fA-F]{6}$/.test(value.color)))
      ||!(value.parentId===null||validUuid(value.parentId))
      ||typeof value.moveToRoot!=="boolean"
    ))return NextResponse.json({message:"Alteração de pasta inválida."},{status:400});
    body=JSON.stringify(value);
  }
  try {
    const response=await fetch(url,{method,body,headers:{Authorization:`Bearer ${session.bearer}`,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12_000)});
    const payload=response.status===204?null:await response.json().catch(()=>null);
    return payload===null?new NextResponse(null,{status:response.status}):NextResponse.json(payload,{status:response.status,headers:{"Cache-Control":"no-store"}});
  } catch {return NextResponse.json({message:"Não foi possível concluir a operação."},{status:502});}
}
