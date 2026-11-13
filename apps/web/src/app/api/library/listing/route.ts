import { NextResponse } from "next/server";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getPersonalLibrary,getSharedFolder,getSharedListing,validUuid } from "../../../../lib/documents/library";

export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const session=await requireAuthenticatedNiteSession();
  const params=new URL(request.url).searchParams;
  const view=params.get("view")==="shared"?"shared":"personal";
  const folder=params.get("folder")??undefined;
  if(folder&&!validUuid(folder))return NextResponse.json({message:"Pasta inválida."},{status:400});
  const options={search:params.get("search")??undefined,mimeType:params.get("type")??undefined,
    sortBy:params.get("sort")??undefined,direction:params.get("direction")??undefined,
    cursor:params.get("cursor")??undefined,limit:100};
  const result=view==="shared"
    ?folder?await getSharedFolder(session.bearer,folder,options):await getSharedListing(session.bearer,options.cursor)
    :await getPersonalLibrary(session.bearer,folder,options);
  if(!result.data)return NextResponse.json({message:result.issue==="access"?"Acesso negado.":"Não foi possível carregar os arquivos."},{status:result.issue==="access"?403:result.issue==="not-found"?404:502});
  return NextResponse.json(result.data,{headers:{"Cache-Control":"no-store"}});
}
