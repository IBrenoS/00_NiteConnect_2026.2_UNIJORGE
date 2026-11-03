import { notFound, redirect } from "next/navigation";
import { getAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { probeMeetingCalendar } from "../../../../lib/auth/meetings-graph-probe";

export const dynamic = "force-dynamic";

export default async function MeetingsGraphCalendarProbePage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const session = await getAuthenticatedNiteSession();
  if (!session || session.member.status !== "ATIVO") redirect("/login");

  const result = await probeMeetingCalendar(session.bearer, process.env.API_BASE_URL ?? "");

  return (
    <main>
      <h1>Verificação do calendário Microsoft</h1>
      <p>Esta prova faz somente GET da capacidade do calendário do organizador pelo backend NITE e Microsoft Graph.</p>
      {result.status === "AVAILABLE" ? (
        <section>
          <h2>Graph acessível pelo backend</h2>
          <p>O OBO e a consulta ao calendário concluíram com sucesso.</p>
          <p>Provedor padrão: {result.capabilities.defaultOnlineMeetingProvider || "não informado"}</p>
          <p>Teams para Empresas disponível: {result.capabilities.supportsTeamsForBusiness ? "sim" : "não"}</p>
          <p>Provedores permitidos: {result.capabilities.allowedOnlineMeetingProviders.join(", ") || "nenhum"}</p>
        </section>
      ) : result.status === "API_ERROR" ? (
        <section>
          <h2>O backend não concluiu a consulta Graph</h2>
          <p>HTTP {result.httpStatus}; código NITE: {result.code ?? "não informado"}.</p>
          <p>A mensagem original do Microsoft Entra/Graph e os tokens não são exibidos nesta página.</p>
        </section>
      ) : (
        <section>
          <h2>Não foi possível concluir a prova</h2>
          <p>Verifique se a API local está disponível e se a resposta de capacidades é válida.</p>
        </section>
      )}
    </main>
  );
}
