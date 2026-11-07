import Image from "next/image";
import { Button, Surface } from "../ui";
import { signOutOfNite } from "../../lib/auth/actions";
import type { NiteMember } from "../../lib/auth/identity";
import { LoginErrorNotice } from "./login-error-notice";
import { MicrosoftSignInForm } from "./microsoft-sign-in-form";
import { InstitutionalVisualPanel } from "./institutional-visual-panel";

type LoginError = {
  title: string;
  description: string;
};

function loginError(error: string | null): LoginError | null {
  if (error === "Configuration") {
    return {
      title: "Autenticação indisponível",
      description: "A autenticação institucional ainda não está disponível neste ambiente.",
    };
  }
  if (error === "AccessDenied") {
    return {
      title: "Acesso não autorizado",
      description: "Sua conta não possui permissão para acessar o NITE Connect.",
    };
  }
  if (error === "SessionExpired") {
    return {
      title: "Sua sessão precisa ser renovada",
      description: "Entre novamente para continuar.",
    };
  }
  if (error) {
    return {
      title: "Não foi possível entrar com a Microsoft",
      description: "Tente novamente. Se o problema continuar, entre em contato com a equipe responsável pelo acesso.",
    };
  }
  return null;
}

type InstitutionalLoginProps = {
  member?: NiteMember | null;
  roles?: string[];
  error?: string | null;
};

function InstitutionalLogin({ member = null, roles = [], error = null }: InstitutionalLoginProps = {}) {
  const feedback = loginError(error);

  return (
    <main className="min-h-svh bg-nite-background text-nite-text-primary min-[56rem]:grid min-[56rem]:grid-cols-[minmax(28rem,39%)_minmax(0,1fr)]">
      <section
        aria-labelledby="institutional-login-heading"
        className="flex min-h-svh min-w-0 flex-col px-6 py-8 sm:px-10 lg:px-8 xl:px-12"
      >
        <div className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col">
          <header className="flex items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/icon.svg" alt="" width={40} height={40} className="size-8 shrink-0 sm:size-10" unoptimized />
              <span className="whitespace-nowrap font-sans text-type-metadata font-semibold tracking-[0.08em] text-nite-text-primary sm:text-type-label">
                NITE CONNECT
              </span>
            </div>
          </header>

          <div className="my-auto grid min-h-0 grid-rows-[minmax(min-content,1fr)_minmax(min-content,1fr)] py-12 sm:py-16">
            <div className="flex min-h-0 flex-col justify-end pb-6">
              <div className="max-w-[27rem]">
                <p className="mb-2 text-type-metadata font-semibold uppercase tracking-[0.12em] text-nite-brand-accent">
                Acesso institucional
                </p>
                <h1 id="institutional-login-heading" className="font-display text-type-display text-nite-text-primary">
                  {member ? (
                    "Acesso autorizado."
                  ) : (
                    <>
                      <span className="block">Bem-vindo ao</span>
                      <span className="block whitespace-nowrap">NITE Connect.</span>
                    </>
                  )}
                </h1>
                <p className="mt-4 text-type-body text-nite-text-secondary">
                  {member ? "Sua identidade e seu acesso foram confirmados pelo NITE Connect." : "Acesse seu espaço de trabalho com sua conta institucional."}
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-col pt-6">
              <div className="max-w-[27rem] space-y-4">
                {feedback ? <LoginErrorNotice title={feedback.title} description={feedback.description} /> : null}
                {member ? (
                  <Surface className="space-y-3">
                    <div>
                      <p className="text-type-label font-semibold text-nite-text-primary">{member.name}</p>
                      <p className="mt-1 break-all text-type-body-compact text-nite-text-secondary">
                        {member.institutionalEmail}
                      </p>
                    </div>
                    {roles.length > 0 ? (
                      <p className="border-t border-nite-border-soft pt-3 text-type-metadata text-nite-text-secondary">
                        Acessos: {roles.join(" · ")}
                      </p>
                    ) : null}
                    <form action={signOutOfNite}>
                      <Button type="submit" variant="secondary" className="w-full">
                        Sair
                      </Button>
                    </form>
                  </Surface>
                ) : (
                  <MicrosoftSignInForm />
                )}
              </div>

              <p className="mt-6 border-t border-nite-border-soft pt-5 text-type-body-compact text-nite-text-secondary">
                Acesso exclusivo aos integrantes autorizados do NITE.
              </p>
            </div>
          </div>
        </div>
      </section>

      <InstitutionalVisualPanel />
    </main>
  );
}

export { InstitutionalLogin };
