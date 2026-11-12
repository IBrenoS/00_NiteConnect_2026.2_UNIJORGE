import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getPersonalLibrary,getTemplates,validUuid } from "../../../lib/documents/library";
import { LibraryExplorer } from "../../../components/documents/library-explorer";
import { createPersonalTemplateCopy } from "../../../lib/documents/library-actions";
export const dynamic="force-dynamic";
export const metadata={title:"Meus arquivos"};
type Props={searchParams:Promise<{folder?:string;error?:string;saved?:string;uploaded?:string}>};
export default async function PersonalDocumentsPage({searchParams}:Props) {
  const session=await requireAuthenticatedNiteSession();
  const params=await searchParams;
  const [listing,templates]=await Promise.all([
    getPersonalLibrary(session.bearer,params.folder&&validUuid(params.folder)?params.folder:undefined),
    getTemplates(session.bearer),
  ]);
  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-7 sm:px-8">
    <header><h1 className="font-display text-type-page-title text-nite-text-primary">Meus arquivos</h1>
      <p className="text-type-body-compact text-nite-text-secondary">Sua pasta individual no Núcleo. Você pode adicionar e editar arquivos, sem excluir o acervo institucional.</p></header>
    {(params.saved||params.uploaded)&&<p role="status" className="text-nite-text-primary">Arquivo ou documento atualizado.</p>}
    {params.error&&<p role="alert" className="text-nite-text-primary">Operação não concluída ({params.error}).</p>}
    {listing.data?<LibraryExplorer listing={listing.data} base="/documentos" personal/>
      :<p role="alert" className="text-nite-text-secondary">Não foi possível consultar sua pasta. Confira a disponibilidade do serviço documental.</p>}
    {templates.data?.some(t=>!t.retired)&&<section className="space-y-3 rounded-control border border-nite-border-soft p-4">
      <h2 className="font-medium text-nite-text-primary">Criar a partir de modelo oficial</h2>
      <p className="text-type-body-compact text-nite-text-secondary">Você recebe uma cópia pessoal e independente. A versão original permanece preservada.</p>
      <div className="flex flex-wrap gap-3">{templates.data.filter(t=>!t.retired).map(t=><form action={createPersonalTemplateCopy} key={t.id}>
        <input type="hidden" name="templateId" value={t.id}/><input type="hidden" name="returnTo" value="/documentos"/>
        <button className="min-h-10 rounded-control border border-nite-border-control px-3 text-nite-text-primary">{t.title}</button>
      </form>)}</div>
    </section>}
  </main>;
}
