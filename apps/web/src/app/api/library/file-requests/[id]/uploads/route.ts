import { NextResponse } from "next/server";
import { requireAuthenticatedNiteSession } from "../../../../../../lib/auth/server-session";
import { resolveApiUrl } from "../../../../../../lib/api/server";
import { validUuid } from "../../../../../../lib/documents/library";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(!validUuid(id))return NextResponse.json({message:"Solicitação inválida."},{status:400});
  const incoming=await request.formData().catch(()=>null),file=incoming?.get("file"),title=incoming?.get("title");
  if(!(file instanceof File)||file.size<1||file.size>8*1024*1024||typeof title!=="string"||!title.trim()||title.length>190)
    return NextResponse.json({message:"Arquivo inválido ou acima de 8 MiB."},{status:400});
  const session=await requireAuthenticatedNiteSession(),url=resolveApiUrl(`/api/v1/file-requests/${id}/uploads`);
  if(!url)return NextResponse.json({message:"Serviço indisponível."},{status:503});
  const body=new FormData();body.set("file",file,file.name);body.set("title",title.trim());
  try {const response=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${session.bearer}`},body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(120_000)});
    return NextResponse.json(await response.json().catch(()=>({message:"Resposta inválida."})),{status:response.status,headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({message:"Envio interrompido."},{status:502});}
}
