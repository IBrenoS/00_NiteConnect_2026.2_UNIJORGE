import Link from "next/link";
import { documentReturnTo } from "../../../../lib/documents/navigation";
import { notFound } from "next/navigation";
import { CollaboraFrame } from "../../../../components/documents/collabora-frame";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getDocument, getEditorLaunch } from "../../../../lib/documents/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editor de documentos" };

function EditorUnavailable({back}:{back:string}) {
  return (
    <main className="grid h-dvh w-dvw place-items-center overflow-auto bg-nite-background p-6">
      <section role="alert" className="w-full max-w-lg space-y-4 text-center">
        <h1 className="font-display text-type-page-title text-nite-text-primary">Documento indisponível</h1>
        <p className="text-type-body-compact text-nite-text-secondary">
          Não foi possível iniciar uma sessão de visualização ou edição. Verifique a disponibilidade do documento, do CODE e suas permissões.
        </p>
        <Link href={back} className="inline-flex min-h-11 items-center justify-center rounded-control px-4 font-medium text-nite-brand-primary underline underline-offset-4">
          {back.startsWith("/relatorios")?"Voltar aos relatórios":back.startsWith("/meus-projetos/")?"Voltar aos documentos do projeto":"Voltar a Meus Arquivos"}
        </Link>
      </section>
    </main>
  );
}

export default async function DocumentEditorPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams?:Promise<{returnTo?:string}> }) {
  const { id } = await params;
  const back = documentReturnTo((await searchParams)?.returnTo);
  const session = await requireAuthenticatedNiteSession();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const document = await getDocument(session.bearer, id);
  if (!document.data) return <EditorUnavailable back={back}/>;

  const launch = await getEditorLaunch(session.bearer, id);
  if (!launch) return <EditorUnavailable back={back}/>;

  return <CollaboraFrame actionUrl={launch.actionUrl} token={launch.accessToken} ttl={launch.accessTokenTtl} title={document.data.title} returnTo={back.startsWith("/meus-projetos/")||back.startsWith("/relatorios")?back:undefined}/>;
}
