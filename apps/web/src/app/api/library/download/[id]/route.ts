import { NextResponse } from "next/server";
import { getAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { resolveApiUrl } from "../../../../../lib/api/server";
import { validUuid } from "../../../../../lib/documents/library";
export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!validUuid(id))return new NextResponse(null,{status:404});
  const session=await getAuthenticatedNiteSession();
  if(!session)return new NextResponse(null,{status:401});
  const url=resolveApiUrl(`/api/v1/documents/${id}/download`);
  if(!url)return new NextResponse(null,{status:503});
  try {
    const response=await fetch(url,{headers:{Authorization:`Bearer ${session.bearer}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15_000)});
    if(!response.ok)return new NextResponse(null,{status:response.status===403||response.status===404?404:503});
    const buffer=await response.arrayBuffer();
    return new NextResponse(buffer,{headers:{"Content-Type":response.headers.get("Content-Type")??"application/octet-stream",
      "Content-Disposition":response.headers.get("Content-Disposition")??"attachment", "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"}});
  }catch{return new NextResponse(null,{status:503});}
}
