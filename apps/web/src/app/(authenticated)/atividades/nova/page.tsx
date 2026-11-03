import Link from "next/link";
import { createIndependentActivityAction } from "../../../../lib/activities/actions";
import { getMyActivityCapabilities } from "../../../../lib/activities/data";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { Button } from "../../../../components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova atividade" };

const controlClass = "min-h-11 w-full min-w-0 rounded-control border border-nite-border-control bg-nite-surface px-3 py-2 text-type-body-compact text-nite-text-primary placeholder:text-nite-placeholder focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus";
const labelClass = "grid min-w-0 gap-1.5 text-type-label text-nite-text-primary";

export default async function NewActivityPage() {
  const session = await requireAuthenticatedNiteSession();
  const capability = await getMyActivityCapabilities(session.bearer);

  return <main className="mx-auto w-full max-w-3xl min-w-0 space-y-7 px-4 py-7 sm:px-7 sm:py-10 lg:px-9">
    <Link href="/atividades" className="relative -top-2 text-type-body-compact font-medium text-nite-brand-primary underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Voltar para minhas atividades</Link>
    <header className="space-y-2">
      <h1 className="font-display text-type-page-title text-nite-text-primary">Nova atividade</h1>
      <p className="max-w-prose text-type-body-compact text-nite-text-secondary">Crie uma atividade independente para acompanhar seu próprio trabalho.</p>
    </header>
    {capability.issue || !capability.data?.createIndependent ? <section aria-live="polite" className="border-y border-nite-border-soft py-6">
      <p className="font-medium text-nite-text-primary">{capability.issue === "access" ? "A criação não está autorizada para sua identidade." : capability.issue ? "Não foi possível confirmar a disponibilidade da criação." : "A criação de atividades não está disponível neste contexto."}</p>
      <p className="mt-2 text-type-body-compact text-nite-text-secondary">Volte à lista e tente novamente mais tarde.</p>
    </section> : <form action={createIndependentActivityAction} className="grid min-w-0 gap-5 border-t border-nite-border-soft pt-6">
      <label className={labelClass}>Título<input className={controlClass} name="title" required maxLength={200} autoComplete="off" /></label>
      <label className={labelClass}>Descrição<textarea className={`${controlClass} min-h-36 resize-y`} name="description" required maxLength={10_000} /></label>
      <label className={labelClass}>Prazo (opcional)<input className={controlClass} type="date" name="dueOn" /></label>
      <label className={labelClass}>Motivo da criação<textarea className={`${controlClass} min-h-20 resize-y`} name="reason" required maxLength={1_000} /></label>
      <div className="flex flex-wrap justify-end gap-3 border-t border-nite-border-soft pt-5">
        <Link href="/atividades" className="inline-flex min-h-11 items-center justify-center rounded-control px-4 text-type-body-compact font-medium text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Cancelar</Link>
        <Button type="submit">Criar atividade</Button>
      </div>
    </form>}
  </main>;
}
