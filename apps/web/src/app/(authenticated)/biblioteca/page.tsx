import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getAdminFolder,getAdminRoots,getAdminTree,getArchivedItems,getRecipients,getTemplates,validUuid } from "../../../lib/documents/library";
import { LibraryExplorer } from "../../../components/documents/library-explorer";
import { createLibraryFolder,createOfficialTemplate,distributeOfficialTemplate,provisionLibraryMembers,publishTemplateVersion,restoreArchivedItem,updateLibraryFolder } from "../../../lib/documents/library-actions";
export const dynamic="force-dynamic";
export const metadata={title:"Biblioteca do NITE"};
type Props={searchParams:Promise<{folder?:string;error?:string;saved?:string}>};
export default async function LibraryPage({searchParams}:Props) {
  const session=await requireAuthenticatedNiteSession();
  if(!session.roles.some(r=>r==="GESTOR_GERAL"||r==="COORDENADOR"))return <main className="p-8"><h1>Biblioteca indisponível</h1></main>;
  const params=await searchParams;
  const folderId=params.folder&&validUuid(params.folder)?params.folder:null;
  const [roots,tree,templates,recipients,listing,archived]=await Promise.all([
    getAdminRoots(session.bearer),getAdminTree(session.bearer),getTemplates(session.bearer),getRecipients(session.bearer),
    folderId?getAdminFolder(session.bearer,folderId):Promise.resolve(null), getArchivedItems(session.bearer),
  ]);
  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-7 sm:px-8">
    <header><h1 className="font-display text-type-page-title text-nite-text-primary">Biblioteca do NITE</h1>
      <p className="text-type-body-compact text-nite-text-secondary">Uma biblioteca institucional com os mesmos documentos que os integrantes veem em seus espaços.</p></header>
    {params.saved&&<p role="status" className="text-type-body-compact text-nite-text-primary">Alteração registrada.</p>}
    {params.error&&<p role="alert" className="text-type-body-compact text-nite-text-primary">Não foi possível concluir a operação ({params.error}). Nenhum conteúdo foi sobrescrito.</p>}
    {folderId ? listing?.data?<>
          <LibraryExplorer listing={listing.data} base="/biblioteca" canManage tree={tree.data??[]}/>
          {listing.data.folder.systemKey==="MODELOS"&&<section className="rounded-control border border-nite-border-soft p-4">
            <h2 className="font-medium text-nite-text-primary">Modelos oficiais publicados</h2>
            <p className="text-type-body-compact text-nite-text-secondary">Os modelos são versões institucionais, gerenciadas pela administração. Para publicar e distribuir cópias, use o painel de modelos na página principal da Biblioteca.</p>
            {templates.data?.filter(t=>!t.retired).map(t=><p key={t.id} className="mt-2 text-type-body-compact">{t.title} — versão {t.revision}</p>)}
            <Link href="/biblioteca" className="mt-3 inline-block text-nite-brand-primary underline underline-offset-4">Gerenciar modelos e distribuição</Link>
          </section>}
        </>:<p role="alert" className="text-nite-text-secondary">Pasta não encontrada ou biblioteca indisponível.</p>
      :<section className="space-y-4">
        <h2 className="font-medium text-nite-text-primary">Pastas institucionais</h2>
        {roots.data?<ul className="grid gap-3 sm:grid-cols-2">{roots.data.map(folder=><li key={folder.id}>
          <Link href={`/biblioteca?folder=${folder.id}`} className="flex min-h-20 items-center gap-3 rounded-control border border-nite-border-soft p-4 hover:bg-nite-surface-subtle">
            <span style={{color:folder.color}} aria-hidden="true" className="text-2xl">▰</span><span className="font-medium text-nite-text-primary">{folder.name}</span>
          </Link>
          <details className="mt-1 rounded-control border border-nite-border-soft p-2 text-type-body-compact">
            <summary className="cursor-pointer text-nite-text-secondary">Personalizar pasta</summary>
            <form action={updateLibraryFolder} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={folder.id}/><input type="hidden" name="returnTo" value="/biblioteca"/>
              <label className="grid gap-1">Nome<input name="name" required defaultValue={folder.name} maxLength={190} className="min-h-9 rounded-control border border-nite-border-control bg-nite-surface p-2"/></label>
              <label className="grid gap-1">Cor<input name="color" type="color" defaultValue={folder.color} className="h-9 w-14"/></label>
              <button className="min-h-9 rounded-control border border-nite-border-control px-3">Salvar</button>
            </form>
          </details></li>)}</ul>:<p className="text-nite-text-secondary">A estrutura institucional está indisponível.</p>}
        <details className="rounded-control border border-nite-border-soft p-4"><summary className="cursor-pointer font-medium">Criar pasta na raiz</summary>
          <form action={createLibraryFolder} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="returnTo" value="/biblioteca"/><label className="grid gap-1">Nome<input name="name" required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface p-2"/></label>
            <label className="grid gap-1">Cor<input type="color" name="color" defaultValue="#D6A432" className="h-10 w-16"/></label>
            <button className="rounded-control bg-nite-brand-primary px-4 py-2 text-white">Criar pasta</button>
          </form></details>
        <section className="space-y-3 rounded-control border border-nite-border-soft p-4" aria-label="Modelos oficiais">
          <h2 className="font-medium text-nite-text-primary">Modelos oficiais</h2>
          <p className="text-type-body-compact text-nite-text-secondary">Distribuir um modelo cria arquivos DOCX independentes. Versões novas não substituem as cópias já entregues.</p>
          <details><summary className="cursor-pointer text-nite-brand-primary">Cadastrar modelo DOCX</summary>
            <form action={createOfficialTemplate} className="mt-3 grid max-w-md gap-3">
              <input name="returnTo" type="hidden" value="/biblioteca"/>
              <label className="grid gap-1">Nome<input name="title" required maxLength={190} className="rounded-control border border-nite-border-control bg-nite-surface p-2"/></label>
              <label className="grid gap-1">Arquivo DOCX<input type="file" name="file" required accept=".docx"/></label>
              <label className="flex gap-2"><input type="checkbox" name="autoAssignOnJoin"/>Distribuir automaticamente a novos integrantes</label>
              <button className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-white">Publicar modelo</button>
            </form>
          </details>
          {templates.data?.filter(t=>!t.retired).map(t=><details key={t.id} className="rounded-control border border-nite-border-soft p-3">
            <summary className="cursor-pointer font-medium">{t.title} · versão {t.revision}{t.autoAssign?" · ingresso automático":""}</summary>
            <div className="mt-3 grid gap-4">
              <form action={publishTemplateVersion} className="grid max-w-md gap-2">
                <input type="hidden" name="templateId" value={t.id}/><input type="hidden" name="returnTo" value="/biblioteca"/>
                <label>Publicar nova versão DOCX <input name="file" type="file" accept=".docx" required/></label>
                <button className="min-h-9 rounded-control border border-nite-border-control px-3">Atualizar modelo para novas cópias</button>
              </form>
              <form action={distributeOfficialTemplate} className="grid gap-2">
                <input type="hidden" name="templateId" value={t.id}/><input type="hidden" name="returnTo" value="/biblioteca"/>
                <p className="text-type-body-compact text-nite-text-secondary">Selecione os destinatários:</p>
                <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">{recipients.data?.map(person=><label key={person.id} className="flex gap-2 text-type-body-compact">
                  <input type="checkbox" name="recipientId" value={person.id}/>{person.name}</label>)}</div>
                <button className="min-h-10 justify-self-start rounded-control bg-nite-brand-primary px-4 text-white">Distribuir cópias individuais</button>
              </form>
            </div>
          </details>)}
        </section>
        <details className="rounded-control border border-nite-border-soft p-4">
          <summary className="cursor-pointer font-medium text-nite-text-primary">Itens arquivados (recuperáveis)</summary>
          <p className="mt-2 text-type-body-compact text-nite-text-secondary">Os documentos permanecem preservados. Se uma pasta inteira foi arquivada, restaure a pasta para recuperar o conteúdo do mesmo arquivamento.</p>
          {archived.data?.length?<ul className="mt-3 grid gap-2">
            {archived.data.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-nite-border-soft p-3">
              <span className="text-type-body-compact text-nite-text-primary">{item.type==="FOLDER"?"Pasta":"Arquivo"}: {item.name}</span>
              <form action={restoreArchivedItem}>
                <input type="hidden" name="id" value={item.id}/><input type="hidden" name="type" value={item.type}/>
                <input type="hidden" name="returnTo" value="/biblioteca"/>
                <button className="min-h-9 rounded-control border border-nite-border-control px-3 text-type-body-compact">Restaurar</button>
              </form>
            </li>)}
          </ul>:<p className="mt-2 text-type-body-compact text-nite-text-muted">Nenhum item arquivado.</p>}
        </details>
        <form action={provisionLibraryMembers} className="rounded-control border border-nite-border-soft p-4">
          <input type="hidden" name="returnTo" value="/biblioteca"/>
          <p className="mb-3 text-type-body-compact text-nite-text-secondary">Atualizar pastas e modelos obrigatórios de integrantes já ativos, sem duplicar documentos.</p>
          <button className="min-h-10 rounded-control border border-nite-border-control px-4 font-medium">Sincronizar integrantes</button>
        </form>
      </section>}
  </main>;
}
