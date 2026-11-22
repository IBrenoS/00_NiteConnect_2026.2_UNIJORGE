import Link from "next/link";
import { getAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { cookies } from "next/headers";

export const metadata = { title: "Ingresso por convite" };
const messages: Record<string, { title: string; detail: string }> = {
  success: { title: "Ingresso concluído", detail: "Seu convite foi aceito ou já estava associado a esta conta. Acesse o NITE Connect para continuar." },
  invalid: { title: "Link de convite inválido", detail: "Peça à equipe responsável um novo link de convite." },
  "different-account": { title: "Conta Microsoft não corresponde ao convite", detail: "Saia da conta Microsoft atual e entre com a conta institucional destinatária. Se o problema continuar, peça à gestão para verificar o convite." },
  "expired-or-revoked": { title: "Convite indisponível", detail: "O convite expirou, foi revogado ou não pode mais ser utilizado. Peça à gestão um novo convite." },
  "temporary-failure": { title: "Não foi possível concluir o ingresso", detail: "Houve uma falha temporária. Tente abrir o link novamente mais tarde." },
  "identity-failure": { title: "Identidade não confirmada", detail: "A conta Microsoft foi autenticada, mas o vínculo institucional não pôde ser confirmado. Contate a gestão do NITE." },
};
export default async function InvitationResult({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const confirmed = status === "success" && (await cookies()).get("nite-invitation-success")?.value === "1"
    ? await getAuthenticatedNiteSession() : null;
  const displayedStatus = status === "success" && !confirmed ? "identity-failure" : status;
  const message = messages[displayedStatus ?? ""] ?? messages.invalid;
  return <main className="flex min-h-svh items-center justify-center bg-nite-background px-4 py-10 text-nite-text-primary"><section className="w-full max-w-lg rounded-control border border-nite-border-soft bg-nite-surface p-6 sm:p-9">
    <p className="text-type-metadata text-nite-text-muted">NITE Connect · convite institucional</p><h1 className="mt-3 font-display text-type-page-title">{message.title}</h1><p className="mt-4 text-type-body text-nite-text-secondary">{message.detail}</p>
    <Link href={displayedStatus === "success" ? "/dashboard" : "/login"} className="mt-6 inline-flex min-h-11 items-center rounded-control bg-nite-brand-primary px-4 text-nite-action-text">{displayedStatus === "success" ? "Ir para o NITE Connect" : "Ir para o login"}</Link>
  </section></main>;
}
