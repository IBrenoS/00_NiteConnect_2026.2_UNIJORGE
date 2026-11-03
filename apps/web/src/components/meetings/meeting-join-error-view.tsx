import Link from "next/link";
import type { MeetingJoinFeedback } from "../../lib/meetings/meeting-join-feedback";

type Props = {
  reason: MeetingJoinFeedback;
  meetingId: string | null;
};

const messages: Record<MeetingJoinFeedback, { title: string; description: string }> = {
  forbidden: {
    title: "Sua sessão não tem acesso a esta reunião",
    description: "Confirme se entrou no NITE Connect com a conta institucional associada à reunião. Se o acesso continuar negado, peça ao organizador para verificar se seu convite permanece ativo.",
  },
  "session-required": {
    title: "Sua sessão precisa ser renovada",
    description: "O serviço não aceitou a sessão institucional atual. Entre novamente no NITE Connect e tente acessar a reunião.",
  },
  "not-found": {
    title: "Esta reunião não está disponível para sua conta",
    description: "Ela pode ter sido removida ou seu acesso pode não estar mais ativo. Confirme os detalhes com o organizador.",
  },
  unavailable: {
    title: "Não foi possível confirmar sua entrada",
    description: "O serviço de reuniões não concluiu a verificação. Nenhuma entrada foi iniciada; tente novamente em alguns instantes.",
  },
};

function VideoErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-8" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3M4 20 20 4" />
    </svg>
  );
}

export function MeetingJoinErrorView({ reason, meetingId }: Props) {
  const content = messages[reason];
  const retryHref = meetingId ? `/reunioes/${encodeURIComponent(meetingId)}/entrar` : null;

  return (
    <main className="flex min-h-svh flex-col bg-nite-background text-nite-text-primary">
      <header className="flex min-h-20 items-center px-5 sm:px-8">
        <Link href="/reunioes" className="inline-flex items-center gap-3 rounded-control focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-nite-focus" aria-label="NITE Connect — voltar para Reuniões">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span className="font-sans text-type-label font-semibold tracking-wide">NITE CONNECT</span>
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 pb-14 pt-4 text-center sm:px-8" aria-labelledby="meeting-join-error-title">
        <div className="grid size-16 place-items-center rounded-full bg-nite-brand-soft text-nite-brand-primary sm:size-[4.5rem]">
          <VideoErrorIcon />
        </div>
        <h1 id="meeting-join-error-title" className="mt-6 max-w-2xl font-display text-type-page-title font-semibold text-nite-text-primary">{content.title}</h1>
        <p className="mt-4 max-w-xl text-type-body text-nite-text-secondary">{content.description}</p>

        <div className="mt-8 flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row">
          <Link href="/reunioes" className="inline-flex min-h-11 items-center justify-center rounded-control border border-nite-brand-primary bg-nite-brand-primary px-5 py-2 text-type-label font-medium text-nite-action-text transition-colors hover:bg-nite-brand-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus motion-reduce:transition-none">
            Voltar para Reuniões
          </Link>
          {retryHref ? (
            <Link href={retryHref} className="inline-flex min-h-11 items-center justify-center rounded-control border border-nite-border-strong bg-nite-surface px-5 py-2 text-type-label font-medium text-nite-text-primary transition-colors hover:bg-nite-surface-focus focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus motion-reduce:transition-none">
              Tentar novamente
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
