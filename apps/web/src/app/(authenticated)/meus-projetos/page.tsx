import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getMyProjects } from "../../../lib/projects/my-projects";
export const dynamic="force-dynamic";
export const metadata={title:"Meus projetos"};
export default async function MyProjectsPage() {
  const session=await requireAuthenticatedNiteSession();
  const result=await getMyProjects(session.bearer);
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-7 sm:px-8">
    <header><h1 className="font-display text-type-page-title text-nite-text-primary">Meus projetos</h1>
    <p className="text-type-body-compact text-nite-text-secondary">Acesse os arquivos dos projetos dos quais você participa. A evolução do catálogo e das solicitações de ingresso pertence ao Bloco 02.</p></header>
    {result.issue?<p role="alert" className="text-nite-text-secondary">Não foi possível consultar seus projetos.</p>
      :!result.data?.length?<p className="text-nite-text-secondary">Você ainda não participa de nenhum projeto.</p>
      :<ul className="grid gap-3 sm:grid-cols-2">{result.data.map(p=><li key={p.id} className="space-y-2 rounded-control border border-nite-border-soft p-4">
        <h2 className="font-medium text-nite-text-primary">{p.title}</h2>
        <p className="text-type-body-compact text-nite-text-secondary">{p.description}</p>
        <p className="text-type-metadata text-nite-text-muted">Situação: {p.status}</p>
        <Link href={`/projetos/${p.id}/arquivos`} className="text-nite-brand-primary underline underline-offset-4">Abrir arquivos do projeto</Link>
      </li>)}</ul>}
  </main>;
}
