"use client";

import { TransientFeedback } from "../ui/transient-feedback";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "../ui/alert-dialog";
import { deletePlanningAction } from "../../lib/activities/planning-actions";

export function PlanningDeleteMenu({ id, version, title, canDelete, leaveWorkspace = false }: {
  id: string; version: number; title: string; canDelete: boolean; leaveWorkspace?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await deletePlanningAction(id, version);
      if (result.issue) {
        setError(result.issue === "conflict" ? "A atividade mudou. Atualize a página antes de excluir." : "Não foi possível excluir a atividade. Atualize a página e tente novamente.");
        router.refresh();
        return;
      }
      setOpen(false);
      if (leaveWorkspace) router.push("/atividades");
      router.refresh();
    } catch {
      setError("Não foi possível excluir a atividade. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  if (!canDelete) return null;
  return <>
    <details className="relative shrink-0">
      <summary aria-label={`Opções de ${title}`} className="grid size-9 cursor-pointer list-none place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle">⋯</summary>
      <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-panel border border-nite-border-soft bg-nite-surface p-1 shadow-nite-floating">
        <button type="button" aria-haspopup="dialog" disabled={pending} onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          setError(null);
          setOpen(true);
        }} className="min-h-9 w-full rounded-control px-3 text-left text-type-body-compact text-status-error hover:bg-status-error-soft disabled:opacity-60">Excluir atividade</button>
      </div>
    </details>
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}
      title="Excluir esta atividade?" description="O planejamento será excluído permanentemente. Esta ação não pode ser desfeita."
      confirmLabel="Excluir atividade" pending={pending} onConfirm={() => void remove()} className="max-w-md">
      <p className="break-words font-medium text-nite-text-primary">{title}</p>
      <p className="mt-3 text-type-body-compact text-nite-text-secondary">As tarefas serão desvinculadas e continuarão disponíveis em Minhas tarefas, com seu histórico e suas evidências.</p>
      {error ? <TransientFeedback messageKey={error} onDismiss={() => setError(null)}><p role="alert" className="mt-4 text-type-body-compact text-status-error">{error}</p></TransientFeedback> : null}
    </AlertDialog>
  </>;
}
