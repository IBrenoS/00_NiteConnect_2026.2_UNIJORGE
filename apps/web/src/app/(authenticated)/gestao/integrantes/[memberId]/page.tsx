import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getMember, getMemberHistory, type MemberEvent } from "../../../../../lib/members/administrative";
import { roleLabel, statusLabel } from "../../../../../lib/members/status";
import { MemberAvatar } from "../../../../../components/ui/member-avatar";
import { StatusControl } from "../../../../../components/members/status-control";

export const metadata = { title: "Ficha de integrante" };
const eventLabel = (event: MemberEvent) => {
  if (event.kind === "ROLE_GRANTED") return `Concessão: ${roleLabel[event.newValue ?? ""] ?? event.newValue}`;
  if (event.kind === "ROLE_REVOKED") return `Revogação: ${roleLabel[event.previousValue ?? ""] ?? event.previousValue}`;
  if (event.newValue === "PENDENTE_INGRESSO") return "Ingresso registrado";
  if (event.newValue === "ATIVO") return event.previousValue === "AFASTADO" || event.previousValue === "DESLIGADO" ? "Reativação" : event.previousValue === null ? "Ingresso e ativação" : "Ativação";
  if (event.newValue === "AFASTADO") return "Afastamento";
  if (event.newValue === "DESLIGADO") return "Desligamento";
  return "Alteração institucional";
};
export default async function MemberPage({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ page?: string }> }) {
  const [session, { memberId }, search] = await Promise.all([requireAuthenticatedNiteSession(), params, searchParams]);
  if (!session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR"))
    return <main className="mx-auto max-w-4xl p-6"><h1 className="text-type-page-title">Ficha de integrante</h1><p role="alert">Acesso restrito à gestão geral e à coordenação.</p></main>;
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return <main className="p-6" role="alert">Integrante inválido.</main>;
  const page = /^\d{1,6}$/.test(search.page ?? "") ? Number(search.page) : 0;
  const [detail, history] = await Promise.all([getMember(session.bearer, memberId), getMemberHistory(session.bearer, memberId, page)]);
  if (!detail.data) return <main className="mx-auto max-w-4xl p-6"><Link href="/gestao/integrantes" className="text-nite-brand-primary underline">Voltar ao diretório</Link><p role="alert" className="mt-5 text-status-error">{detail.issue === "not-found" ? "Integrante não encontrado." : "Não foi possível carregar a ficha. Tente novamente."}</p></main>;
  const member = detail.data;
  return <main className="mx-auto w-full max-w-5xl space-y-7 px-4 py-5 sm:px-7 sm:py-7">
    <Link href="/gestao/integrantes" className="text-type-body-compact text-nite-brand-primary underline">← Integrantes</Link>
    <header className="flex items-center gap-4 border-b border-nite-border-soft pb-5"><MemberAvatar name={member.name} memberId={member.hasPhoto ? member.id : null} size={64}/><div><p className="text-type-metadata text-nite-text-muted">Ficha administrativa</p><h1 className="font-display text-type-page-title font-semibold">{member.name}</h1><p className="text-type-body-compact text-nite-text-secondary">{statusLabel[member.status]}</p></div></header>
    <section aria-labelledby="cadastro" className="space-y-4"><h2 id="cadastro" className="text-type-section-title font-semibold">Dados cadastrais</h2><dl className="grid gap-x-8 gap-y-4 text-type-body-compact sm:grid-cols-2">{[["Nome completo",member.name],["E-mail institucional",member.institutionalEmail],["Curso",member.course],["Área de atuação",member.practiceArea],["Data de nascimento",member.birthDate ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${member.birthDate}T12:00:00Z`)) : null]].map(([label,value]) => <div key={label}><dt className="text-type-metadata text-nite-text-muted">{label}</dt><dd>{value || "Não informado"}</dd></div>)}</dl></section>
    <section aria-labelledby="vinculo" className="space-y-4 border-t border-nite-border-soft pt-6"><h2 id="vinculo" className="text-type-section-title font-semibold">Vínculo institucional</h2><dl className="grid gap-4 text-type-body-compact sm:grid-cols-2"><div><dt className="text-type-metadata text-nite-text-muted">Situação</dt><dd>{statusLabel[member.status]}</dd></div><div><dt className="text-type-metadata text-nite-text-muted">Papéis institucionais</dt><dd>{member.roles.map(role => roleLabel[role] ?? role).join(", ")}</dd></div></dl><StatusControl id={member.id} status={member.status} version={member.version}/></section>
    <section aria-labelledby="historico" className="space-y-4 border-t border-nite-border-soft pt-6"><h2 id="historico" className="text-type-section-title font-semibold">Histórico institucional</h2>
      {!history.data ? <p role="alert" className="text-status-error">Não foi possível carregar o histórico. Atualize a página.</p>
        : !history.data.items.length ? <p className="text-type-body-compact text-nite-text-secondary">Nenhum evento institucional registrado.</p>
        : <ol className="divide-y divide-nite-border-soft border-y border-nite-border-soft">{history.data.items.map(event => <li key={event.id} className="grid gap-1 py-4 text-type-body-compact"><div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="font-medium">{eventLabel(event)}</strong><time className="text-type-metadata text-nite-text-muted" dateTime={event.occurredAt}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(event.occurredAt))}</time></div><p className="text-nite-text-secondary">{event.technical ? "Regularização técnica" : event.actorName ? `Responsável: ${event.actorName}` : "Responsável indisponível"}</p>{event.reason && <p className="text-nite-text-secondary">Motivo: {event.reason}</p>}</li>)}</ol>}
      {history.data && <nav aria-label="Paginação do histórico" className="flex gap-4 text-type-body-compact">{page > 0 && <Link className="text-nite-brand-primary underline" href={`?page=${page-1}`}>Anterior</Link>}{(page+1)*20 < history.data.total && <Link className="text-nite-brand-primary underline" href={`?page=${page+1}`}>Próxima</Link>}</nav>}
    </section>
  </main>;
}
