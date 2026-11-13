import { NextResponse } from "next/server";
import { requireAuthenticatedNiteSession } from "../../../../../../lib/auth/server-session";
import { resolveApiUrl } from "../../../../../../lib/api/server";
import { validUuid } from "../../../../../../lib/documents/library";

export const dynamic="force-dynamic";
const MAX_FILE=8*1024*1024,MAX_BATCH=32*1024*1024,MAX_ITEMS=100;
const supported=/\.(docx|pdf|png|jpe?g)$/i;
export async function POST(request:Request,{params}:{params:Promise<{folderId:string}>}) {
  const {folderId}=await params;
  if(!validUuid(folderId))return NextResponse.json({message:"Pasta inválida."},{status:400});
  const incoming=await request.formData().catch(()=>null);
  if(!incoming)return NextResponse.json({message:"Formulário inválido."},{status:400});
  const files=incoming.getAll("files"),paths=incoming.getAll("paths");
  const typed=files.filter((file):file is File=>file instanceof File),typedPaths=paths.filter((path):path is string=>typeof path==="string");
  if(typed.length<1||typed.length>MAX_ITEMS||typed.length!==files.length||typed.length!==typedPaths.length)return NextResponse.json({message:"O lote precisa ter entre 1 e 100 arquivos e caminhos correspondentes."},{status:400});
  if(typed.some((file)=>file.size===0||file.size>MAX_FILE||!supported.test(file.name))||typed.reduce((sum,file)=>sum+file.size,0)>MAX_BATCH)return NextResponse.json({message:"O lote excede o limite de 8 MiB por arquivo, 32 MiB ou inclui formato não suportado."},{status:400});
  for(const value of typedPaths)if(!value||value.startsWith("/")||value.split("/").some((part)=>!part||part==="."||part==="..")||value.includes("\\"))return NextResponse.json({message:"Caminho de arquivo inválido."},{status:400});
  const session=await requireAuthenticatedNiteSession(),url=resolveApiUrl(`/api/v1/library/folders/${folderId}/upload-tree`);
  if(!url)return NextResponse.json({message:"Serviço documental indisponível."},{status:503});
  const body=new FormData();
  typed.forEach((file,index)=>{body.append("files",file,file.name);body.append("paths",typedPaths[index]??file.name);});
  try {
    const response=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${session.bearer}`,Accept:"application/json"},body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(120_000)});
    return NextResponse.json(await response.json().catch(()=>({message:"A API retornou uma resposta inválida."})),{status:response.status,headers:{"Cache-Control":"no-store"}});
  } catch {return NextResponse.json({message:"O envio foi interrompido. Confira a conexão e tente novamente."},{status:502});}
}
