import Link from "next/link";
import { notFound } from "next/navigation";
import { CollaboraFrame } from "../../../../components/documents/collabora-frame";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getDocument, getEditorLaunch } from "../../../../lib/documents/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editor de documentos" };
export default async function DocumentEditorPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const session=await requireAuthenticatedNiteSession();
  const document=await getDocument(session.bearer,id);
  if(document.issue==="not-found" || document.issue==="access") notFound();
  const launch=document.data?await getEditorLaunch(session.bearer,id):null;
  return <main className="mx-auto w-full space-y-5 px-4 py-5 sm:px-8">
    <Link href="/documentos" className="text-type-body-compact font-medium text-nite-brand-primary underline underline-offset-4">Voltar aos documentos</Link>
    <h1 className="font-display text-type-page-title text-nite-text-primary">{document.data?.title??"Documento indisponível"}</h1>
    {!launch || !document.data ? <p role="alert" className="text-type-body-compact text-nite-text-secondary">Não foi possível iniciar uma sessão de edição. Verifique a API, o CODE e suas permissões.</p>
      : <CollaboraFrame actionUrl={launch.actionUrl} token={launch.accessToken} ttl={launch.accessTokenTtl} title={document.data.title} />}
  </main>;
}
