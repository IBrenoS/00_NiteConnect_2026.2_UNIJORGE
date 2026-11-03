import { notFound } from "next/navigation";
import { auth } from "../../../../auth";
import { requestMeetingsGraphConsent } from "../../../lib/auth/actions";

export const dynamic = "force-dynamic";

export default async function MeetingsGraphConsentPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const session = await auth();
  const isActiveMember = session?.niteMember?.status === "ATIVO" && !session.error;

  return (
    <main>
      <h1>Prova de consentimento do Microsoft Graph</h1>
      <p>
        Esta etapa solicita consentimento delegado combinado para a API do NITE Connect e suas permissões
        downstream. O login normal não será alterado.
      </p>
      <p>
        O escopo desta prova é limitado à configuração declarada no Entra para o recurso da API. A tela da
        Microsoft mostrará as permissões antes de qualquer concessão.
      </p>
      {isActiveMember ? (
        <form action={requestMeetingsGraphConsent}>
          <button type="submit">Continuar para a Microsoft</button>
        </form>
      ) : (
        <p>Entre no NITE Connect com uma conta de integrante ativo antes de iniciar a prova.</p>
      )}
    </main>
  );
}
