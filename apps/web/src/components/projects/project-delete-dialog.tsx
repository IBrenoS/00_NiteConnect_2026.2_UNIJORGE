"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProjectAction } from "../../lib/projects/administration-actions";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export function ProjectDeleteDialog({ projectId, name, open, onOpenChange }: { projectId: string; name: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteProjectAction(projectId);
      if (result.issue) {
        setError(result.issueText ?? "Não foi possível excluir o projeto.");
        return;
      }
      router.push("/projetos?deleted=1");
    });
  }

  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }} title="Excluir projeto?" description={`“${name}” deixará de aparecer nas áreas ativas.`} footer={<><Button variant="secondary" type="button" disabled={pending} onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="destructive" type="button" disabled={pending} onClick={remove}>{pending ? "Excluindo…" : "Excluir projeto"}</Button></>}>
    <p>Esta operação segue as regras de exclusão lógica e retenção documental existentes.</p>
    {error ? <p role="alert">{error}</p> : null}
  </Dialog>;
}
