import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getMember } from "../../../../../lib/members/administrative";
import { roleLabel, statusLabel } from "../../../../../lib/members/status";
import { MemberAvatar } from "../../../../../components/ui/member-avatar";
import { StatusControl } from "../../../../../components/members/status-control";

export const metadata = { title: "Ficha de integrante" };
export default async function MemberPage({ params }: { params: Promise<{ memberId: string }> }) {
  const [session, { memberId }] = await Promise.all([requireAuthenticatedNiteSession(), params]);
  if (!session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR"))
    return <main className="mx-auto max-w-4xl p-6"><h1 className="text-type-page-title">Ficha de integrante</h1><p role="alert">Acesso restrito à gestão geral e à coordenação.</p></main>;
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return <main className="p-6" role="alert">Integrante inválido.</main>;
  const detail = await getMember(session.bearer, memberId);
  if (!detail.data) return <main className="mx-auto max-w-4xl p-6"><Link href="/gestao/integrantes" className="text-nite-brand-primary underline">Voltar ao diretório</Link><p role="alert" className="mt-5 text-status-error">{detail.issue === "not-found" ? "Integrante não encontrado." : "Não foi possível carregar a ficha. Tente novamente."}</p></main>;
  const member = detail.data;
  return <main className="mx-auto w-full max-w-5xl space-y-7 px-4 py-5 sm:px-7 sm:py-7">
    <Link href="/gestao/integrantes" className="text-type-body-compact text-nite-brand-primary underline">← Integrantes</Link>
    <header className="flex items-center gap-4 border-b border-nite-border-soft pb-5"><MemberAvatar name={member.name} memberId={member.hasPhoto ? member.id : null} size={64}/><div><p className="text-type-metadata text-nite-text-muted">Ficha administrativa</p><h1 className="font-display text-type-page-title font-semibold">{member.name}</h1><p className="text-type-body-compact text-nite-text-secondary">{statusLabel[member.status]}</p></div></header>
    <section aria-labelledby="cadastro" className="space-y-4"><h2 id="cadastro" className="text-type-section-title font-semibold">Dados cadastrais</h2><dl className="grid gap-x-8 gap-y-4 text-type-body-compact sm:grid-cols-2">{[["Nome completo",member.name],["E-mail institucional",member.institutionalEmail],["Curso",member.course],["Área de atuação",member.practiceArea],["Data de nascimento",member.birthDate ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${member.birthDate}T12:00:00Z`)) : null]].map(([label,value]) => <div key={label}><dt className="text-type-metadata text-nite-text-muted">{label}</dt><dd>{value || "Não informado"}</dd></div>)}</dl></section>
    <section aria-labelledby="vinculo" className="space-y-4 border-t border-nite-border-soft pt-6"><h2 id="vinculo" className="text-type-section-title font-semibold">Vínculo institucional</h2><dl className="grid gap-4 text-type-body-compact sm:grid-cols-2"><div><dt className="text-type-metadata text-nite-text-muted">Situação</dt><dd>{statusLabel[member.status]}</dd></div><div><dt className="text-type-metadata text-nite-text-muted">Papéis institucionais</dt><dd>{member.roles.map(role => roleLabel[role] ?? role).join(", ")}</dd></div></dl><StatusControl id={member.id} status={member.status} version={member.version}/></section>
  </main>;
}
