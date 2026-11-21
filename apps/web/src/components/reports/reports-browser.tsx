import Link from "next/link";
import {DocumentDataGrid,DocumentFolderIcon} from "../documents/document-data-grid";
import {reportFileHref,reportLocation,type ReportListing} from "../../lib/reports/contracts";
import type {LibraryRecipient} from "../../lib/documents/library-contracts";
import type {ApiIssue} from "../../lib/api/contracts";

export function ReportsIssue({issue}:{issue:ApiIssue}) {
  return <section role="alert" className="rounded-panel border border-nite-border-soft bg-nite-surface p-6 text-nite-text-secondary">
    <h1 className="font-display text-type-section-title text-nite-text-primary">{issue==="access"?"Acesso restrito":"Relatórios indisponíveis"}</h1>
    <p className="mt-2">{issue==="access"?"Esta área está disponível somente à coordenação e à gestão geral do NITE.":"Não foi possível consultar os relatórios. Tente novamente em instantes."}</p>
    <Link href="/relatorios" className="mt-4 inline-block text-nite-brand-primary underline">Tentar novamente</Link>
  </section>;
}
export function ReportsDirectory({members,search=""}:{members:LibraryRecipient[];search?:string}) {
  const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  const visible=members.filter(member=>normalize(member.name).includes(normalize(search.trim())));
  return <>
    <header><h1 className="font-display text-type-page-title text-nite-text-primary">Relatórios</h1>
      <p className="mt-2 text-type-body-compact text-nite-text-secondary">Consulte os relatórios institucionais vinculados a cada integrante.</p></header>
    <form action="/relatorios" className="flex flex-wrap gap-2" role="search">
      <label htmlFor="report-member-search" className="sr-only">Pesquisar integrante pelo nome</label>
      <input id="report-member-search" name="search" defaultValue={search} maxLength={120} placeholder="Pesquisar integrante pelo nome" className="min-h-11 min-w-0 flex-1 rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary focus-visible:outline-2 focus-visible:outline-nite-focus"/>
      <button className="min-h-11 rounded-control border border-nite-border-control px-4 font-medium hover:bg-nite-surface-subtle">Pesquisar</button>
      {search&&<Link href="/relatorios" className="self-center px-2 text-nite-brand-primary underline">Limpar</Link>}
    </form>
    {visible.length?<ul aria-label="Integrantes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(member=><li key={member.id}>
      <Link href={reportLocation(member.id)} className="flex min-h-24 items-center gap-4 rounded-panel border border-nite-border-soft bg-nite-surface px-5 py-4 hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
        <DocumentFolderIcon className="size-10"/><span className="min-w-0 break-words font-medium text-nite-text-primary">{member.name}</span>
      </Link></li>)}</ul>:<p role="status" className="rounded-panel border border-nite-border-soft p-8 text-center text-nite-text-secondary">{search?"Nenhum integrante encontrado para esta pesquisa.":"Nenhum integrante disponível."}</p>}
  </>;
}
const modified=(value:string)=>new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Bahia"});
const size=(bytes:number)=>bytes<1024?`${bytes} B`:`${(bytes/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} KB`;
export function ReportsDocuments({member,listing,folder}:{member:LibraryRecipient;listing:ReportListing;folder?:string}) {
  const back=reportLocation(member.id,folder,listing.offset);
  return <>
    <nav aria-label="Caminho dos relatórios" className="flex flex-wrap items-center gap-2 text-type-body-compact text-nite-text-secondary">
      <Link href="/relatorios" className="text-nite-brand-primary hover:underline">Relatórios</Link><span aria-hidden="true">/</span>
      {folder?<><Link href={reportLocation(member.id)} className="text-nite-brand-primary hover:underline">{member.name}</Link><span aria-hidden="true">/</span><span aria-current="page">Pasta selecionada</span></>:<span aria-current="page">{member.name}</span>}
    </nav>
    <header><h1 className="break-words font-display text-type-page-title text-nite-text-primary">{member.name}</h1><p className="mt-2 text-type-body-compact text-nite-text-secondary">Relatórios institucionais</p></header>
    {listing.items.length?<section aria-label={`Relatórios de ${member.name}`} className="overflow-hidden rounded-panel border border-nite-border-soft bg-nite-surface">
      <div className="overflow-x-auto" tabIndex={0} aria-label="Tabela de relatórios, role horizontalmente em telas pequenas">
        <DocumentDataGrid className="min-w-[760px] text-type-body-compact">
          <colgroup><col className="w-[34%]"/><col className="w-[18%]"/><col className="w-[18%]"/><col className="w-[10%]"/><col className="w-[20%]"/></colgroup>
          <thead className="border-b border-nite-border-soft bg-nite-surface-elevated text-nite-text-secondary"><tr>{["Nome","Modificado","Modificado por","Tamanho","Compartilhamento"].map(name=><th scope="col" key={name} className="h-[49px] px-3 font-medium">{name}</th>)}</tr></thead>
          <tbody>{listing.items.map(item=>{
            const href=item.type==="FOLDER"?(item.capabilities.canView?reportLocation(member.id,item.id):null):reportFileHref(item,back);
            const sharing=item.sharing.map(grant=>`${grant.memberName} (${grant.permission==="EDIT"?"Pode editar":"Pode visualizar"})`).join(", ");
            return <tr key={item.id} className="border-b border-nite-border-soft/70 last:border-0 hover:bg-nite-surface-subtle">
              <td className="px-3 py-3"><div className="flex min-w-0 items-center gap-3">{item.type==="FOLDER"?<DocumentFolderIcon/>:<span aria-hidden="true" className="shrink-0 text-nite-brand-primary">▤</span>}
                <div className="min-w-0">{href?<Link href={href} className="block truncate font-medium text-nite-text-primary hover:text-nite-brand-primary hover:underline focus-visible:outline-2 focus-visible:outline-nite-focus" title={item.name}>{item.name}</Link>:<span title="Abertura não autorizada" className="block truncate text-nite-text-muted">{item.name}</span>}
                  {item.type==="DOCUMENT"&&href&&<span className="text-type-metadata text-nite-text-muted">{item.mimeType?.includes("wordprocessing")?(item.capabilities.canEdit?"Abrir para editar":"Somente leitura"):"Baixar arquivo"}</span>}
                </div></div></td>
              <td className="px-3 py-3 text-nite-text-secondary">{modified(item.modifiedAt)}</td>
              <td className="truncate px-3 py-3 text-nite-text-secondary" title={item.modifiedByName??undefined}>{item.modifiedByName??"Não disponível"}</td>
              <td className="px-3 py-3 text-nite-text-secondary">{size(item.size)}</td>
              <td className="px-3 py-3 text-nite-text-secondary"><details><summary className="cursor-pointer">{item.sharing.length?"Ver acessos":"Sem compartilhamento explícito"}</summary><p className="mt-2 break-words text-type-metadata">{sharing||"Vínculo institucional com o integrante."}</p></details></td>
            </tr>;
          })}</tbody>
        </DocumentDataGrid>
      </div>
    </section>:<section role="status" className="rounded-panel border border-nite-border-soft bg-nite-surface p-8 text-center"><DocumentFolderIcon className="mx-auto mb-4 size-12"/><h2 className="font-medium text-nite-text-primary">Nenhum relatório nesta pasta</h2><p className="mt-2 text-type-body-compact text-nite-text-secondary">{folder?"Não há relatórios vinculados a este integrante neste local.":"Ainda não há documentos classificados como relatório e vinculados a este integrante."}</p></section>}
    {(listing.offset>0||listing.hasMore)&&<nav aria-label="Paginação dos relatórios" className="flex items-center justify-between gap-3">
      {listing.offset>0?<Link href={reportLocation(member.id,folder,Math.max(0,listing.offset-listing.limit))} className="min-h-10 rounded-control border border-nite-border-control px-4 py-2">Anterior</Link>:<span/>}
      {listing.hasMore&&<Link href={reportLocation(member.id,folder,listing.offset+listing.limit)} className="min-h-10 rounded-control border border-nite-border-control px-4 py-2">Próxima</Link>}
    </nav>}
  </>;
}
