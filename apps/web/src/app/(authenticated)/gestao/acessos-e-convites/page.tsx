import { FilterToolbar } from "../../../../components/patterns/filter-toolbar";
import { FilterSelect, SearchField, Button } from "../../../../components/ui";
import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getInvitations, invitationStates, invitationStatus, getMembers, type InvitationState } from "../../../../lib/access-management/data";
import { roleLabel, statusLabel } from "../../../../lib/members/status";
import { InvitationControls, RoleControls } from "../../../../components/access-management/controls";

export const metadata = { title: "Acessos e convites" };
type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const date = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(value)) : "Sem registro";
const tabs = [{ id: "convites", label: "Convites" }, { id: "permissoes", label: "Permissões" }, { id: "acessos", label: "Acessos" }] as const;

export default async function AccessManagementPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [session, params] = await Promise.all([requireAuthenticatedNiteSession(), searchParams]);
  if (!session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR"))
    return <main className="mx-auto max-w-4xl p-6"><h1>Acessos e convites</h1><p role="alert">Acesso restrito à gestão geral e à coordenação.</p></main>;
  const tab = tabs.find(item => item.id === one(params.tab))?.id ?? "convites";
  const q = one(params.q).trim().slice(0, 160);
  const state = invitationStates.find(item => item === one(params.state)) ?? "ALL";
  const page = /^\d{1,6}$/.test(one(params.page)) ? Number(one(params.page)) : 0;
  const invitations = tab === "convites" ? await getInvitations(session.bearer, state, page, q) : null;
  const members = tab !== "convites" ? await getMembers(session.bearer, q, "", page) : null;
  const filteredInvitations = invitations?.data?.items ?? [];
  const pageHref = (next: number) => `/gestao/acessos-e-convites?${new URLSearchParams({ tab, q, state, page: String(next) })}`;
  return <main className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
    <header><p className="text-type-metadata text-nite-text-muted">Gestão do NITE</p><h1 className="font-display text-type-page-title font-semibold text-nite-text-primary">Acessos e convites</h1>
      <p className="mt-2 text-type-body-compact text-nite-text-secondary">Identidade Microsoft, vínculo institucional e papéis são administrados separadamente.</p></header>
    <nav aria-label="Perspectivas" className="flex flex-wrap gap-2 border-b border-nite-border-soft pb-3">{tabs.map(item => <Link key={item.id} href={`/gestao/acessos-e-convites?tab=${item.id}`} aria-current={tab === item.id ? "page" : undefined}
      className={`rounded-control px-4 py-2 text-type-body-compact focus-visible:outline-3 focus-visible:outline-nite-focus ${tab === item.id ? "bg-nite-brand-soft font-semibold text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>{item.label}</Link>)}</nav>
    {tab === "convites" ? <>
      <div className="flex flex-wrap items-end justify-between gap-4"><FilterToolbar compact action="/gestao/acessos-e-convites" method="get" className="border-b border-nite-border-soft pb-4"><input type="hidden" name="tab" value="convites" />
        <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Nome ou e-mail<SearchField name="q" defaultValue={q} maxLength={160} /></label>
        <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Situação<FilterSelect name="state" defaultValue={state}>
          {([ ["ALL","Todas"], ["PENDING","Pendentes"], ["ACCEPTED","Aceitos"], ["EXPIRED","Expirados"], ["REVOKED","Revogados"], ["SEND_FAILED","Falha no envio"] ] as [InvitationState,string][]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</FilterSelect></label>
        <Button size="compact" type="submit">Pesquisar</Button></FilterToolbar><InvitationControls /></div>
      {!invitations?.data ? <p role="alert" className="py-6 text-status-error">{invitations?.issue === "access" ? "A API negou acesso aos convites." : "Não foi possível consultar os convites. Tente novamente."}</p>
        : <>
          {filteredInvitations.length ? <div className="overflow-x-auto border-y border-nite-border-soft"><table className="w-full min-w-[850px] text-left text-type-body-compact"><thead className="text-type-metadata text-nite-text-muted"><tr>{["Destinatário", "Papel inicial", "Situação", "Enviado em", "Validade", "Ações"].map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{filteredInvitations.map(item => <tr key={item.id} className="border-t border-nite-border-soft"><td className="px-3 py-3"><strong className="block font-medium">{item.name}</strong><span className="break-all text-type-metadata text-nite-text-secondary">{item.email}</span></td><td className="px-3 py-3">{roleLabel[item.initialRole]}</td><td className="px-3 py-3">{invitationStatus(item)}{item.sendState === "ACCEPTED_BY_PROVIDER" && !item.acceptedAt ? <span className="block text-type-metadata text-nite-text-muted">Aceito pelo provedor; entrega não confirmada</span> : null}</td><td className="px-3 py-3">{date(item.lastSendAt)}</td><td className="px-3 py-3">{date(item.expiresAt)}</td><td className="px-3 py-3"><InvitationControls invitation={item} active={invitationStatus(item) === "Pendente" || invitationStatus(item) === "Falha no envio"} /></td></tr>)}</tbody></table></div>
            : <p className="py-8 text-center text-nite-text-secondary">Nenhum convite encontrado nesta página.</p>}</>}
    </> : <>
      <FilterToolbar compact action="/gestao/acessos-e-convites" method="get" className="border-b border-nite-border-soft pb-4"><input type="hidden" name="tab" value={tab} /><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Nome do integrante<SearchField name="q" defaultValue={q} maxLength={160} /></label><Button size="compact" type="submit">Pesquisar</Button></FilterToolbar>
      {!members?.data ? <p role="alert" className="py-6 text-status-error">{members?.issue === "access" ? "A API negou acesso aos integrantes." : "Não foi possível consultar os integrantes. Tente novamente."}</p>
        : members.data.items.length ? <div className="overflow-x-auto border-y border-nite-border-soft"><table className="w-full min-w-[700px] text-left text-type-body-compact"><thead><tr>{["Integrante", tab === "acessos" ? "Situação institucional" : "Papéis institucionais", tab === "acessos" ? "Último acesso" : "Gerenciar"].map(label => <th key={label} className="px-3 py-3 font-medium text-nite-text-muted">{label}</th>)}</tr></thead><tbody>{members.data.items.map(member => <tr key={member.id} className="border-t border-nite-border-soft"><td className="px-3 py-3"><strong className="block font-medium">{member.name}</strong><span className="break-all text-type-metadata text-nite-text-secondary">{member.institutionalEmail}</span></td><td className="px-3 py-3">{tab === "acessos" ? statusLabel[member.status] : member.roles.map(role => roleLabel[role] ?? role).join(", ")}</td><td className="px-3 py-3">{tab === "acessos" ? date(member.lastAccessAt) : <RoleControls memberId={member.id} name={member.name} />}</td></tr>)}</tbody></table></div>
          : <p className="py-8 text-center text-nite-text-secondary">Nenhum integrante encontrado.</p>}
    </>}
    {((invitations?.data ?? members?.data)) && <nav aria-label="Paginação" className="flex justify-between text-type-body-compact"><span>{(invitations?.data ?? members?.data)?.total} registro(s)</span><span className="flex gap-4">{page > 0 && <Link href={pageHref(page - 1)} className="text-nite-brand-primary underline">Anterior</Link>}{(page + 1) * 20 < ((invitations?.data ?? members?.data)?.total ?? 0) && <Link href={pageHref(page + 1)} className="text-nite-brand-primary underline">Próxima</Link>}</span></nav>}
  </main>;
}
