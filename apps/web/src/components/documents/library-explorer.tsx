import Link from "next/link";
import type { LibraryFolder,LibraryListing } from "../../lib/documents/library";
import { LibraryUploadForm } from "./library-upload-form";
import { archiveLibraryFile,archiveLibraryFolder,createLibraryFolder,organizeLibraryFile,updateLibraryFolder,setProjectDocumentEditGrant } from "../../lib/documents/library-actions";

type Props={listing:LibraryListing; base:string; personal?:boolean; canManage?:boolean; tree?:LibraryFolder[]; members?:{memberId:string;memberName:string}[]};
const nav=(base:string,id:string)=>`${base}${base.includes("?")?"&":"?"}folder=${encodeURIComponent(id)}`;
const when=(date:string)=>new Date(date).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
export function LibraryExplorer({listing,base,personal=false,canManage=false,tree=[],members=[]}:Props) {
  const current=listing.folder;
  const returnTo=nav(base,current.id);
  return <section aria-label={`Pasta ${current.name}`} className="grid gap-5">
    <div className="flex flex-wrap items-center gap-3">
      {personal?<Link href="/documentos" className="text-type-body-compact text-nite-brand-primary">Minha pasta</Link>:<Link href={base} className="text-type-body-compact text-nite-brand-primary">Início da biblioteca</Link>}
      {current.parentId&&current.kind!=="PERSONAL"&&current.kind!=="PROJECT"&&<Link href={nav(base,current.parentId)} className="text-type-body-compact text-nite-brand-primary">Pasta anterior</Link>}
      <span className="text-nite-text-muted" aria-hidden="true">/</span>
      <h2 className="font-display text-type-section-title text-nite-text-primary">{current.name}</h2>
    </div>
    <div className="flex flex-wrap gap-2 text-type-body-compact text-nite-text-secondary">
      <span>{listing.folders.length} pastas</span><span aria-hidden="true">·</span><span>{listing.files.length} arquivos</span>
    </div>
    {canManage&&<details className="rounded-control border border-nite-border-soft p-4">
      <summary className="cursor-pointer font-medium text-nite-text-primary">Nova subpasta</summary>
      <form action={createLibraryFolder} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="parentId" value={current.id}/><input type="hidden" name="returnTo" value={returnTo}/>
        <label className="grid gap-1 text-type-body-compact">Nome<input name="name" required maxLength={190} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2"/></label>
        <label className="grid gap-1 text-type-body-compact">Cor<input type="color" name="color" defaultValue="#D6A432" className="h-10 w-14"/></label>
        <button className="min-h-10 rounded-control bg-nite-brand-primary px-4 text-white">Criar pasta</button>
      </form>
    </details>}
    <div className="overflow-x-auto rounded-control border border-nite-border-soft">
      <table className="w-full min-w-[650px] text-left text-type-body-compact">
        <thead className="bg-nite-surface-subtle text-nite-text-muted"><tr>
          <th className="p-3 font-medium">Nome</th><th className="p-3 font-medium">Proprietário / criado por</th>
          <th className="p-3 font-medium">Última modificação</th><th className="p-3 font-medium">Ações</th>
        </tr></thead>
        <tbody>
          {listing.folders.map(f=><tr key={f.id} className="border-t border-nite-border-soft align-top">
            <td className="p-3"><Link href={nav(base,f.id)} className="flex items-center gap-2 font-medium text-nite-brand-primary">
              <span aria-hidden="true" style={{color:f.color}}>▰</span>{f.name}</Link><span className="text-type-metadata text-nite-text-muted">Pasta</span></td>
            <td className="p-3 text-nite-text-secondary">{f.kind==="PERSONAL"?"Integrante":"Área institucional"}</td>
            <td className="p-3 text-nite-text-secondary">{when(f.modifiedAt)}</td>
            <td className="p-3">{canManage&&<details><summary className="cursor-pointer text-nite-brand-primary">Organizar</summary>
              <form action={updateLibraryFolder} className="mt-2 grid max-w-56 gap-2">
                <input type="hidden" name="id" value={f.id}/><input type="hidden" name="returnTo" value={returnTo}/>
                <label className="grid gap-1">Nome<input name="name" defaultValue={f.name} required maxLength={190} className="rounded-control border border-nite-border-control bg-nite-surface p-2"/></label>
                <label className="grid gap-1">Cor<input type="color" name="color" defaultValue={f.color} className="h-9"/></label>
                {f.kind==="CUSTOM"&&tree.length>0&&<label className="grid gap-1">Mover para
                  <select name="parentId" defaultValue={f.parentId??""} className="rounded-control border border-nite-border-control bg-nite-surface p-2">
                    {tree.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
                  </select></label>}
                <button className="min-h-9 rounded-control border border-nite-border-control px-2">Salvar</button>
              </form>
              {f.kind==="CUSTOM"&&<form action={archiveLibraryFolder} className="mt-2">
                <input type="hidden" name="id" value={f.id}/><input type="hidden" name="returnTo" value={returnTo}/>
                <label className="my-2 flex gap-2 text-type-metadata text-nite-text-secondary"><input type="checkbox" name="recursive"/>Incluir subpastas e arquivos (restauráveis pela gestão)</label>
                <button className="text-nite-text-secondary underline underline-offset-2">Arquivar pasta</button>
              </form>}
            </details>}</td>
          </tr>)}
          {listing.files.map(file=><tr key={file.id} className="border-t border-nite-border-soft align-top">
            <td className="p-3"><div className="flex items-start gap-2"><span aria-hidden="true">{file.mimeType.includes("wordprocessing")?"📄":file.mimeType.includes("pdf")?"📕":"🖼️"}</span>
              <div><Link href={file.mimeType.includes("wordprocessing")?`/documentos/${file.id}`:`/api/library/download/${file.id}`}
                className="font-medium text-nite-brand-primary underline underline-offset-4">{file.title}</Link>
                <p className="text-type-metadata text-nite-text-muted">Revisão {file.revision} · {file.size.toLocaleString("pt-BR")} bytes</p></div></div></td>
            <td className="p-3 text-nite-text-secondary"><div>Proprietário: {file.ownerName??"NITE"}</div><div>Criado por: {file.createdByName}</div>{file.sharedByName&&<div>Distribuído por: {file.sharedByName}{file.sharedAt?` · ${when(file.sharedAt)}`:""}</div>}</td>
            <td className="p-3 text-nite-text-secondary">{when(file.modifiedAt)}<div className="text-type-metadata">{file.modifiedByName??file.createdByName}</div>
              {file.lastOpenedAt&&<div className="mt-1 text-type-metadata">Aberto em {when(file.lastOpenedAt)}{file.lastOpenedByName?` por ${file.lastOpenedByName}`:""}</div>}</td>
            <td className="p-3"><Link href={`/api/library/download/${file.id}`} className="text-nite-brand-primary underline underline-offset-4">Baixar</Link>
              {canManage&&<details className="mt-2"><summary className="cursor-pointer text-nite-brand-primary">Organizar</summary>
                <form action={organizeLibraryFile} className="mt-2 grid max-w-56 gap-2">
                  <input type="hidden" name="id" value={file.id}/><input type="hidden" name="returnTo" value={returnTo}/>
                  <label className="grid gap-1">Nome<input name="title" defaultValue={file.title} required className="rounded-control border border-nite-border-control bg-nite-surface p-2"/></label>
                  <label className="grid gap-1">Pasta de destino
                    {tree.length?<select name="folderId" defaultValue={current.id} className="rounded-control border border-nite-border-control bg-nite-surface p-2">
                      {tree.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>:<input name="folderId" readOnly value={current.id} className="rounded-control border border-nite-border-control p-2"/>}
                  </label>
                  <button className="min-h-9 rounded-control border border-nite-border-control px-2">Salvar</button>
                </form>
                {file.context==="PROJECT"&&members.length>0&&<form action={setProjectDocumentEditGrant} className="mt-3 grid gap-2">
                  <input type="hidden" name="id" value={file.id}/><input type="hidden" name="returnTo" value={returnTo}/>
                  <label className="grid gap-1">Permissão de edição
                    <select name="memberId" required className="rounded-control border border-nite-border-control bg-nite-surface p-2">
                      {members.map(p=><option key={p.memberId} value={p.memberId}>{p.memberName}</option>)}
                    </select>
                  </label>
                  <select name="canEdit" aria-label="Ação de permissão" className="rounded-control border border-nite-border-control bg-nite-surface p-2">
                    <option value="true">Autorizar edição</option><option value="false">Revogar edição</option>
                  </select>
                  <button className="min-h-9 rounded-control border border-nite-border-control px-2">Aplicar permissão</button>
                </form>}
                <form action={archiveLibraryFile} className="mt-2">
                  <input type="hidden" name="id" value={file.id}/><input type="hidden" name="returnTo" value={returnTo}/>
                  <button className="text-nite-text-secondary underline underline-offset-2">Arquivar arquivo</button>
                </form>
              </details>}
            </td>
          </tr>)}
          {listing.folders.length===0&&listing.files.length===0&&<tr><td colSpan={4} className="p-6 text-nite-text-secondary">Esta pasta ainda não possui conteúdo.</td></tr>}
        </tbody>
      </table>
    </div>
    {(personal||canManage)&&<details className="rounded-control border border-nite-border-soft p-4">
      <summary className="cursor-pointer font-medium text-nite-text-primary">Criar ou carregar arquivo</summary>
      <div className="mt-3"><LibraryUploadForm folderId={current.id} returnTo={returnTo}/></div>
    </details>}
  </section>;
}
