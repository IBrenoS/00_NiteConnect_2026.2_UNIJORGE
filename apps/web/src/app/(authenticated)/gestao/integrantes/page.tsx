import { FilterToolbar } from "../../../../components/patterns/filter-toolbar";
import { FilterSelect, SearchField, Button } from "../../../../components/ui";
import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getMembers } from "../../../../lib/members/administrative";
import { memberStatuses, roleLabel, statusLabel } from "../../../../lib/members/status";
import { MemberAvatar } from "../../../../components/ui/member-avatar";

export const metadata = { title: "Integrantes" };
type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
export default async function MembersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [session, params] = await Promise.all([requireAuthenticatedNiteSession(), searchParams]);
  if (!session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR"))
    return <main className="mx-auto max-w-4xl p-6"><h1 className="text-type-page-title">Integrantes</h1><p role="alert">Acesso restrito à gestão geral e à coordenação.</p></main>;
  const q = one(params.q).trim().slice(0, 160);
  const requestedStatus = one(params.status);
  const status = memberStatuses.some(value => value === requestedStatus) ? requestedStatus : "";
  const page = /^\d{1,6}$/.test(one(params.page)) ? Number(one(params.page)) : 0;
  const result = await getMembers(session.bearer, q, status, page);
  const href = (next: number) => `/gestao/integrantes?${new URLSearchParams({ q, ...(status ? { status } : {}), page: String(next) })}`;
  return <main className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
    <header><p className="text-type-metadata text-nite-text-muted">Gestão do NITE</p><h1 className="font-display text-type-page-title font-semibold text-nite-text-primary">Integrantes</h1></header>
    <FilterToolbar compact action="/gestao/integrantes" method="get" className="border-b border-nite-border-soft pb-4">
      <label className="grid min-w-56 flex-1 gap-1 text-type-metadata text-nite-text-secondary">Nome ou e-mail
        <SearchField name="q" defaultValue={q} maxLength={160} /></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Situação
        <FilterSelect name="status" defaultValue={status}>
          <option value="">Todas</option>{memberStatuses.map(value => <option key={value} value={value}>{statusLabel[value]}</option>)}
        </FilterSelect></label>
      <Button size="compact" type="submit">Pesquisar</Button>
    </FilterToolbar>
    {!result.data ? <p role="alert" className="border-b border-nite-border-soft py-8 text-type-body-compact text-status-error">{result.issue === "access" ? "A API negou acesso ao diretório." : "Não foi possível carregar os integrantes. Atualize a página e tente novamente."}</p>
      : !result.data.items.length ? <section className="grid min-h-48 place-content-center border-b border-nite-border-soft text-center"><h2 className="text-type-component-title font-medium">Nenhum integrante encontrado</h2><p className="text-type-body-compact text-nite-text-secondary">Ajuste a pesquisa ou a situação selecionada.</p></section>
      : <><ul className="divide-y divide-nite-border-soft border-y border-nite-border-soft sm:hidden">{result.data.items.map(member => <li key={member.id} className="py-4"><Link href={`/gestao/integrantes/${member.id}`} className="flex items-start gap-3 text-nite-brand-primary focus-visible:outline-3 focus-visible:outline-nite-focus"><MemberAvatar name={member.name} memberId={member.hasPhoto ? member.id : null} size={38}/><span className="min-w-0 break-words"><strong className="block text-type-body-compact font-medium">{member.name}</strong><span className="block break-all text-type-metadata text-nite-text-secondary">{member.institutionalEmail}</span><span className="mt-2 block text-type-metadata text-nite-text-secondary">{member.roles.map(role => roleLabel[role] ?? role).join(", ")}</span><span className="block text-type-metadata text-nite-text-secondary">{statusLabel[member.status]}</span></span></Link></li>)}</ul><div className="hidden overflow-x-auto border-b border-nite-border-soft sm:block"><table className="w-full min-w-[650px] text-left text-type-body-compact"><thead className="border-b border-nite-border-soft text-type-metadata text-nite-text-muted"><tr><th className="px-3 py-3 font-medium">Integrante</th><th className="px-3 py-3 font-medium">Papel institucional</th><th className="px-3 py-3 font-medium">Situação</th></tr></thead><tbody>{result.data.items.map(member => <tr key={member.id} className="border-b border-nite-border-soft last:border-0 hover:bg-nite-surface-subtle"><td className="px-3 py-3"><Link href={`/gestao/integrantes/${member.id}`} className="flex items-center gap-3 text-nite-brand-primary focus-visible:outline-3 focus-visible:outline-nite-focus"><MemberAvatar name={member.name} memberId={member.hasPhoto ? member.id : null} size={38}/><span className="min-w-0"><strong className="block font-medium">{member.name}</strong><span className="block text-type-metadata text-nite-text-secondary">{member.institutionalEmail}</span></span></Link></td><td className="px-3 py-3">{member.roles.map(role => roleLabel[role] ?? role).join(", ")}</td><td className="px-3 py-3">{statusLabel[member.status]}</td></tr>)}</tbody></table></div></>}
    {result.data && <nav aria-label="Paginação de integrantes" className="flex items-center justify-between gap-3 text-type-body-compact"><span className="text-nite-text-secondary">{result.data.total} integrante(s)</span><span className="flex gap-4">{page > 0 && <Link className="text-nite-brand-primary underline" href={href(page - 1)}>Anterior</Link>}{(page + 1) * 20 < result.data.total && <Link className="text-nite-brand-primary underline" href={href(page + 1)}>Próxima</Link>}</span></nav>}
  </main>;
}
