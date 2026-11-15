import { NextResponse } from "next/server";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { resolveApiUrl } from "../../../../lib/api/server";
import { validUuid } from "../../../../lib/documents/library";

export const dynamic="force-dynamic";
export async function POST(request:Request) {
  const value:unknown=await request.json().catch(()=>null);
  if(typeof value!=="object"||value===null||!("items" in value)||!Array.isArray(value.items)
      ||value.items.length<1||value.items.length>100||!value.items.every((item)=>typeof item==="object"&&item!==null
        &&"type" in item&&(item.type==="DOCUMENT"||item.type==="FOLDER")&&"id" in item&&validUuid(item.id)))
    return NextResponse.json({message:"Seleção inválida."},{status:400});
  const session=await requireAuthenticatedNiteSession(),url=resolveApiUrl("/api/v1/library/download-zip");
  if(!url)return new NextResponse(null,{status:503});
  try {const response=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${session.bearer}`,"Content-Type":"application/json"},
    body:JSON.stringify(value),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(120_000)});
    if(!response.ok)return NextResponse.json({message:response.status===403||response.status===404?"Seleção não autorizada.":"Download indisponível."},{status:response.status});
    return new NextResponse(response.body,{headers:{"Content-Type":"application/zip","Content-Disposition":"attachment; filename=documents.zip","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch{return new NextResponse(null,{status:503});}
}
