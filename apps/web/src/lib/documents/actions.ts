"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../auth/server-session";
import { resolveApiUrl } from "../api/server";
import { documentTitleFromFilename } from "./title";

export async function importPersonalDocx(form: FormData): Promise<void> {
  const session = await requireAuthenticatedNiteSession();
  const document = form.get("file");
  const submittedTitle = form.get("title");
  if (!(document instanceof File) || document.size===0 || document.size>8*1024*1024
      || !document.name.toLowerCase().endsWith(".docx") || typeof submittedTitle !== "string" || submittedTitle.length>190) {
    redirect("/documentos?error=invalid");
  }
  const title = submittedTitle.trim() || documentTitleFromFilename(document.name);
  if (title.length>190) redirect("/documentos?error=invalid");
  const url=resolveApiUrl("/api/v1/me/documents");
  if (!url) redirect("/documentos?error=unavailable");
  const body=new FormData();
  body.append("file",document,document.name);
  body.append("title",title);
  let result="unavailable";
  try {
    const response=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${session.bearer}`},
      body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(30_000)});
    result=response.ok?"success":response.status===400?"invalid":response.status===401||response.status===403?"access":"unavailable";
  } catch { result="unavailable"; }
  redirect(result==="success"?"/documentos":`/documentos?error=${result}`);
}
