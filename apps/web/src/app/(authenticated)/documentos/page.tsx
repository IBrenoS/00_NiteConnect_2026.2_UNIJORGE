import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getMyDocuments } from "../../../lib/documents/data";
import { DocumentImportForm } from "../../../components/documents/document-import-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus documentos" };

type Props={searchParams:Promise<{error?:string;uploaded?:string}>};
export default async function PersonalDocumentsPage({searchParams}:Props) {
  const session=await requireAuthenticatedNiteSession();
  const [docs,params]=await Promise.all([getMyDocuments(session.bearer),searchParams]);
  return <main className="mx-auto w-full max-w-4xl space-y-7 px-4 py-8 sm:px-8">
    <header className="space-y-2"><h1 className="font-display text-type-page-title text-nite-text-primary">Meus documentos</h1>
      <p className="text-type-body-compact text-nite-text-secondary">Fundação documental: importe uma cópia DOCX de teste para editar no Collabora Online.</p></header>
    {params.uploaded==="1" && <p role="status" className="text-nite-text-primary">Documento importado com sucesso.</p>}
    {params.error && <p role="alert" className="text-nite-text-primary">Não foi possível importar o documento ({params.error}).</p>}
    <DocumentImportForm />
    <section aria-label="Documentos pessoais" className="space-y-3">
      <h2 className="font-medium text-nite-text-primary">Documentos disponíveis</h2>
      {docs.issue ? <p className="text-type-body-compact text-nite-text-secondary">A gestão documental está indisponível ou ainda não foi ativada neste ambiente.</p>
        : docs.data?.length ? <ul className="space-y-2">{docs.data.map((doc)=><li key={doc.id} className="rounded-control border border-nite-border-soft p-4">
          <Link className="font-medium text-nite-brand-primary underline underline-offset-4" href={`/documentos/${doc.id}`}>{doc.title}</Link>
          <p className="mt-1 text-type-body-compact text-nite-text-secondary">Revisão {doc.revision} · {doc.size} bytes</p>
        </li>)}</ul> : <p className="text-type-body-compact text-nite-text-secondary">Nenhum documento importado.</p>}
    </section>
  </main>;
}
