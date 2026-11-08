import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getMyDocuments } from "../../../lib/documents/data";
import { importPersonalDocx } from "../../../lib/documents/actions";

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
    <form action={importPersonalDocx} className="grid gap-4 rounded-control border border-nite-border-soft p-5">
      <label className="grid gap-2 text-type-body-compact text-nite-text-primary">Nome do documento
        <input name="title" maxLength={190} placeholder="Relatório Individual" className="min-h-11 rounded-control border border-nite-border-control bg-nite-surface px-3" />
      </label>
      <label className="grid gap-2 text-type-body-compact text-nite-text-primary">Arquivo DOCX (até 8 MiB)
        <input name="file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required className="min-h-11" />
      </label>
      <div><button type="submit" className="min-h-11 rounded-control bg-nite-brand-primary px-4 font-medium text-white">Importar DOCX</button></div>
    </form>
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
